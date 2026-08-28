import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 读取分页参数（兜底 & 范围校验），避免 SQL 中出现 LIMIT 0 或超大数字。 */
function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const rawSize = Number(req.query.pageSize)
  const pageSize = rawSize > 0 ? Math.min(rawSize, 200) : 20
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

/** 供应商列表（含其下模型）。分页：query.page / query.pageSize */
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePagination(req)
    // 先计数（按供应商颗粒度）
    const cnt = await queryOne<any>('SELECT COUNT(*) AS c FROM providers')
    const total = Number(cnt?.c ?? 0)
    const providers = await query<{
      id: string; name: string; key_hint: string; url: string; source: string; sort_order: number; is_active: boolean
    }>('SELECT id, name, key_hint, url, source, sort_order, is_active FROM providers ORDER BY sort_order, id LIMIT ? OFFSET ?', [pageSize, offset])
    const models = await query<{
      id: string; provider_id: string; name: string; type: string; description: string
      supports_i2v: boolean; supports_first_last: boolean; supports_reference: boolean;
      resolution: number; speed: number; price: number; source: string; sort_order: number; is_active: boolean
    }>('SELECT id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference, resolution, speed, price, source, sort_order, is_active FROM models ORDER BY sort_order, id')
    const tree = providers.rows.map((p) => ({
      ...p,
      models: models.rows.filter((m: any) => m.provider_id === p.id)
    }))
    ok(res, {
      providers: tree,
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (e) {
    next(e)
  }
})

/** 仅返回活跃的供应商+模型（客户端拉取配置用，更精简）。 */
router.get('/active', async (_req, res, next) => {
  try {
    const providers = await query(
      `SELECT id, name, key_hint, url, source FROM providers WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const models = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price, source
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
    const { id, name, keyHint = '', url = '', source = 'system', sortOrder = 0 } = req.body ?? {}
    if (!id || !name) throw badRequest('id 和 name 必填')
    await queryOne(
      `INSERT INTO providers (id, name, key_hint, url, source, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [id, name, keyHint, url, source, sortOrder]
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
    const { name, keyHint, url, source, sortOrder, isActive } = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM providers WHERE id = ?', [id])
    if (!exists) throw notFound('供应商不存在')
    await query(
      `UPDATE providers SET
         name = COALESCE(?, name),
         key_hint = COALESCE(?, key_hint),
         url = COALESCE(?, url),
         source = COALESCE(?, source),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [name, keyHint, url, source, sortOrder, isActive, id]
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

/**
 * 用户自定义供应商：登录用户可添加自定义供应商，source 固定为 'user'。
 * 与 admin POST 区别：不需要管理员权限，且 source 强制为 'user'。
 */
router.post('/user', requireAuth, async (req, res, next) => {
  try {
    const { id, name, keyHint = '', url = '', sortOrder = 0 } = req.body ?? {}
    if (!id || !name) throw badRequest('id 和 name 必填')
    const exists = await queryOne('SELECT 1 FROM providers WHERE id = ?', [id])
    if (exists) throw badRequest('供应商 ID 已存在')
    await queryOne(
      `INSERT INTO providers (id, name, key_hint, url, source, sort_order, is_active)
       VALUES (?, ?, ?, ?, 'user', ?, TRUE)`,
      [id, name, keyHint, url, sortOrder]
    )
    ok(res, { provider: { id, name, source: 'user' } }, '已创建自定义供应商')
  } catch (e) {
    next(e)
  }
})

export default router
