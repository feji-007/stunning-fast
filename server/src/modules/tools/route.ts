import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { badRequest, notFound } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'

const router = Router()

/**
 * 工具目录列表（公开）。
 * 支持筛选：category / scenario / has_api / has_web_app / has_mobile_app /
 *           has_open_source / synced_audio / pricing_tier / difficulty / search / limit / offset
 * 排序：默认 sort_order 升序；也支持 artificial_analysis_score DESC（热门）、sort_order ASC（置顶）。
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      category, scenario, has_api, has_web_app, has_mobile_app,
      has_open_source, synced_audio, pricing_tier, difficulty,
      search, sort, limit = 50, offset = 0
    } = req.query as Record<string, string | undefined>

    const wh = [`is_active = TRUE`]
    const params: unknown[] = []

    const likeIn = (col: string, val: string | undefined) => {
      if (!val) return
      // categories / scenarios 是逗号分隔字符串，LIKE 匹配任一标签
      val.split(',').forEach((v) => {
        const trim = v.trim()
        if (trim) {
          wh.push(`FIND_IN_SET(?, ${col}) > 0`)
          params.push(trim)
        }
      })
    }

    likeIn('categories', category)
    likeIn('scenarios', scenario)

    const eq = (col: string, val: string | undefined) => {
      if (val === undefined || val === '') return
      wh.push(`${col} = ?`)
      params.push(val)
    }
    eq('pricing_tier', pricing_tier)
    eq('difficulty', difficulty)

    const boolEq = (col: string, val: string | undefined) => {
      if (val === undefined) return
      const v = val === 'true' || val === '1' ? 1 : 0
      wh.push(`${col} = ?`)
      params.push(v)
    }
    boolEq('has_api', has_api)
    boolEq('has_web_app', has_web_app)
    boolEq('has_mobile_app', has_mobile_app)
    boolEq('has_open_source', has_open_source)
    boolEq('synced_audio', synced_audio)

    if (search) {
      const s = `%${search.toLowerCase()}%`
      wh.push(`(LOWER(name) LIKE ? OR LOWER(provider) LIKE ? OR LOWER(short_desc) LIKE ? OR LOWER(categories) LIKE ?)`)
      params.push(s, s, s, s)
    }

    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : ''

    let order = 'sort_order ASC, artificial_analysis_score DESC, id ASC'
    if (sort === 'popular') order = 'artificial_analysis_score DESC, sort_order ASC, id ASC'
    if (sort === 'new') order = 'created_at DESC, sort_order ASC'

    const lim = Math.max(1, Math.min(200, Number(limit)))
    const off = Math.max(0, Number(offset))

    const result = await query(
      `SELECT * FROM tools ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, lim, off]
    )

    ok(res, { tools: result.rows, total: result.rowCount })
  } catch (e) {
    next(e)
  }
})

/** 工具详情（公开，含 setup_steps Markdown）。 */
router.get('/:id', async (req, res, next) => {
  try {
    const tool = await queryOne('SELECT * FROM tools WHERE id = ?', [req.params.id])
    if (!tool) throw notFound('工具不存在')
    ok(res, { tool })
  } catch (e) {
    next(e)
  }
})

/**
 * 按场景标签推荐（公开）。
 * GET /api/tools/recommend?scenario=shorts,talking-head&limit=8
 */
router.get('/recommend', async (req, res, next) => {
  try {
    const { scenario, limit = 8 } = req.query as Record<string, string | undefined>
    if (!scenario) throw badRequest('scenario 参数必填')
    const params: unknown[] = []
    const wh: string[] = []
    scenario.split(',').forEach((s) => {
      const trim = s.trim()
      if (trim) {
        wh.push(`FIND_IN_SET(?, scenarios) > 0`)
        params.push(trim)
      }
    })
    if (wh.length === 0) throw badRequest('无效的 scenario')
    const result = await query(
      `SELECT * FROM tools WHERE is_active = TRUE AND (${wh.join(' OR ')}) ORDER BY artificial_analysis_score DESC, sort_order ASC LIMIT ?`,
      [...params, Math.min(30, Number(limit))]
    )
    ok(res, { tools: result.rows, scenario })
  } catch (e) {
    next(e)
  }
})

/** 用户提交工具反馈（公开，不需要登录）。 */
router.post('/feedback', async (req, res, next) => {
  try {
    const { toolName = '', toolUrl = '', message = '', userContact = '' } = req.body ?? {}
    if (!toolName && !message) throw badRequest('至少提供工具名或反馈内容')
    // 暂不入库（后续加 feedback_tools 表再处理），先返回成功
    ok(res, { received: true }, '已收到，感谢反馈')
  } catch (e) {
    next(e)
  }
})

// ========== 管理员 CRUD（预留） ==========

/** 新增工具（管理员）。 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { id, name } = req.body ?? {}
    if (!id || !name) throw badRequest('id 和 name 必填')
    const exists = await queryOne('SELECT 1 FROM tools WHERE id = ?', [id])
    if (exists) throw badRequest('id 已存在')
    const body = req.body as any
    const columns = [
      'id', 'name', 'subtitle', 'provider', 'official_url', 'api_docs_url', 'api_key_url',
      'logo_url', 'banner_url', 'categories', 'scenarios', 'difficulty', 'pricing_tier',
      'starting_price', 'has_api', 'has_web_app', 'has_mobile_app', 'has_open_source',
      'synced_audio', 'max_resolution', 'max_clip_sec', 'supports_i2v', 'supports_t2v',
      'supports_reference', 'short_desc', 'highlights', 'limitations', 'setup_steps',
      'notes', 'artificial_analysis_score', 'sort_order'
    ]
    const placeholders = columns.map(() => '?').join(',')
    const sql = `INSERT INTO tools (${columns.map((c) => `\`${c}\``).join(',')}) VALUES (${placeholders})`
    await query(sql, columns.map((c) => body[c] ?? ''))
    ok(res, { id }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 更新工具（管理员）。 */
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const exists = await queryOne('SELECT 1 FROM tools WHERE id = ?', [req.params.id])
    if (!exists) throw notFound('工具不存在')
    const body = req.body as any
    const updatable = [
      'name', 'subtitle', 'provider', 'official_url', 'api_docs_url', 'api_key_url',
      'logo_url', 'banner_url', 'categories', 'scenarios', 'difficulty', 'pricing_tier',
      'starting_price', 'has_api', 'has_web_app', 'has_mobile_app', 'has_open_source',
      'synced_audio', 'max_resolution', 'max_clip_sec', 'supports_i2v', 'supports_t2v',
      'supports_reference', 'short_desc', 'highlights', 'limitations', 'setup_steps',
      'notes', 'artificial_analysis_score', 'sort_order', 'is_active'
    ]
    const sets: string[] = []
    const params: unknown[] = []
    for (const c of updatable) {
      if (body[c] !== undefined) {
        sets.push(`\`${c}\` = ?`)
        params.push(body[c])
      }
    }
    if (sets.length === 0) return ok(res, { id: req.params.id }, '没有字段要更新')
    params.push(req.params.id)
    await query(`UPDATE tools SET ${sets.join(',')}, updated_at = NOW() WHERE id = ?`, params)
    ok(res, { id: req.params.id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 删除工具（管理员）。 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await query('DELETE FROM tool_favorites WHERE tool_id = ?', [req.params.id])
    await query('DELETE FROM tools WHERE id = ?', [req.params.id])
    ok(res, { id: req.params.id }, '已删除')
  } catch (e) {
    next(e)
  }
})

export default router
