import crypto from 'crypto'
import type {
  GenerateVideoParams,
  GenerateVideoResult,
  VideoProgress
} from './shared/ipc'

// 视频生成多供应商集成：主进程按 provider 路由到对应客户端。
// 各供应商协议不同（端点 / 请求体 / 状态机），但都是「提交异步任务 -> 轮询 -> 取视频」。
// 目前已接入：
//   - alibaba   通义万相 (DashScope)：wan2.7（resolution+ratio）/ wan2.1-2.6（size）
//   - volcengine 火山引擎 (Ark)：Seedance 2.x / 1.5 / 1.0
//   - kling     快手可灵：JWT(AK+SK) 鉴权，kling-v3/v2-master/v2.5-turbo/v1.6
// 其他供应商可在 generateVideo 的 switch 中扩展。

const POLL_INTERVAL = 5000
const MAX_WAIT = 10 * 60 * 1000

type ProgressCb = (p: VideoProgress) => void

/* ------------------------------------------------------------------ */
/* 通义万相 (DashScope)                                                */
/* ------------------------------------------------------------------ */

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1'
const DASHSCOPE_SUBMIT = '/services/aigc/video-generation/video-synthesis'

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
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${DASHSCOPE_BASE}${DASHSCOPE_SUBMIT}`, {
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
      const q = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
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

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const ARK_SUBMIT = '/contents/generations/tasks'

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
  // 图生视频：content 数组中加入 image 类型
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: params.prompt }]
  if (params.imageUrl) {
    content.unshift({ type: 'image', image: { url: params.imageUrl } })
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
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const res = await fetch(`${ARK_BASE}${ARK_SUBMIT}`, {
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
      const q = await fetch(`${ARK_BASE}${ARK_SUBMIT}/${taskId}`, {
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

const KLING_BASE = 'https://api-beijing.klingai.com/v1'
const KLING_T2V = '/videos/text2video'

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

// 可灵图生视频用独立端点
function klingEndpoint(params: GenerateVideoParams): string {
  return params.imageUrl ? '/videos/image2video' : '/videos/text2video'
}

async function generateKlingVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  onProgress?.({ status: 'PENDING', message: '提交生成任务…' })
  const endpoint = klingEndpoint(params)
  const res = await fetch(`${KLING_BASE}${endpoint}`, {
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
      const q = await fetch(`${KLING_BASE}${endpoint}/${taskId}`, {
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
/* 统一入口 / 路由                                                      */
/* ------------------------------------------------------------------ */

export async function generateVideo(
  params: GenerateVideoParams,
  onProgress?: ProgressCb
): Promise<GenerateVideoResult> {
  switch (params.provider) {
    case 'alibaba':
      return generateDashScopeVideo(params, onProgress)
    case 'volcengine':
      return generateSeedanceVideo(params, onProgress)
    case 'kling':
      return generateKlingVideo(params, onProgress)
    default:
      throw new Error(`供应商「${params.provider}」暂未接入真实生成 API`)
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
