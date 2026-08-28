import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

/** 读取分页参数（兜底 & 范围校验）。 */
function parsePagination(req: any) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const rawSize = Number(req.query.pageSize)
  const pageSize = rawSize > 0 ? Math.min(rawSize, 200) : 20
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

/** 全部模型列表（分页）。 */
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePagination(req)
    const cnt = await queryOne<any>('SELECT COUNT(*) AS c FROM models')
    const total = Number(cnt?.c ?? 0)
    const r = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference, resolution, speed, price, source, sort_order, is_active
       FROM models ORDER BY sort_order, id
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    )
    ok(res, {
      models: r.rows,
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
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
      `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference, resolution, speed, price, source, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        b.id, b.providerId, b.name, b.type ?? 'video', b.description ?? '',
        b.supportsI2V ?? false, b.supportsFirstLast ?? false, b.supportsReference ?? false,
        b.resolution ?? 720, b.speed ?? 60, b.price ?? 2,
        b.source ?? 'system', b.sortOrder ?? 0
      ]
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
         supports_first_last = COALESCE(?, supports_first_last),
         supports_reference = COALESCE(?, supports_reference),
         resolution = COALESCE(?, resolution),
         speed = COALESCE(?, speed),
         price = COALESCE(?, price),
         source = COALESCE(?, source),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [
        b.providerId, b.name, b.type, b.description,
        b.supportsI2V, b.supportsFirstLast, b.supportsReference,
        b.resolution, b.speed, b.price,
        b.source, b.sortOrder, b.isActive, id
      ]
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

/**
 * 用户自定义模型：登录用户可添加自定义模型，source 固定为 'user'。
 * 与 admin POST 区别：不需要管理员权限，且 source 强制为 'user'。
 */
router.post('/user', requireAuth, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.id || !b.providerId || !b.name) throw badRequest('id / providerId / name 必填')
    const provider = await queryOne('SELECT 1 FROM providers WHERE id = ?', [b.providerId])
    if (!provider) throw notFound('供应商不存在')
    const exists = await queryOne('SELECT 1 FROM models WHERE id = ?', [b.id])
    if (exists) throw badRequest('模型 ID 已存在')
    await queryOne(
      `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference, resolution, speed, price, source, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, TRUE)`,
      [
        b.id, b.providerId, b.name, b.type ?? 'video', b.description ?? '',
        b.supportsI2V ?? false, b.supportsFirstLast ?? false, b.supportsReference ?? false,
        b.resolution ?? 720, b.speed ?? 60, b.price ?? 2, b.sortOrder ?? 0
      ]
    )
    ok(res, { model: { id: b.id, source: 'user' } }, '已创建自定义模型')
  } catch (e) {
    next(e)
  }
})

export default router
