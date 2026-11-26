import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { ok } from '../../utils/response'
import { getAuthUser } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'

const router = Router()

// 所有收藏操作都需要登录，按 req.user.id 隔离

router.use(requireAuth)

/** 我的收藏列表（附工具详情）。 */
router.get('/', async (req, res, next) => {
  try {
    const user = getAuthUser(req)
    const result = await query(
      `SELECT f.tool_id, f.note, f.created_at,
              t.name, t.subtitle, t.logo_url, t.categories, t.scenarios,
              t.difficulty, t.pricing_tier, t.starting_price, t.has_api,
              t.has_web_app, t.has_mobile_app, t.has_open_source, t.synced_audio,
              t.short_desc
       FROM tool_favorites f
       JOIN tools t ON t.id = f.tool_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [user.id]
    )
    ok(res, { favorites: result.rows })
  } catch (e) {
    next(e)
  }
})

/** 添加收藏。 */
router.post('/:toolId', async (req, res, next) => {
  try {
    const user = getAuthUser(req)
    const { note = '' } = req.body ?? {}
    await query(
      `INSERT INTO tool_favorites (user_id, tool_id, note) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE note = VALUES(note)`,
      [user.id, req.params.toolId, note]
    )
    ok(res, { toolId: req.params.toolId }, '已收藏')
  } catch (e) {
    next(e)
  }
})

/** 取消收藏。 */
router.delete('/:toolId', async (req, res, next) => {
  try {
    const user = getAuthUser(req)
    await query('DELETE FROM tool_favorites WHERE user_id = ? AND tool_id = ?', [user.id, req.params.toolId])
    ok(res, { toolId: req.params.toolId }, '已取消')
  } catch (e) {
    next(e)
  }
})

/** 判断某个 toolId 是否已收藏（可选，用于卡片上显示"已收藏"按钮）。 */
router.get('/check/:toolId', async (req, res, next) => {
  try {
    const user = getAuthUser(req)
    const hit = await queryOne(
      'SELECT 1 FROM tool_favorites WHERE user_id = ? AND tool_id = ?',
      [user.id, req.params.toolId]
    )
    ok(res, { toolId: req.params.toolId, favorited: !!hit })
  } catch (e) {
    next(e)
  }
})

export default router
