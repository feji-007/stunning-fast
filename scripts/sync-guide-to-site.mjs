// 从后端 API 拉取「使用指南」问答，动态生成 site/guide/usage.md
// ------------------------------------------------------------
// 用法：
//   node scripts/sync-guide-to-site.mjs                   # 从远程服务器拉取
//   GUIDE_API_BASE=http://localhost:4178 node ...         # 本地开发服务
//
// 流程：
//   1. GET ${GUIDE_API_BASE}/api/guide/questions?active=1
//   2. 按 category 分组、sort_order 排序
//   3. 渲染为 Markdown 并写入 site/guide/usage.md
//
// 集成到 publish:site：sync-guide → site build → upload-site
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

// 远程 API 地址（与 docker-deploy.ps1 / upload-site.mjs 保持一致）
const API_BASE = process.env.GUIDE_API_BASE || 'http://1.194.28.136:90'
const API_URL = `${API_BASE}/api/guide/questions?active=1`
const OUTPUT = join(process.cwd(), 'site', 'guide', 'usage.md')

// ---------- 拉取 ----------
console.log(`[sync-guide] 拉取问答：${API_URL}`)

let res
try {
  res = await fetch(API_URL, { signal: AbortSignal.timeout(8000) })
} catch (e) {
  console.error(`\x1b[31m[sync-guide] API 请求失败：${e.message}\x1b[0m`)
  console.error(`[sync-guide] 请确认后端服务在线，或设置 GUIDE_API_BASE 指向本地`)
  process.exit(1)
}

if (!res.ok) {
  console.error(`\x1b[31m[sync-guide] API 返回 ${res.status} ${res.statusText}\x1b[0m`)
  process.exit(1)
}

const json = await res.json()
// 统一响应结构 { code, message, data: { questions, total } }
const questions = (json?.data?.questions ?? json?.questions ?? []).filter(q => q.is_active !== false)

if (!questions.length) {
  console.warn(`\x1b[33m[sync-guide] API 返回 0 条启用中的问答，官网 usage.md 内容将为空\x1b[0m`)
}

console.log(`[sync-guide] 拉取到 ${questions.length} 条启用中的问答`)

// ---------- 分组 & 排序 ----------
// 按 category 分组，组内按 sort_order 排序
const groups = new Map()
for (const q of questions) {
  const cat = (q.category || '其他').trim()
  if (!groups.has(cat)) groups.set(cat, [])
  groups.get(cat).push(q)
}
for (const list of groups.values()) {
  list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
}

// ---------- 渲染 Markdown ----------
const lines = []
lines.push('# 使用指南\n')
lines.push('> 内容实时同步自后台管理系统，管理员可在 `/admin` 增删改问答。\n')

// 先渲染所有分类目录（Table of Contents）
if (groups.size > 0) {
  lines.push('## 目录\n')
  let idx = 1
  for (const cat of groups.keys()) {
    const anchor = cat.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
    lines.push(`${idx}. [${cat}](#${anchor})（${groups.get(cat).length} 条）`)
    idx++
  }
  lines.push('')
}

// 每个分类一个 H2，问答 Q/A
for (const [cat, list] of groups) {
  lines.push(`## ${cat}\n`)
  for (const q of list) {
    lines.push(`### ${q.question}\n`)
    lines.push(`${q.answer}\n`)
  }
}

if (questions.length === 0) {
  lines.push('*暂无使用指南内容，请联系管理员在后台添加。*\n')
}

lines.push('---\n')
lines.push('还有问题？前往 [意见反馈](/feedback) 告诉我们。\n')

const md = lines.join('\n')

// ---------- 写入 ----------
writeFileSync(OUTPUT, md, 'utf8')
console.log(`\x1b[32m[sync-guide] 已写入 ${OUTPUT}（${questions.length} 条问答，${groups.size} 个分类）\x1b[0m`)
