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
      `SELECT id, name, key_hint, url, source FROM providers WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const models = await query(
      `SELECT id, provider_id, name, type, description, supports_i2v, resolution, speed, price, source
       FROM models WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const features = await query(
      `SELECT id, name, icon, description, pinned FROM features WHERE is_active = TRUE ORDER BY sort_order, id`
    )
    const opts = await query(
      `SELECT config_key, option_value, option_label
       FROM video_config_options WHERE is_active = TRUE ORDER BY config_key, sort_order, id`
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

    ok(res, {
      providers: providersTree,
      features: features.rows,
      videoConfig
    })
  } catch (e) {
    next(e)
  }
})

export default router
