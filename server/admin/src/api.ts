// 统一 API 客户端：封装 fetch + JWT，所有响应走 { code, message, data } 结构。

const TOKEN_KEY = 'stunning-admin-token'
const USER_KEY = 'stunning-admin-user'

export interface AdminUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
export function saveUser(u: AdminUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(u))
}
export function getStoredUser(): AdminUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(`服务器响应解析失败（${res.status}）`)
  }
  if (!res.ok || data.code !== 0) {
    // 401 时清理本地登录态
    if (res.status === 401) clearAuth()
    throw new Error(data.message || `请求失败 (${res.status})`)
  }
  return data.data as T
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' })
}

// ===== 认证 =====
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: AdminUser }>('/api/auth/login', { username, password }),
  me: () => api.get<{ user: AdminUser }>('/api/auth/me')
}

export interface PageQuery { page?: number; pageSize?: number }
export interface PageResult<T> {
  total: number
  page: number
  pageSize: number
  totalPages: number
  list?: T[]
}

function withPage(qs: URLSearchParams, p: PageQuery | undefined) {
  if (!p) return
  if (p.page)     qs.set('page', String(p.page))
  if (p.pageSize) qs.set('pageSize', String(p.pageSize))
}

// ===== 系统配置 =====
export const providersApi = {
  list: (p?: PageQuery) => {
    const qs = new URLSearchParams()
    withPage(qs, p)
    const q = qs.toString()
    return api.get<{
      providers: any[];
      total: number; page: number; pageSize: number; totalPages: number
    }>(`/api/providers${q ? `?${q}` : ''}`)
  },
  create: (b: any) => api.post('/api/providers', b),
  update: (id: string, b: any) => api.put(`/api/providers/${id}`, b),
  remove: (id: string) => api.del(`/api/providers/${id}`)
}
export const modelsApi = {
  list: (p?: PageQuery) => {
    const qs = new URLSearchParams()
    withPage(qs, p)
    const q = qs.toString()
    return api.get<{
      models: any[];
      total: number; page: number; pageSize: number; totalPages: number
    }>(`/api/models${q ? `?${q}` : ''}`)
  },
  create: (b: any) => api.post('/api/models', b),
  update: (id: string, b: any) => api.put(`/api/models/${id}`, b),
  remove: (id: string) => api.del(`/api/models/${id}`)
}
export const featuresApi = {
  list: () => api.get<{ features: any[] }>('/api/features'),
  create: (b: any) => api.post('/api/features', b),
  update: (id: string, b: any) => api.put(`/api/features/${id}`, b),
  batchUpdate: (features: any[]) => api.put('/api/features', { features }),
  remove: (id: string) => api.del(`/api/features/${id}`)
}
export const videoConfigApi = {
  list: () => api.get<{ options: Record<string, any[]> }>('/api/video-config'),
  create: (b: any) => api.post('/api/video-config', b),
  update: (id: number, b: any) => api.put(`/api/video-config/${id}`, b),
  remove: (id: number) => api.del(`/api/video-config/${id}`)
}
export const usersApi = {
  list: (p?: PageQuery) => {
    const qs = new URLSearchParams()
    withPage(qs, p)
    const q = qs.toString()
    return api.get<{
      users: any[];
      total: number; page: number; pageSize: number; totalPages: number
    }>(`/api/users${q ? `?${q}` : ''}`)
  },
  create: (b: any) => api.post('/api/users', b),
  update: (id: number, b: any) => api.put(`/api/users/${id}`, b),
  resetPassword: (id: number, password: string) =>
    api.post(`/api/users/${id}/reset-password`, { password }),
  remove: (id: number) => api.del(`/api/users/${id}`)
}
// ===== 任务记录与统计 =====
export const tasksApi = {
  list: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      qs.set(k, String(v))
    })
    const q = qs.toString()
    return api.get<{
      tasks: any[];
      total: number; page: number; pageSize: number; totalPages: number
    }>(`/api/tasks${q ? `?${q}` : ''}`)
  },
  remove: (id: number) => api.del(`/api/tasks/${id}`)
}
export const statsApi = {
  fetch: () =>
    api.get<{
      byProvider: any[]
      byModel: any[]
      total: { total_tasks: number; total_users: number; success_count: number; fail_count: number }
    }>('/api/tasks/stats')
}

// ===== 用户意见反馈管理 =====
export const feedbackApi = {
  list: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      qs.set(k, String(v))
    })
    const q = qs.toString()
    return api.get<{
      feedbacks: any[];
      total: number; page: number; pageSize: number; totalPages: number
    }>(`/api/feedback${q ? `?${q}` : ''}`)
  },
  stats: () =>
    api.get<{
      total: number
      openCount: number
      repliedCount: number
      closedCount: number
    }>('/api/feedback/stats'),
  update: (id: number, b: any) => api.put(`/api/feedback/${id}`, b),
  remove: (id: number) => api.del(`/api/feedback/${id}`)
}
