import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProviderModel } from '../../types'

// 资源库：罗列主流常用模型，帮用户搜索更适配的资源。
// 供应商/模型来自后端 bootstrap（运行时 store.providers），不再使用硬编码。
// 登录用户可通过「添加」按钮自定义供应商和模型，source='user' 写入后端。
// 可见性规则：
//  - 未登录：展示所有「来源=系统 (source='system')」的供应商与模型网格，
//    便于用户离线浏览模型目录；隐藏用户自定义的供应商/模型。
//  - 已登录：展示全部资源（system + user，含自定义供应商/模型），不再按 API 密钥过滤。
export default function ResourceLibrary() {
  const providers = useStore((s) => s.providers)
  const keys = useStore((s) => s.keys)
  const user = useStore((s) => s.user)
  const setModal = useStore((s) => s.setModal)
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'video' | 'image' | 'audio' | 'text'>('all')
  const [showAdd, setShowAdd] = useState(false)

  // —— 可见性第一层：按登录态 / 来源 / API Key 筛选可展示的模型 ——
  const visibleModels = useMemo<ProviderModel[]>(() => {
    if (!user.loggedIn) {
      // 未登录：只暴露系统来源的供应商 + 系统来源的模型
      return providers
        .filter((p) => p.source === 'system')
        .flatMap((p) => p.models.filter((m) => m.source === 'system'))
    }
    // 已登录：展示全部供应商 + 全部模型（含 system + user），不再按 API key 过滤
    return providers.flatMap((p) => p.models)
  }, [user.loggedIn, providers, keys])

  const visibleProviderCount = useMemo(() => {
    if (!user.loggedIn) {
      return providers.filter((p) => p.source === 'system').length
    }
    return providers.length
  }, [user.loggedIn, providers, keys])

  // —— 可见性第二层：用户搜索 + 类型筛选 ——
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return visibleModels.filter((m) => {
      if (type !== 'all' && m.type !== type) return false
      if (!kw) return true
      return (
        m.name.toLowerCase().includes(kw) ||
        m.desc.toLowerCase().includes(kw) ||
        m.provider.toLowerCase().includes(kw)
      )
    })
  }, [visibleModels, q, type])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">模型资源库</h2>
          {user.loggedIn && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              共 {visibleProviderCount} 家供应商 · {visibleModels.length} 个模型
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg border border-brand-300 bg-brand-50/50 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100"
          title={user.loggedIn ? '添加自定义供应商或模型' : '需登录后使用'}
        >
          + 添加
        </button>
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
        {visibleModels.length === 0 ? (
          user.loggedIn ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="text-2xl">📦</span>
              <p className="text-xs font-medium text-gray-600">暂无模型</p>
              <p className="max-w-xs text-[11px] leading-relaxed text-gray-400">
                点击右上角「添加」创建自定义供应商与模型。
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-1 rounded-lg border border-brand-300 bg-brand-50/50 px-3 py-1 text-[11px] text-brand-600 hover:bg-brand-100"
              >
                添加自定义资源
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="text-2xl">📦</span>
              <p className="text-xs font-medium text-gray-600">暂未收录系统模型</p>
              <p className="max-w-xs text-[11px] leading-relaxed text-gray-400">
                登录后可查看你已配置的专属模型，或添加自定义供应商资源。
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((m) => (
              <ModelCard key={m.id} model={m} />
            ))}
          </div>
        )}
        {visibleModels.length > 0 && filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">没有匹配的模型</p>
        )}
      </div>

      {showAdd && <AddResourceModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function ModelCard({ model }: { model: ProviderModel }) {
  const providers = useStore((s) => s.providers)
  const provider = providers.find((p) => p.id === model.provider)
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
        <div className="flex items-center gap-1 flex-wrap">
          {model.source === 'user' && (
            <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-600">
              自定义
            </span>
          )}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            {typeLabel[model.type]}
          </span>
          {model.supportsI2V && (() => {
            const fl = model.supportsFirstLast
            const rf = model.supportsReference
            if (fl && rf) return <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">图生·双模式</span>
            if (rf)        return <span className="rounded bg-purple-50 px-1 py-0.5 text-[10px] text-purple-600">图生·参考图</span>
            if (fl)        return <span className="rounded bg-cyan-50 px-1 py-0.5 text-[10px] text-cyan-600">图生·首尾帧</span>
            return <span className="rounded bg-green-50 px-1 py-0.5 text-[10px] text-green-600">图生</span>
          })()}
        </div>
      </div>
      <span className="text-[10px] text-brand-500">
        {provider?.name}
        {provider?.source === 'user' && ' (自定义)'}
      </span>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-400">{model.desc}</p>
      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-brand-400">
        访问官网 ↗
      </span>
    </div>
  )
}

// ===== 添加自定义供应商/模型弹窗 =====
function AddResourceModal({ onClose }: { onClose: () => void }) {
  const providers = useStore((s) => s.providers)
  const user = useStore((s) => s.user)
  const addCustomProvider = useStore((s) => s.addCustomProvider)
  const addCustomModel = useStore((s) => s.addCustomModel)
  const setModal = useStore((s) => s.setModal)

  const [tab, setTab] = useState<'provider' | 'model'>('provider')

  // 供应商表单
  const [pId, setPId] = useState('')
  const [pName, setPName] = useState('')
  const [pUrl, setPUrl] = useState('')
  const [pKeyHint, setPKeyHint] = useState('')

  // 模型表单
  const [mProvider, setMProvider] = useState('')
  const [mId, setMId] = useState('')
  const [mName, setMName] = useState('')
  const [mType, setMType] = useState<'video' | 'image' | 'audio' | 'text'>('video')
  const [mDesc, setMDesc] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 未登录时提示登录
  if (!user.loggedIn) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
          <p className="text-sm text-gray-700">添加自定义资源需要先登录</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={() => {
                onClose()
                setModal('login')
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700"
            >
              去登录
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleSaveProvider = async () => {
    setError('')
    if (!pId.trim() || !pName.trim()) {
      setError('供应商 ID 和名称必填')
      return
    }
    setSaving(true)
    try {
      await addCustomProvider({
        id: pId.trim(),
        name: pName.trim(),
        url: pUrl.trim() || undefined,
        keyHint: pKeyHint.trim() || undefined
      })
      // 成功后清空供应商表单，并自动切到模型 tab 方便继续添加模型
      setPId('')
      setPName('')
      setPUrl('')
      setPKeyHint('')
      setMProvider(pId.trim())
      setTab('model')
    } catch (e: any) {
      setError(e?.message ?? '添加失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveModel = async () => {
    setError('')
    if (!mProvider) {
      setError('请选择供应商')
      return
    }
    if (!mId.trim() || !mName.trim()) {
      setError('模型 ID 和名称必填')
      return
    }
    setSaving(true)
    try {
      await addCustomModel({
        id: mId.trim(),
        providerId: mProvider,
        name: mName.trim(),
        type: mType,
        description: mDesc.trim() || undefined
      })
      // 成功后清空模型表单
      setMId('')
      setMName('')
      setMDesc('')
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">添加自定义资源</h3>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => { setError(''); setTab('provider') }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'provider' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            添加供应商
          </button>
          <button
            onClick={() => { setError(''); setTab('model') }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'model' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            添加模型
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto scroll-thin">
          {tab === 'provider' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">供应商 ID</label>
                <input
                  value={pId}
                  onChange={(e) => setPId(e.target.value)}
                  placeholder="英文标识，如 my-provider"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">供应商名称</label>
                <input
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="显示名称，如 我的供应商"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">官网地址 (可选)</label>
                <input
                  value={pUrl}
                  onChange={(e) => setPUrl(e.target.value)}
                  placeholder="https://"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">API Key 前缀提示 (可选)</label>
                <input
                  value={pKeyHint}
                  onChange={(e) => setPKeyHint(e.target.value)}
                  placeholder="如 sk-"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">选择供应商</label>
                <select
                  value={mProvider}
                  onChange={(e) => setMProvider(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">请选择</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.source === 'user' ? ' (自定义)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">模型 ID</label>
                <input
                  value={mId}
                  onChange={(e) => setMId(e.target.value)}
                  placeholder="英文标识，如 my-model"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">模型名称</label>
                <input
                  value={mName}
                  onChange={(e) => setMName(e.target.value)}
                  placeholder="显示名称"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">模型类型</label>
                <select
                  value={mType}
                  onChange={(e) => setMType(e.target.value as typeof mType)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="video">视频</option>
                  <option value="image">图像</option>
                  <option value="audio">音频</option>
                  <option value="text">文本</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-gray-600">模型描述 (可选)</label>
                <textarea
                  value={mDesc}
                  onChange={(e) => setMDesc(e.target.value)}
                  rows={2}
                  placeholder="模型能力说明"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
          >
            取消
          </button>
          <button
            onClick={tab === 'provider' ? handleSaveProvider : handleSaveModel}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? '保存中…' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  )
}



