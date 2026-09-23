// 上传 electron-builder 打包产物到天翼云 ZOS bucket-5620/release/ 前缀
// ------------------------------------------------------------
// 前置：先执行 npm run dist 生成 release/ 目录
// 用法：
//   node scripts/release-to-oss.mjs            # 实际上传
//   node scripts/release-to-oss.mjs --dry      # 仅打印将上传的文件清单
//   node scripts/release-to-oss.mjs --check    # 仅校验凭证与 Bucket 可达性
//
// 凭证：deploy/.oss.env（模板见 deploy/.oss.env.example）
// 产物扁平化上传到 OSS_RELEASE_PREFIX/ 根（不带子目录），确保 web installer 与
// electron-updater 都能从 publish.url 根目录直接拉取文件
// （nsis-web 产物在 release/nsis-web/ 子目录，但 web installer 期望从 release/
// 根拉 7z 包，故用 basename 平铺）
import { basename } from 'node:path'
import { uploadFile, walkDir, publicUrl, client } from './oss-client.mjs'
import { HeadBucketCommand } from '@aws-sdk/client-s3'

const RELEASE_DIR = process.env.OSS_RELEASE_DIR || 'release'
const PREFIX = (process.env.OSS_RELEASE_PREFIX || 'release').replace(/\/$/, '')
const DRY = process.argv.includes('--dry')
const CHECK = process.argv.includes('--check')

// Bucket 名（仅用于打印；实际 Bucket 名在 oss-client.mjs 内通过 OSS_BUCKET 读取）
const BUCKET = process.env.OSS_BUCKET || 'bucket-5620'

// ---------- 仅校验凭证与 Bucket 可达性 ----------
async function checkBucket() {
  console.log(`[oss] 校验 Bucket 可达性：${BUCKET}`)
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }))
    console.log(`\x1b[32m[oss] Bucket 可达，凭证有效\x1b[0m`)
    console.log(`[oss] 公开访问基址：${publicUrl(PREFIX)}/`)
    return true
  } catch (e) {
    console.error(`\x1b[31m[oss] Bucket 校验失败：${e.message}\x1b[0m`)
    console.error(`\x1b[33m[oss] 排查清单：\x1b[0m`)
    console.error(`  1. deploy/.oss.env 中 OSS_ACCESS_KEY_ID / OSS_SECRET_ACCESS_KEY 是否正确`)
    console.error(`  2. OSS_BUCKET 是否匹配（当前：${BUCKET}）`)
    console.error(`  3. OSS_ENDPOINT 协议（外网 https / 内网 http）`)
    console.error(`  4. AccessKey 是否有 ${BUCKET} 的读写权限`)
    return false
  }
}

if (CHECK) {
  const ok = await checkBucket()
  process.exit(ok ? 0 : 1)
}

// ---------- 上传 ----------
// 白名单模式：只上传 electron-builder 的实际分发产物（与 pack-to-releases.ps1 一致）
//   - latest*.yml：自动更新清单
//   - *.exe / *.7z / *.zip / *.rar：Windows 安装包与差分包
//   - *.dmg：macOS 安装包
//   - *.AppImage / *.snap：Linux 安装包
//   - *.blockmap：增量更新块映射
// 排除：
//   - win-unpacked / linux-unpacked / mac/ 解压目录
//   - builder-*.yml / builder-*.yaml 构建配置文件
//   - app.asar / app-electron.asar 根目录构建产物（非分发包）
const DIST_PATTERNS = [
  /^latest(-[^/]+)?\.ya?ml$/i,
  /\.exe$/i,
  /\.7z$/i,
  /\.zip$/i,
  /\.rar$/i,
  /\.dmg$/i,
  /\.AppImage$/i,
  /\.snap$/i,
  /\.blockmap$/i
]
const allFiles = await walkDir(RELEASE_DIR)
const files = allFiles.filter((f) => {
  const name = basename(f)
  // 排除解压目录
  if (/(win-unpacked|linux-unpacked|\/mac\/)/.test(f)) return false
  // 排除 builder 配置文件
  if (/^builder-.+\.ya?ml$/i.test(name)) return false
  // 排除根目录 app.asar / app-electron.asar 构建产物
  if (name === 'app.asar' || name === 'app-electron.asar') return false
  // 白名单匹配
  return DIST_PATTERNS.some((re) => re.test(name))
})
if (!files.length) {
  console.error(`\x1b[31m[oss] ${RELEASE_DIR}/ 无可上传产物，请先执行 npm run dist\x1b[0m`)
  process.exit(1)
}

const ymlFiles = files.filter((f) => /^latest(-[^/]+)?\.ya?ml$/i.test(basename(f)))
if (!ymlFiles.length) {
  console.warn('\x1b[33m[oss] 警告：未发现 latest*.yml，electron-updater 将无法自动更新\x1b[0m')
} else {
  console.log(`[oss] 检测到更新清单：${ymlFiles.map((f) => basename(f)).join(', ')}`)
}

console.log(`[oss] 待上传 ${files.length} 个文件到 ${PREFIX}/（扁平化，不含子目录）\n`)

// 上传前先校验 Bucket 可达，避免上传到一半才发现凭证错误
if (!DRY) {
  const ok = await checkBucket()
  if (!ok) process.exit(1)
  console.log('')
}

const results = []
for (const f of files) {
  const name = basename(f)
  const key = `${PREFIX}/${name}`
  if (DRY) {
    console.log(`  [dry] ${name} -> ${key}`)
    results.push({ file: name, url: publicUrl(key) })
    continue
  }
  try {
    const url = await uploadFile(f, key)
    console.log(`  \x1b[32m[ok]\x1b[0m ${name}`)
    results.push({ file: name, url })
  } catch (e) {
    console.error(`  \x1b[31m[fail]\x1b[0m ${name}：${e.message}`)
    process.exit(1)
  }
}

console.log(`\n[oss] 完成，共 ${files.length} 个文件`)

// 打印 electron-updater 自动更新清单 URL，并提示修改 electron-builder.yml
if (ymlFiles.length) {
  const manifestUrls = ymlFiles.map((f) => publicUrl(`${PREFIX}/${basename(f)}`))
  console.log(`\n[updater] 自动更新清单已就绪：`)
  manifestUrls.forEach((u) => console.log(`  ${u}`))

  const publishUrl = `${publicUrl(PREFIX)}/`
  console.log(`\n[next] 请将 electron-builder.yml 的 publish.url 改为：`)
  console.log(`\x1b[36m  publish:\x1b[0m`)
  console.log(`\x1b[36m    provider: generic\x1b[0m`)
  console.log(`\x1b[36m    url: ${publishUrl}\x1b[0m`)
  console.log(`\x1b[36m    channel: latest\x1b[0m`)

  console.log(`\n[next] 验证下载（curl）：`)
  manifestUrls.forEach((u) => console.log(`  curl -sI ${u}`))
  console.log(`  curl -sI ${publishUrl}`)
}
