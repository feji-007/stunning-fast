import { Router } from 'express'
import { query } from '../../db/pool'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

// 排序字段白名单 + 方向校验，避免 SQL 注入。
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

/**
 * 记录一条任务生成记录（客户端生成视频后调用，仅登录用户）。
 * user_id 由 JWT 注入，避免前端伪造。
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const b = req.body ?? {}
    if (!b.providerId || !b.modelId) {
      res.status(400).json({ code: 400, message: 'providerId / modelId 必填' })
      return
    }
    const r = await query(
      `INSERT INTO tasks (user_id, provider_id, model_id, gen_mode, status, resolution, ratio, duration, prompt, video_url, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        b.videoUrl ?? '',
        b.errorMessage ?? ''
      ]
    )
    ok(res, { id: r.insertId }, '已记录')
  } catch (e) {
    next(e)
  }
})

/**
 * 任务列表（仅管理员）：支持按服务商/模型/用户/状态过滤 + 排序。
 * 关联 users 读取可读用户名。
 */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { providerId, modelId, userId, status, sort, order } = req.query as Record<string, string>
    const where: string[] = []
    const params: unknown[] = []
    if (providerId) { where.push('t.provider_id = ?'); params.push(providerId) }
    if (modelId)    { where.push('t.model_id = ?'); params.push(modelId) }
    if (userId)     { where.push('t.user_id = ?'); params.push(Number(userId)) }
    if (status)     { where.push('t.status = ?'); params.push(status) }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const r = await query(
      `SELECT t.id, t.user_id, u.username, t.provider_id, t.model_id, t.gen_mode, t.status,
              t.resolution, t.ratio, t.duration, t.prompt, t.video_url, t.error_message, t.created_at
       FROM tasks t
       LEFT JOIN users u ON u.id = t.user_id
       ${whereSql}
       ${buildOrderBy(sort, order)}
       LIMIT 1000`,
      params
    )
    ok(res, { tasks: r.rows })
  } catch (e) {
    next(e)
  }
})

/**
 * 统计（仅管理员）：
 *   - byProvider: 每家服务商的 任务数 + 用户数
 *   - byModel:    每个模型的 任务数 + 用户数
 *   - total:      总任务数 / 总用户数 / 成功数 / 失败数
 */
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

/** 删除一条任务记录（仅管理员）。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM tasks WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
