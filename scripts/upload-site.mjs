// 上传 VitePress 官网产物到天翼云 ZOS（默认根目录，或指定前缀）
// 前置：先在 site/ 下执行 npm run build 生成 site/.vitepress/dist
// 用法：node scripts/upload-site.mjs [--dry]
// 凭证：deploy/.oss.env（模板见 deploy/.oss.env.example），与 upload:oss 共用同一套 OSS_* 变量
// 缓存策略由 oss-client.mjs 通过 Cache-Control 头控制：html 5 分钟，其余 30 天 immutable
// 注：天翼云 ZOS 默认无 CDN，无需 purge；上传后通过 max-age 缓存策略生效（≤ 5 分钟）
import { relative } from 'node:path'
import { uploadFile, walkDir, publicUrl } from './oss-client.mjs'

const SITE_DIR = process.env.OSS_SITE_DIR || 'site/.vitepress/dist'
const PREFIX = (process.env.OSS_SITE_PREFIX || '').replace(/\/$/, '')
const DRY = process.argv.includes('--dry')

let files = []
try {
  files = await walkDir(SITE_DIR)
} catch {
  console.error(`\x1b[31m[site] ${SITE_DIR}/ 不存在，请先 cd site && npm run build\x1b[0m`)
  process.exit(1)
}
if (!files.length) {
  console.error(`\x1b[31m[site] ${SITE_DIR}/ 为空\x1b[0m`)
  process.exit(1)
}

console.log(`[site] 待上传 ${files.length} 个文件到 ${PREFIX || '/'}\n`)
for (const f of files) {
  const rel = relative(SITE_DIR, f).replace(/\\/g, '/')
  const key = PREFIX ? `${PREFIX}/${rel}` : rel
  if (DRY) {
    console.log(`  [dry] ${rel} -> ${key}`)
    continue
  }
  await uploadFile(f, key)
  console.log(`  \x1b[32m[ok]\x1b[0m ${rel}`)
}

console.log(`\n[site] 完成，共 ${files.length} 个文件`)
const homeKey = (PREFIX ? PREFIX + '/' : '') + 'index.html'
console.log(`[site] 官网入口：${publicUrl(homeKey)}`)
