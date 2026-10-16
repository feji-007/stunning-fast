import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'

const router = Router()

// ========== AI 助手「使用指南」问答 CRUD ==========

/** 使用指南问答列表（公开读，含停用项，供后台管理使用）。 */
router.get('/questions', async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT id, category, question, answer, sort_order, is_active
       FROM guide_questions ORDER BY sort_order, id`
    )
    ok(res, { questions: result.rows, total: result.rowCount })
  } catch (e) {
    next(e)
  }
})

/** 新增使用指南问答。 */
router.post('/questions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { category = '', question, answer, sortOrder = 0 } = req.body ?? {}
    if (!question || !answer) throw badRequest('question 和 answer 必填')
    const r = await query(
      `INSERT INTO guide_questions (category, question, answer, sort_order, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [category, question, answer, sortOrder]
    )
    ok(res, { id: r.insertId }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新使用指南问答。 */
router.put('/questions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const { category, question, answer, sortOrder, isActive } = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM guide_questions WHERE id = ?', [id])
    if (!exists) throw notFound('使用指南问答不存在')
    await query(
      `UPDATE guide_questions SET
         category = COALESCE(?, category),
         question = COALESCE(?, question),
         answer = COALESCE(?, answer),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [category, question, answer, sortOrder, isActive, id]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除使用指南问答。 */
router.delete('/questions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await query('DELETE FROM guide_questions WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
