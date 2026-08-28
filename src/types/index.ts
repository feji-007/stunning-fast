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
  /** 来源：system 系统自带 / user 用户自定义 */
  source?: 'system' | 'user'
}

export type ProviderId = string

export interface Provider {
  id: ProviderId
  name: string
  /** Key prefix used to detect a valid-looking key, e.g. "sk-". */
  keyHint: string
  /** 供应商官网地址，用于资源库卡片跳转 */
  url: string
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


