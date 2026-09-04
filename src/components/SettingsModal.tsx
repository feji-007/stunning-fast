import { useState } from 'react'
import { useStore, availableProviders } from '../store/useStore'
import type { ProviderId } from '../types'

// 设置：统一管理自有密钥。保存 Key 后自动探测可接入供应商，并在生成页展示可用模型。
// 供应商列表来自后端 bootstrap（运行时 store.providers），不再使用硬编码。
export default function SettingsModal() {
  const setModal = useStore((s) => s.setModal)
  const keys = useStore((s) => s.keys)
  const saveKey = useStore((s) => s.saveKey)
  const removeKey = useStore((s) => s.removeKey)
  const providers = useStore((s) => s.providers)

  const connected = new Set(availableProviders(providers, keys).map((p) => p.id))

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/30">
      <div className="flex h-[460px] w-[640px] flex-col rounded-2xl bg-white shadow-float">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">设置 · 密钥管理</h2>
          <button
            onClick={() => setModal('none')}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-2 text-[11px] text-gray-400">
          <span>
            已接入 <b className="text-brand-600">{connected.size}</b> / {providers.length} 家供应商
          </span>
          <span>保存密钥后将自动探测，并在视频生成页展示可用模型</span>
        </div>

        <div className="flex-1 overflow-auto scroll-thin px-5 pb-5">
          <div className="space-y-2">
            {providers.map((p) => {
              const existing = keys.find((k) => k.provider === p.id)
              return (
                <ProviderRow
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  url={p.url}
                  keyHint={p.keyHint}
                  models={p.models.map((m) => m.name)}
                  connected={connected.has(p.id)}
                  existingKey={existing?.key}
                  onSave={(key) => saveKey(p.id, key)}
                  onRemove={() => removeKey(p.id)}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderRow({
  name,
  url,
  keyHint,
  models,
  connected,
  existingKey,
  onSave,
  onRemove
}: {
  id: ProviderId
  name: string
  url: string
  keyHint: string
  models: string[]
  connected: boolean
  existingKey?: string
  onSave: (key: string) => void
  onRemove: () => void
}) {
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)

  const masked = existingKey
    ? existingKey.slice(0, 4) + '••••••' + existingKey.slice(-4)
    : ''

  return (
    <div className="rounded-lg border border-black/5 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-800">{name}</span>
          {url && (
            <button
              onClick={() => window.api?.openExternal?.(url)}
              className="text-[10px] text-brand-600 hover:underline"
              title={`在系统浏览器中打开 ${name} 官网`}
            >
              🌐 官网 ↗
            </button>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              connected
                ? 'bg-green-50 text-green-600'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {connected ? '已接入' : '未接入'}
          </span>
        </div>
        {existingKey && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-brand-600 hover:underline"
          >
            修改
          </button>
        )}
      </div>

      <p className="mt-1 text-[10px] text-gray-400">
        模型：{models.join('、')}
      </p>

      {(!existingKey || editing) && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={keyHint ? `密钥以 ${keyHint} 开头` : '粘贴 API Key'}
            className="flex-1 rounded-md border border-black/10 px-2.5 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <button
            onClick={() => {
              if (value.trim()) {
                onSave(value.trim())
                setValue('')
                setEditing(false)
              }
            }}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-[11px] text-white hover:bg-brand-600"
          >
            保存
          </button>
          {existingKey && editing && (
            <button
              onClick={() => setEditing(false)}
              className="rounded-md px-2 py-1.5 text-[11px] text-gray-500 hover:bg-black/5"
            >
              取消
            </button>
          )}
        </div>
      )}

      {existingKey && !editing && (
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[11px] text-gray-500">{masked}</span>
          <button
            onClick={onRemove}
            className="text-[11px] text-red-500 hover:underline"
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
