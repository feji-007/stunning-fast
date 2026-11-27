export type FeatureId =
  | 'video'
  | 'library'
  | 'custom'
  | 'image'
  | 'audio'
  | 'chat'

export interface Feature {
  id: FeatureId
  name: string
  icon: string
  desc: string
  /** Whether shown in the default row of the main panel. */
  pinned: boolean
}

export interface ProviderModel {
  id: string
  name: string
  provider: ProviderId
  type: 'video' | 'image' | 'audio' | 'text'
  desc: string
  /** 是否支持图生视频（image-to-video） */
  supportsI2V?: boolean
  /** 图生视频是否支持首尾帧模式 */
  supportsFirstLast?: boolean
  /** 图生视频是否支持参考图模式 */
  supportsReference?: boolean
  /** 参考图模式：最大图片数量（后台模型配置，默认 5） */
  maxImages?: number
  /** 参考图模式：最大视频数量（后台模型配置，默认 0=不支持） */
  maxVideos?: number
  /** 参考图模式：最大音频数量（后台模型配置，默认 0=不支持） */
  maxAudios?: number
  /** 参考图模式：图片+视频+音频总素材上限（后台模型配置，0=不限制） */
  maxTotalAssets?: number
  /** 模型详情介绍页地址 */
  docsUrl?: string
  /** 分辨率档位（720/1080，后台维护，用于自动匹配与展示） */
  resolution?: number
  /** 速度评分（数值越小越快，后台维护） */
  speed?: number
  /** 价格档位（后台维护） */
  price?: number
  /** 选中该模型时预填的默认分辨率，如 720P / 1080P */
  defaultResolution?: string
  /** 选中该模型时预填的默认画面比例，如 16:9 */
  defaultRatio?: string
  /** 选中该模型时预填的默认时长（秒） */
  defaultDuration?: string
  /** 来源：system 系统自带 / user 用户自定义 */
  source?: 'system' | 'user'
  // ===== 步骤一新增：六层模型档案 =====
  /** 适用场景标签（JSON 数组解析后的字符串数组） */
  scenarios?: string[]
  /** 能力边界说明（自由文本） */
  capabilities?: string
  /** 使用限制（自由文本） */
  limitsText?: string
  /** 实测评分 0-100，0 表示未实测 */
  verifiedScore?: number
  /** 内容来源 URL（官方文档/社区帖子等） */
  sourceUrl?: string
  /** 授权类型（MIT/Apache/商用/免费额度/API 付费等） */
  license?: string
  /** 是否允许商用 */
  commercialAllowed?: boolean
  /** 部署要求：cloud/local/hybrid */
  deployment?: 'cloud' | 'local' | 'hybrid'
  // ===== 步骤一新增：三态审核 =====
  /** 审核状态：draft/review/published */
  reviewStatus?: 'draft' | 'review' | 'published'
}

export type ProviderId = string

/** 视频生成协议类型：决定请求体格式、鉴权方式与状态映射 */
export type VideoProtocol =
  | 'dashscope'   // 通义万相 DashScope（已实现）
  | 'ark'         // 火山引擎 Ark / Seedance（已实现）
  | 'kling'       // 可灵旧版设计标准（AccessKey:SecretKey + JWT）
  | 'kling-v2'    // 可灵新版设计标准（单个 API Key + /text-to-video/{model}）
  | 'minimax'     // MiniMax（API 端点已录入，协议待实现）
  | 'zhipu'       // 智谱 CogVideoX（API 端点已录入，协议待实现）
  | 'runway'      // Runway Gen-3（API 端点已录入，协议待实现）
  | 'luma'        // Luma Dream Machine（API 端点已录入，协议待实现）
  | 'openai'      // OpenAI Sora（API 端点已录入，协议待实现）
  | 'pika'        // Pika（API 端点占位，协议待实现）
  | 'google'      // Google Veo / Gemini Omni（predictLongRunning + operations 轮询）
  | 'heygen'      // HeyGen 数字人（video/generate + video_status）
  | 'synthesia'   // Synthesia 数字人（v2/videos 轮询）
  | 'd-id'        // D-ID 数字人（talks 轮询，需公网图片）

export interface Provider {
  id: ProviderId
  name: string
  /** Key prefix used to detect a valid-looking key, e.g. "sk-". */
  keyHint: string
  /** 供应商官网地址 */
  url: string
  /** API Key 获取/管理页面地址 */
  apiKeyUrl?: string
  /** API 调用端点（后端 providers.api_base_url，下发给主进程生成时使用） */
  apiBaseUrl?: string
  /** 视频生成协议；由后台供应商配置下发，客户端不再按 id 推断 */
  protocol?: VideoProtocol
  /** 任务提交路径（相对 apiBaseUrl），由后台配置 */
  submitPath?: string
  /** 任务查询路径（相对 apiBaseUrl，支持 {taskId} 占位符），由后台配置 */
  statusPath?: string
  /** 图生视频任务提交路径（后台可选配置，留空沿用 submitPath） */
  submitPathI2v?: string
  /** 图生视频任务查询路径（后台可选配置，留空沿用 statusPath） */
  statusPathI2v?: string
  models: ProviderModel[]
  /** 来源：system 系统自带 / user 用户自定义 */
  source?: 'system' | 'user'
}

export interface ApiKeyEntry {
  provider: ProviderId
  key: string
}

export interface UserState {
  loggedIn: boolean
  /** 后端用户 id，未登录为 null */
  userId: number | null
  username: string
  token: string
}

// 主面板布局调整相关类型
export type LayoutColumns = 2 | 3 | 4
/** 卡片内容样式：仅图标 / 图标+名称 / 图标+名称+描述 */
export type CardStyle = 'icon' | 'icon-name' | 'icon-name-desc'
/** 卡片密度：紧凑 / 标准 / 宽松 */
export type CardSize = 'compact' | 'standard' | 'loose'
/** 主题：明色 / 暗色 */
export type Theme = 'light' | 'dark'

// 模型推荐助手
export interface RecommendModel {
  name: string
  desc: string
  tag: string
}

export interface RecommendOption {
  label: string
  models: string[]
  note?: string
}

export interface RecommendQuestion {
  layer: string
  title: string
  options: RecommendOption[]
}

// AI 助手「使用指南」问答
export interface GuideQuestion {
  id: number
  category: string
  question: string
  answer: string
}

// ===== AI 视频工具导购目录 =====
export type ToolDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type ToolPricingTier = 'free' | 'freemium' | 'pay-per-use' | 'subscription' | 'premium-only'

/** 工具目录条目（bootstrap 下发的基础字段） */
export interface Tool {
  id: string
  name: string
  subtitle: string
  provider: string
  officialUrl: string
  logoUrl: string
  categories: string[]
  scenarios: string[]
  difficulty: ToolDifficulty
  pricingTier: ToolPricingTier
  startingPrice: string
  hasApi: boolean
  hasWebApp: boolean
  hasMobileApp: boolean
  hasOpenSource: boolean
  syncedAudio: boolean
  maxResolution: string
  maxClipSec: number
  supportsI2v: boolean
  supportsT2v: boolean
  supportsReference: boolean
  shortDesc: string
  notes: string
  /** 关联的后端供应商 id（有值表示可在 App 内直接生成） */
  providerId?: string
  /** 可调用模型白名单（为空表示该供应商全部已发布模型） */
  modelIds?: string[]
}

/** 工具详情（/api/tools/:id，额外包含长文本字段） */
export interface ToolDetail extends Tool {
  apiDocsUrl: string
  apiKeyUrl: string
  bannerUrl: string
  highlights: string[]
  limitations: string[]
  /** 配置引导 Markdown */
  setupSteps: string
  artificialAnalysisScore: number
}


