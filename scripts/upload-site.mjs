// 上传 VitePress 官网产物到 R2 根目录（或指定前缀），并刷新首页 CDN 缓存
// 前置：先在 site/ 下执行 npm run build 生成 site/.vitepress/dist
// 用法：node scripts/upload-site.mjs [--dry]
import { relative } from 'node:path'
import { uploadFile, walkDir, publicUrl, purgeFiles } from './r2-client.mjs'

const SITE_DIR = process.env.R2_SITE_DIR || 'site/.vitepress/dist'
const PREFIX = (process.env.R2_SITE_PREFIX || '').replace(/\/$/, '')
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
if (!DRY) {
  console.log('[cf] 刷新官网首页缓存...')
  const ok = await purgeFiles([publicUrl(homeKey)])
  if (ok) console.log('\x1b[32m[cf] 首页缓存已刷新\x1b[0m')
}