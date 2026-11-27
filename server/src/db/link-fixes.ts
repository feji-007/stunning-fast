import { query, queryOne } from './pool'

/**
 * 资源链接与模型关联修正。
 * 针对早期种子数据中的失效链接（404 / 域名不存在）与未关联模型的免费资源，
 * 通过 meta 标记确保只执行一次；仅当字段值仍为旧的错误值时才覆盖，避免覆盖管理员的后续修改。
 */
export async function applyResourceLinkFixes(): Promise<void> {
  const done = await queryOne<{ k: string }>(
    `SELECT \`key\` AS k FROM meta WHERE \`key\` = 'resource_link_fix_v1'`
  )
  if (done) return

  let changed = 0

  // 1) 工具导购：失效的文档 / Key 地址
  const toolFixes: Array<{ id: string; col: 'api_docs_url' | 'api_key_url'; from: string; to: string }> = [
    { id: 'runway', col: 'api_docs_url', from: 'https://runwayml.github.io/api/', to: 'https://docs.dev.runwayml.com/' },
    { id: 'runway', col: 'api_key_url', from: 'https://runway.com/user/manage/api-keys', to: 'https://dev.runwayml.com/' },
    { id: 'kling', col: 'api_docs_url', from: 'https://klingai.com/api/introduction', to: 'https://kling.ai/dev/document-api' },
    { id: 'kling', col: 'api_key_url', from: 'https://platform.klingai.com', to: 'https://kling.ai/dev/api-key' },
    { id: 'minimax', col: 'api_key_url', from: 'https://platform.minimaxi.com/user/apikey', to: 'https://platform.minimaxi.com/user-center/basic-information/interface-key' },
    { id: 'd-id', col: 'api_key_url', from: 'https://console.d-id.com', to: 'https://studio.d-id.com/' }
  ]
  for (const f of toolFixes) {
    const r = await query(
      `UPDATE tools SET \`${f.col}\` = ? WHERE id = ? AND \`${f.col}\` = ?`,
      [f.to, f.id, f.from]
    )
    changed += Number(r.affectedRows ?? 0)
  }

  // 工具安装步骤正文中引用的旧域名
  const stepFixes: Array<[string, string, string]> = [
    ['kling', 'https://platform.klingai.com', 'https://kling.ai/dev/api-key'],
    ['d-id', 'https://console.d-id.com', 'https://studio.d-id.com']
  ]
  for (const [id, from, to] of stepFixes) {
    const r = await query(
      `UPDATE tools SET setup_steps = REPLACE(setup_steps, ?, ?) WHERE id = ? AND setup_steps LIKE ?`,
      [from, to, id, `%${from}%`]
    )
    changed += Number(r.affectedRows ?? 0)
  }

  // 2) 模型文档地址：阿里云万相旧链接已 404
  const modelDocs: Record<string, { from: string; to: string }> = {
    'wan2.7-t2v': { from: 'https://help.aliyun.com/zh/model-studio/wan2.7-video-generation', to: 'https://help.aliyun.com/zh/model-studio/text-to-video-guide/' },
    'wan2.7-t2v-2026-06-12': { from: 'https://help.aliyun.com/zh/model-studio/wan2.7-video-generation', to: 'https://help.aliyun.com/zh/model-studio/text-to-video-guide/' },
    'wan2.6-t2v': { from: 'https://help.aliyun.com/zh/model-studio/wan2.6-video-generation', to: 'https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference' },
    'wan2.2-t2v-plus': { from: 'https://help.aliyun.com/zh/model-studio/wan2.2-video-generation', to: 'https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference' },
    'wan2.1-t2v-turbo': { from: 'https://help.aliyun.com/zh/model-studio/wan2.1-video-generation', to: 'https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference' },
    'wan2.1-t2v-plus': { from: 'https://help.aliyun.com/zh/model-studio/wan2.1-video-generation', to: 'https://help.aliyun.com/zh/model-studio/legacy-wan-text-to-video-api-reference' }
  }
  for (const [id, { from, to }] of Object.entries(modelDocs)) {
    const r = await query('UPDATE models SET docs_url = ? WHERE id = ? AND docs_url = ?', [to, id, from])
    changed += Number(r.affectedRows ?? 0)
  }

  // 3) 免费资源：失效链接（Replicate 已下架 pika-labs/pika 页面）
  const fr = await query(
    `UPDATE free_resources
        SET title = 'Replicate — 社区视频模型托管平台',
            url = 'https://replicate.com/explore',
            notes = 'Replicate 提供大量社区视频模型（含 Pika 系衍生模型）的按次推理服务，新用户通常有 $5-10 免费额度。'
      WHERE id = 'fr_cm_paperplane' AND url = 'https://replicate.com/pika-labs/pika'`
  )
  changed += Number(fr.affectedRows ?? 0)

  // 4) 免费资源补模型关联（仅当尚未关联时）
  const freeModels: Record<string, string> = {
    fr_os_kling_omni: 'kling-v1-6',
    fr_vf_volcengine_free: 'doubao-seedance-2-0-260128',
    fr_vf_runway_free: 'gen-3-alpha',
    fr_vf_luma_free: 'dream-machine',
    fr_ot_kling_web: 'kling-v3',
    fr_ot_pika_web: 'pika-1-5',
    fr_cm_paperplane: 'pika-1-5'
  }
  for (const [rid, mid] of Object.entries(freeModels)) {
    const r = await query(
      `UPDATE free_resources SET model_id = ? WHERE id = ? AND (model_id IS NULL OR model_id = '')`,
      [mid, rid]
    )
    changed += Number(r.affectedRows ?? 0)
  }

  await query(
    `INSERT INTO meta (\`key\`, \`value\`) VALUES ('resource_link_fix_v1', NOW())
     ON DUPLICATE KEY UPDATE \`value\` = NOW()`
  )
  console.log(`[link-fix] 已修正 ${changed} 处资源链接/模型关联`)
}

/**
 * 新协议供应商迁移：为老库补入 Google / HeyGen / Synthesia / D-ID 四个供应商与模型，
 * 并回填工具导购中对应工具的 provider_id（只执行一次）。
 * 仅填充空字段，不覆盖管理员已配置的内容。
 */
export async function applyNewProviderProtocols(): Promise<void> {
  const done = await queryOne<{ k: string }>(
    `SELECT \`key\` AS k FROM meta WHERE \`key\` = 'new_provider_protocols_v1'`
  )
  if (done) return

  const providers: Array<{
    id: string; name: string; keyHint: string; url: string; keyUrl: string
    apiBaseUrl: string; protocol: string
    submitPath: string; statusPath: string; sort: number
    models: Array<{
      id: string; name: string; desc: string; docsUrl: string
      supportsI2V: boolean; res: number; speed: number; price: number; sort: number
    }>
  }> = [
    {
      id: 'google', name: 'Google Veo (Gemini API)', keyHint: 'AIza',
      url: 'https://deepmind.google/models/veo/',
      keyUrl: 'https://aistudio.google.com/app/apikey',
      apiBaseUrl: 'https://generativelanguage.googleapis.com', protocol: 'google',
      submitPath: '/v1beta/models/{model}:predictLongRunning', statusPath: '/v1beta/{taskId}', sort: 10,
      models: [
        { id: 'veo-3-1', name: 'Veo 3.1', desc: 'Google Veo 3.1，电影级文生/图生视频，原生音频，支持竖屏。', docsUrl: 'https://ai.google.dev/gemini-api/docs/video', supportsI2V: true, res: 1080, speed: 120, price: 3, sort: 1 },
        { id: 'veo-3-1-fast', name: 'Veo 3.1 Fast', desc: 'Google Veo 3.1 快速版，成本更低，适合快速出片。', docsUrl: 'https://ai.google.dev/gemini-api/docs/video', supportsI2V: true, res: 720, speed: 60, price: 2, sort: 2 }
      ]
    },
    {
      id: 'heygen', name: 'HeyGen', keyHint: '', url: 'https://www.heygen.com/',
      keyUrl: 'https://app.heygen.com/settings?nav=API',
      apiBaseUrl: 'https://api.heygen.com', protocol: 'heygen',
      submitPath: '/v2/video/generate', statusPath: '/v1/video_status.get?video_id={taskId}', sort: 11,
      models: [
        { id: 'heygen-avatar', name: 'HeyGen 数字人视频', desc: 'HeyGen 数字人播报：文本作为台词，自动匹配账号下的数字人形象与音色。', docsUrl: 'https://docs.heygen.com/reference/create-an-avatar-video-v2', supportsI2V: false, res: 1080, speed: 60, price: 3, sort: 1 }
      ]
    },
    {
      id: 'synthesia', name: 'Synthesia', keyHint: '', url: 'https://www.synthesia.io/',
      keyUrl: 'https://app.synthesia.io/#/account/api-keys',
      apiBaseUrl: 'https://api.synthesia.io', protocol: 'synthesia',
      submitPath: '/v2/videos', statusPath: '/v2/videos/{taskId}', sort: 12,
      models: [
        { id: 'synthesia-avatar', name: 'Synthesia 数字人视频', desc: 'Synthesia 数字人播报：文本作为台词，自动匹配账号下的数字人形象。', docsUrl: 'https://docs.synthesia.io/reference/create-a-video', supportsI2V: false, res: 1080, speed: 60, price: 3, sort: 1 }
      ]
    },
    {
      id: 'd-id', name: 'D-ID', keyHint: 'user:password', url: 'https://www.d-id.com/',
      keyUrl: 'https://studio.d-id.com/',
      apiBaseUrl: 'https://api.d-id.com', protocol: 'd-id',
      submitPath: '/talks', statusPath: '/talks/{taskId}', sort: 13,
      models: [
        { id: 'did-talks', name: 'D-ID Talks', desc: 'D-ID 照片说话数字人：需上传人物照片，文本作为台词生成口型同步视频。', docsUrl: 'https://docs.d-id.com/reference/create-a-talk', supportsI2V: true, res: 720, speed: 60, price: 2, sort: 1 }
      ]
    }
  ]

  for (const p of providers) {
    await query(
      `INSERT IGNORE INTO providers (id, name, key_hint, url, api_key_url, api_base_url, protocol, submit_path, status_path, submit_path_i2v, status_path_i2v, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, TRUE)`,
      [p.id, p.name, p.keyHint, p.url, p.keyUrl, p.apiBaseUrl, p.protocol, p.submitPath, p.statusPath, p.sort]
    )
    // 已存在的供应商只补空值，避免覆盖管理员修改
    await query(
      `UPDATE providers SET
         api_base_url = COALESCE(NULLIF(api_base_url, ''), ?),
         protocol = COALESCE(NULLIF(protocol, ''), ?),
         submit_path = COALESCE(NULLIF(submit_path, ''), ?),
         status_path = COALESCE(NULLIF(status_path, ''), ?),
         api_key_url = COALESCE(NULLIF(api_key_url, ''), ?)
       WHERE id = ?`,
      [p.apiBaseUrl, p.protocol, p.submitPath, p.statusPath, p.keyUrl, p.id]
    )
    for (const m of p.models) {
      await query(
        `INSERT IGNORE INTO models (id, provider_id, name, type, description, supports_i2v, supports_first_last, supports_reference,
           max_images, max_videos, max_audios, max_total_assets,
           resolution, speed, price, default_resolution, default_ratio, default_duration, docs_url, sort_order, is_active)
         VALUES (?, ?, ?, 'video', ?, ?, FALSE, FALSE, 5, 0, 0, 0, ?, ?, ?, ?, '16:9', '5', ?, ?, TRUE)`,
        [
          m.id, p.id, m.name, m.desc,
          m.supportsI2V, m.res, m.speed, m.price,
          m.res >= 1080 ? '1080P' : '720P', m.docsUrl, m.sort
        ]
      )
      await query(
        `UPDATE models SET docs_url = COALESCE(NULLIF(docs_url, ''), ?) WHERE id = ?`,
        [m.docsUrl, m.id]
      )
    }
  }

  // 工具导购：回填对应工具的供应商关联（仅当尚未关联时）
  const toolLinks: Record<string, string> = {
    'google-veo3': 'google',
    'gemini-omni': 'google',
    heygen: 'heygen',
    synthesia: 'synthesia',
    'd-id': 'd-id'
  }
  let linked = 0
  for (const [toolId, providerId] of Object.entries(toolLinks)) {
    const r: any = await query(
      `UPDATE tools SET provider_id = ? WHERE id = ? AND (provider_id IS NULL OR provider_id = '')`,
      [providerId, toolId]
    )
    if (r?.affectedRows) linked += Number(r.affectedRows)
  }

  await query(
    `INSERT INTO meta (\`key\`, \`value\`) VALUES ('new_provider_protocols_v1', NOW())
     ON DUPLICATE KEY UPDATE \`value\` = NOW()`
  )
  console.log(`[link-fix] 已补入 Google/HeyGen/Synthesia/D-ID 供应商，关联 ${linked} 个工具`)
}

/**
 * Pika 协议迁移：旧域名 pika.pikaslabs.com 已下线，
 * 官方开发者 API 迁移到 api.dev.pika.art（X-API-Key 鉴权，/v1/media/... 路径）。
 * 只覆盖仍在使用旧配置的供应商，避免覆盖管理员自建的端点。
 */
export async function applyPikaApiMigration(): Promise<void> {
  const done = await queryOne<{ k: string }>(
    `SELECT \`key\` AS k FROM meta WHERE \`key\` = 'pika_api_v2'`
  )
  if (done) return

  const r = await query(
    `UPDATE providers
        SET api_base_url = 'https://api.dev.pika.art',
            submit_path = '/v1/media/pika/pika-2.5/text-to-video',
            status_path = '/v1/media/jobs/{taskId}',
            submit_path_i2v = '/v1/media/pika/pika-2.5/image-to-video'
      WHERE id = 'pika'
        AND (api_base_url LIKE '%pikaslabs%' OR api_base_url = '' OR submit_path = '/v1/videos')`
  )

  // 历史模型名与新版 API 对齐（id 保持不变，避免影响已有引用）
  await query(
    `UPDATE models SET name = 'Pika 2.5', description = 'Pika 2.5 视频生成，特效与 Pikaffects。'
      WHERE id = 'pika-1-5' AND name = 'Pika 1.5'`
  )

  await query(
    `INSERT INTO meta (\`key\`, \`value\`) VALUES ('pika_api_v2', NOW())
     ON DUPLICATE KEY UPDATE \`value\` = NOW()`
  )
  console.log(`[link-fix] Pika 供应商已迁移到新 API（${Number(r.affectedRows ?? 0)} 行更新）`)
}
