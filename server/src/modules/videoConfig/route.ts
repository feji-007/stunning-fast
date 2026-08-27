import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 按 config_key 分组返回所有选项。 */
router.get('/', async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT id, config_key, option_value, option_label, sort_order, is_active
       FROM video_config_options ORDER BY config_key, sort_order, id`
    )
    const grouped: Record<string, typeof r.rows> = {}
    for (const row of r.rows) {
      ;(grouped[row.config_key] ??= []).push(row)
    }
    ok(res, { options: grouped })
  } catch (e) {
    next(e)
  }
})

/** 客户端拉取活跃选项（精简，按 key 分组）。 */
router.get('/active', async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT config_key, option_value, option_label
       FROM video_config_options WHERE is_active = TRUE ORDER BY config_key, sort_order, id`
    )
    const grouped: Record<string, Array<{ value: string; label: string }>> = {}
    for (const row of r.rows as any[]) {
      ;(grouped[row.config_key] ??= []).push({ value: row.option_value, label: row.option_label })
    }
    ok(res, { options: grouped })
  } catch (e) {
    next(e)
  }
})

/** 新增选项。 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.configKey || !b.optionValue || !b.optionLabel) throw badRequest('configKey/optionValue/optionLabel 必填')
    const r = await query(
      `INSERT INTO video_config_options (config_key, option_value, option_label, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [b.configKey, b.optionValue, b.optionLabel, b.sortOrder ?? 0]
    )
    ok(res, { id: r.insertId }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新选项。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const b = req.body ?? {}
    const r = await query(
      `UPDATE video_config_options SET
         option_label = COALESCE(?, option_label),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [b.optionLabel, b.sortOrder, b.isActive, id]
    )
    if (r.affectedRows === 0) throw notFound('选项不存在')
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除选项。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM video_config_options WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router