// 上传 VitePress 官网产物到服务器运行中的 nginx 容器
// ------------------------------------------------------------
// 前置：先在 site/ 下执行 npm run build 生成 site/.vitepress/dist
// 用法：
//   node scripts/upload-site.mjs            # 实际上传
//   node scripts/upload-site.mjs --dry      # 仅打印将部署的文件清单
//
// 部署方式（不依赖 OSS，不重建 Docker 镜像）：
//   1. 本地构建 site -> site/.vitepress/dist/
//   2. scp 到服务器 /tmp/juese-site-dist/
//   3. docker cp 到运行中的 juese-nginx 容器 /usr/share/nginx/docs/
//   4. nginx -s reload 重载配置
//
// 服务器信息（与 deploy/docker-deploy.ps1 保持一致）：
//   公网 IP：1.194.28.136，SSH 用户：root
//   nginx 容器名：juese-nginx，docs 路径：/usr/share/nginx/docs/
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'

const SITE_DIR = process.env.OSS_SITE_DIR || 'site/.vitepress/dist'
const DRY = process.argv.includes('--dry')

// 服务器配置（与 docker-deploy.ps1 保持一致）
const REMOTE_USER = process.env.REMOTE_USER || 'root'
const REMOTE_HOST = process.env.REMOTE_HOST || '1.194.28.136'
const REMOTE_TMP = process.env.REMOTE_SITE_TMP || '/tmp/juese-site-dist'
const NGINX_CONTAINER = process.env.NGINX_CONTAINER || 'juese-nginx'
const NGINX_DOCS_PATH = process.env.NGINX_DOCS_PATH || '/usr/share/nginx/docs'

// 项目根目录（脚本从项目根执行）
const ROOT = process.cwd()
const LOCAL_DIST = join(ROOT, SITE_DIR)

// ---------- 工具函数 ----------

// 递归遍历目录，返回所有文件绝对路径
async function walkDir(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    const s = await stat(p)
    if (s.isDirectory()) out.push(...(await walkDir(p)))
    else if (s.isFile()) out.push(p)
  }
  return out
}

// ---------- 检查本地构建产物 ----------
let files = []
try {
  files = await walkDir(LOCAL_DIST)
} catch {
  console.error(`\x1b[31m[site] ${SITE_DIR}/ 不存在，请先 cd site && npm run build\x1b[0m`)
  process.exit(1)
}
if (!files.length) {
  console.error(`\x1b[31m[site] ${SITE_DIR}/ 为空，请先 cd site && npm run build\x1b[0m`)
  process.exit(1)
}

console.log(`[site] 待部署 ${files.length} 个文件`)
console.log(`[site] 目标：${REMOTE_USER}@${REMOTE_HOST} → docker:${NGINX_CONTAINER}:${NGINX_DOCS_PATH}`)

if (DRY) {
  console.log('\n[site] dry-run 文件清单：')
  for (const f of files) {
    const rel = f.replace(LOCAL_DIST, '').replace(/\\/g, '/').replace(/^[/\\]/, '')
    console.log(`  [dry] ${rel}`)
  }
  console.log(`\n[site] dry-run 完成，未实际部署`)
  process.exit(0)
}

// ---------- 工具函数 ----------
function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts })
    return true
  } catch (e) {
    if (opts.ignoreError) return false
    console.error(`\x1b[31m[site] 命令失败：${cmd}\x1b[0m`)
    if (e?.stderr) console.error(e.stderr.toString().trim())
    return false
  }
}

function ssh(cmd) {
  return run(`ssh -o BatchMode=yes -o ConnectTimeout=8 ${REMOTE_USER}@${REMOTE_HOST} ${JSON.stringify(cmd)}`)
}

// ---------- 部署 ----------
console.log('\n>>> 1/4 检查 SSH 连接')
if (!ssh('echo ok')) {
  console.error(`\x1b[31m[site] SSH 连接失败\x1b[0m`)
  console.error(`[site] 请确保已配置 SSH 免密登录到 ${REMOTE_USER}@${REMOTE_HOST}`)
  process.exit(1)
}
console.log('  SSH 连接正常')

console.log('>>> 2/4 上传到服务器临时目录')
ssh(`rm -rf ${REMOTE_TMP} && mkdir -p ${REMOTE_TMP}`)
if (!run(`scp -r "${LOCAL_DIST}"/* ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TMP}/`)) {
  console.error(`\x1b[31m[site] scp 上传失败\x1b[0m`)
  process.exit(1)
}
console.log(`  scp 完成 → ${REMOTE_TMP}（${files.length} 个文件）`)

console.log('>>> 3/4 docker cp 到 nginx 容器')
ssh(`docker exec ${NGINX_CONTAINER} sh -c 'rm -rf ${NGINX_DOCS_PATH}/*'`)
if (!ssh(`docker cp ${REMOTE_TMP}/. ${NGINX_CONTAINER}:${NGINX_DOCS_PATH}/`)) {
  console.error(`\x1b[31m[site] docker cp 失败\x1b[0m`)
  process.exit(1)
}
console.log(`  已复制到 ${NGINX_CONTAINER}:${NGINX_DOCS_PATH}`)

console.log('>>> 4/4 重载 nginx')
ssh(`docker exec ${NGINX_CONTAINER} nginx -s reload`)
console.log('  nginx 已重载')

// 清理
ssh(`rm -rf ${REMOTE_TMP}`, { ignoreError: true })

console.log(`\n\x1b[32m[site] 部署完成！\x1b[0m`)
console.log(`  官网入口：http://${REMOTE_HOST}:90/docs/`)
console.log(`  共 ${files.length} 个文件`)
