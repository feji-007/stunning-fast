import { useState } from 'react'
import { useStore } from '../../store/useStore'
import type { Tool, ToolDetail } from '../../types'
import SimpleMarkdown, { openExternal } from './SimpleMarkdown'
import { canQuickTry } from './toolMeta'

interface Props {
  tool: Tool | ToolDetail
  onClose: () => void
}

/** 配置引导：把"注册 → 创建 Key → 粘贴回 App"讲清楚，并支持就地保存 */
export default function SetupWizard({ tool, onClose }: Props) {
  const user = useStore((s) => s.user)
  const setModal = useStore((s) => s.setModal)
  const keys = useStore((s) => s.keys)
  const saveKey = useStore((s) => s.saveKey)
  const openFeature = useStore((s) => s.openFeature)

  const providerId = tool.providerId
  const quickTry = canQuickTry(tool)
  const provider = useStore((s) => s.providers.find((p) => p.id === providerId))
  const providerName = provider?.name ?? providerId ?? ''
  const existing = keys.find((k) => k.provider === providerId)?.key ?? ''
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const detail = tool as ToolDetail
  const steps = detail.setupSteps || ''
  // 工具自身未配置时，回退到所属供应商的 Key 获取页
  const apiKeyUrl = detail.apiKeyUrl || provider?.apiKeyUrl || ''
  const docsUrl = detail.apiDocsUrl || ''

  const handleSave = () => {
    if (!user.loggedIn) {
      setModal('login')
      return
    }
    const value = key.trim()
    if (!value) {
      setError('请先粘贴 API Key')
      return
    }
    if (!providerId) {
      setError('该工具暂不支持在 App 内保存 Key')
      return
    }
    saveKey(providerId, value)
    setSaved(true)
    setError('')
    setKey('')
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">配置 {tool.name}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {quickTry
                ? `保存后可在绝色内直接生成（供应商：${providerName}）`
                : '该工具暂不支持在绝色内直接生成，按引导到官网使用'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-md text-gray-400 hover:bg-black/5"
            title="关闭"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-auto scroll-thin px-4 py-3">
          {steps ? (
            <SimpleMarkdown text={steps} />
          ) : (
            <p className="text-xs leading-relaxed text-gray-500">
              打开「{tool.name}」官网，注册账号并进入控制台的 API 管理页面创建 Key，然后回到绝色粘贴保存。
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {apiKeyUrl && (
              <button
                type="button"
                onClick={() => openExternal(apiKeyUrl)}
                className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-medium text-brand-600 hover:bg-brand-100"
              >
                打开 API Key 页面
              </button>
            )}
            {docsUrl && (
              <button
                type="button"
                onClick={() => openExternal(docsUrl)}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50"
              >
                API 文档
              </button>
            )}
            <button
              type="button"
              onClick={() => openExternal(tool.officialUrl)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              打开官网
            </button>
          </div>

          {quickTry ? (
            <div className="mt-4 rounded-xl border border-black/5 bg-gray-50/70 p-3">
              <p className="text-[11px] font-medium text-gray-700">把 Key 保存到绝色</p>
              {existing && (
                <p className="mt-1 text-[11px] text-emerald-600">
                  已保存：{existing.slice(0, 4)}****{existing.slice(-4)}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value)
                    setError('')
                  }}
                  placeholder="粘贴 API Key"
                  className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  保存
                </button>
              </div>
              {error && <p className="mt-1.5 text-[11px] text-red-500">{error}</p>}
              {saved && <p className="mt-1.5 text-[11px] text-emerald-600">已保存，可以开始体验了</p>}
              <button
                type="button"
                onClick={() => {
                  onClose()
                  openFeature('video')
                }}
                disabled={!existing && !saved}
                className="mt-2 w-full rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                去快速体验 →
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-relaxed text-amber-700">
              该工具没有接入绝色的生成协议，配置引导只用于帮助你在官网/App 中顺利开始。
              {tool.hasOpenSource && ' 它是开源项目，需要本地 GPU 环境，按上面的步骤安装即可。'}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-black/5 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            关闭
          </button>
        </footer>
      </div>
    </div>
  )
}
