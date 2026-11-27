import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { ok } from '../../utils/response'
import { badRequest, notFound } from '../../utils/http'
import { requireAuth, requireAdmin } from '../../middleware/auth'
import { checkSingleUrl } from './checker'

const router = Router()

/** 分类常量 —— 与前端一致 */
export const FR_CATEGORIES = {
  open_source:     { label: '开源权重',     icon: '📦' },
  vendor_free_tier:{ label: '厂商免费额度', icon: '🎁' },
  local_deploy:    { label: '本地部署方案', icon: '💻' },
  online_trial:    { label: '在线试用',     icon: '🌐' },
  community:       { label: '社区镜像/教程', icon: '👥' }
} as const

export type FrCategory = keyof typeof FR_CATEGORIES

/**
 * 公开列表（客户端 bootstrap 用）。只返回 is_active + status=normal 的资源。
 * 可按 category / model_id 过滤。
 */
router.get('/', async (req, res, next) => {
  try {
    const category = (req.query.category as string) || ''
    const modelId = (req.query.modelId as string) || ''
    const where = ['WHERE fr.is_active = TRUE AND fr.status = \'normal\'']
    const params: any[] = []
    if (category) { where.push('fr.category = ?'); params.push(category) }
    if (modelId)  { where.push('fr.model_id = ?');  params.push(modelId) }
    const r = await query(
      `SELECT fr.id, fr.title, fr.category, fr.model_id, fr.tool_id, fr.url, fr.license,
              fr.commercial_allowed, fr.free_quota, fr.entry_type, fr.region,
              fr.notes, fr.source_url, fr.status, fr.last_check_at
       FROM free_resources fr
       ${where.join(' AND ')}
       ORDER BY fr.sort_order, fr.id`,
      params
    )
    ok(res, { resources: r.rows })
  } catch (e) {
    next(e)
  }
})

/**
 * 管理后台完整列表（含 status/restricted/invalid）。
 * 支持按 review_status / category / 搜索词筛选。
 */
router.get('/admin', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || ''
    const category = (req.query.category as string) || ''
    const q = ((req.query.q as string) || '').trim().toLowerCase()
    const where = ['WHERE 1=1']
    const params: any[] = []
    if (status)   { where.push('status = ?');    params.push(status) }
    if (category) { where.push('category = ?');  params.push(category) }
    if (q) {
      where.push('(LOWER(title) LIKE ? OR LOWER(url) LIKE ? OR LOWER(id) LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }
    const r = await query(
      `SELECT id, title, category, model_id, tool_id, url, license, commercial_allowed,
              free_quota, entry_type, region, notes, source_url, status,
              last_check_at, check_count, fail_reason, sort_order, is_active,
              created_at, updated_at
       FROM free_resources ${where.join(' AND ')}
       ORDER BY sort_order, id`,
      params
    )
    ok(res, { resources: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 按 model_id 获取该模型关联的免费资源（客户端选型详情跳转用）。 */
router.get('/by-model/:modelId', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, title, category, url, license, commercial_allowed, free_quota,
              entry_type, region, notes, source_url, status
       FROM free_resources WHERE model_id = ? AND is_active = TRUE AND status = 'normal'
       ORDER BY sort_order, id`,
      [req.params.modelId]
    )
    ok(res, { resources: r.rows })
  } catch (e) {
    next(e)
  }
})

/** 管理后台：新增资源。 */
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.id || !b.title || !b.category || !b.url) throw badRequest('id / title / category / url 必填')
    await queryOne(
      `INSERT INTO free_resources
        (id, title, category, model_id, tool_id, url, license, commercial_allowed,
         free_quota, entry_type, region, notes, source_url,
         status, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?, TRUE)`,
      [
        b.id, b.title, b.category, b.modelId || null, b.toolId || null, b.url,
        b.license || '', !!b.commercialAllowed,
        b.freeQuota || '', b.entryType || 'official', b.region || '',
        b.notes || null, b.sourceUrl || '',
        b.sortOrder ?? 0
      ]
    )
    ok(res, { resource: { id: b.id } }, '已创建')
  } catch (e) {
    next(e)
  }
})

/** 管理后台：更新资源。 */
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const b = req.body ?? {}
    const exists = await queryOne('SELECT 1 FROM free_resources WHERE id = ?', [id])
    if (!exists) throw notFound('资源不存在')
    await query(
      `UPDATE free_resources SET
         title = COALESCE(?, title),
         category = COALESCE(?, category),
         model_id = ?,
         tool_id = ?,
         url = COALESCE(?, url),
         license = COALESCE(?, license),
         commercial_allowed = COALESCE(?, commercial_allowed),
         free_quota = COALESCE(?, free_quota),
         entry_type = COALESCE(?, entry_type),
         region = COALESCE(?, region),
         notes = COALESCE(?, notes),
         source_url = COALESCE(?, source_url),
         status = COALESCE(?, status),
         sort_order = COALESCE(?, sort_order),
         is_active = COALESCE(?, is_active),
         updated_at = NOW()
       WHERE id = ?`,
      [
        b.title, b.category,
        b.modelId === undefined ? null : (b.modelId || null),
        b.toolId === undefined ? null : (b.toolId || null),
        b.url, b.license,
        b.commercialAllowed === undefined ? null : !!b.commercialAllowed,
        b.freeQuota, b.entryType, b.region,
        b.notes, b.sourceUrl, b.status,
        b.sortOrder,
        b.isActive === undefined ? null : !!b.isActive,
        id
      ]
    )
    ok(res, { id }, '已更新')
  } catch (e) {
    next(e)
  }
})

/** 管理后台：删除资源。 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    await queryOne('DELETE FROM free_resources WHERE id = ?', [id])
    ok(res, { id }, '已删除')
  } catch (e) {
    next(e)
  }
})

/**
 * 管理后台：手动触发一次链接校验。
 * 检查 url 是否可达（HTTP HEAD / GET），更新 status + last_check_at + check_count + fail_reason。
 */
router.post('/:id/check', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const r: any = await queryOne('SELECT url FROM free_resources WHERE id = ?', [id])
    if (!r) throw notFound('资源不存在')
    const { status, failReason } = await checkSingleUrl(r.url)
    await query(
      `UPDATE free_resources
         SET status = ?, last_check_at = NOW(), check_count = check_count + 1, fail_reason = ?
       WHERE id = ?`,
      [status, failReason, id]
    )
    ok(res, { id, status, failReason })
  } catch (e) {
    next(e)
  }
})

export default router
