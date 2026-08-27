import jwt from 'jsonwebtoken'
import { config } from '../config'
import type { AuthUser } from './response'

/** 签发 JWT。 */
export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any })
}

/** 验证 JWT，失败抛出。 */
export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwtSecret) as any
  if (!payload || typeof payload.id !== 'number' || !payload.username || !payload.role) {
    throw new Error('无效的令牌')
  }
  return {
    id: payload.id,
    username: payload.username,
    role: payload.role
  }
}

/** 从 Authorization 头中提取 Bearer token。 */
export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const m = /^Bearer\s+(.+)$/i.exec(authHeader)
  return m ? m[1].trim() : null
}
