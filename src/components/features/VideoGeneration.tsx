import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore, availableModels, availableProviders } from '../../store/useStore'
import { tasksApi } from '../../api/client'
import type { ProviderModel } from '../../types'

// 自动匹配优先级
type AutoPriority = 'quality' | 'speed' | 'price'

// 图生视频子模式
type I2VMode = 'firstlast' | 'reference'

// 上传图片项
interface ImageItem {
  url: string
  name: string
}

// 历史任务记录
interface HistoryTask {
  id: number
  provider_id: string
  model_id: string
  gen_mode: string
  status: string
  resolution: string
  ratio: string
  duration: string
  prompt: string
  image_url: string
  video_url: string
  error_message: string
  created_at: string
}

const MODEL_META: Record<string, { res: number; speed: number; price: number }> = {
  'doubao-seedance-2-5':              { res: 1080, speed: 60,  price: 3 },
  'doubao-seedance-2-0-260128':       { res: 1080, speed: 45,  price: 2 },
  'doubao-seedance-2-0-fast-260128':  { res: 720,  speed: 20,  price: 1 },
  'doubao-seedance-1-5-pro-251215':   { res: 720,  speed: 30,  price: 2 },
  'doubao-seedance-1-0-pro-fast-251015': { res: 720, speed: 15, price: 1 },
  'kling-v3':          { res: 1080, speed: 120, price: 3 },
  'kling-v2-master':   { res: 1080, speed: 90,  price: 3 },
  'kling-v2-5-turbo':  { res: 720,  speed: 30,  price: 1 },
  'kling-v1-6':         { res: 720,  speed: 60,  price: 2 },
  'wan2.7-t2v':           { res: 1080, speed: 120, price: 3 },
  'wan2.7-t2v-2026-06-12': { res: 1080, speed: 120, price: 3 },
  'wan2.6-t2v':           { res: 1080, speed: 100, price: 3 },
  'wan2.2-t2v-plus':      { res: 1080, speed: 90,  price: 2 },
  'wan2.1-t2v-turbo':     { res: 720,  speed: 30,  price: 1 },
  'wan2.1-t2v-plus':      { res: 720,  speed: 60,  price: 2 },
  'video-01':      { res: 720,  speed: 60, price: 2 },
  'gen-3-alpha':   { res: 1080, speed: 60, price: 3 },
  'pika-1-5':      { res: 720,  speed: 30, price: 2 },
  'dream-machine': { res: 720,  speed: 60, price: 2 },
  'cogvideox':     { res: 720,  speed: 60, price: 1 },
  'sora':          { res: 1080, speed: 60, price: 3 },
}

function pickAutoModel(models: ProviderModel[], priority: AutoPriority): ProviderModel | null {
  if (models.length === 0) return null
  const sorted = [...models].sort((a, b) => {
    const ma = MODEL_META[a.id] ?? { res: 720, speed: 60, price: 2 }
    const mb = MODEL_META[b.id] ?? { res: 720, speed: 60, price: 2 }
    switch (priority) {
      case 'quality': return mb.res - ma.res || ma.speed - mb.speed
      case 'speed':   return ma.speed - mb.speed || ma.price - mb.price
      case 'price':   return ma.price - mb.price || ma.speed - mb.speed
    }
  })
  return sorted[0]
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function fmtDate(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function truncatePrompt(p: string, max = 20): string {
  const t = p.trim()
  if (!t) return '无提示词'
  return t.length > max ? t.slice(0, max) + '...' : t
}

export default function VideoGeneration() {
  const keys = useStore((s) => s.keys)
  const setModal = useStore((s) => s.setModal)
  const user = useStore((s) => s.user)
  const allProviders = useStore((s) => s.providers)
  const videoConfig = useStore((s) => s.videoConfig)

  const activeKeys = user.loggedIn ? keys : []
  const videoModels = availableModels(allProviders, activeKeys).filter((m) => m.type === 'video')
  const providers = availableProviders(allProviders, activeKeys)

  const videoForm = useStore((s) => s.videoForm)
  const setVideoForm = useStore((s) => s.setVideoForm)
  const { mode, autoPriority, selected, genMode, i2vMode, images, prompt, resolution, ratio, duration } = videoForm
  const [urlInput, setUrlInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null)
  const [historyTasks, setHistoryTasks] = useState<HistoryTask[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.55)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const off = window.api?.onVideoProgress?.((p) => {
      if (p?.message) setProgress(p.message)
    })
    return () => off?.()
  }, [])

  const loadHistory = useCallback(() => {
    if (!user.loggedIn) return
    tasksApi.listMine().then((r) => setHistoryTasks(r.tasks ?? [])).catch(() => {})
  }, [user.loggedIn])

  useEffect(() => { loadHistory() }, [loadHistory])

  const chosen = mode === 'auto' ? pickAutoModel(videoModels, autoPriority) : videoModels.find((m) => m.id === selected) ?? null
  const supportsI2V = chosen?.supportsI2V ?? false
  // 模型 i2v 子模式能力：
  // 1) supportsI2V = true 且两个子模式字段都不是明确的 true → 旧数据未配置，两子模式都默认 true（向后兼容）
  // 2) 有明确配置（任一字段为 true）时按配置区分
  const hasExplicitSubmode = chosen?.supportsFirstLast === true || chosen?.supportsReference === true
  const canFirstLast = chosen ? (hasExplicitSubmode ? !!chosen.supportsFirstLast : supportsI2V ? true : !!chosen.supportsFirstLast) : true
  const canReference = chosen ? (hasExplicitSubmode ? !!chosen.supportsReference : supportsI2V ? true : !!chosen.supportsReference) : true

  // 模型/模式变化时的一致性修复（切换模型后 i2vMode 若不支持就 fallback）
  useEffect(() => {
    const patch: any = {}
    // A) 新模型完全不支持图生视频：强制退回文生视频，清空图片
    if (genMode === 'i2v' && !supportsI2V) {
      patch.genMode = 't2v' as const
      patch.images = []
    }
    // B) 在 i2v 模式下，校验当前 i2vMode 是否被新模型支持；不支持则 fallback 到可用模式（优先 reference → firstlast → 都不支持就退 t2v 清空）
    if ((patch.genMode ?? genMode) === 'i2v') {
      const okFL = !!canFirstLast
      const okRF = !!canReference
      const current = i2vMode
      // 当前值合法 & 被新模型支持 → 无需调整
      const stillOk = (current === 'firstlast' && okFL) || (current === 'reference' && okRF)
      if (!stillOk) {
        let desired: I2VMode | null = null
        if (okRF) desired = 'reference'
        else if (okFL) desired = 'firstlast'
        if (desired) {
          patch.i2vMode = desired
        } else {
          // 新模型连一种子模式都不支持，回退到文生视频
          patch.genMode = 't2v' as const
          patch.images = []
        }
      }
    }
    // C) 按最终确定的模式裁剪图片数量（firstlast<=2，reference<=5）
    if ((patch.genMode ?? genMode) === 'i2v') {
      const mode = patch.i2vMode ?? i2vMode
      const safeMode: I2VMode = mode === 'firstlast' || mode === 'reference' ? mode : (canReference ? 'reference' : (canFirstLast ? 'firstlast' : 'reference'))
      const maxLen = safeMode === 'firstlast' ? 2 : 5
      const imgs = patch.images ?? images
      if (imgs && imgs.length > maxLen) patch.images = imgs.slice(0, maxLen)
    }
    if (Object.keys(patch).length > 0) setVideoForm(patch)
  }, [chosen?.id, supportsI2V, canFirstLast, canReference, genMode, i2vMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const needLogin = !user.loggedIn
  const needKeys = user.loggedIn && videoModels.length === 0
  // render fallback: if i2vMode invalid, pick one by model capability
  const effectiveI2VMode = (i2vMode === 'firstlast' || i2vMode === 'reference') ? i2vMode : (canReference ? 'reference' : (canFirstLast ? 'firstlast' : 'reference'))
  const maxImages = effectiveI2VMode === 'firstlast' ? 2 : 5

  const findKey = (provider: ProviderModel['provider']) =>
    keys.find((k) => k.provider === provider && k.key.trim())?.key ?? ''

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const remaining = maxImages - images.length
    if (remaining <= 0) { setError('最多只能上传 ' + maxImages + ' 张图片'); return }
    const toProcess = arr.slice(0, remaining)
    const newItems: ImageItem[] = []
    for (const f of toProcess) {
      try { const url = await fileToDataUrl(f); newItems.push({ url, name: f.name }) } catch {}
    }
    if (newItems.length > 0) { setVideoForm({ images: [...images, ...newItems] }); setError(null) }
  }

  const onFileSelect = () => fileInputRef.current?.click()
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void handleFiles(e.target.files)
    e.target.value = ''
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files)
  }

  const addUrlImage = () => {
    const url = urlInput.trim()
    if (!url) return
    if (images.length >= maxImages) { setError('最多只能上传 ' + maxImages + ' 张图片'); return }
    setVideoForm({ images: [...images, { url: url, name: url.split('/').pop() || 'url-image' }] })
    setUrlInput('')
    setError(null)
  }

  const removeImage = (idx: number) => setVideoForm({ images: images.filter((_: any, i: number) => i !== idx) })

  const handleGenerate = async () => {
    setError(null); setVideoUrl(null); setVideoLoadError(null); setProgress(null)
    if (needLogin) return setModal('login')
    if (needKeys || !chosen) return setModal('settings')
    if (genMode === 'i2v' && images.length === 0) { setError('图生视频模式下，请先上传或填写参考图片。'); return }
    setBusy(true)
    let status: 'success' | 'fail' = 'fail'
    let videoUrlOut = ''
    let errMsgOut = ''
    const imageUrlForTask = genMode === 'i2v' && images.length > 0 ? images[0].url : ''
    const primaryImageUrl = genMode === 'i2v' && images.length > 0 ? images[0].url : undefined
    try {
      if (chosen.provider === 'alibaba' || chosen.provider === 'volcengine' || chosen.provider === 'kling') {
        const apiKey = findKey(chosen.provider)
        if (!apiKey) { setError('未找到该供应商 API 密钥，请在设置中配置。'); errMsgOut = '未找到该供应商 API 密钥'; return }
        const result = await window.api.generateVideo({ provider: chosen.provider, apiKey, model: chosen.id, prompt, resolution, ratio, duration: Number(duration), imageUrl: primaryImageUrl })
        setVideoUrl(result.videoUrl); setProgress('生成完成'); status = 'success'; videoUrlOut = result.videoUrl ?? ''
      } else {
        setProgress('演示生成中...')
        await new Promise((r) => setTimeout(r, 1200))
        setVideoUrl(null)
        setError('【' + chosen.name + '】演示完成。目前「通义万相」「火山引擎 Seedance」「快手可灵」已接入真实生成，可在设置中配置密钥后选用对应模型。')
        status = 'success'
      }
    } catch (e: any) {
      setError(e?.message ?? '生成失败'); status = 'fail'; errMsgOut = e?.message ?? '生成失败'
    } finally {
      setBusy(false)
      if (chosen) {
        void tasksApi.record({ providerId: chosen.provider, modelId: chosen.id, genMode, status, resolution, ratio, duration, prompt, imageUrl: imageUrlForTask, videoUrl: videoUrlOut, errorMessage: errMsgOut }).then(() => loadHistory()).catch(() => {})
      }
    }
  }

  const onSelectHistoryTask = (t: HistoryTask) => {
    setSelectedTaskId(t.id); setVideoLoadError(null)
    if (!t.video_url) { setVideoUrl(null); setVideoLoadError('该任务没有可播放的视频文件（可能生成失败或未记录）。'); return }
    setVideoUrl(t.video_url)
    if (t.prompt) setVideoForm({ prompt: t.prompt })
  }

  const onVideoError = () => setVideoLoadError('媒体文件出错，无法播放该视频。可能链接已失效或格式不受支持。')

  const startDrag = () => { draggingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onUp = () => { if (draggingRef.current) { draggingRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = '' } }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  return (
    <div className="flex h-full flex-col gap-3">
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFileChange} className="hidden" />
      {mode === 'auto' && (
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px]">
            {([{ v: 'quality' as AutoPriority, label: '清晰度优先' }, { v: 'speed' as AutoPriority, label: '速度优先' }, { v: 'price' as AutoPriority, label: '价格优先' }]).map((o) => (
              <button key={o.v} onClick={() => setVideoForm({ autoPriority: o.v })} className={'rounded-md px-2.5 py-1 ' + (autoPriority === o.v ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>{o.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <ModeSwitch mode={mode} onChange={(m) => setVideoForm({ mode: m })} />
        {!needLogin && (<div className="ml-auto text-[11px] text-gray-400">可用供应商：{providers.length > 0 ? providers.map((p) => p.name).join('、') : '无'}</div>)}
      </div>
      {needLogin && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
          未登录：可用模型将按你在「设置 - API 密钥」中的配置展示。
          <button className="ml-1 font-medium underline" onClick={() => setModal('login')}>立即登录</button>
        </div>
      )}
      {!needLogin && needKeys && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          尚未配置任何 API 密钥。前往<button className="mx-1 font-medium underline" onClick={() => setModal('settings')}>设置</button>添加密钥后，可用模型会自动出现在下方。
        </div>
      )}
      <div ref={containerRef} className="flex flex-1 gap-0 overflow-hidden">
        <div className="flex flex-col gap-3 overflow-auto scroll-thin pr-2" style={{ width: (splitRatio * 100) + '%' }}>
          {!needLogin && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-gray-500">可用模型</p>
              {videoModels.length === 0 ? (
                <span className="text-xs text-gray-400">暂无可用视频模型</span>
              ) : (
                <select value={chosen?.id ?? ''} onChange={(e) => { setVideoForm({ mode: 'manual' as 'manual', selected: e.target.value }) }} className="w-full max-w-xs rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-brand-200 focus:border-brand-300 focus:outline-none">
                  {videoModels.map((m) => (<option key={m.id} value={m.id}>{m.name}{m.supportsI2V ? ' (图+文)' : ''}</option>))}
                </select>
              )}
            </div>
          )}
          {supportsI2V && (
            <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px] w-fit">
              <button onClick={() => setVideoForm({ genMode: 't2v' as 't2v' })} className={'rounded-md px-3 py-1 ' + (genMode === 't2v' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>文生视频</button>
              <button onClick={() => setVideoForm({ genMode: 'i2v' as 'i2v' })} className={'rounded-md px-3 py-1 ' + (genMode === 'i2v' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>图生视频</button>
            </div>
          )}
          {genMode === 'i2v' && (
            <div className="flex flex-col gap-2">
              <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px] w-fit">
{canFirstLast && (<button onClick={() => setVideoForm({ i2vMode: 'firstlast' as 'firstlast' })} className={'rounded-md px-3 py-1 ' + (i2vMode === 'firstlast' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>首尾帧</button>)}
{canReference && (<button onClick={() => setVideoForm({ i2vMode: 'reference' as 'reference' })} className={'rounded-md px-3 py-1 ' + (i2vMode === 'reference' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>参考模式</button>)}
              </div>

              {/* 首尾帧：两个78x78槽位 + 中间交换图标 */}
              {effectiveI2VMode === 'firstlast' && (
                <div className="flex items-center gap-2">
                  {/* 首帧 */}
                  <div
                    onClick={() => images.length <= 0 && onFileSelect()}
                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    className="group relative h-[78px] w-[78px] shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-brand-300"
                  >
                    {images[0] ? (
                      <>
                        <img src={images[0].url} alt="first frame" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3' }} />
                        <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-1 py-0.5 text-[8px] text-white">首帧</span>
                        <button onClick={(e) => { e.stopPropagation(); removeImage(0) }} className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white opacity-0 group-hover:opacity-100">x</button>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-gray-300">
                        <span className="text-base">+</span><span className="text-[8px]">首帧</span>
                      </div>
                    )}
                  </div>

                  {/* 交换图标 */}
                  <button
                    onClick={() => { if (images.length >= 2) { const a = [...images]; [a[0], a[1]] = [a[1], a[0]]; setVideoForm({ images: a }) } }}
                    disabled={images.length < 2}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition-colors hover:border-brand-300 hover:text-brand-500 disabled:opacity-30"
                    title="swap first/last frame"
                  >
                    ⇄
                  </button>

                  {/* 尾帧 */}
                  <div
                    onClick={() => images.length <= 1 && onFileSelect()}
                    onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                    className="group relative h-[78px] w-[78px] shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-brand-300"
                  >
                    {images[1] ? (
                      <>
                        <img src={images[1].url} alt="last frame" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3' }} />
                        <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-1 py-0.5 text-[8px] text-white">尾帧</span>
                        <button onClick={(e) => { e.stopPropagation(); removeImage(1) }} className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white opacity-0 group-hover:opacity-100">x</button>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-gray-300">
                        <span className="text-base">+</span><span className="text-[8px]">尾帧</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 参考模式：一行小缩略图 + 末尾上传按钮 */}
              {effectiveI2VMode === 'reference' && (
                <div className="flex items-center gap-1.5">
                  {images.map((img, idx) => (
                    <div key={idx} className="group relative h-[78px] w-[78px] shrink-0 overflow-hidden rounded-lg border border-black/10">
                      <img src={img.url} alt={'ref ' + (idx + 1)} className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3' }} />
                      <span className="absolute left-0.5 top-0.5 rounded bg-black/50 px-1 py-0.5 text-[8px] text-white">{'#' + (idx + 1)}</span>
                      <button onClick={() => removeImage(idx)} className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white opacity-0 group-hover:opacity-100">x</button>
                    </div>
                  ))}
                  {images.length < maxImages && (
                    <div
                      onClick={onFileSelect}
                      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                      className="flex h-[78px] w-[78px] shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 text-gray-300 hover:border-brand-300 hover:bg-brand-50/30"
                    >
                      <span className="text-base">+</span>
                    </div>
                  )}
                  <span className="ml-1 text-[10px] text-gray-300">{images.length}/{maxImages}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">清晰度<select value={resolution} onChange={(e) => setVideoForm({ resolution: e.target.value })} className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400">{(videoConfig.resolution ?? []).map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">宽高比<select value={ratio} onChange={(e) => setVideoForm({ ratio: e.target.value })} className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400">{(videoConfig.ratio ?? []).map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">时长<select value={duration} onChange={(e) => setVideoForm({ duration: e.target.value })} className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400">{(videoConfig.duration ?? []).map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
          </div>
          <div className="flex flex-1 flex-col">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">提示词</p>
            <textarea value={prompt} onChange={(e) => setVideoForm({ prompt: e.target.value })} placeholder="描述你想要生成的视频画面..." className="min-h-[80px] flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-brand-400 scroll-thin" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleGenerate} disabled={busy} className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">{busy ? '生成中…' : genMode === 'i2v' ? '图生视频' : '文生视频'}</button>
            {chosen && (<span className="text-[11px] text-gray-400">当前使用：<b className="text-gray-600">{chosen.name}</b>{(chosen.provider === 'alibaba' || chosen.provider === 'volcengine' || chosen.provider === 'kling') && (<span className="ml-1 text-green-500">· 已接入</span>)}</span>)}
          </div>
          {busy && progress && (<div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-600"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />{progress}</div>)}
          {error && (<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>)}
        </div>
        <div onMouseDown={startDrag} className="group relative w-1 shrink-0 cursor-col-resize bg-black/5 hover:bg-brand-300"><div className="absolute inset-y-0 -left-1 -right-1" /></div>
        <div className="flex flex-col gap-2 overflow-auto scroll-thin pl-2" style={{ width: ((1 - splitRatio) * 100) + '%' }}>
          <p className="text-[11px] font-medium text-gray-500">视频预览</p>
          {videoLoadError ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50"><div className="flex flex-col items-center gap-1 text-red-400"><span className="text-2xl">⚠️</span><span className="text-[11px] text-red-500">{videoLoadError}</span></div></div>
          ) : videoUrl ? (
            <div className="flex flex-col gap-2">
              <video src={videoUrl} controls autoPlay loop className="w-full flex-1 rounded-lg bg-black" onError={onVideoError} />
              <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-block text-[11px] text-brand-600 hover:underline">下载 / 在浏览器中打开 ↗</a>
            </div>
          ) : busy ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-gray-50"><div className="flex flex-col items-center gap-2 text-gray-400"><span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-300 border-t-transparent" /><span className="text-[11px]">{progress ?? '等待生成…'}</span></div></div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-gray-50"><div className="flex flex-col items-center gap-1 text-gray-400"><span className="text-2xl">🎬</span><span className="text-[11px]">生成的视频将在此预览</span></div></div>
          )}
          <div className="mt-2 border-t border-gray-100 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-medium text-gray-500">历史任务</p>
              {user.loggedIn && (<button onClick={loadHistory} className="text-[10px] text-gray-400 hover:text-brand-500">刷新</button>)}
            </div>
            {needLogin ? (
              <div className="py-3 text-center text-[11px] text-gray-300">登录后可查看历史任务</div>
            ) : historyTasks.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-gray-300">暂无历史记录</div>
            ) : (
              <div className="flex flex-col gap-1">
                {historyTasks.slice(0, 20).map((t) => (
                  <button key={t.id} onClick={() => onSelectHistoryTask(t)} className={'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ' + (selectedTaskId === t.id ? 'border-brand-300 bg-brand-50/50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50')}>
                    <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (t.status === 'success' ? 'bg-emerald-400' : 'bg-red-400')} />
                    <span className="flex-1 truncate text-gray-600" title={t.prompt}>{truncatePrompt(t.prompt)}</span>
                    <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-500">{t.gen_mode === 'i2v' ? '图生' : '文生'}</span>
                    <span className="shrink-0 text-[9px] text-gray-300">{fmtDate(t.created_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeSwitch({ mode, onChange }: { mode: 'auto' | 'manual'; onChange: (m: 'auto' | 'manual') => void }) {
  return (
    <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px]">
      <button onClick={() => onChange('auto')} className={'rounded-md px-3 py-1 ' + (mode === 'auto' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>自动匹配</button>
      <button onClick={() => onChange('manual')} className={'rounded-md px-3 py-1 ' + (mode === 'manual' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500')}>手动切换</button>
    </div>
  )
}







