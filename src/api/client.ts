// 客户端后端 API：封装 fetch + JWT，对接 server（默认 http://localhost:4178）。
// 所有响应走 { code, message, data } 结构；401 自动清理本地登录态。

const DEFAULT_API_BASE = 'http://localhost:4178'
const API_BASE_KEY = 'stunning-fast-api-base'
const TOKEN_KEY = 'stunning-fast-token'

export function getApiBase(): string {
  return localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE
}
export function setApiBase(url: string) {
  localStorage.setItem(API_BASE_KEY, url.replace(/\/+$/, ''))
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
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
    throw new Error('无法连接后台服务，请确认服务已启动')
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(`服务器响应解析失败（${res.status}）`)
  }
  if (!res.ok || data.code !== 0) {
    if (res.status === 401) clearToken()
    throw new Error(data.message || `请求失败 (${res.status})`)
  }
  return data.data as T
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
  register: (username: string, password: string) =>
    api.post<{ token: string; user: AuthUser }>('/api/auth/register', { username, password }),
  me: () => api.get<{ user: AuthUser }>('/api/auth/me')
}

// ===== 客户端启动聚合配置（替代硬编码 models.ts） =====
export const bootstrapApi = {
  fetch: () =>
    api.get<{
      providers: any[]
      features: any[]
      videoConfig: Record<string, Array<{ value: string; label: string }>>
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
    }> }>('/api/tasks/mine')
}

// ===== 用户自定义供应商与模型（登录用户可添加，source='user'） =====
export const userProvidersApi = {
  create: (b: {
    id: string
    name: string
    keyHint?: string
    url?: string
    sortOrder?: number
  }) => api.post<{ provider: { id: string; name: string; source: 'user' } }>('/api/providers/user', b)
}
export const userModelsApi = {
  create: (b: {
    id: string
    providerId: string
    name: string
    type?: string
    description?: string
    supportsI2V?: boolean
    resolution?: number
    speed?: number
    price?: number
    sortOrder?: number
  }) => api.post<{ model: { id: string; source: 'user' } }>('/api/models/user', b)
}

