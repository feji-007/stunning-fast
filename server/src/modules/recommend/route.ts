import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

// ========== 推荐模型 CRUD ==========

/** 推荐模型列表（管理员）。 */
router.get('/models', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, description, tag, sort_order, is_active
       FROM recommend_models ORDER BY sort_order, id`
    )
    ok(res, { models: result.rows, total: result.rowCount })
  } catch (e) {
    next(e)
  }
})

/** 新增推荐模型。 */
router.post('/models', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id, name, desc = '', tag = '', sortOrder = 0 } = req.body ?? {}
    if (!id || !name) throw badRequest('id 和 name 必填')
    await query(
      `INSERT INTO recommend_models (id, name, description, tag, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [id, name, desc, tag, sortOrder]
    )
    ok(res, { id }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新推荐模型。 */
router.put('/models/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, desc, tag, sortOrder, isActive } = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM recommend_models WHERE id = ?', [id])
    if (!exists) throw notFound('推荐模型不存在')
    await query(
      `UPDATE recommend_models SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         tag = COALESCE(?, tag),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [name, desc, tag, sortOrder, isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除推荐模型。 */
router.delete('/models/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM recommend_models WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

// ========== 推荐问题 CRUD ==========

/** 推荐问题列表（管理员）。options 字段 JSON parse 后返回。 */
router.get('/questions', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, layer, title, options, sort_order, is_active
       FROM recommend_questions ORDER BY sort_order, id`
    )
    const questions = (result.rows as any[]).map((q) => {
      let options: any[] = []
      try { options = JSON.parse(q.options) } catch {}
      return { ...q, options }
    })
    ok(res, { questions, total: result.rowCount })
  } catch (e) {
    next(e)
  }
})

/** 新增推荐问题。 */
router.post('/questions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { layer, title, options = [], sortOrder = 0 } = req.body ?? {}
    if (!layer || !title) throw badRequest('layer 和 title 必填')
    const r = await query(
      `INSERT INTO recommend_questions (layer, title, options, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [layer, title, JSON.stringify(options), sortOrder]
    )
    ok(res, { id: r.insertId }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新推荐问题。 */
router.put('/questions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const { layer, title, options, sortOrder, isActive } = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM recommend_questions WHERE id = ?', [id])
    if (!exists) throw notFound('推荐问题不存在')
    const optionsJson = options !== undefined ? JSON.stringify(options) : undefined
    await query(
      `UPDATE recommend_questions SET
         layer = COALESCE(?, layer),
         title = COALESCE(?, title),
         options = COALESCE(?, options),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [layer, title, optionsJson, sortOrder, isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除推荐问题。 */
router.delete('/questions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM recommend_questions WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
