import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { hashPassword } from '../../utils/password'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 用户列表（不含密码）。 */
router.get('/', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT id, username, role, is_active, created_at, updated_at
       FROM users ORDER BY id`
    )
    ok(res, { users: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 创建用户（管理员可指定角色）。 */
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

/** 更新用户（启用/禁用、改角色）。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const { role, isActive } = req.body ?? {}
    const r = await query(
      `UPDATE users SET
         role = COALESCE(?, role),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [role, isActive, id]
    )
    if (r.affectedRows === 0) throw notFound('用户不存在')
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 重置密码（仅管理员）。 */
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

/** 删除用户。 */
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