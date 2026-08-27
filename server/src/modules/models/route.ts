import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 全部模型列表。 */
router.get('/', async (_req, res, next) => {
  try {
    const r = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price, sort_order, is_active
       FROM models ORDER BY sort_order, id`
    )
    ok(res, { models: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 新增模型。 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.id || !b.providerId || !b.name) throw badRequest('id / providerId / name 必填')
    const provider = await queryOne('SELECT 1 FROM providers WHERE id = ?', [b.providerId])
    if (!provider) throw notFound('供应商不存在')
    await queryOne(
      `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, resolution, speed, price, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [b.id, b.providerId, b.name, b.type ?? 'video', b.description ?? '', b.supportsI2V ?? false,
       b.resolution ?? 720, b.speed ?? 60, b.price ?? 2, b.sortOrder ?? 0]
    )
    ok(res, { model: { id: b.id } }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新模型。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const b = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM models WHERE id = ?', [id])
    if (!exists) throw notFound('模型不存在')
    await query(
      `UPDATE models SET
         provider_id = COALESCE(?, provider_id),
         name = COALESCE(?, name),
         type = COALESCE(?, type),
         description = COALESCE(?, description),
         supports_i2v = COALESCE(?, supports_i2v),
         resolution = COALESCE(?, resolution),
         speed = COALESCE(?, speed),
         price = COALESCE(?, price),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [b.providerId, b.name, b.type, b.description, b.supportsI2V,
       b.resolution, b.speed, b.price, b.sortOrder, b.isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除模型。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM models WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router