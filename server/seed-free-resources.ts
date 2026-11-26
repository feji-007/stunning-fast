import { query, pingDb } from './src/db/pool'

/** 免费资源种子数据 — 步骤二：聚合免费模型资源 */
const FREE_RESOURCES_SEED = [
  // ===== 开源权重（open_source） =====
  {
    id: 'fr_os_kling_omni',
    title: '可灵 Kling v1.6 — Hugging Face Omni 社区权重',
    category: 'open_source',
    model_id: null as string | null,
    url: 'https://huggingface.co/kolors',
    license: 'Apache-2.0',
    commercial_allowed: false,
    free_quota: '完整开源权重，无额度限制',
    entry_type: 'community',
    region: '全球',
    notes: '快手 Kling 模型 Hugging Face 社区页面，含历史开源权重（v1.0 及更早）。新版本非开源。',
    source_url: 'https://huggingface.co/kolors',
    sort_order: 10
  },
  {
    id: 'fr_os_minimax_open',
    title: 'MiniMax 开源视觉模型 — 仅图像',
    category: 'open_source',
    model_id: null,
    url: 'https://github.com/MiniMax-AI',
    license: 'MIT',
    commercial_allowed: true,
    free_quota: 'MIT 协议，商用需保留版权声明',
    entry_type: 'official',
    region: '全球',
    notes: 'MiniMax 官方 GitHub 仓库，图像类模型（VideoCrafter 前身）开源可商用；当前视频生成 API 为闭源。',
    source_url: 'https://github.com/MiniMax-AI',
    sort_order: 20
  },

  // ===== 厂商免费额度（vendor_free_tier）=====
  {
    id: 'fr_vf_volcengine_free',
    title: '火山引擎 Seedance — 新用户免费 100 条',
    category: 'vendor_free_tier',
    model_id: null,
    url: 'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    license: '商业 API',
    commercial_allowed: true,
    free_quota: '新用户赠送 100 条（约 30 天内有效）',
    entry_type: 'official',
    region: '中国大陆',
    notes: '火山引擎方舟平台新用户权益，需实名注册领取。超出后按量计费约 ¥0.1/条。',
    source_url: 'https://www.volcengine.com/product/ark',
    sort_order: 30
  },
  {
    id: 'fr_vf_runway_free',
    title: 'Runway Gen-3 — 每月免费 125 积分',
    category: 'vendor_free_tier',
    model_id: null,
    url: 'https://runwayml.com/research/gen-3',
    license: '商业 API',
    commercial_allowed: true,
    free_quota: 'Free 版每月 125 积分（约 25 条 5s 视频）',
    entry_type: 'official',
    region: '全球',
    notes: 'Runway Research 最新 Gen-3 视频模型，支持文生视频 + 图生视频。免费版水印、分辨率限制 720p。',
    source_url: 'https://runwayml.com',
    sort_order: 40
  },
  {
    id: 'fr_vf_luma_free',
    title: 'Luma Dream Machine — 免费版每周 30 次',
    category: 'vendor_free_tier',
    model_id: null,
    url: 'https://lumalabs.ai/dream-machine',
    license: '商业 API',
    commercial_allowed: false,
    free_quota: '免费版每周 30 次生成（720p）',
    entry_type: 'official',
    region: '全球',
    notes: 'Dream Machine 对提示词理解强，电影感输出。免费版输出带水印且商用受限。',
    source_url: 'https://lumalabs.ai',
    sort_order: 50
  },

  // ===== 在线试用（online_trial） =====
  {
    id: 'fr_ot_kling_web',
    title: '可灵 Kling — 官方网页版免费体验',
    category: 'online_trial',
    model_id: null,
    url: 'https://klingai.com/',
    license: '在线试用',
    commercial_allowed: false,
    free_quota: '网页版注册后赠送体验次数（约 20 条）',
    entry_type: 'official',
    region: '中国大陆',
    notes: '快手可灵官方 Web 端，免费体验无需 API Key，需实名登录。生成后可在线编辑。',
    source_url: 'https://klingai.com',
    sort_order: 60
  },
  {
    id: 'fr_ot_pika_web',
    title: 'Pika Labs — 免费网页体验',
    category: 'online_trial',
    model_id: null,
    url: 'https://pika.art/invite/stunning',
    license: '在线试用',
    commercial_allowed: false,
    free_quota: '注册赠送免费点数，邀请链接可额外获得',
    entry_type: 'official',
    region: '全球',
    notes: 'Pika v1.5/v2 模型网页端，支持文生视频 + 图生视频，免费版带水印。',
    source_url: 'https://pika.art',
    sort_order: 70
  },

  // ===== 本地部署方案（local_deploy） =====
  {
    id: 'fr_ld_videocrafter',
    title: 'VideoCrafter2 — 本地部署方案（开源）',
    category: 'local_deploy',
    model_id: null,
    url: 'https://github.com/Tencent/VideoCrafter2',
    license: 'Apache-2.0',
    commercial_allowed: true,
    free_quota: '完全免费开源，本地 GPU 部署',
    entry_type: 'official',
    region: '全球',
    notes: '腾讯 AI Lab VideoCrafter2，基于 Stable Diffusion 架构，需 ≥ 24GB 显存显卡。',
    source_url: 'https://github.com/Tencent/VideoCrafter2',
    sort_order: 80
  },

  // ===== 社区镜像/教程（community） =====
  {
    id: 'fr_cm_paperplane',
    title: 'Pika Paperplane — 社区镜像',
    category: 'community',
    model_id: null,
    url: 'https://replicate.com/pika-labs/pika',
    license: '社区镜像',
    commercial_allowed: false,
    free_quota: 'Replicate 按次计费，新用户有免费额度',
    entry_type: 'mirror',
    region: '全球',
    notes: 'Pika Labs 通过 Replicate 平台提供模型推理服务。Replicate 新用户通常有 $5-10 免费额度。',
    source_url: 'https://replicate.com',
    sort_order: 90
  },
  {
    id: 'fr_cm_prompt_cookbook',
    title: 'AI 视频 Prompt 精选 — 社区汇总',
    category: 'community',
    model_id: null,
    url: 'https://civitai.com/articles/video-prompts',
    license: '社区内容',
    commercial_allowed: true,
    free_quota: '完全免费浏览',
    entry_type: 'community',
    region: '全球',
    notes: 'Civitai 社区精选视频模型 Prompt 模板，含 Kling/Runway/Pika/Luma 等分模型场景。',
    source_url: 'https://civitai.com',
    sort_order: 100
  }
]

async function main() {
  const ok = await pingDb()
  if (!ok) { console.error('DB 连不上'); process.exit(1) }
  console.log('[seed] DB 连通\n')

  // 幂等插入（存在则跳过）
  let inserted = 0
  let skipped = 0
  for (const r of FREE_RESOURCES_SEED) {
    const exists = await queryOne('SELECT id FROM free_resources WHERE id = ?', [r.id])
    if (exists) { skipped++; console.log(`  [skip] ${r.id}`); continue }
    await query(
      `INSERT INTO free_resources
        (id, title, category, model_id, url, license, commercial_allowed,
         free_quota, entry_type, region, notes, source_url,
         status, sort_order, is_active, check_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?, TRUE, 0)`,
      [
        r.id, r.title, r.category, r.model_id, r.url,
        r.license, !!r.commercial_allowed, r.free_quota,
        r.entry_type, r.region, r.notes, r.source_url, r.sort_order
      ]
    )
    inserted++
    console.log(`  [ok]   ${r.id} — ${r.title.slice(0, 20)}…`)
  }

  console.log(`\n[seed] 完成：新增 ${inserted} 条，已存在 ${skipped} 条，总计 ${FREE_RESOURCES_SEED.length} 条种子数据`)

  // 最终展示
  const rows = await query(
    `SELECT category, COUNT(*) as cnt FROM free_resources WHERE id LIKE 'fr_%' GROUP BY category`
  )
  console.log('\n[seed] 分类统计：')
  const catLabel: Record<string, string> = {
    open_source: '📦 开源权重',
    vendor_free_tier: '🎁 厂商免费额度',
    local_deploy: '💻 本地部署',
    online_trial: '🌐 在线试用',
    community: '👥 社区/镜像'
  }
  for (const r of rows.rows as any[]) {
    console.log(`  ${catLabel[r.category] ?? r.category.padEnd(16)}: ${r.cnt} 条`)
  }
}

// 引入 queryOne（复用 pool.ts）
import { queryOne } from './src/db/pool'

main().catch((e) => { console.error(e); process.exit(1) })
