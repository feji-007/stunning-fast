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
//   - kling      快手可灵：JWT(AK+SK) 鉴权，kling-v3/v2-master/v2.5-turbo/v1.6
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
  // 图生视频：content 数组中加入 image_url 类型（API 要求 type=image_url）
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: params.prompt }]
  if (params.imageUrl) {
    content.unshift({ type: 'image_url', image_url: { url: params.imageUrl } })
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
    case 'submitted': return 'PENDING'
    case 'processing':
    case 'running':    return 'RUNNING'
    case 'completed':
    case 'succeeded':  return 'SUCCEEDED'
    case 'failed':
    case 'error':      return 'FAILED'
    default:           return 'UNKNOWN'
  }
}

function pikaBuildBody(params: GenerateVideoParams) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    video_model: params.model,
    aspect_ratio: params.ratio ?? '16:9'
  }
  if (params.duration) body.duration = params.duration
  if (params.imageUrl) body.image_url = params.imageUrl
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify(pikaBuildBody(params))
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch {
    throw new Error(`提交任务失败 (${res.status})：${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(`提交任务失败 (${res.status})：${data?.message || text}`)
  }
  const taskId: string | undefined = data?.id || data?.task_id
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
    const raw: string | undefined = resp?.status
    const status = mapPikaStatus(raw)
    onProgress?.({ status, message: humanStatus(status) })
    if (status === 'SUCCEEDED') {
      const videoUrl: string | undefined =
        resp?.video_url || resp?.video?.url || resp?.result?.url
      if (!videoUrl) throw new Error('任务成功但未返回视频地址')
      return { videoUrl, taskId }
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(`视频生成失败：${resp?.message || raw || '未知错误'}`)
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

