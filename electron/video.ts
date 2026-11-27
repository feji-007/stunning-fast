import crypto from 'crypto'
import type {
  GenerateVideoParams,
  GenerateVideoResult,
  VideoProgress
} from './shared/ipc'

// 视频生成多供应商集成：主进程按协议类型路由到对应客户端。
// 各协议不同（端点 / 请求体 / 状态机），但都是「提交异步任务 -> 轮询 -> 取视频」。
// 已内置的协议：
//   - dashscope  通义万相 (DashScope)：wan2.7（resolution+ratio）/ wan2.1-2.6（size）
//   - ark        火山引擎 (Ark)：Seedance 2.x / 1.5 / 1.0
//   - kling      快手可灵旧版标准：JWT(AK+SK) 鉴权
//   - kling-v2   快手可灵新版标准：单个 API Key，模型版本在路径中（/text-to-video/{model}）
// 供应商的接口地址、协议、提交/查询路径全部由后台数据库配置下发，本文件不再硬编码任何供应商数据。

const POLL_INTERVAL = 5000
const MAX_WAIT = 10 * 60 * 1000

type ProgressCb = (p: VideoProgress) => void

// 统一路径格式：去掉首尾空白，缺失前导斜杠时补上，便于与 base 直接拼接。
function normalizePath(p?: string): string {
  const t = (p ?? '').trim()
  if (!t) return ''
  return t.startsWith('/') ? t : `/${t}`
}

// 后台未配置时直接给出可操作的报错，不再回退到代码内置路径。
function requirePath(p: GenerateVideoParams, value: string | undefined, label: string): string {
  const path = normalizePath(value)
  if (!path) {
    throw new Error(`供应商「${p.provider}」未配置${label}，请到后台「供应商管理」补全后重试。`)
  }
  return path
}

// 提交路径：图生视频若配置了独立端点则优先使用。
function resolveSubmitPath(p: GenerateVideoParams): string {
  const configured = p.imageUrl && p.submitPathI2v ? p.submitPathI2v : p.submitPath
  return requirePath(p, configured, '任务提交路径')
}

// 查询路径：图生视频若配置了独立端点则优先使用；支持 {taskId} 占位符。
function resolveStatusPath(p: GenerateVideoParams, taskId: string): string {
  const configured = p.imageUrl && p.statusPathI2v ? p.statusPathI2v : p.statusPath
  const path = requirePath(p, configured, '任务查询路径')
  return path.includes('{taskId}')
    ? path.replace(/\{taskId\}/g, taskId)
    : `${path.replace(/\/+$/, '')}/${taskId}`
}

// 基础地址去掉末尾斜杠，避免与路径拼接出双斜杠。
function resolveBase(p: GenerateVideoParams): string {
  const base = (p.apiBaseUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) {
    throw new Error(`供应商「${p.provider}」未配置 API 调用端点，请到后台「供应商管理」补全后重试。`)
  }
  return base
}

/* ------------------------------------------------------------------ */
/* 通义万相 (DashScope)                                                */
/* ------------------------------------------------------------------ */

// wan2.1-2.6 旧版协议用 size="宽*高"；按 UI 的 resolution+ratio 推算。
const SIZE_MAP: Record<string, Record<string, string>> = {
  '720P': {
    '16:9': '1280*720',
    '9:16': '720*1280',
    '1:1': '960*960',
    '4:3': '960*720',
    '3:4': '720*960'
  },
  '1080P': {
    '16:9': '1920*1080',
    '9:16': '1080*1920',
    '1:1': '1440*1440',
    '4:3': '1440*1080',
    '3:4': '1080*1440'
  }
}

function dashscopeBuildBody(params: GenerateVideoParams) {
  const isV27 = params.model.startsWith('wan2.7')
  const parameters: Record<string, unknown> = {
    watermark: false,
    prompt_extend: true
  }
  if (isV27) {
    // wan2.7 新版协议：resolution + ratio
    if (params.resolution) parameters.resolution = params.resolution
    if (params.ratio) parameters.ratio = params.ratio
  } else {
    // wan2.1-2.6 旧版协议：size
    const size =
      SIZE_MAP[params.resolution ?? '720P']?.[params.ratio ?? '16:9'] ?? '1280*720'
    parameters.size = size
  }
  if (params.duration) parameters.duration = params.duration
  return {
    model: params.model,
    input: { prompt: params.prompt },
    parameters
  }
}

function extractDashScopeVideoUrl(out: any): string | null {
  if (out?.video_url) return out.video_url
  if (Array.isArray(out?.results)) {
    const hit = out.results.find((r: any) => r?.url || r?.video_url)
    if (hit) return hit.url || hit.video_url
  }
  return null
}

async function generateDashScopeVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
      'X-DashScope-Async': 'enable'
    },
    body: JSON.stringify(dashscopeBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.message || data?.output?.message || text}`)
  }
  const taskId: string | undefined = data?.output?.task_id
  if (!taskId) throw new Error(`未返回 task_id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），排队中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const status: string = resp?.output?.task_status ?? 'UNKNOWN'
    onProgress?.({ status: status as VideoProgress['status'], message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl = extractDashScopeVideoUrl(resp?.output)
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.output?.message || status}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* 火山引擎 Seedance (Ark)                                            */
/* ------------------------------------------------------------------ */

// Seedance 状态 -> 统一 VideoProgress.status
function mapArkStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'queued':
      return 'PENDING'
    case 'running':
      return 'RUNNING'
    case 'succeeded':
      return 'SUCCEEDED'
    case 'cancelled':
      return 'CANCELED'
    case 'failed':
    case 'expired':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

function arkBuildBody(params: GenerateVideoParams) {
  // Seedance resolution 用小写 480p/720p/1080p
  const resolution = params.resolution ? params.resolution.toLowerCase() : '720p'
  // 图生视频：content 数组中加入多模态参考（image_url / video_url / audio_url）
  // 顺序：图片（保持传入顺序，首尾帧模式依赖顺序）→ 文本 → 视频 → 音频
  const content: Array<Record<string, unknown>> = []
  // 图片：优先使用完整列表 imageUrls，兼容单图 imageUrl
  const images = params.imageUrls && params.imageUrls.length > 0
    ? params.imageUrls
    : (params.imageUrl ? [params.imageUrl] : [])
  for (const url of images) {
    content.push({ type: 'image_url', image_url: { url } })
  }
  content.push({ type: 'text', text: params.prompt })
  for (const url of params.videos ?? []) {
    content.push({ type: 'video_url', video_url: { url } })
  }
  for (const url of params.audios ?? []) {
    content.push({ type: 'audio_url', audio_url: { url } })
  }
  const body: Record<string, unknown> = {
    model: params.model,
    content,
    resolution,
    ratio: params.ratio ?? '16:9',
    watermark: false
  }
  if (params.duration) body.duration = params.duration
  return body
}

async function generateSeedanceVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(arkBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.error?.message || data?.message || text}`
    )
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回 task id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 12)}…），排队中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    const status = mapArkStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl = resp?.content?.video_url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.error?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* 快手可灵 (Kling)                                                    */
/* ------------------------------------------------------------------ */

// 可灵状态 -> 统一 VideoProgress.status
function mapKlingStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'submitted':
      return 'PENDING'
    case 'processing':
      return 'RUNNING'
    case 'succeed':
    case 'succeeded':
      return 'SUCCEEDED'
    case 'failed':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

// 可灵用 AccessKey + SecretKey 签发 JWT（HS256）做鉴权。
// apiKey 字段约定为 "AccessKey:SecretKey"。
function signKlingJWT(accessKey: string, secretKey: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 }
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  const h = enc(header)
  const p = enc(payload)
  const data = `${h}.${p}`
  const sig = crypto
    .createHmac('sha256', secretKey)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${data}.${sig}`
}

// 每次请求都签发新 JWT（exp 30 分钟，足够一次生成流程）。
function klingHeaders(apiKey: string) {
  const idx = apiKey.indexOf(':')
  if (idx <= 0) {
    throw new Error('可灵密钥格式应为「AccessKey:SecretKey」，请在设置中补全。')
  }
  const accessKey = apiKey.slice(0, idx)
  const secretKey = apiKey.slice(idx + 1)
  if (!accessKey || !secretKey) {
    throw new Error('可灵 AccessKey / SecretKey 不能为空，请在设置中补全。')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${signKlingJWT(accessKey, secretKey)}`
  }
}

function klingBuildBody(params: GenerateVideoParams) {
  // 可灵 v1/v2 视频仅支持 16:9 / 9:16 / 1:1，其余比例回退 16:9。
  const ratio = ['16:9', '9:16', '1:1'].includes(params.ratio ?? '')
    ? params.ratio
    : '16:9'
  const body: Record<string, unknown> = {
    model_name: params.model,
    prompt: params.prompt,
    aspect_ratio: ratio,
    mode: 'std'
  }
  // 图生视频：加入参考图
  if (params.imageUrl) {
    body.image = params.imageUrl
  }
  if (params.duration) body.duration = String(params.duration)
  return body
}

async function generateKlingVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  // 文生/图生视频的提交路径均由后台配置（图生未配置时沿用提交路径）
  const submitPath = resolveSubmitPath(params)
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: klingHeaders(params.apiKey),
    body: JSON.stringify(klingBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok || data?.code !== 0) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.message || data?.data?.message || text}`
    )
  }
  const taskId: string | undefined = data?.data?.task_id
  if (!taskId) throw new Error(`未返回 task_id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 12)}…），排队中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: klingHeaders(params.apiKey)
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.data?.task_status
    const status = mapKlingStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videos = resp?.data?.task_result?.videos
      const videoUrl = Array.isArray(videos) ? videos[0]?.url : undefined
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(
        `视频生成失败：${resp?.data?.task_status_msg || raw || '未知错误'}`
      )
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* 快手可灵 - 新版 API 设计标准（单个 API Key）                        */
/* ------------------------------------------------------------------ */

// 新版标准：模型版本在路径中（/text-to-video/{model}），鉴权为 Bearer <API Key>，
// 任务查询统一为 GET /tasks?task_ids={id}，返回 data 数组。
function klingV2Headers(apiKey: string) {
  const key = (apiKey ?? '').trim()
  if (!key) {
    throw new Error('可灵新版 API 需要 API Key，请到「设置 → API Key」或工具配置引导中填写。')
  }
  if (key.includes(':')) {
    throw new Error(
      '可灵已升级到新版 API：请在可灵控制台新建单个 API Key 并填写；旧的 AccessKey:SecretKey 仅适用于旧版接口。'
    )
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  }
}

function klingV2BuildBody(params: GenerateVideoParams) {
  const settings: Record<string, unknown> = {}
  if (params.resolution) settings.resolution = params.resolution.toLowerCase()
  if (params.duration) settings.duration = Number(params.duration)
  const options = { watermark_info: { enabled: false } }
  if (params.imageUrl) {
    // 图生视频：contents 中分别放提示词与首帧图片，宽高比由图片决定
    return {
      contents: [
        { type: 'prompt', text: params.prompt },
        { type: 'first_frame', url: params.imageUrl }
      ],
      settings,
      options
    }
  }
  if (params.ratio) settings.aspect_ratio = params.ratio
  return { prompt: params.prompt, settings, options }
}

// 新版提交/查询路径支持 {model} 占位符（模型版本位于路径中）。
function resolveKlingV2Path(params: GenerateVideoParams, taskId?: string): string {
  const raw = taskId ? resolveStatusPath(params, taskId) : resolveSubmitPath(params)
  return raw.replace(/\{model\}/g, encodeURIComponent(params.model))
}

async function generateKlingV2Video(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const headers = klingV2Headers(params.apiKey)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${resolveKlingV2Path(params)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(klingV2BuildBody(params))
  })
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok || data?.code !== 0) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.message || data?.data?.message || text}`
    )
  }
  const taskId: string | undefined = data?.data?.id
  if (!taskId) throw new Error(`未返回任务 ID：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 12)}…），排队中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveKlingV2Path(params, taskId)}`, { headers })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    // 查询接口返回 data 数组
    const row = Array.isArray(resp?.data) ? resp.data[0] : resp?.data
    const raw: string | undefined = row?.status
    const status = mapKlingStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const outputs = Array.isArray(row?.outputs) ? row.outputs : []
      const videoUrl = outputs.find((o: any) => o?.type === 'video' && o?.url)?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${row?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* 智谱 CogVideoX (Zhipu)                                              */
/* ------------------------------------------------------------------ */

// 智谱查询接口返回 task_status 字段：PROCESSING / SUCCESS / FAIL
function mapZhipuStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'PROCESSING':
      return 'RUNNING'
    case 'SUCCESS':
      return 'SUCCEEDED'
    case 'FAIL':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

// 智谱请求体：model / prompt / quality / with_audio / image_url / size / fps / duration
function zhipuBuildBody(params: GenerateVideoParams) {
  // size：cogvideox-3 支持 1280x720 / 720x1280 / 1024x1024 / 1920x1080 等
  const SIZE_MAP: Record<string, Record<string, string>> = {
    '16:9':  { '720P': '1280x720',  '1080P': '1920x1080' },
    '9:16':  { '720P': '720x1280',  '1080P': '1080x1920' },
    '1:1':   { '720P': '1024x1024', '1080P': '1440x1440' }
  }
  const size = SIZE_MAP[params.ratio ?? '16:9']?.[params.resolution ?? '720P'] ?? '1280x720'
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    quality: 'speed',
    with_audio: false,
    size,
    fps: 30
  }
  if (params.duration) body.duration = params.duration
  if (params.imageUrl) body.image_url = params.imageUrl
  return body
}

async function generateZhipuVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(zhipuBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.error?.message || text}`)
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 12)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.task_status
    const status = mapZhipuStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl = resp?.video_result?.[0]?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${raw || resp?.error?.message || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* MiniMax                                                             */
/* ------------------------------------------------------------------ */

// MiniMax 查询返回 status：processing / success / failed
function mapMiniMaxStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'processing': return 'RUNNING'
    case 'success':    return 'SUCCEEDED'
    case 'failed':     return 'FAILED'
    default:           return 'UNKNOWN'
  }
}

// MiniMax 请求体：model / prompt / duration / resolution
function minimaxBuildBody(params: GenerateVideoParams) {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    duration: params.duration ?? 6,
    resolution: params.resolution ?? '720P'
  }
  if (params.imageUrl) body.first_frame_image = params.imageUrl
  return body
}

async function generateMiniMaxVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(minimaxBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok || data?.base_resp?.status_code !== 0) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.base_resp?.status_msg || data?.message || text}`
    )
  }
  const taskId: string | undefined = data?.task_id
  if (!taskId) throw new Error(`未返回 task_id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    const status = mapMiniMaxStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const files = resp?.files
      let videoUrl: string | undefined
      if (Array.isArray(files)) {
        const hit = files.find((f: any) => f?.file_url || f?.video_url || f?.url)
        videoUrl = hit?.file_url || hit?.video_url || hit?.url
      }
      if (!videoUrl) videoUrl = resp?.video_url || resp?.video?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.base_resp?.status_msg || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* Runway                                                              */
/* ------------------------------------------------------------------ */

// Runway Gen-3 任务状态：SUBMITTED / RUNNING / SUCCEEDED / FAILED
function mapRunwayStatus(s: string | undefined): VideoProgress['status'] {
  switch (s?.toUpperCase()) {
    case 'SUBMITTED':
    case 'PENDING':
      return 'PENDING'
    case 'RUNNING':
    case 'PROCESSING':
      return 'RUNNING'
    case 'SUCCEEDED':
    case 'SUCCESS':
      return 'SUCCEEDED'
    case 'FAILED':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

// Runway 请求必须携带 API 版本头
const RUNWAY_VERSION = '2024-11-06'

// Runway ratio 为像素格式（1280:720 等），需从 UI 的比例格式映射
const RUNWAY_RATIO_MAP: Record<string, string> = {
  '16:9': '1280:720',
  '9:16': '720:1280',
  '1:1': '960:960',
  '4:3': '1104:832',
  '3:4': '832:1104'
}

// Runway text_to_video 请求体
function runwayBuildBody(params: GenerateVideoParams) {
  const d = Number(params.duration) || 5
  return {
    model: params.model,
    promptText: params.prompt,
    ratio: RUNWAY_RATIO_MAP[params.ratio ?? ''] ?? '1280:720',
    // Runway 仅支持 5s / 10s
    duration: d <= 5 ? 5 : 10
  }
}

async function generateRunwayVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
      'X-Runway-Version': RUNWAY_VERSION
    },
    body: JSON.stringify(runwayBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.error || data?.message || text}`)
  }
  const taskId: string | undefined = data?.id || data?.task?.id || data?.taskId
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}`, 'X-Runway-Version': RUNWAY_VERSION }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    const status = mapRunwayStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined = resp?.output?.[0] || resp?.video_url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.failure?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* Luma Dream Machine                                                  */
/* ------------------------------------------------------------------ */

// Luma 状态：queued / dreaming / completed / failed
function mapLumaStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'queued':    return 'PENDING'
    case 'dreaming':  return 'RUNNING'
    case 'completed': return 'SUCCEEDED'
    case 'failed':    return 'FAILED'
    default:          return 'UNKNOWN'
  }
}

// Luma GenerationRequest
function lumaBuildBody(params: GenerateVideoParams) {
  return {
    prompt: params.prompt,
    generation_type: 'video',
    aspect_ratio: params.ratio ?? '16:9',
    loop: false
  }
}

async function generateLumaVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(lumaBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.detail || data?.message || text}`)
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.state
    const status = mapLumaStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined = resp?.assets?.video
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.failure_reason || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* OpenAI Sora                                                         */
/* ------------------------------------------------------------------ */

// Sora 状态：queued / in_progress / completed / failed
function mapOpenAIStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'queued':      return 'PENDING'
    case 'in_progress':
    case 'processing':  return 'RUNNING'
    case 'completed':   return 'SUCCEEDED'
    case 'failed':      return 'FAILED'
    default:            return 'UNKNOWN'
  }
}

// Sora 请求体：model / prompt / size / seconds
// size 仅支持 1280x720 / 720x1280；seconds 仅支持 '4' / '8' / '12'
function openaiBuildBody(params: GenerateVideoParams) {
  const size = params.ratio === '9:16' ? '720x1280' : '1280x720'
  const d = Number(params.duration) || 4
  const seconds = d <= 4 ? '4' : d <= 8 ? '8' : '12'
  return {
    model: params.model,
    prompt: params.prompt,
    size,
    seconds
  }
}

async function generateOpenAIVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(openaiBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.error?.message || text}`)
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 12)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    const status = mapOpenAIStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      // Sora 响应不含可公开播放的 URL，需带鉴权从 /content 拉取视频内容，
      // 内联为 data URL 供渲染进程直接播放（<video> 无法携带鉴权头）
      const dl = await fetch(`${base}${resolveStatusPath(params, taskId)}/content`, {
        headers: { Authorization: `Bearer ${params.apiKey}` }
      })
      if (!dl.ok) throw new Error(`视频内容下载失败 (${dl.status})`)
      const buf = Buffer.from(await dl.arrayBuffer())
      return { videoUrl: `data:video/mp4;base64,${buf.toString('base64')}`, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.error?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* Pika                                                                */
/* ------------------------------------------------------------------ */

function mapPikaStatus(s: string | undefined): VideoProgress['status'] {
  switch (s) {
    case 'queued':
    case 'pending':
    case 'submitted': return 'PENDING'
    case 'processing':
    case 'running':
    case 'in_progress': return 'RUNNING'
    case 'completed':
    case 'succeeded':
    case 'success':   return 'SUCCEEDED'
    case 'failed':
    case 'error':
    case 'canceled':
    case 'cancelled': return 'FAILED'
    default:           return 'UNKNOWN'
  }
}

// Pika Dev API（api.dev.pika.art）：X-API-Key 鉴权，路径 /v1/media/{provider}/{model}/{mode}
function pikaHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-API-Key': apiKey }
}

function pikaBuildBody(params: GenerateVideoParams) {
  const body: Record<string, unknown> = { prompt: params.prompt }
  if (params.imageUrl) {
    // 图生视频：比例/时长由参考图决定
    body.image_url = params.imageUrl
  } else {
    body.aspect_ratio = params.ratio ?? '16:9'
    if (params.duration) body.duration = params.duration
  }
  return body
}

async function generatePikaVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: pikaHeaders(params.apiKey),
    body: JSON.stringify(pikaBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.error || data?.message || text}`)
  }
  const taskId: string | undefined = data?.request_id || data?.id || data?.job_id
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: { 'X-API-Key': params.apiKey }
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status || resp?.state
    const status = mapPikaStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      // 任务结果可能直接带回 url，否则走 content 接口取下载地址
      let videoUrl: string | undefined =
        resp?.output?.url || resp?.output?.video_url || resp?.result?.url ||
        resp?.result_url || resp?.video_url
      if (!videoUrl) {
        const c = await fetch(`${base}/v1/media/jobs/${encodeURIComponent(taskId)}/content`, {
          headers: { 'X-API-Key': params.apiKey }
        })
        if (c.ok) {
          const cd: any = await c.json().catch(() => null)
          videoUrl = cd?.url || cd?.output?.url
        }
      }
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.error || resp?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* Google Veo / Gemini Omni                                            */
/* ------------------------------------------------------------------ */

// Gemini API：x-goog-api-key 鉴权，predictLongRunning 提交，operations 轮询。
function googleHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
}

// Gemini 的参考图需内联 base64：兼容 data URL 与公网 http(s) 图片。
async function googleInlineImage(
  imageUrl: string
): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
  if (imageUrl.startsWith('data:')) {
    const m = /^data:([^;,]+);base64,(.*)$/.exec(imageUrl)
    if (!m) throw new Error('参考图 data URL 解析失败，请更换图片后重试')
    return { mimeType: m[1], bytesBase64Encoded: m[2] }
  }
  const r = await fetch(imageUrl)
  if (!r.ok) {
    throw new Error(`参考图下载失败 (${r.status})，请使用可公开访问的图片地址`)
  }
  const mimeType = r.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  const buf = Buffer.from(await r.arrayBuffer())
  return { mimeType, bytesBase64Encoded: buf.toString('base64') }
}

async function googleBuildBody(params: GenerateVideoParams) {
  const instance: Record<string, unknown> = { prompt: params.prompt }
  if (params.imageUrl) instance.image = await googleInlineImage(params.imageUrl)
  const parameters: Record<string, unknown> = {
    aspectRatio: params.ratio ?? '16:9'
  }
  if (params.duration) parameters.durationSeconds = params.duration
  if (params.resolution) parameters.resolution = params.resolution.toLowerCase()
  return { instances: [instance], parameters }
}

// 兼容 Veo 3.x（generateVideoResponse）与旧版预测结构。
function extractGoogleVideoUri(resp: any): string | null {
  const r = resp?.response
  const samples = r?.generateVideoResponse?.generatedSamples
  if (Array.isArray(samples) && samples[0]?.video?.uri) return samples[0].video.uri
  const generated = r?.generatedVideos
  if (Array.isArray(generated) && generated[0]?.video?.uri) return generated[0].video.uri
  const preds = r?.predictions
  if (Array.isArray(preds)) {
    const hit = preds.find((p: any) => p?.videoUri)
    if (hit?.videoUri) return hit.videoUri
    const gcs = preds.find((p: any) => p?.gcsUri)
    if (gcs?.gcsUri) return gcs.gcsUri
  }
  if (r?.videos?.[0]?.gcsUri) return r.videos[0].gcsUri
  return null
}

// 展示用模型 id -> Gemini API 模型名；已是 API 模型名（含点/斜杠）时原样使用。
function googleApiModel(model: string): string {
  if (model.includes('/') || model.includes('.')) return model
  const MAP: Record<string, string> = {
    'veo-3-1': 'veo-3.1-generate-preview',
    'veo-3-1-fast': 'veo-3.1-fast-generate-preview'
  }
  return MAP[model] ?? model
}

async function generateGoogleVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  // 模型名位于 URL 中，提交路径支持 {model} 占位符。
  const submitPath = resolveSubmitPath(params).replace(
    /\{model\}/g,
    encodeURIComponent(googleApiModel(params.model))
  )
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: googleHeaders(params.apiKey),
    body: JSON.stringify(await googleBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.error?.message || data?.message || text}`
    )
  }
  // operation name 形如 models/veo-3.1-generate-001/operations/xxx，含斜杠，
  // 必须由查询路径中的 {taskId} 占位符整体替换。
  const taskId: string | undefined = data?.name
  if (!taskId) throw new Error(`未返回任务名称：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(-8)}…），排队中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: googleHeaders(params.apiKey)
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    if (resp?.error) {
      throw new Error(`视频生成失败：${resp.error?.message || '未知错误'}`)
    }
    if (resp?.done) {
      const uri = extractGoogleVideoUri(resp)
      if (!uri) throw new Error('任务成功但未返回视频地址')
      // 下载地址需鉴权，拼接 key 以便渲染进程直接播放。
      const sep = uri.includes('?') ? '&' : '?'
      return { videoUrl: `${uri}${sep}key=${encodeURIComponent(params.apiKey)}`, taskId }
    }
    onProgress?.({ status: 'RUNNING', message: humanStatus('RUNNING') })
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* HeyGen（数字人：prompt 作为台词）                                    */
/* ------------------------------------------------------------------ */

function heygenHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Api-Key': apiKey }
}

// 分辨率按比例映射，HeyGen 仅需宽高。
function heygenDimension(ratio?: string) {
  switch (ratio) {
    case '9:16':
      return { width: 720, height: 1280 }
    case '1:1':
      return { width: 1080, height: 1080 }
    default:
      return { width: 1280, height: 720 }
  }
}

// 模型 id 支持 "avatarId:voiceId" 显式指定；未指定时取账号下首个形象与音色。
async function resolveHeygenAssets(
  params: GenerateVideoParams
): Promise<{ avatarId: string; voiceId: string }> {
  const [mAvatar, mVoice] = params.model.split(':')
  let avatarId = mVoice ? mAvatar : ''
  let voiceId = mVoice ?? ''
  const base = resolveBase(params)
  if (!avatarId) {
    const r = await fetch(`${base}/v2/avatars`, { headers: heygenHeaders(params.apiKey) })
    const d: any = await r.json().catch(() => null)
    const list = d?.data?.avatars ?? d?.avatars ?? []
    avatarId = list?.[0]?.avatar_id ?? ''
  }
  if (!voiceId) {
    const r = await fetch(`${base}/v2/voices`, { headers: heygenHeaders(params.apiKey) })
    const d: any = await r.json().catch(() => null)
    const list = d?.data?.voices ?? d?.voices ?? []
    voiceId = list?.[0]?.voice_id ?? ''
  }
  if (!avatarId || !voiceId) {
    throw new Error(
      'HeyGen 账号下未找到可用的数字人形象或音色，请先在 HeyGen 后台创建后再试。'
    )
  }
  return { avatarId, voiceId }
}

async function generateHeygenVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '准备数字人形象与音色…' })
  const { avatarId, voiceId } = await resolveHeygenAssets(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const body = {
    video_inputs: [
      {
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice: { type: 'text', input_text: params.prompt, voice_id: voiceId }
      }
    ],
    dimension: heygenDimension(params.ratio)
  }
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: heygenHeaders(params.apiKey),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.error?.message || data?.message || text}`
    )
  }
  const taskId: string | undefined = data?.data?.video_id || data?.video_id
  if (!taskId) throw new Error(`未返回视频 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: heygenHeaders(params.apiKey)
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const detail = resp?.data ?? resp
    const raw: string | undefined = detail?.status
    let status: VideoProgress['status'] = 'UNKNOWN'
    if (raw === 'pending' || raw === 'waiting' || raw === 'queued') status = 'PENDING'
    else if (raw === 'processing' || raw === 'running') status = 'RUNNING'
    else if (raw === 'completed' || raw === 'success') status = 'SUCCEEDED'
    else if (raw === 'failed' || raw === 'error') status = 'FAILED'
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined = detail?.video_url || detail?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${detail?.error?.message || detail?.msg || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* Synthesia（数字人：prompt 作为台词）                                 */
/* ------------------------------------------------------------------ */

// Synthesia 使用裸 key（非 Bearer）放入 Authorization 头。
function synthesiaHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: apiKey, Accept: 'application/json' }
}

// 模型 id 支持 "synthesia:avatarId" 显式指定；否则取账号下首个形象。
async function resolveSynthesiaAvatar(params: GenerateVideoParams): Promise<string> {
  const idx = params.model.indexOf(':')
  if (idx >= 0) {
    const explicit = params.model.slice(idx + 1).trim()
    if (explicit) return explicit
  }
  const base = resolveBase(params)
  const r = await fetch(`${base}/v2/avatars`, { headers: synthesiaHeaders(params.apiKey) })
  const d: any = await r.json().catch(() => null)
  const list = Array.isArray(d) ? d : d?.avatars ?? d?.data ?? []
  const id = list?.[0]?.id || list?.[0]?.avatarId
  if (!id) {
    throw new Error('Synthesia 账号下未找到可用的数字人形象，请先在 Synthesia 后台创建后再试。')
  }
  return id
}

async function generateSynthesiaVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  onProgress?.({ status: 'PENDING', message: '准备数字人形象…' })
  const avatar = await resolveSynthesiaAvatar(params)
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const body = {
    input: [{ scriptText: params.prompt, avatar }],
    aspectRatio: params.ratio ?? '16:9'
  }
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: synthesiaHeaders(params.apiKey),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.message || data?.error?.message || text}`
    )
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回视频 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: synthesiaHeaders(params.apiKey)
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    let status: VideoProgress['status'] = 'UNKNOWN'
    if (raw === 'draft' || raw === 'queued') status = 'PENDING'
    else if (raw === 'in_progress' || raw === 'rendering' || raw === 'processing') status = 'RUNNING'
    else if (raw === 'complete' || raw === 'completed') status = 'SUCCEEDED'
    else if (raw === 'error' || raw === 'failed') status = 'FAILED'
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined =
        resp?.download || resp?.downloadUrl || resp?.video_url || resp?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.message || resp?.error || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* D-ID（数字人：需公网图片作为人物形象，prompt 作为台词）              */
/* ------------------------------------------------------------------ */

// D-ID 使用 Basic 鉴权，apiKey 形如 "USER:PASSWORD"（Base64 前的原文）。
function didHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Basic ${apiKey}` }
}

async function generateDidVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const base = resolveBase(params)
  const submitPath = resolveSubmitPath(params)
  // D-ID 必须提供可公网访问的人物照片。
  if (!params.imageUrl) {
    throw new Error('D-ID 需要提供人物照片（公网可访问图片地址）才能生成数字人视频，请先上传照片。')
  }
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const body = {
    source_url: params.imageUrl,
    script: {
      type: 'text',
      input: params.prompt,
      provider: { type: 'microsoft', voice_id: 'en-US-JennyNeural' }
    }
  }
  const res = await fetch(`${base}${submitPath}`, {
    method: 'POST',
    headers: didHeaders(params.apiKey),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(
      `提交任务失败 (${res.status})：${data?.description || data?.message || data?.error?.message || text}`
    )
  }
  const taskId: string | undefined = data?.id
  if (!taskId) throw new Error(`未返回任务 id：${text.slice(0, 200)}`)
  onProgress?.({ status: 'PENDING', message: `任务已提交（${taskId.slice(0, 8)}…），处理中` })

  const deadline = Date.now() + MAX_WAIT
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let resp: any
    try {
      const q = await fetch(`${base}${resolveStatusPath(params, taskId)}`, {
        headers: didHeaders(params.apiKey)
      })
      if (!q.ok) throw new Error(`查询失败 (${q.status})`)
      resp = await q.json()
    } catch {
      onProgress?.({ status: 'RUNNING', message: '生成中…（查询重试）' })
      continue
    }
    const raw: string | undefined = resp?.status
    let status: VideoProgress['status'] = 'UNKNOWN'
    if (raw === 'created' || raw === 'queued') status = 'PENDING'
    else if (raw === 'started' || raw === 'processing') status = 'RUNNING'
    else if (raw === 'done') status = 'SUCCEEDED'
    else if (raw === 'error' || raw === 'failed') status = 'FAILED'
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined = resp?.result_url || resp?.resultUrl
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.error?.description || resp?.error?.message || raw || '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请稍后重试')
}

/* ------------------------------------------------------------------ */
/* 统一入口 / 路由                                                      */
/* ------------------------------------------------------------------ */

export async function generateVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  const protocol = params.protocol
  switch (protocol) {
    case 'dashscope':
      return generateDashScopeVideo(params, onProgress)
    case 'ark':
      return generateSeedanceVideo(params, onProgress)
    case 'kling':
      return generateKlingVideo(params, onProgress)
    case 'kling-v2':
      return generateKlingV2Video(params, onProgress)
    case 'zhipu':
      return generateZhipuVideo(params, onProgress)
    case 'minimax':
      return generateMiniMaxVideo(params, onProgress)
    case 'runway':
      return generateRunwayVideo(params, onProgress)
    case 'luma':
      return generateLumaVideo(params, onProgress)
    case 'openai':
      return generateOpenAIVideo(params, onProgress)
    case 'pika':
      return generatePikaVideo(params, onProgress)
    case 'google':
      return generateGoogleVideo(params, onProgress)
    case 'heygen':
      return generateHeygenVideo(params, onProgress)
    case 'synthesia':
      return generateSynthesiaVideo(params, onProgress)
    case 'd-id':
      return generateDidVideo(params, onProgress)
    default:
      throw new Error(
        `供应商「${params.provider}」未配置协议类型，请到后台「供应商管理」选择支持的协议后重试`
      )
  }
}

function humanStatus(status: string): string {
  switch (status) {
    case 'PENDING':
      return '排队中…'
    case 'RUNNING':
      return '生成中…'
    case 'SUCCEEDED':
      return '生成完成'
    case 'FAILED':
    case 'CANCELED':
    case 'UNKNOWN':
      return '生成异常'
    default:
      return '生成中…'
  }
}

