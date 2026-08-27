// 上传 electron-builder 打包产物到 R2 的 releases/ 前缀下，并刷新 CDN 缓存
// 前置：先执行 npm run dist 生成 release/ 目录
// 用法：node scripts/upload-release.mjs [--dry]
import { basename } from 'node:path'
import { uploadFile, walkDir, purgeFiles } from './r2-client.mjs'

const RELEASE_DIR = process.env.R2_RELEASE_DIR || 'release'
const PREFIX = (process.env.R2_RELEASE_PREFIX || 'releases').replace(/\/$/, '')
const DRY = process.argv.includes('--dry')

// 排除开发产物与调试文件：
//  - win-unpacked 是解压后的应用目录（体积大、非分发文件，绝不上传）
//  - builder-debug.yml 是构建调试信息（非分发文件）
// 产物扁平化上传到 PREFIX/ 根（不带子目录），确保 web installer 与 electron-updater
// 都能从 publish.url 根目录直接拉取文件（nsis-web 产物在 release/nsis-web/ 子目录，
// 但 web installer 期望从 releases/ 根拉 7z 包，故用 basename 平铺）
const allFiles = await walkDir(RELEASE_DIR)
const files = allFiles.filter(
  (f) => !f.includes('win-unpacked') && !f.endsWith('builder-debug.yml')
)
if (!files.length) {
  console.error(`\x1b[31m[release] ${RELEASE_DIR}/ 无可上传产物，请先执行 npm run dist\x1b[0m`)
  process.exit(1)
}

const ymlFiles = files.filter((f) => /\.ya?ml$/i.test(f))
if (!ymlFiles.length) {
  console.warn('\x1b[33m[release] 警告：未发现 latest*.yml，electron-updater 将无法自动更新\x1b[0m')
} else {
  console.log(`[release] 检测到更新清单：${ymlFiles.map((f) => basename(f)).join(', ')}`)
}

console.log(`[release] 待上传 ${files.length} 个文件到 ${PREFIX}/（扁平化，不含子目录）\n`)
const results = []
for (const f of files) {
  const name = basename(f)
  const key = `${PREFIX}/${name}`
  if (DRY) {
    console.log(`  [dry] ${name} -> ${key}`)
    continue
  }
  const url = await uploadFile(f, key)
  console.log(`  \x1b[32m[ok]\x1b[0m ${name}`)
  results.push({ file: name, url })
}

console.log(`\n[release] 完成，共 ${files.length} 个文件`)
if (!DRY && ymlFiles.length) {
  const manifestUrls = ymlFiles.map((f) => `${process.env.R2_PUBLIC_BASE}/${PREFIX}/${basename(f)}`)
  console.log(`\n[updater] 自动更新清单已就绪：\n  ${manifestUrls.join(' / ')}`)
  console.log('[cf] 刷新 CDN 缓存以确保 latest*.yml 立即生效...')
  const ok = await purgeFiles(manifestUrls)
  if (ok) console.log('\x1b[32m[cf] 缓存刷新成功，新版本可被客户端立即检测到\x1b[0m')
}