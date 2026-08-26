import { useMemo, useState } from 'react'
import { PROVIDERS, ALL_MODELS } from '../../data/models'
import type { ProviderModel } from '../../types'

// 资源库：罗列主流常用模型，帮用户搜索更适配的资源。
export default function ResourceLibrary() {
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'video' | 'image' | 'audio' | 'text'>('all')

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return ALL_MODELS.filter((m) => {
      if (type !== 'all' && m.type !== type) return false
      if (!kw) return true
      return (
        m.name.toLowerCase().includes(kw) ||
        m.desc.toLowerCase().includes(kw) ||
        m.provider.toLowerCase().includes(kw)
      )
    })
  }, [q, type])

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">模型资源库</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          收录 {ALL_MODELS.length} 个主流模型 · 来自 {PROVIDERS.length} 家供应商
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索模型名 / 供应商 / 描述…"
          className="flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-gray-600 outline-none"
        >
          <option value="all">全部类型</option>
          <option value="video">视频</option>
          <option value="image">图像</option>
          <option value="audio">音频</option>
          <option value="text">文本</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto scroll-thin pr-1">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">没有匹配的模型</p>
        )}
      </div>
    </div>
  )
}

function ModelCard({ model }: { model: ProviderModel }) {
  const provider = PROVIDERS.find((p) => p.id === model.provider)
  const typeLabel: Record<ProviderModel['type'], string> = {
    video: '视频',
    image: '图像',
    audio: '音频',
    text: '文本'
  }
  const handleOpen = () => {
    const url = provider?.url
    if (!url) return
    // 不使用可选链，避免 IPC 方法未暴露时静默失败
    const api = window.api as any
    if (api && typeof api.openExternal === 'function') {
      api.openExternal(url)
    } else {
      // 兜底：在 Electron 新窗口中打开（preload 未重新编译时）
      console.warn('[ResourceLibrary] openExternal 不可用，回退到 window.open')
      window.open(url, '_blank')
    }
  }
  return (
    <div
      onClick={handleOpen}
      className="flex cursor-pointer flex-col gap-1 rounded-lg border border-black/5 bg-white p-2.5 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
      title={`点击访问 ${provider?.name} 官网（在外部浏览器打开）`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-800">{model.name}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
          {typeLabel[model.type]}
        </span>
      </div>
      <span className="text-[10px] text-brand-500">{provider?.name}</span>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-400">{model.desc}</p>
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-brand-400">
        访问官网 ↗
      </span>
    </div>
  )
}
