import { query, queryOne } from './pool'
import { config } from '../config'
import { hashPassword } from '../utils/password'

/**
 * 种子数据：仅在对应表为空时插入，不覆盖管理员后续的修改。
 * 每次启动都会执行检查，已存在数据则跳过。
 */

// 从客户端 src/data/models.ts 迁移的供应商 + 模型
const PROVIDERS_SEED: Array<{
  id: string; name: string; keyHint: string; url: string; sort: number
  models: Array<{
    id: string; name: string; type: string; desc: string
    supportsI2V?: boolean; res: number; speed: number; price: number; sort: number
  }>
}> = [
  {
    id: 'alibaba', name: '通义万相 (DashScope)', keyHint: 'sk-',
    url: 'https://dashscope.aliyun.com/', sort: 1,
    models: [
      { id: 'wan2.7-t2v', name: 'Wan2.7 文生视频', type: 'video', desc: '通义万相最新文生视频，2-15s，720P/1080P，含音频，支持多镜头叙事。', res: 1080, speed: 120, price: 3, sort: 1 },
      { id: 'wan2.7-t2v-2026-06-12', name: 'Wan2.7 (2026-06-12 快照)', type: 'video', desc: '通义万相 wan2.7 固定版本快照，结果更稳定可复现。', res: 1080, speed: 120, price: 3, sort: 2 },
      { id: 'wan2.6-t2v', name: 'Wan2.6 文生视频', type: 'video', desc: '通义万相文生视频，2-15s，1080P，含音频，支持多镜头。', res: 1080, speed: 100, price: 3, sort: 3 },
      { id: 'wan2.2-t2v-plus', name: 'Wan2.2 文生视频', type: 'video', desc: '通义万相文生视频，5s，1080P，画质优先。', res: 1080, speed: 90, price: 2, sort: 4 },
      { id: 'wan2.1-t2v-turbo', name: 'Wan2.1 Turbo 文生视频', type: 'video', desc: '通义万相文生视频，5s，720P，快速低价，适合尝鲜。', res: 720, speed: 30, price: 1, sort: 5 },
      { id: 'wan2.1-t2v-plus', name: 'Wan2.1 Plus 文生视频', type: 'video', desc: '通义万相文生视频，5s，720P，画质增强。', res: 720, speed: 60, price: 2, sort: 6 },
      { id: 'qwen-max', name: 'Qwen-Max', type: 'text', desc: '通义千问通用大语言模型。', res: 0, speed: 0, price: 1, sort: 7 }
    ]
  },
  {
    id: 'volcengine', name: '火山引擎 (豆包 Seedance)', keyHint: '',
    url: 'https://www.volcengine.com/product/doubao-seedance', sort: 2,
    models: [
      { id: 'doubao-seedance-2-5', name: 'Seedance 2.5', type: 'video', desc: '字节最新 Seedance 2.5，文生/图生视频，支持多模态参考，最长 30s。', supportsI2V: true, res: 1080, speed: 60, price: 3, sort: 1 },
      { id: 'doubao-seedance-2-0-260128', name: 'Seedance 2.0', type: 'video', desc: '豆包 Seedance 2.0 标准版，文/图生视频，原生音频，最长 15s。', supportsI2V: true, res: 1080, speed: 45, price: 2, sort: 2 },
      { id: 'doubao-seedance-2-0-fast-260128', name: 'Seedance 2.0 Fast', type: 'video', desc: '豆包 Seedance 2.0 快速版，速度更快成本更低（不支持 1080p）。', supportsI2V: true, res: 720, speed: 20, price: 1, sort: 3 },
      { id: 'doubao-seedance-1-5-pro-251215', name: 'Seedance 1.5 Pro', type: 'video', desc: '豆包 Seedance 1.5 Pro，文/图生视频，4-12s。', supportsI2V: true, res: 720, speed: 30, price: 2, sort: 4 },
      { id: 'doubao-seedance-1-0-pro-fast-251015', name: 'Seedance 1.0 Pro Fast', type: 'video', desc: '豆包 Seedance 1.0 Pro Fast，文/图生视频，2-12s，快速。', supportsI2V: true, res: 720, speed: 15, price: 1, sort: 5 },
      { id: 'doubao-pro', name: 'Doubao Pro', type: 'text', desc: '豆包通用文本对话模型。', res: 0, speed: 0, price: 1, sort: 6 }
    ]
  },
  {
    id: 'kling', name: '快手可灵 (Kling)', keyHint: 'AccessKey:SecretKey',
    url: 'https://klingai.com/', sort: 3,
    models: [
      { id: 'kling-v3', name: 'Kling 3.0', type: 'video', desc: '可灵最新一代文生视频，画质与一致性最佳，支持更长时长。', supportsI2V: true, res: 1080, speed: 120, price: 3, sort: 1 },
      { id: 'kling-v2-master', name: 'Kling 2.0 Master', type: 'video', desc: '可灵 2.0 高质量文生视频，1080p，最长 10s。', supportsI2V: true, res: 1080, speed: 90, price: 3, sort: 2 },
      { id: 'kling-v2-5-turbo', name: 'Kling 2.5 Turbo', type: 'video', desc: '可灵 2.5 Turbo，速度更快成本更低，适合快速尝鲜。', supportsI2V: true, res: 720, speed: 30, price: 1, sort: 3 },
      { id: 'kling-v1-6', name: 'Kling 1.6', type: 'video', desc: '可灵上一代视频模型，性价比高。', supportsI2V: true, res: 720, speed: 60, price: 2, sort: 4 }
    ]
  },
  {
    id: 'minimax', name: 'MiniMax', keyHint: '', url: 'https://www.minimaxi.com/', sort: 4,
    models: [
      { id: 'video-01', name: 'MiniMax Video-01', type: 'video', desc: 'MiniMax 视频生成，擅长人物与运镜。', res: 720, speed: 60, price: 2, sort: 1 },
      { id: 'abab6-5', name: 'abab6.5', type: 'text', desc: 'MiniMax 通用大语言模型。', res: 0, speed: 0, price: 1, sort: 2 }
    ]
  },
  {
    id: 'runway', name: 'Runway', keyHint: '', url: 'https://runwayml.com/', sort: 5,
    models: [
      { id: 'gen-3-alpha', name: 'Gen-3 Alpha', type: 'video', desc: 'Runway Gen-3，高质量文生/图生视频。', supportsI2V: true, res: 1080, speed: 60, price: 3, sort: 1 }
    ]
  },
  {
    id: 'pika', name: 'Pika', keyHint: '', url: 'https://pika.art/', sort: 6,
    models: [
      { id: 'pika-1-5', name: 'Pika 1.5', type: 'video', desc: 'Pika 视频生成，特效与 Pikaffects。', supportsI2V: true, res: 720, speed: 30, price: 2, sort: 1 }
    ]
  },
  {
    id: 'luma', name: 'Luma AI', keyHint: '', url: 'https://lumalabs.ai/', sort: 7,
    models: [
      { id: 'dream-machine', name: 'Dream Machine', type: 'video', desc: 'Luma Dream Machine，文/图生视频。', supportsI2V: true, res: 720, speed: 60, price: 2, sort: 1 }
    ]
  },
  {
    id: 'zhipu', name: '智谱 AI', keyHint: '', url: 'https://www.zhipuai.cn/', sort: 8,
    models: [
      { id: 'cogvideox', name: 'CogVideoX', type: 'video', desc: '智谱开源视频生成模型。', res: 720, speed: 60, price: 1, sort: 1 },
      { id: 'glm-4', name: 'GLM-4', type: 'text', desc: '智谱通用大语言模型。', res: 0, speed: 0, price: 1, sort: 2 }
    ]
  },
  {
    id: 'openai', name: 'OpenAI', keyHint: 'sk-', url: 'https://openai.com/', sort: 9,
    models: [
      { id: 'sora', name: 'Sora', type: 'video', desc: 'OpenAI Sora 视频生成模型。', res: 1080, speed: 60, price: 3, sort: 1 },
      { id: 'dall-e-3', name: 'DALL\u00b7E 3', type: 'image', desc: 'OpenAI 图像生成。', res: 0, speed: 0, price: 2, sort: 2 },
      { id: 'gpt-4o', name: 'GPT-4o', type: 'text', desc: 'OpenAI 通用对话模型。', res: 0, speed: 0, price: 3, sort: 3 }
    ]
  }
]

const FEATURES_SEED: Array<{
  id: string; name: string; icon: string; desc: string; pinned: boolean; sort: number
}> = [
  { id: 'video', name: '视频生成', icon: '\u{1F3AC}', desc: '文生视频 / 图生视频，自动匹配或手动切换 API', pinned: true, sort: 1 },
  { id: 'library', name: '资源库', icon: '\u{1F4DA}', desc: '罗列主流常用模型，搜索最适配的资源', pinned: true, sort: 2 },
  { id: 'custom', name: '自定义', icon: '\u{1F3A8}', desc: 'DIY 界面，调整核心功能展示位', pinned: true, sort: 3 },
  { id: 'image', name: '图像生成', icon: '\u{1F5BC}\uFE0F', desc: '文生图，主流模型可选', pinned: true, sort: 4 },
  { id: 'audio', name: '语音合成', icon: '\u{1F3A4}', desc: '文本转语音，多音色可选', pinned: false, sort: 5 },
  { id: 'chat', name: 'AI 对话', icon: '\u{1F4AC}', desc: '通用大模型对话', pinned: false, sort: 6 }
]

// 视频生成参数选项：分辨率 / 宽高比 / 时长 / 自动匹配优先级
const VIDEO_CONFIG_SEED: Array<{
  key: string; value: string; label: string; sort: number
}> = [
  { key: 'resolution', value: '720P', label: '720P', sort: 1 },
  { key: 'resolution', value: '1080P', label: '1080P', sort: 2 },
  { key: 'ratio', value: '16:9', label: '16:9 横屏', sort: 1 },
  { key: 'ratio', value: '9:16', label: '9:16 竖屏', sort: 2 },
  { key: 'ratio', value: '1:1', label: '1:1 方形', sort: 3 },
  { key: 'ratio', value: '4:3', label: '4:3', sort: 4 },
  { key: 'ratio', value: '3:4', label: '3:4', sort: 5 },
  { key: 'duration', value: '2', label: '2s', sort: 1 },
  { key: 'duration', value: '5', label: '5s', sort: 2 },
  { key: 'duration', value: '10', label: '10s', sort: 3 },
  { key: 'duration', value: '15', label: '15s', sort: 4 },
  { key: 'duration', value: '30', label: '30s', sort: 5 },
  { key: 'priority', value: 'quality', label: '清晰度优先', sort: 1 },
  { key: 'priority', value: 'speed', label: '速度优先', sort: 2 },
  { key: 'priority', value: 'price', label: '价格优先', sort: 3 }
]

async function tableEmpty(table: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM ${table} LIMIT 1`)
  return r.rowCount === 0
}

async function seedProvidersAndModels() {
  if (!(await tableEmpty('providers'))) return
  for (const p of PROVIDERS_SEED) {
    await query(
      `INSERT INTO providers (id, name, key_hint, url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [p.id, p.name, p.keyHint, p.url, p.sort]
    )
    for (const m of p.models) {
      await query(
        `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, resolution, speed, price, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [m.id, p.id, m.name, m.type, m.desc, m.supportsI2V ?? false, m.res, m.speed, m.price, m.sort]
      )
    }
  }
  console.log(`[seed] providers + models 已初始化（${PROVIDERS_SEED.length} 供应商）`)
}

async function seedFeatures() {
  if (!(await tableEmpty('features'))) return
  for (const f of FEATURES_SEED) {
    await query(
      `INSERT INTO features (id, name, icon, description, pinned, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [f.id, f.name, f.icon, f.desc, f.pinned, f.sort]
    )
  }
  console.log(`[seed] features 已初始化（${FEATURES_SEED.length} 功能入口）`)
}

async function seedVideoConfig() {
  if (!(await tableEmpty('video_config_options'))) return
  for (const o of VIDEO_CONFIG_SEED) {
    await query(
      `INSERT INTO video_config_options (config_key, option_value, option_label, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [o.key, o.value, o.label, o.sort]
    )
  }
  console.log(`[seed] video_config_options 已初始化（${VIDEO_CONFIG_SEED.length} 项）`)
}

async function seedAdminUser() {
  // 管理员按 username 唯一判断，已存在则跳过
  const exists = await queryOne('SELECT 1 FROM users WHERE username = ?', [config.adminUsername])
  if (exists) return
  const hash = await hashPassword(config.adminPassword)
  await query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES (?, ?, 'admin', TRUE)`,
    [config.adminUsername, hash]
  )
  console.log(`[seed] 管理员账号已创建：${config.adminUsername} / ${config.adminPassword}（请及时修改密码）`)
}

/** 启动时执行：仅在各表为空时插入种子数据，不覆盖已有数据。 */
export async function seedAll(): Promise<void> {
  await seedProvidersAndModels()
  await seedFeatures()
  await seedVideoConfig()
  await seedAdminUser()
}