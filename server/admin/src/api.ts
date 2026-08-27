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

// ===== 系统配置 =====
export const providersApi = {
  list: () => api.get<{ providers: any[] }>('/api/providers'),
  create: (b: any) => api.post('/api/providers', b),
  update: (id: string, b: any) => api.put(`/api/providers/${id}`, b),
  remove: (id: string) => api.del(`/api/providers/${id}`)
}
export const modelsApi = {
  list: () => api.get<{ models: any[] }>('/api/models'),
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
  list: () => api.get<{ users: any[] }>('/api/users'),
  create: (b: any) => api.post('/api/users', b),
  update: (id: number, b: any) => api.put(`/api/users/${id}`, b),
  resetPassword: (id: number, password: string) =>
    api.post(`/api/users/${id}/reset-password`, { password }),
  remove: (id: number) => api.del(`/api/users/${id}`)
}
// ===== 任务记录与统计 =====
export const tasksApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString()
    return api.get<{ tasks: any[] }>(`/api/tasks${qs ? `?${qs}` : ''}`)
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
