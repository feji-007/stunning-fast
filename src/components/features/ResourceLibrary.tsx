﻿import { useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProviderModel } from '../../types'

// 资源库：罗列主流常用模型，帮用户搜索更适配的资源。
// 系统供应商/模型来自后端 bootstrap；用户自定义供应商/模型仅保存在本地
// （localStorage），不上传服务器，可通过「导出/导入」跨设备迁移。
export default function ResourceLibrary() {
  const providers = useStore((s) => s.providers)
  const exportCustomResources = useStore((s) => s.exportCustomResources)
  const importCustomResources = useStore((s) => s.importCustomResources)
  const hasCustom = useStore((s) => s.customProviders.length + s.customModels.length > 0)
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'video' | 'image' | 'audio' | 'text'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  const handleExport = () => {
    const blob = new Blob([exportCustomResources()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'custom-resources.json'
    a.click()
    URL.revokeObjectURL(url)
    showToast('已导出自定义资源')
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      importCustomResources(await file.text())
      showToast('导入成功')
    } catch (err: any) {
      showToast(err?.message ?? '导入失败')
    }
  }

  // 系统模型 + 本地自定义模型统一展示，不再按登录态过滤
  const visibleModels = useMemo<ProviderModel[]>(() => {
    return providers.flatMap((p) => p.models)
  }, [providers])

  const visibleProviderCount = useMemo(() => providers.length, [providers])

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
          <p className="mt-0.5 text-[11px] text-gray-400">
            共 {visibleProviderCount} 家供应商 · {visibleModels.length} 个模型
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-600"
            title="从 JSON 文件导入本地自定义资源"
          >
            导入
          </button>
          <button
            onClick={handleExport}
            disabled={!hasCustom}
            className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="将本地自定义资源导出为 JSON 文件，用于跨设备迁移"
          >
            导出
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg border border-brand-300 bg-brand-50/50 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100"
            title="添加自定义供应商或模型（仅保存在本机）"
          >
            + 添加
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {toast && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-[11px] text-brand-700">
          {toast}
        </div>
      )}

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
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="text-2xl">📦</span>
            <p className="text-xs font-medium text-gray-600">暂无模型</p>
            <p className="max-w-xs text-[11px] leading-relaxed text-gray-400">
              点击右上角「添加」创建自定义供应商与模型，仅保存在本机。
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-1 rounded-lg border border-brand-300 bg-brand-50/50 px-3 py-1 text-[11px] text-brand-600 hover:bg-brand-100"
            >
              添加自定义资源
            </button>
          </div>
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
  const openExternal = (url: string) => {
    const api = window.api as any
    if (api && typeof api.openExternal === 'function') {
      api.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white p-2.5">
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
      <div className="mt-0.5 flex items-center gap-2">
        {provider?.apiKeyUrl && (
          <button
            onClick={() => openExternal(provider.apiKeyUrl!)}
            className="inline-flex items-center gap-0.5 rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-brand-600"
          >
            获取 API Key ↗
          </button>
        )}
        {model.docsUrl && (
          <button
            onClick={() => openExternal(model.docsUrl!)}
            className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            了解模型详情 ↗
          </button>
        )}
      </div>
    </div>
  )
}

// ===== 添加自定义供应商/模型弹窗（数据仅保存本机） =====
function AddResourceModal({ onClose }: { onClose: () => void }) {
  const providers = useStore((s) => s.providers)
  const addCustomProvider = useStore((s) => s.addCustomProvider)
  const addCustomModel = useStore((s) => s.addCustomModel)

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



