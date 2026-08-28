import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { hashPassword } from '../../utils/password'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const rawSize = Number(req.query.pageSize)
  const pageSize = rawSize > 0 ? Math.min(rawSize, 200) : 20
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePagination(req)
    const cnt = await query<any>('SELECT COUNT(*) AS c FROM users')
    const total = Number((cnt.rows as any[])?.[0]?.c ?? 0)
    const r = await query(
      `SELECT id, username, role, is_active, created_at, updated_at
       FROM users ORDER BY id
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    )
    ok(res, {
      users: r.rows,
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (e) {
    next(e)
  }
})

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { username, password, role = 'user', isActive = true } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码必填')
    if (!['admin', 'user'].includes(role)) throw badRequest('role 仅支持 admin / user')
    const exists = await query('SELECT 1 FROM users WHERE username = ?', [username])
    if (exists.rowCount) throw badRequest('用户名已被占用')
    const hash = await hashPassword(password)
    const r = await query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES (?, ?, ?, ?)`,
      [username, hash, role, isActive]
    )
    ok(res, { id: r.insertId, username, role }, '已创建')
  } catch (e) {
    next(e)
  }
})

router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const b = req.body ?? {}
    const username = b.username
    const password = b.password
    const role = b.role
    // 兼容 camelCase (isActive) 和 snake_case (is_active)
    const isActive = b.isActive !== undefined ? b.isActive : b.is_active
    let passwordHash: string | undefined
    if (password) {
      if (password.length < 4) throw badRequest('密码至少 4 位')
      passwordHash = await hashPassword(password)
    }
    const r = await query(
      `UPDATE users SET
         username = COALESCE(?, username),
         password_hash = COALESCE(?, password_hash),
         role = COALESCE(?, role),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [username, passwordHash, role, isActive, id]
    )
    if (r.affectedRows === 0) throw notFound('用户不存在')
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

router.post('/:id/reset-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const { password } = req.body ?? {}
    if (!password || password.length < 4) throw badRequest('密码至少 4 位')
    const hash = await hashPassword(password)
    const r = await query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [hash, id]
    )
    if (r.affectedRows === 0) throw notFound('用户不存在')
    ok(res, { id }, '密码已重置')
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM users WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
