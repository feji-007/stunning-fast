import type { Response, Request } from 'express'

/** 统一成功响应。 */
export function ok<T>(res: Response, data?: T, message = 'ok') {
  return res.json({ code: 0, message, data })
}

/** 统一失败响应。 */
export function fail(res: Response, code: number, message: string, extra?: Record<string, unknown>) {
  return res.status(code >= 100 && code < 600 ? code : 500).json({
    code,
    message,
    ...extra
  })
}

/** 从请求中取出已认证用户（由 auth 中间件注入）。 */
export function getAuthUser(req: Request): AuthUser {
  const u = (req as any).user as AuthUser | undefined
  if (!u) throw new Error('未认证')
  return u
}

export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
}
