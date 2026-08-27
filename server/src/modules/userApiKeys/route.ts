import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest } from '../../utils/http'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'

const router = Router()

// 所有路由都带 requireAuth，且严格按 req.user.id 过滤，确保用户只能看到自己的密钥。

/** 当前用户的 API 密钥列表。 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const r = await query(
      `SELECT provider_id, encrypted_key, updated_at
       FROM user_api_keys WHERE user_id = ? ORDER BY provider_id`,
      [u.id]
    )
    ok(res, { keys: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 保存/更新当前用户的某供应商密钥（upsert）。 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const { providerId, key } = req.body ?? {}
    if (!providerId || !key) throw badRequest('providerId 和 key 必填')
    await query(
      `INSERT INTO user_api_keys (user_id, provider_id, encrypted_key, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key), updated_at = NOW()`,
      [u.id, providerId, key]
    )
    ok(res, { providerId }, '已保存')
  } catch (e) {
    next(e)
  }
})

/** 删除当前用户的某供应商密钥。 */
router.delete('/:providerId', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const { providerId } = req.params
    await query(
      'DELETE FROM user_api_keys WHERE user_id = ? AND provider_id = ?',
      [u.id, providerId]
    )
    ok(res, { providerId }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router