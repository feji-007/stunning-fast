// 根据 deploy/releases 中的实际产物更新 site/download.md 的下载链接。
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROJECT_DIR = resolve(import.meta.dirname, '..')
const RELEASE_DIR = resolve(process.env.RELEASE_DIR || `${PROJECT_DIR}/deploy/releases`)
const DOWNLOAD_MD = resolve(process.env.DOWNLOAD_MD || `${PROJECT_DIR}/site/download.md`)
const BASE_URL = (process.env.RELEASE_PUBLIC_BASE || 'http://8.219.219.110/releases').replace(/\/$/, '')
const START = '<!-- AUTO-GENERATED-DOWNLOADS:START -->'
const END = '<!-- AUTO-GENERATED-DOWNLOADS:END -->'

const packageJson = JSON.parse(await readFile(resolve(PROJECT_DIR, 'package.json'), 'utf8'))
const version = packageJson.version
const files = await readdir(RELEASE_DIR)

const findFile = (predicate) => files.find(predicate)

const windows = findFile((file) => new RegExp(`^.*-${version}-setup\\.exe$`, 'i').test(file))
const macFiles = files.filter((file) => new RegExp(`^.*-${version}.*\\.dmg$`, 'i').test(file))
const macIntel = macFiles.find((file) => !/-arm64\.dmg$/i.test(file))
const macArm = macFiles.find((file) => /-arm64\.dmg$/i.test(file))
const linux = findFile((file) => new RegExp(`^.*-${version}.*\\.AppImage$`, 'i').test(file))

const link = (file, label, fallback) => {
  if (!file) return `- **${label}**${fallback}`
  const url = `${BASE_URL}/${encodeURIComponent(file)}`
  return `- **${label}**[下载](${url})`
}
const generated = [
  START,
  link(windows, '在线安装器（推荐）：', '本次未生成'),
  '',
  '  约 2 MB，运行后自动从 CDN 拉取完整程序（约 80 MB）并安装，**需联网**。完成后从开始菜单启动「绝色」。',
  '',
  '## macOS',
  '',
  link(macIntel, 'Intel：', '本次未生成'),
  link(macArm, 'Apple Silicon：', '本次未生成'),
  '',
  '## Linux',
  '',
  link(linux, 'AppImage：', '本次未生成'),
  END,
].join('\n')

const markdown = await readFile(DOWNLOAD_MD, 'utf8')
const start = markdown.indexOf(START)
const end = markdown.indexOf(END)
if (start < 0 || end < start) throw new Error(`${DOWNLOAD_MD} 缺少自动下载链接标记`)
const updated = `${markdown.slice(0, start)}${generated}${markdown.slice(end + END.length)}`
await writeFile(DOWNLOAD_MD, updated, 'utf8')
console.log(`下载地址： ${BASE_URL}`)
console.log(`[download] 已更新 ${DOWNLOAD_MD}（${version}）`)
console.log(`[download] Windows: ${windows || '本次未生成'}`)
console.log(`[download] macOS: ${macIntel || '本次未生成'}, ${macArm || '本次未生成'}`)
console.log(`[download] Linux: ${linux || '本次未生成'}`)