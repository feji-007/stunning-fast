import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { signToken } from '../../utils/jwt'
import { hashPassword, verifyPassword } from '../../utils/password'
import { badRequest, unauthorized } from '../../utils/http'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'

const router = Router()

/** 登录：用户名 + 密码，返回 JWT。 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码不能为空')
    const row = await queryOne<{
      id: number; username: string; password_hash: string; role: string; is_active: boolean
    }>('SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?', [username])
    if (!row || !row.is_active) throw unauthorized('用户不存在或已禁用')
    const okPwd = await verifyPassword(password, row.password_hash)
    if (!okPwd) throw unauthorized('密码错误')
    const token = signToken({ id: row.id, username: row.username, role: row.role as 'admin' | 'user' })
    ok(res, {
      token,
      user: { id: row.id, username: row.username, role: row.role }
    })
  } catch (e) {
    next(e)
  }
})

/** 注册：创建普通用户（管理员需在后台创建）。 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码不能为空')
    if (username.length < 2) throw badRequest('用户名至少 2 个字符')
    if (password.length < 4) throw badRequest('密码至少 4 位')
    const exists = await queryOne('SELECT 1 FROM users WHERE username = ?', [username])
    if (exists) throw badRequest('用户名已被占用')
    const hash = await hashPassword(password)
    const r = await query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES (?, ?, 'user', TRUE)`,
      [username, hash]
    )
    const id = r.insertId ?? 0
    const token = signToken({ id, username, role: 'user' })
    ok(res, { token, user: { id, username, role: 'user' } }, '注册成功')
  } catch (e) {
    next(e)
  }
})

/** 获取当前登录用户信息。 */
router.get('/me', requireAuth, (req, res) => {
  const u = getAuthUser(req)
  ok(res, { user: u })
})

export default router