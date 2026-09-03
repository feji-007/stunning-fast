import { Router } from 'express'
import { query } from '../../db/pool'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'
import { badRequest, notFound } from '../../utils/http'

const router = Router()

const SORT_COLUMNS: Record<string, string> = {
  id: 'f.id',
  status: 'f.status',
  created: 'f.created_at'
}
function buildOrderBy(sort?: string, order?: string): string {
  const col = SORT_COLUMNS[sort ?? 'created'] ?? 'f.created_at'
  const dir = String(order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  return `ORDER BY ${col} ${dir}, f.id DESC`
}
function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const rawSize = Number(req.query.pageSize)
  const pageSize = rawSize > 0 ? Math.min(rawSize, 200) : 20
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

/** 客户端提交意见反馈。 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const b = req.body ?? {}
    if (!b.content || !String(b.content).trim()) {
      throw badRequest('反馈内容必填')
    }
    const category = String(b.category ?? 'other').slice(0, 32)
    const title = String(b.title ?? '').slice(0, 128)
    const content = String(b.content).slice(0, 5000)
    const contact = String(b.contact ?? '').slice(0, 128)
    const r = await query(
      `INSERT INTO feedbacks (user_id, category, title, content, contact, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [u.id, category, title, content, contact]
    )
    ok(res, { id: r.insertId }, '已提交，感谢您的反馈')
  } catch (e) {
    next(e)
  }
})

/** 当前用户查询自己提交的反馈（可选，便于客户端查看历史）。 */
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const r = await query(
      `SELECT id, category, title, content, contact, status, admin_reply, created_at, updated_at
       FROM feedbacks
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [u.id]
    )
    ok(res, { feedbacks: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 管理员：反馈统计（总数 + 各状态计数，用于仪表盘新反馈通知）。 */
router.get('/stats', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const r = await query<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) AS replied_count,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count
       FROM feedbacks`
    )
    const row = (r.rows as any[])?.[0] ?? {}
    ok(res, {
      total: Number(row.total ?? 0),
      openCount: Number(row.open_count ?? 0),
      repliedCount: Number(row.replied_count ?? 0),
      closedCount: Number(row.closed_count ?? 0)
    })
  } catch (e) {
    next(e)
  }
})

/** 管理员：反馈列表（分页 + 状态/分类/关键字筛选）。 */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status, category, keyword } = req.query as Record<string, string>
    const { page, pageSize, offset } = parsePagination(req)
    const where: string[] = []
    const params: unknown[] = []
    if (status)   { where.push('f.status = ?');   params.push(status) }
    if (category){ where.push('f.category = ?'); params.push(category) }
    if (keyword)  { where.push('(f.title LIKE ? OR f.content LIKE ?)'); const k = `%${keyword}%`; params.push(k, k) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const cnt = await query<any>(`SELECT COUNT(*) AS c FROM feedbacks f ${whereSql}`, params)
    const total = Number((cnt.rows as any[])?.[0]?.c ?? 0)

    const r = await query(
      `SELECT f.id, f.user_id, u.username, f.category, f.title, f.content, f.contact,
              f.status, f.admin_reply, f.created_at, f.updated_at
       FROM feedbacks f
       LEFT JOIN users u ON u.id = f.user_id
       ${whereSql}
       ${buildOrderBy(req.query.sort as string, req.query.order as string)}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, {
      feedbacks: r.rows,
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (e) {
    next(e)
  }
})

/** 管理员：更新反馈状态 / 回复。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const b = req.body ?? {}
    const exists = await query('SELECT 1 FROM feedbacks WHERE id = ?', [id])
    if (!exists.rowCount) throw notFound('反馈不存在')
    // 状态：open / replied / closed
    const validStatus = ['open', 'replied', 'closed']
    const status = b.status && validStatus.includes(b.status) ? b.status : null
    const adminReply = b.adminReply !== undefined ? String(b.adminReply) : null
    if (status === null && adminReply === null) {
      throw badRequest('至少需要更新 status 或 adminReply')
    }
    // 若提供了回复，状态自动切为 replied（除非显式指定其他状态）
    let finalStatus = status
    if (adminReply !== null && adminReply.trim() && finalStatus === null) {
      finalStatus = 'replied'
    }
    await query(
      `UPDATE feedbacks SET
         status = COALESCE(?, status),
         admin_reply = COALESCE(?, admin_reply),
         updated_at = NOW()
       WHERE id = ?`,
      [finalStatus, adminReply, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 管理员：删除反馈。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM feedbacks WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
