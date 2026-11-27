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

/** 全部模型列表（分页，支持按 review_status / provider_id 筛选）。 */
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePagination(req)
    const reviewStatus = (req.query.reviewStatus as string) || ''
    const providerId = (req.query.providerId as string) || ''
    const search = String(req.query.search ?? '').trim()

    const wh: string[] = []
    const params: unknown[] = []
    if (reviewStatus) { wh.push('review_status = ?'); params.push(reviewStatus) }
    if (providerId) { wh.push('provider_id = ?'); params.push(providerId) }
    if (search) {
      const s = `%${search.toLowerCase()}%`
      wh.push('(LOWER(id) LIKE ? OR LOWER(name) LIKE ? OR LOWER(description) LIKE ?)')
      params.push(s, s, s)
    }
    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : ''

    const cntSql = `SELECT COUNT(*) AS c FROM models ${where}`
    const cnt = await queryOne<any>(cntSql, params)
    const total = Number(cnt?.c ?? 0)
    const r = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference,
              max_images, max_videos, max_audios, max_total_assets,
              resolution, speed, price, default_resolution, default_ratio, default_duration,
              docs_url, source, sort_order, is_active,
              scenarios, capabilities, limits_text, verified_score, source_url,
              license, commercial_allowed, deployment,
              review_status, reviewer_id, reviewed_at
       FROM models ${where}
       ORDER BY sort_order, id
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
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
    const scenarios = b.scenarios ? JSON.stringify(b.scenarios) : null
    const isActive = b.isActive ?? true
    await queryOne(
      `INSERT INTO models (id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference,
         max_images, max_videos, max_audios, max_total_assets,
         resolution, speed, price, default_resolution, default_ratio, default_duration, docs_url, source, sort_order, is_active,
         scenarios, capabilities, limits_text, verified_score, source_url,
         license, commercial_allowed, deployment, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id, b.providerId, b.name, b.type ?? 'video', b.description ?? '',
        b.supportsI2V ?? false, b.supportsFirstLast ?? false, b.supportsReference ?? false,
        b.maxImages ?? 5, b.maxVideos ?? 0, b.maxAudios ?? 0, b.maxTotalAssets ?? 0,
        b.resolution ?? 720, b.speed ?? 60, b.price ?? 2,
        b.defaultResolution ?? '', b.defaultRatio ?? '', b.defaultDuration ?? '',
        b.docsUrl ?? '', b.source ?? 'system', b.sortOrder ?? 0, isActive ? 1 : 0,
        scenarios, b.capabilities ?? null, b.limitsText ?? null,
        Number(b.verifiedScore) || 0, b.sourceUrl ?? '',
        b.license ?? '', !!b.commercialAllowed, b.deployment ?? 'cloud',
        b.reviewStatus ?? 'published'
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
    // scenarios: 客户端传数组 → JSON 字符串；null 表示不修改
    let scenariosSql = 'scenarios = COALESCE(?, scenarios)'
    let scenariosVal: any = null
    if (Array.isArray(b.scenarios)) {
      scenariosSql = 'scenarios = ?'
      scenariosVal = JSON.stringify(b.scenarios)
    } else if (b.scenarios === null) {
      scenariosSql = 'scenarios = NULL'
    }
    const reviewSql = b.reviewStatus
      ? `review_status = ?, reviewer_id = ?, reviewed_at = NOW()`
      : 'review_status = COALESCE(?, review_status)'
    const reviewArgs = b.reviewStatus
      ? [b.reviewStatus, (req as any).adminUserId ?? null]
      : [null]
    await query(
      `UPDATE models SET
         provider_id = COALESCE(?, provider_id),
         name = COALESCE(?, name),
         type = COALESCE(?, type),
         description = COALESCE(?, description),
         supports_i2v = COALESCE(?, supports_i2v),
         supports_first_last = COALESCE(?, supports_first_last),
         supports_reference = COALESCE(?, supports_reference),
         max_images = COALESCE(?, max_images),
         max_videos = COALESCE(?, max_videos),
         max_audios = COALESCE(?, max_audios),
         max_total_assets = COALESCE(?, max_total_assets),
         resolution = COALESCE(?, resolution),
         speed = COALESCE(?, speed),
         price = COALESCE(?, price),
         default_resolution = COALESCE(?, default_resolution),
         default_ratio = COALESCE(?, default_ratio),
         default_duration = COALESCE(?, default_duration),
         docs_url = COALESCE(?, docs_url),
         source = COALESCE(?, source),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         ${scenariosSql},
         capabilities = COALESCE(?, capabilities),
         limits_text = COALESCE(?, limits_text),
         verified_score = COALESCE(?, verified_score),
         source_url = COALESCE(?, source_url),
         license = COALESCE(?, license),
         commercial_allowed = COALESCE(?, commercial_allowed),
         deployment = COALESCE(?, deployment),
         ${reviewSql},
         updated_at = NOW()
       WHERE id = ?`,
      [
        b.providerId, b.name, b.type, b.description,
        b.supportsI2V, b.supportsFirstLast, b.supportsReference,
        b.maxImages, b.maxVideos, b.maxAudios, b.maxTotalAssets,
        b.resolution, b.speed, b.price,
        b.defaultResolution, b.defaultRatio, b.defaultDuration,
        b.docsUrl,
        b.source, b.sortOrder, b.isActive,
        scenariosVal,
        b.capabilities, b.limitsText,
        b.verifiedScore != null ? Number(b.verifiedScore) : null,
        b.sourceUrl,
        b.license,
        b.commercialAllowed != null ? !!b.commercialAllowed : null,
        b.deployment,
        ...reviewArgs,
        id
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

export default router
