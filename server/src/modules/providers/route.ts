import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 供应商列表（含其下模型）。 */
router.get('/', async (_req, res, next) => {
  try {
    const providers = await query<{
      id: string; name: string; key_hint: string; url: string; sort_order: number; is_active: boolean
    }>('SELECT id, name, key_hint, url, sort_order, is_active FROM providers ORDER BY sort_order, id')
    const models = await query<{
      id: string; provider_id: string; name: string; type: string; description: string
      supports_i2v: boolean; resolution: number; speed: number; price: number; sort_order: number; is_active: boolean
    }>('SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price, sort_order, is_active FROM models ORDER BY sort_order, id')
    const tree = providers.rows.map((p) => ({
      ...p,
      models: models.rows.filter((m) => m.provider_id === p.id)
    }))
    ok(res, { providers: tree })
  } catch (e) {
    next(e)
  }
})

/** 仅返回活跃的供应商+模型（客户端拉取配置用，更精简）。 */
router.get('/active', async (_req, res, next) => {
  try {
    const providers = await query(
      `SELECT id, name, key_hint, url FROM providers WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const models = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price
       FROM models WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const tree = providers.rows.map((p: any) => ({
      ...p,
      models: models.rows.filter((m: any) => m.provider_id === p.id)
    }))
    ok(res, { providers: tree })
  } catch (e) {
    next(e)
  }
})

/** 新增供应商。 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id, name, keyHint = '', url = '', sortOrder = 0 } = req.body ?? {}
    if (!id || !name) throw badRequest('id 和 name 必填')
    await queryOne(
      `INSERT INTO providers (id, name, key_hint, url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [id, name, keyHint, url, sortOrder]
    )
    ok(res, { provider: { id, name } }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新供应商。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, keyHint, url, sortOrder, isActive } = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM providers WHERE id = ?', [id])
    if (!exists) throw notFound('供应商不存在')
    await query(
      `UPDATE providers SET
         name = COALESCE(?, name),
         key_hint = COALESCE(?, key_hint),
         url = COALESCE(?, url),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [name, keyHint, url, sortOrder, isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除供应商（级联删除其下模型）。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM providers WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router