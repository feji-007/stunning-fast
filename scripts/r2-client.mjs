// Cloudflare R2 客户端封装（基于 S3 兼容 API）
// 用法：在 scripts/.env 配置 R2_* 变量后，由 upload-release.mjs / upload-site.mjs 导入使用
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createReadStream, readFileSync, existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

// ---- 加载 .env（scripts/.env 或项目根 .env，不覆盖已存在的环境变量）----
function loadEnv() {
  const dir = dirname(fileURLToPath(import.meta.url))
  for (const p of [join(dir, '.env'), join(dir, '..', '.env')]) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
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
    console.error(`\x1b[31m[r2] 缺少环境变量 ${key}，请在 scripts/.env 配置\x1b[0m`)
    process.exit(1)
  }
  return v
}

const ACCOUNT_ID = envOrDie('R2_ACCOUNT_ID')
const ACCESS_KEY = envOrDie('R2_ACCESS_KEY_ID')
const SECRET_KEY = envOrDie('R2_SECRET_ACCESS_KEY')
const BUCKET = envOrDie('R2_BUCKET')
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || `https://pub-${ACCOUNT_ID}.r2.dev`).replace(/\/$/, '')

export const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
})

// 拼接公开访问 URL
export function publicUrl(key) {
  return `${PUBLIC_BASE}/${key.replace(/^\//, '')}`
}

// 扩展名 -> Content-Type
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
export function cacheControl(filePath) {
  if (/\.(ya?ml|html)$/i.test(filePath)) return 'public, max-age=300'
  return 'public, max-age=2592000, immutable'
}

// 上传本地文件（流式上传，适合大体积安装包）
export async function uploadFile(localPath, key) {
  const ContentType = getMime(localPath)
  const CacheControl = cacheControl(localPath)
  const Body = createReadStream(localPath)
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body, ContentType, CacheControl }))
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

// 刷新 Cloudflare CDN 缓存（按 URL 精准刷新，Free 计划支持，单次 ≤ 30 文件）
// 需配置 CF_API_TOKEN（权限 Zone > Cache Purge）+ CF_ZONE_ID；未配置则跳过并告警
// 用途：上传 latest*.yml / index.html 后立即刷新，避免旧缓存导致更新延迟
export async function purgeFiles(urls) {
  const token = process.env.CF_API_TOKEN
  const zoneId = process.env.CF_ZONE_ID
  if (!token || !zoneId) {
    console.warn('\x1b[33m[cf] 未配置 CF_API_TOKEN/CF_ZONE_ID，跳过 CDN 缓存刷新（更新最长延迟 5 分钟）\x1b[0m')
    return false
  }
  const list = Array.isArray(urls) ? urls : [urls]
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: list })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      console.error(`\x1b[31m[cf] 缓存刷新失败：${JSON.stringify(data.errors || data)}\x1b[0m`)
      return false
    }
    return true
  } catch (e) {
    console.error(`\x1b[31m[cf] 缓存刷新异常：${e.message}\x1b[0m`)
    return false
  }
}