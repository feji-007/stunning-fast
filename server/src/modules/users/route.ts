import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { hashPassword } from '../../utils/password'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/

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
      `SELECT id, username, email, role, is_active, created_at, updated_at
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
    const { username, password, role = 'user', isActive = true, email = '' } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码必填')
    if (!['admin', 'user'].includes(role)) throw badRequest('role 仅支持 admin / user')
    const exists = await query('SELECT 1 FROM users WHERE username = ?', [username])
    if (exists.rowCount) throw badRequest('用户名已被占用')
    // 邮箱必填：校验格式与唯一性
    const emailVal = String(email ?? '').trim()
    if (!emailVal) throw badRequest('邮箱必填')
    if (!EMAIL_RE.test(emailVal)) throw badRequest('邮箱格式不正确')
    const taken = await queryOne('SELECT 1 FROM users WHERE email = ?', [emailVal])
    if (taken) throw badRequest('该邮箱已被其他用户使用')
    const hash = await hashPassword(password)
    const r = await query(
      `INSERT INTO users (username, password_hash, email, role, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hash, emailVal, role, isActive]
    )
    ok(res, { id: r.insertId, username, role, email: emailVal }, '已创建')
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
    const email = b.email
    // 兼容 camelCase (isActive) 和 snake_case (is_active)
    const isActive = b.isActive !== undefined ? b.isActive : b.is_active
    let passwordHash: string | undefined
    if (password) {
      if (password.length < 4) throw badRequest('密码至少 4 位')
      passwordHash = await hashPassword(password)
    }
    // 邮箱校验：填写时校验格式与唯一性（排除自身）；留空表示不修改
    let emailVal: string | undefined
    if (email !== undefined) {
      const trimmed = String(email).trim()
      if (trimmed) {
        if (!EMAIL_RE.test(trimmed)) throw badRequest('邮箱格式不正确')
        const taken = await queryOne('SELECT 1 FROM users WHERE email = ? AND id <> ?', [trimmed, id])
        if (taken) throw badRequest('该邮箱已被其他用户使用')
        emailVal = trimmed
      }
    }
    const r = await query(
      `UPDATE users SET
         username = COALESCE(?, username),
         password_hash = COALESCE(?, password_hash),
         email = COALESCE(?, email),
         role = COALESCE(?, role),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [username, passwordHash, emailVal, role, isActive, id]
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
