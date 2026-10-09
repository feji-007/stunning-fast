import { Router } from 'express'
import { query } from '../../db/pool'
import { ok } from '../../utils/response'

const router = Router()

/**
 * 客户端启动聚合拉取：一次性返回所有活跃系统配置。
 * 供 Electron 客户端启动时调用，替代原硬编码的 models.ts。
 *
 * 返回：
 *   - providers: 活跃供应商 + 其下活跃模型（含分辨率/速度/价格元数据）
 *   - features: 活跃功能入口
 *   - videoConfig: 按 key 分组的视频生成参数选项
 */
router.get('/', async (_req, res, next) => {
  try {
    const providers = await query(
      `SELECT id, name, key_hint, url, api_key_url, source FROM providers WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const models = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price, docs_url, source
       FROM models WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const features = await query(
      `SELECT id, name, icon, description, pinned FROM features WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const opts = await query(
      `SELECT config_key, option_value, option_label
       FROM video_config_options WHERE is_active = TRUE ORDER BY config_key, sort_order, id`
    )
    const recModels = await query(
      `SELECT id, name, description, tag FROM recommend_models WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const recQuestions = await query(
      `SELECT layer, title, options FROM recommend_questions WHERE is_active = TRUE ORDER BY sort_order, id`
    )

    const providersTree = providers.rows.map((p: any) => ({
      ...p,
      models: models.rows.filter((m: any) => m.provider_id === p.id)
    }))

    const videoConfig: Record<string, Array<{ value: string; label: string }>> = {}
    for (const row of opts.rows as any[]) {
      ;(videoConfig[row.config_key] ??= []).push({
        value: row.option_value,
        label: row.option_label
      })
    }

    // 推荐模型转成 Record<id, {name, desc, tag}>；问题 options JSON parse 还原
    const recommendModels: Record<string, { name: string; desc: string; tag: string }> = {}
    for (const m of recModels.rows as any[]) {
      recommendModels[m.id] = { name: m.name, desc: m.description, tag: m.tag || '' }
    }
    const recommendQuestions = (recQuestions.rows as any[]).map((q) => {
      let options: any[] = []
      try { options = JSON.parse(q.options) } catch {}
      return { layer: q.layer, title: q.title, options }
    })

    ok(res, {
      providers: providersTree,
      features: features.rows,
      videoConfig,
      recommendModels,
      recommendQuestions
    })
  } catch (e) {
    next(e)
  }
})

export default router
