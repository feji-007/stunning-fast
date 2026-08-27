import { useEffect, useRef, useState } from 'react'
import { useStore, availableModels, availableProviders } from '../../store/useStore'
import type { ProviderModel } from '../../types'

// 自动匹配优先级
type AutoPriority = 'quality' | 'speed' | 'price'

// 模型元数据：用于自动匹配排序（res=分辨率高度，speed=预估生成秒数，price=1低/2中/3高）
const MODEL_META: Record<string, { res: number; speed: number; price: number }> = {
  // 火山引擎 Seedance
  'doubao-seedance-2-5':              { res: 1080, speed: 60,  price: 3 },
  'doubao-seedance-2-0-260128':       { res: 1080, speed: 45,  price: 2 },
  'doubao-seedance-2-0-fast-260128':  { res: 720,  speed: 20,  price: 1 },
  'doubao-seedance-1-5-pro-251215':   { res: 720,  speed: 30,  price: 2 },
  'doubao-seedance-1-0-pro-fast-251015': { res: 720, speed: 15, price: 1 },
  // 快手可灵
  'kling-v3':          { res: 1080, speed: 120, price: 3 },
  'kling-v2-master':   { res: 1080, speed: 90,  price: 3 },
  'kling-v2-5-turbo':  { res: 720,  speed: 30,  price: 1 },
  'kling-v1-6':         { res: 720,  speed: 60,  price: 2 },
  // 通义万相
  'wan2.7-t2v':           { res: 1080, speed: 120, price: 3 },
  'wan2.7-t2v-2026-06-12': { res: 1080, speed: 120, price: 3 },
  'wan2.6-t2v':           { res: 1080, speed: 100, price: 3 },
  'wan2.2-t2v-plus':      { res: 1080, speed: 90,  price: 2 },
  'wan2.1-t2v-turbo':     { res: 720,  speed: 30,  price: 1 },
  'wan2.1-t2v-plus':      { res: 720,  speed: 60,  price: 2 },
  // 其他
  'video-01':      { res: 720,  speed: 60, price: 2 },
  'gen-3-alpha':   { res: 1080, speed: 60, price: 3 },
  'pika-1-5':      { res: 720,  speed: 30, price: 2 },
  'dream-machine': { res: 720,  speed: 60, price: 2 },
  'cogvideox':     { res: 720,  speed: 60, price: 1 },
  'sora':          { res: 1080, speed: 60, price: 3 },
}

// 根据优先级自动选择最优模型
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

// 视频生成：自动匹配或手动切换模型，支持文生/图生视频。
// 通义万相 / 火山引擎 Seedance / 快手可灵已接入真实生成流程。
export default function VideoGeneration() {
  const keys = useStore((s) => s.keys)
  const setModal = useStore((s) => s.setModal)
  const user = useStore((s) => s.user)

  const videoModels = availableModels(keys).filter((m) => m.type === 'video')
  const providers = availableProviders(keys)

  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [autoPriority, setAutoPriority] = useState<AutoPriority>('quality')
  const [selected, setSelected] = useState<string | null>(null)
  const [genMode, setGenMode] = useState<'t2v' | 'i2v'>('t2v')
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [resolution, setResolution] = useState('720P')
  const [ratio, setRatio] = useState('16:9')
  const [duration, setDuration] = useState('5')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 可调节分栏比例（左面板占比）
  const [splitRatio, setSplitRatio] = useState(0.55)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // 订阅主进程的生成进度事件。
  useEffect(() => {
    const off = window.api?.onVideoProgress?.((p) => {
      if (p?.message) setProgress(p.message)
    })
    return () => off?.()
  }, [])

  // 自动匹配：按优先级选择最优模型；手动：用用户选择的模型。
  const chosen =
    mode === 'auto'
      ? pickAutoModel(videoModels, autoPriority)
      : videoModels.find((m) => m.id === selected) ?? null

  // 当前选中模型是否支持图生视频
  const supportsI2V = chosen?.supportsI2V ?? false

  // 模型切换时：如果不支持 i2v，自动切回 t2v
  useEffect(() => {
    if (genMode === 'i2v' && !supportsI2V) {
      setGenMode('t2v')
    }
  }, [supportsI2V, genMode])

  const needLogin = !user.loggedIn
  const needKeys = videoModels.length === 0

  const findKey = (provider: ProviderModel['provider']) =>
    keys.find((k) => k.provider === provider && k.key.trim())?.key ?? ''

  const handleGenerate = async () => {
    setError(null)
    setVideoUrl(null)
    setProgress(null)
    if (needLogin) return setModal('login')
    if (needKeys || !chosen) return setModal('settings')

    // 图生视频模式下必须有图片 URL
    if (genMode === 'i2v' && !imageUrl.trim()) {
      setError('图生视频模式下，请先填写参考图片 URL。')
      return
    }

    setBusy(true)
    try {
      if (
        chosen.provider === 'alibaba' ||
        chosen.provider === 'volcengine' ||
        chosen.provider === 'kling'
      ) {
        const apiKey = findKey(chosen.provider)
        if (!apiKey) {
          setError('未找到该供应商 API 密钥，请在设置中配置。')
          return
        }
        const result = await window.api.generateVideo({
          provider: chosen.provider,
          apiKey,
          model: chosen.id,
          prompt,
          resolution,
          ratio,
          duration: Number(duration),
          imageUrl: genMode === 'i2v' ? imageUrl.trim() || undefined : undefined
        })
        setVideoUrl(result.videoUrl)
        setProgress('生成完成')
      } else {
        setProgress('演示生成中…（该供应商暂未接入真实 API）')
        await new Promise((r) => setTimeout(r, 1200))
        setVideoUrl(null)
        setError(`【${chosen.name}】演示完成。目前「通义万相」「火山引擎 Seedance」「快手可灵」已接入真实生成，可在设置中配置密钥后选用对应模型。`)
      }
    } catch (e: any) {
      setError(e?.message ?? '生成失败')
    } finally {
      setBusy(false)
    }
  }

  // 拖拽分隔条
  const startDrag = () => {
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 自动匹配优先级：仅在自动模式下显示 */}
      {mode === 'auto' && (
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px]">
            {([
              { v: 'quality' as AutoPriority, label: '清晰度优先' },
              { v: 'speed' as AutoPriority, label: '速度优先' },
              { v: 'price' as AutoPriority, label: '价格优先' },
            ]).map((o) => (
              <button
                key={o.v}
                onClick={() => setAutoPriority(o.v)}
                className={`rounded-md px-2.5 py-1 ${
                  autoPriority === o.v
                    ? 'bg-white font-medium text-brand-600 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 顶部栏 */}
      <div className="flex items-center gap-2">
        <ModeSwitch mode={mode} onChange={setMode} />
        <div className="ml-auto text-[11px] text-gray-400">
          可用供应商：{providers.length > 0 ? providers.map((p) => p.name).join('、') : '无'}
        </div>
      </div>

      {needKeys && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          尚未配置任何 API 密钥。前往
          <button
            className="mx-1 font-medium underline"
            onClick={() => setModal(needLogin ? 'login' : 'settings')}
          >
            设置
          </button>
          添加密钥后，可用模型会自动出现在下方。
        </div>
      )}

      {/* 左右分栏 */}
      <div ref={containerRef} className="flex flex-1 gap-0 overflow-hidden">
        {/* 左侧：控制区 */}
        <div
          className="flex flex-col gap-3 overflow-auto scroll-thin pr-2"
          style={{ width: `${splitRatio * 100}%` }}
        >
          {/* 可用模型下拉框 */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">可用模型</p>
            {videoModels.length === 0 ? (
              <span className="text-xs text-gray-400">暂无可用视频模型</span>
            ) : (
              <select
                value={chosen?.id ?? ''}
                onChange={(e) => {
                  setMode('manual')
                  setSelected(e.target.value)
                }}
                className="w-full max-w-xs rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-brand-200 focus:border-brand-300 focus:outline-none"
              >
                {videoModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.supportsI2V ? ' (图+文)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 生成模式切换：仅在选中模型支持图生视频时显示 */}
          {supportsI2V && (
            <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px] w-fit">
              <button
                onClick={() => setGenMode('t2v')}
                className={`rounded-md px-3 py-1 ${
                  genMode === 't2v' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                文生视频
              </button>
              <button
                onClick={() => setGenMode('i2v')}
                className={`rounded-md px-3 py-1 ${
                  genMode === 'i2v' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                图生视频
              </button>
            </div>
          )}

          {/* 图生视频：参考图 URL */}
          {genMode === 'i2v' && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-gray-500">参考图片 URL</p>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="参考图"
                  className="mt-1.5 max-h-24 w-full rounded-lg border border-black/5 object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
            </div>
          )}

          {/* 画面参数：清晰度 + 宽高比 + 时长 */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
              清晰度
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400"
              >
                <option value="720P">720P</option>
                <option value="1080P">1080P</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
              宽高比
              <select
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400"
              >
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 方形</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
              时长
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-brand-400"
              >
                <option value="2">2s</option>
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
              </select>
            </label>
          </div>

          {/* 提示词 */}
          <div className="flex flex-1 flex-col">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">提示词</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要生成的视频画面，例如：夕阳下的城市街景，镜头缓慢推进……"
              className="min-h-[80px] flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-brand-400 scroll-thin"
            />
          </div>

          {/* 生成按钮 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={busy}
              className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? '生成中…' : genMode === 'i2v' ? '图生视频' : '文生视频'}
            </button>
            {chosen && (
              <span className="text-[11px] text-gray-400">
                当前使用：<b className="text-gray-600">{chosen.name}</b>
                {(chosen.provider === 'alibaba' ||
                  chosen.provider === 'volcengine' ||
                  chosen.provider === 'kling') && (
                  <span className="ml-1 text-green-500">· 已接入</span>
                )}
              </span>
            )}
          </div>

          {/* 进度 / 错误 */}
          {busy && progress && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
              {progress}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* 拖拽分隔条 */}
        <div
          onMouseDown={startDrag}
          className="group relative w-1 shrink-0 cursor-col-resize bg-black/5 hover:bg-brand-300"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* 右侧：预览区 */}
        <div
          className="flex flex-col gap-2 overflow-auto scroll-thin pl-2"
          style={{ width: `${(1 - splitRatio) * 100}%` }}
        >
          <p className="text-[11px] font-medium text-gray-500">视频预览</p>
          {videoUrl ? (
            <div className="flex flex-col gap-2">
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full flex-1 rounded-lg bg-black"
              />
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[11px] text-brand-600 hover:underline"
              >
                下载 / 在浏览器中打开 ↗
              </a>
            </div>
          ) : busy ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-gray-50">
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-300 border-t-transparent" />
                <span className="text-[11px]">{progress ?? '等待生成…'}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-black/10 bg-gray-50">
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <span className="text-2xl">🎬</span>
                <span className="text-[11px]">生成的视频将在此预览</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeSwitch({
  mode,
  onChange
}: {
  mode: 'auto' | 'manual'
  onChange: (m: 'auto' | 'manual') => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-black/10 bg-gray-50 p-0.5 text-[11px]">
      <button
        onClick={() => onChange('auto')}
        className={`rounded-md px-3 py-1 ${
          mode === 'auto' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
        }`}
      >
        自动匹配
      </button>
      <button
        onClick={() => onChange('manual')}
        className={`rounded-md px-3 py-1 ${
          mode === 'manual' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
        }`}
      >
        手动切换
      </button>
    </div>
  )
}
