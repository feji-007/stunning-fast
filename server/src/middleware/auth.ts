import type { NextFunction, Request, Response } from 'express'
import { extractBearer, verifyToken } from '../utils/jwt'
import { unauthorized, forbidden } from '../utils/http'
import type { AuthUser } from '../utils/response'

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

/** 要求登录：验证 JWT，注入 req.user。 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearer(req.headers.authorization)
    if (!token) throw unauthorized()
    const user = verifyToken(token)
    req.user = user
    next()
  } catch (e) {
    next(unauthorized())
  }
}

/** 要求管理员：必须先登录且 role === 'admin'。 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return next(forbidden('需要管理员权限'))
  }
  next()
}
