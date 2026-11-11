// 客户端后端 API：封装 fetch + JWT，对接 server。
// 默认地址可通过环境变量 VITE_API_BASE_URL 在打包时覆盖（生产部署指向云服务器），
// 未设置时回退到 http://localhost:4178（本地开发）。
// 所有响应走 { code, message, data } 结构；401 自动清理本地登录态。

import type { GuideQuestion } from '../types'

const DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4178').replace(/\/+$/, '')
const API_BASE_KEY = 'stunning-fast-api-base'
const TOKEN_KEY = 'stunning-fast-token'

export function getApiBase(): string {
  return localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE
}
export function setApiBase(url: string) {
  localStorage.setItem(API_BASE_KEY, url.replace(/\/+$/, ''))
}

// 登录态：勾选「下次自动登录」时写入 localStorage（跨会话），
// 否则只写 sessionStorage，关闭会话即失效。
// 存储均不可用时退化为内存态，保证登录流程本身不受影响。
let memoryToken: string | null = null

export function getToken(): string | null {
  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY)
    if (sessionToken) return sessionToken
  } catch {
    // sessionStorage 不可用时继续尝试 localStorage
  }
  try {
    const localToken = localStorage.getItem(TOKEN_KEY)
    if (localToken) return localToken
  } catch {
    // localStorage 不可用时使用内存态
  }
  return memoryToken
}
export function setToken(token: string, persist = false) {
  memoryToken = token
  try {
    if (persist) {
      localStorage.setItem(TOKEN_KEY, token)
      sessionStorage.removeItem(TOKEN_KEY)
    } else {
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.setItem(TOKEN_KEY, token)
    }
  } catch {
    // 两种存储均不可用时，登录态只保留在内存中
  }
}
export function clearToken() {
  memoryToken = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase()
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(base + path, { ...options, headers })
  } catch {
    throw new ApiError('无法连接后台服务，请确认服务已启动', 0)
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new ApiError(`服务器响应解析失败（${res.status}）`, res.status)
  }
  if (!res.ok || data.code !== 0) {
    if (res.status === 401) clearToken()
    throw new ApiError(data.message || `请求失败 (${res.status})`, res.status)
  }
  return data.data as T
}

/** 带 HTTP 状态码的请求错误：0 表示网络不可达，调用方据此区分「凭证失效」与「网络异常」 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' })
}

// ===== 认证 =====
export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
}
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUser }>('/api/auth/login', { username, password }),
  register: (username: string, password: string, email: string, code: string) =>
    api.post<{ token: string; user: AuthUser }>('/api/auth/register', { username, password, email, code }),
  loginEmail: (email: string, code: string) =>
    api.post<{ token: string; user: AuthUser }>('/api/auth/login-email', { email, code }),
  sendEmailCode: (email: string, purpose: 'register' | 'login' = 'register') =>
    api.post<null>('/api/auth/send-email-code', { email, purpose }),
  me: () => api.get<{ user: AuthUser }>('/api/auth/me')
}

// ===== 客户端启动聚合配置（替代硬编码 models.ts） =====
export const bootstrapApi = {
  fetch: () =>
    api.get<{
      providers: any[]
      features: any[]
      videoConfig: Record<string, Array<{ value: string; label: string }>>
      recommendModels: Record<string, { name: string; desc: string; tag: string }>
      recommendQuestions: Array<{ layer: string; title: string; options: Array<{ label: string; models: string[]; note?: string }> }>
      guideQuestions: GuideQuestion[]
    }>('/api/bootstrap')
}

// ===== 用户私有配置（按用户隔离） =====
export const userApiKeysApi = {
  list: () =>
    api.get<{ keys: Array<{ provider_id: string; encrypted_key: string }> }>('/api/user/api-keys'),
  save: (providerId: string, key: string) =>
    api.post('/api/user/api-keys', { providerId, key }),
  remove: (providerId: string) =>
    api.del(`/api/user/api-keys/${encodeURIComponent(providerId)}`)
}
export const userConfigsApi = {
  list: () =>
    api.get<{ configs: Record<string, { value: string; type: string }> }>('/api/user/configs'),
  save: (configs: Array<{ key: string; value: string; type?: string }>) =>
    api.post('/api/user/configs', { configs })
}

// ===== 任务记录（客户端生成视频后写入，供后台统计） =====
export const tasksApi = {
  record: (b: {
    providerId: string
    modelId: string
    genMode?: 't2v' | 'i2v'
    status?: 'success' | 'fail'
    resolution?: string
    ratio?: string
    duration?: string
    prompt?: string
    imageUrl?: string
    videoUrl?: string
    errorMessage?: string
  }) => api.post('/api/tasks', b),
  listMine: () =>
    api.get<{ tasks: Array<{
      id: number
      provider_id: string
      model_id: string
      gen_mode: string
      status: string
      resolution: string
      ratio: string
      duration: string
      prompt: string
      image_url: string
      video_url: string
      error_message: string
      created_at: string
    }> }>('/api/tasks/mine'),
  /** 删除当前用户自己的一条任务 */
  deleteMine: (id: number) =>
    api.del<{ id: number }>(`/api/tasks/mine/${encodeURIComponent(String(id))}`),
  /** 批量删除当前用户选中的任务 */
  batchDeleteMine: (ids: number[]) =>
    api.post<{ deleted: number }>('/api/tasks/mine/batch-delete', { ids }),
  /** 删除当前用户全部失败任务（status = 'fail'） */
  deleteFailedMine: () =>
    api.post<{ deleted: number }>('/api/tasks/mine/delete-failed', {})
}

// ===== 用户意见反馈（客户端提交，管理员查看） =====
export const feedbackApi = {
  submit: (b: {
    category?: string
    title?: string
    content: string
    contact?: string
  }) => api.post<{ id: number }>('/api/feedback', b),
  listMine: () =>
    api.get<{ feedbacks: Array<{
      id: number
      category: string
      title: string
      content: string
      contact: string
      status: string
      admin_reply: string | null
      created_at: string
      updated_at: string
    }> }>('/api/feedback/mine')
}

