import { Router } from 'express'
import { query } from '../../db/pool'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

const SORT_COLUMNS: Record<string, string> = {
  id: 't.id',
  provider: 't.provider_id',
  model: 't.model_id',
  user: 't.user_id',
  status: 't.status',
  created: 't.created_at'
}
function buildOrderBy(sort?: string, order?: string): string {
  const col = SORT_COLUMNS[sort ?? 'created'] ?? 't.created_at'
  const dir = String(order ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
  return `ORDER BY ${col} ${dir}, t.id DESC`
}
function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const rawSize = Number(req.query.pageSize)
  const pageSize = rawSize > 0 ? Math.min(rawSize, 200) : 20
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const b = req.body ?? {}
    if (!b.providerId || !b.modelId) {
      res.status(400).json({ code: 400, message: 'providerId / modelId 必填' })
      return
    }
    const r = await query(
      `INSERT INTO tasks (user_id, provider_id, model_id, gen_mode, status, resolution, ratio, duration, prompt, image_url, video_url, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id,
        b.providerId,
        b.modelId,
        b.genMode === 'i2v' ? 'i2v' : 't2v',
        b.status === 'fail' ? 'fail' : 'success',
        b.resolution ?? '',
        b.ratio ?? '',
        b.duration ?? '',
        b.prompt ?? '',
        b.imageUrl ?? '',
        b.videoUrl ?? '',
        b.errorMessage ?? ''
      ]
    )
    ok(res, { id: r.insertId }, '已记录')
  } catch (e) {
    next(e)
  }
})

router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { providerId, modelId, userId, status, sort, order } = req.query as Record<string, string>
    const { page, pageSize, offset } = parsePagination(req)
    const where: string[] = []
    const params: unknown[] = []
    if (providerId) { where.push('t.provider_id = ?'); params.push(providerId) }
    if (modelId)    { where.push('t.model_id = ?'); params.push(modelId) }
    if (userId)     { where.push('t.user_id = ?'); params.push(Number(userId)) }
    if (status)     { where.push('t.status = ?'); params.push(status) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const cntSql = `SELECT COUNT(*) AS c FROM tasks t ${whereSql}`
    const cnt = await query<any>(cntSql, params)
    const total = Number((cnt.rows as any[])?.[0]?.c ?? 0)

    const r = await query(
      `SELECT t.id, t.user_id, u.username, t.provider_id, t.model_id, t.gen_mode, t.status,
              t.resolution, t.ratio, t.duration, t.prompt, t.image_url, t.video_url, t.error_message, t.created_at
       FROM tasks t
       LEFT JOIN users u ON u.id = t.user_id
       ${whereSql}
       ${buildOrderBy(sort, order)}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, {
      tasks: r.rows,
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (e) {
    next(e)
  }
})

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const r = await query(
      `SELECT id, provider_id, model_id, gen_mode, status, resolution, ratio, duration, prompt, image_url, video_url, error_message, created_at
       FROM tasks
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 200`,
      [u.id]
    )
    ok(res, { tasks: r.rows })
  } catch (e) {
    next(e)
  }
})

router.get('/stats', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [byProvider, byModel, total] = await Promise.all([
      query(
        `SELECT t.provider_id, p.name AS provider_name,
                COUNT(*) AS task_count,
                COUNT(DISTINCT t.user_id) AS user_count
         FROM tasks t
         LEFT JOIN providers p ON p.id = t.provider_id
         GROUP BY t.provider_id, p.name
         ORDER BY task_count DESC`
      ),
      query(
        `SELECT t.model_id, t.provider_id, m.name AS model_name,
                COUNT(*) AS task_count,
                COUNT(DISTINCT t.user_id) AS user_count
         FROM tasks t
         LEFT JOIN models m ON m.id = t.model_id
         GROUP BY t.model_id, t.provider_id, m.name
         ORDER BY task_count DESC`
      ),
      query(
        `SELECT
           COUNT(*) AS total_tasks,
           COUNT(DISTINCT user_id) AS total_users,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
           SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) AS fail_count
         FROM tasks`
      )
    ])
    ok(res, {
      byProvider: byProvider.rows,
      byModel: byModel.rows,
      total: total.rows[0] ?? { total_tasks: 0, total_users: 0, success_count: 0, fail_count: 0 }
    })
  } catch (e) {
    next(e)
  }
})

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM tasks WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

// ===== 用户（按 user_id 隔离）删除自己的历史任务 =====

/** 删除当前用户的单条任务 */
router.delete('/mine/:id', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ code: 400, message: '任务 ID 无效' })
      return
    }
    const r = await query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, u.id])
    const affected = Number((r as any).affectedRows ?? 0)
    if (affected === 0) {
      res.status(404).json({ code: 404, message: '任务不存在或无权删除' })
      return
    }
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

/** 批量删除当前用户选中的任务；body: { ids: number[] } */
router.post('/mine/batch-delete', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const idsRaw: unknown = (req.body as any)?.ids
    if (!Array.isArray(idsRaw)) {
      res.status(400).json({ code: 400, message: 'ids 必须是数组' })
      return
    }
    const ids = idsRaw
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
    if (ids.length === 0) {
      ok(res, { deleted: 0 }, '未选择需要删除的任务')
      return
    }
    const placeholders = ids.map(() => '?').join(',')
    const r = await query(
      `DELETE FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
      [u.id, ...ids]
    )
    ok(res, { deleted: Number((r as any).affectedRows ?? 0) }, '批量删除完成')
  } catch (e) {
    next(e)
  }
})

/** 删除当前用户全部失败的任务（status = 'fail'） */
router.post('/mine/delete-failed', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const r = await query(
      "DELETE FROM tasks WHERE user_id = ? AND status = 'fail'",
      [u.id]
    )
    ok(res, { deleted: Number((r as any).affectedRows ?? 0) }, '已清理失败任务')
  } catch (e) {
    next(e)
  }
})

export default router
