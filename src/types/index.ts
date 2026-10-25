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
}

export type ProviderId = string

/** 视频生成协议类型：决定请求体格式、鉴权方式与状态映射 */
export type VideoProtocol =
  | 'dashscope'   // 通义万相 DashScope（已实现）
  | 'ark'         // 火山引擎 Ark / Seedance（已实现）
  | 'kling'       // 可灵（已实现）
  | 'minimax'     // MiniMax（API 端点已录入，协议待实现）
  | 'zhipu'       // 智谱 CogVideoX（API 端点已录入，协议待实现）
  | 'runway'      // Runway Gen-3（API 端点已录入，协议待实现）
  | 'luma'        // Luma Dream Machine（API 端点已录入，协议待实现）
  | 'openai'      // OpenAI Sora（API 端点已录入，协议待实现）
  | 'pika'        // Pika（API 端点占位，协议待实现）

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


