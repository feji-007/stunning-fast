import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest } from '../../utils/http'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'

const router = Router()

// 用户自定义配置：面板尺寸、布局、透明度、功能排序等。
// 严格按 req.user.id 过滤，用户只能看到/修改自己的配置。

/** 当前用户的全部配置（返回 key->value 映射）。 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const r = await query(
      `SELECT config_key, config_value, config_type
       FROM user_configs WHERE user_id = ?`,
      [u.id]
    )
    const map: Record<string, { value: string; type: string }> = {}
    for (const row of r.rows as any[]) {
      map[row.config_key] = { value: row.config_value, type: row.config_type }
    }
    ok(res, { configs: map })
  } catch (e) {
    next(e)
  }
})

/** 批量保存当前用户配置（upsert）。 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const items: Array<{ key: string; value: string; type?: string }> = req.body?.configs ?? []
    if (!Array.isArray(items)) throw badRequest('configs 必须为数组')
    for (const it of items) {
      if (!it.key) continue
      await query(
        `INSERT INTO user_configs (user_id, config_key, config_value, config_type, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), config_type = VALUES(config_type), updated_at = NOW()`,
        [u.id, it.key, it.value ?? '', it.type ?? 'string']
      )
    }
    ok(res, { count: items.length }, '已保存')
  } catch (e) {
    next(e)
  }
})

/** 删除当前用户的某项配置。 */
router.delete('/:key', requireAuth, async (req, res, next) => {
  try {
    const u = getAuthUser(req)
    const { key } = req.params
    await query('DELETE FROM user_configs WHERE user_id = ? AND config_key = ?', [u.id, key])
    ok(res, { key }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router