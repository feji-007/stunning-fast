import { Router } from 'express'
import { query, queryOne, withTransaction } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 功能入口列表。 */
router.get('/', async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT id, name, icon, description, pinned, sort_order, is_active
       FROM features ORDER BY sort_order, id`
    )
    ok(res, { features: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 客户端拉取活跃功能（精简）。 */
router.get('/active', async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT id, name, icon, description, pinned FROM features WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    ok(res, { features: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 新增功能入口。 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.id || !b.name) throw badRequest('id 和 name 必填')
    await queryOne(
      `INSERT INTO features (id, name, icon, description, pinned, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [b.id, b.name, b.icon ?? '✨', b.description ?? '', b.pinned ?? true, b.sortOrder ?? 0]
    )
    ok(res, { feature: { id: b.id } }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新功能入口。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const b = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM features WHERE id = ?', [id])
    if (!exists) throw notFound('功能不存在')
    await query(
      `UPDATE features SET
         name = COALESCE(?, name),
         icon = COALESCE(?, icon),
         description = COALESCE(?, description),
         pinned = COALESCE(?, pinned),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [b.name, b.icon, b.description, b.pinned, b.sortOrder, b.isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 批量更新排序与 pinned 状态（拖拽保存用）。 */
router.put('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const list: Array<{ id: string; pinned?: boolean; sortOrder?: number }> = req.body?.features ?? []
    if (!Array.isArray(list)) throw badRequest('features 必须为数组')
    await withTransaction(async (client) => {
      for (let i = 0; i < list.length; i++) {
        const it = list[i]
        await client.query(
          `UPDATE features SET
             pinned = COALESCE(?, pinned),
             sort_order = COALESCE(?, sort_order),
             updated_at = NOW()
           WHERE id = ?`,
          [it.pinned, it.sortOrder ?? i, it.id]
        )
      }
    })
    ok(res, { count: list.length }, '已批量更新')
  } catch (e) {
    next(e)
  }
})

/** 删除功能入口。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM features WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router