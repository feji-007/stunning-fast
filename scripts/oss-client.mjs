// 天翼云 ZOS 对象存储 S3 兼容客户端封装
// ------------------------------------------------------------
// 镜像 scripts/r2-client.mjs 结构，仅替换：
//   1. endpoint / 凭证变量名前缀 R2_* → OSS_*
//   2. 去掉 Cloudflare CDN 缓存刷新（天翼云 ZOS 默认无 CDN，或后续按需扩展）
//   3. 默认 forcePathStyle=false（虚拟主机风格），与截图中的
//      https://bucket-5620.zhengzhou5.zos.ctyun.cn 一致
//
// 凭证加载顺序（不覆盖已存在的环境变量）：
//   1. deploy/.oss.env       ← 推荐：与 deploy/.env 同目录，便于统一管理
//   2. scripts/.env          ← 兼容：r2-client.mjs 的旧查找路径
//   3. 系统环境变量 OSS_*    ← CI / 部署机场景
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync, existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

// ---- 加载 .oss.env（不覆盖已存在的环境变量）----
function loadEnv() {
  const dir = dirname(fileURLToPath(import.meta.url))
  const projectRoot = join(dir, '..')
  // 查找顺序：deploy/.oss.env（推荐）→ scripts/.env（兼容）→ 项目根 .env
  const candidates = [
    join(projectRoot, 'deploy', '.oss.env'),
    join(dir, '.env'),
    join(projectRoot, '.env')
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(OSS_[A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[m[1]]) process.env[m[1]] = val
    }
  }
}
loadEnv()

function envOrDie(key) {
  const v = process.env[key]
  if (!v) {
    console.error(`\x1b[31m[oss] 缺少环境变量 ${key}，请在 deploy/.oss.env 配置\x1b[0m`)
    console.error(`\x1b[33m[oss] 模板：cp deploy/.oss.env.example deploy/.oss.env\x1b[0m`)
    process.exit(1)
  }
  return v
}

const ACCESS_KEY = envOrDie('OSS_ACCESS_KEY_ID')
const SECRET_KEY = envOrDie('OSS_SECRET_ACCESS_KEY')
const BUCKET = envOrDie('OSS_BUCKET')
const ENDPOINT = envOrDie('OSS_ENDPOINT')
const REGION = process.env.OSS_REGION || 'auto'
const PUBLIC_BASE = (process.env.OSS_PUBLIC_BASE || ENDPOINT).replace(/\/$/, '')

// 天翼云 ZOS 截图同时给出两种风格：
//   - 路径风格：https://zhengzhou5.zos.ctyun.cn/<bucket>/<key>
//   - 虚拟主机风格：https://<bucket>.zhengzhou5.zos.ctyun.cn/<key>
// 客户端 / electron-updater 拉取用的是 OSS_PUBLIC_BASE（虚拟主机风格），
// 上传时 SDK 与 endpoint 直接通信，两种风格 ZOS 都支持。
// 默认 forcePathStyle=false（与截图 OSS_PUBLIC_BASE 一致）；若遇签名失败可改 true。
export const client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: false
})

// 拼接公开访问 URL（用 OSS_PUBLIC_BASE，便于 electron-updater 通过自定义域名访问）
export function publicUrl(key) {
  return `${PUBLIC_BASE}/${key.replace(/^\//, '')}`
}

// 扩展名 → Content-Type（与 r2-client.mjs 保持一致）
const MIME = {
  '.exe': 'application/octet-stream',
  '.dmg': 'application/octet-stream',
  '.AppImage': 'application/octet-stream',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.blockmap': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
}

export function getMime(filePath) {
  return MIME[extname(filePath)] || 'application/octet-stream'
}

// 缓存策略：更新清单与 html 短缓存（5 分钟），其余长缓存（30 天 immutable）
// 天翼云 ZOS 支持 Cache-Control 头透传
export function cacheControl(filePath) {
  if (/\.(ya?ml|html)$/i.test(filePath)) return 'public, max-age=300'
  return 'public, max-age=2592000, immutable'
}

// 上传本地文件（Buffer 整文件读入 + 显式 ContentLength）
// 说明：S3 SDK 流式上传默认走 chunked Transfer-Encoding，天翼云 ZOS 不支持
// chunked，会报 "non-retryable streaming request" 错误。改用 Buffer 整文件
// 读入内存并显式声明 ContentLength，触发 SDK 走标准 PutObject 一次性上传。
// 对于 nsis-web 产物（几十 MB 量级）完全可接受；如未来需要上传 GB 级大文件，
// 请改用 @aws-sdk/lib-storage 的 Upload 类做 multipart 上传。
export async function uploadFile(localPath, key) {
  const ContentType = getMime(localPath)
  const CacheControl = cacheControl(localPath)
  const Body = await readFile(localPath)
  const ContentLength = (await stat(localPath)).size
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body, ContentType, CacheControl, ContentLength }))
  return publicUrl(key)
}

// 上传文本内容（直接传字符串，如动态生成的清单）
export async function uploadBytes(content, key, ContentType = 'text/plain; charset=utf-8') {
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: content, ContentType, CacheControl: 'public, max-age=300' }))
  return publicUrl(key)
}

// 判断 key 是否已存在
export async function fileExists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

// 删除 key
export async function deleteKey(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// 递归遍历目录，返回所有文件绝对路径
export async function walkDir(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    const s = await stat(p)
    if (s.isDirectory()) out.push(...(await walkDir(p)))
    else if (s.isFile()) out.push(p)
  }
  return out
}
