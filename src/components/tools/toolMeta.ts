import type { Tool, ToolDifficulty, ToolPricingTier } from '../../types'

export const DIFFICULTY_LABEL: Record<ToolDifficulty, string> = {
  beginner: '新手友好',
  intermediate: '需要一点经验',
  advanced: '进阶 / 需本地环境'
}

export const PRICING_LABEL: Record<ToolPricingTier, string> = {
  free: '免费',
  freemium: '免费额度',
  'pay-per-use': '按量计费',
  subscription: '订阅制',
  'premium-only': '仅高价档'
}

export const CATEGORY_LABEL: Record<string, string> = {
  'text-to-video': '文生视频',
  'image-to-video': '图生视频',
  'lip-sync': '口型同步',
  avatar: '数字人 / 口播',
  'open-source': '开源本地',
  editing: '视频编辑',
  'multi-reference': '多参考图'
}

export const SCENARIO_LABEL: Record<string, string> = {
  shorts: '短视频',
  'talking-head': '口播讲解',
  animation: '动漫 / 风格化',
  cinematic: '电影质感',
  'character-consistency': '角色一致',
  'product-demo': '产品展示',
  'photo-to-video': '图片动效',
  'local-gpu': '本地 GPU',
  'multilingual-audio': '多语言语音',
  cheap: '高性价比',
  free: '纯免费'
}

export function difficultyClass(d: ToolDifficulty): string {
  if (d === 'beginner') return 'bg-emerald-50 text-emerald-600'
  if (d === 'intermediate') return 'bg-amber-50 text-amber-600'
  return 'bg-slate-100 text-slate-600'
}

export function pricingClass(t: ToolPricingTier): string {
  if (t === 'free') return 'bg-emerald-50 text-emerald-600'
  if (t === 'freemium') return 'bg-sky-50 text-sky-600'
  if (t === 'pay-per-use') return 'bg-violet-50 text-violet-600'
  if (t === 'subscription') return 'bg-indigo-50 text-indigo-600'
  return 'bg-rose-50 text-rose-600'
}

/** 是否可以在 App 内直接"快速体验"：由后台配置的供应商关联决定 */
export function canQuickTry(tool: Tool): boolean {
  return !!tool.providerId
}
