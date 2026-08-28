// 视频配置:按 config_key 分组(resolution/ratio/duration/priority)展示选项,支持新增/编辑/删除。
import { useEffect, useState } from 'react'
import { videoConfigApi } from '../api'

interface Option {
  id: number
  config_key: string
  option_value: string
  option_label: string
  sort_order: number
}

interface Form {
  config_key: string
  option_value: string
  option_label: string
  sort_order: number
}

const GROUPS: { key: string; label: string }[] = [
  { key: 'resolution', label: '分辨率' },
  { key: 'ratio', label: '宽高比' },
  { key: 'duration', label: '时长' },
  { key: 'priority', label: '优先级' }
]

const EMPTY_FORM: Form = {
  config_key: 'resolution',
  option_value: '',
  option_label: '',
  sort_order: 0
}

export default function VideoConfig() {
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: number }>(null)
  const [saving, setSaving] = useState(false)
  // 每个配置卡片的展开/收起状态, key=config_key, 默认展开
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(() =>
    GROUPS.reduce<Record<string, boolean>>((acc, g) => ((acc[g.key] = true), acc), {})
  )
  const toggleExpanded = (key: string) =>
    setExpandedState((s) => ({ ...s, [key]: !s[key] }))

  const load = () => {
    setLoading(true)
    setError('')
    videoConfigApi
      .list()
      .then((r) => {
        // r.options 可能是 Record<config_key, Option[]> 也可能是 Option[]
        const opts = r.options as any
        if (Array.isArray(opts)) {
          setOptions(opts)
        } else if (opts && typeof opts === 'object') {
          const flat: Option[] = []
          for (const k of Object.keys(opts)) {
            for (const o of opts[k] ?? []) flat.push({ ...o, config_key: o.config_key ?? k })
          }
          setOptions(flat)
        } else {
          setOptions([])
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const remove = (o: Option) => {
    if (!confirm(`确认删除选项「${o.option_label || o.option_value}」?`)) return
    videoConfigApi
      .remove(o.id)
      .then(load)
      .catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.option_value.trim()) {
      alert('请填写选项值')
      return
    }
    setSaving(true)
    const op =
      modal.mode === 'create' ? videoConfigApi.create(modal.data) : videoConfigApi.update(modal.id!, modal.data)
    op
      .then(() => {
        setModal(null)
        load()
      })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">视频配置</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >
          + 新增选项
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-400">加载中…</div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = options
              .filter((o) => o.config_key === g.key)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            return (
              <div key={g.key} className="bg-white rounded-xl shadow-float overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {g.label} <span className="text-gray-400 font-normal">({g.key})</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM, config_key: g.key } })}
                      className="text-xs px-2 py-1 bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >
                      + 添加
                    </button>
                    <button
                      onClick={() => toggleExpanded(g.key)}
                      title={expandedState[g.key] ? '收起' : '展开'}
                      className="min-w-[32px] h-7 px-2 flex items-center justify-center text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                    >
                      <span
                        className="inline-block transition-transform duration-200"
                        style={{ transform: expandedState[g.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                      >
                        ▾
                      </span>
                      <span className="ml-1">{expandedState[g.key] ? '收起' : '展开'}</span>
                    </button>
                  </div>
                </div>
                {!expandedState[g.key] ? null : items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-400">暂无选项</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-200">
                        <th className="px-5 py-2 text-left">选项值</th>
                        <th className="px-5 py-2 text-left">显示标签</th>
                        <th className="px-5 py-2 text-left">排序</th>
                        <th className="px-5 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((o) => (
                        <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-5 py-2 font-mono text-xs text-gray-700">{o.option_value}</td>
                          <td className="px-5 py-2 text-gray-700">{o.option_label || '-'}</td>
                          <td className="px-5 py-2 text-gray-600">{o.sort_order ?? 0}</td>
                          <td className="px-5 py-2 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() =>
                                setModal({
                                  mode: 'edit',
                                  id: o.id,
                                  data: {
                                    config_key: o.config_key,
                                    option_value: o.option_value,
                                    option_label: o.option_label || '',
                                    sort_order: o.sort_order ?? 0
                                  }
                                })
                              }
                              className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => remove(o)}
                              className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增选项' : '编辑选项'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">配置分组</label>
                <select
                  value={modal.data.config_key}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, config_key: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label} ({g.key})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">选项值</label>
                <input
                  value={modal.data.option_value}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, option_value: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  placeholder="如 720p 或 16:9"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">显示标签</label>
                <input
                  value={modal.data.option_label}
                  onChange={(e) =>
                    setModal({ ...modal, data: { ...modal.data, option_label: e.target.value } })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="用户可见名称"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">排序</label>
                <input
                  type="number"
                  value={modal.data.sort_order}
                  onChange={(e) =>
                    setModal({ ...modal, data: { ...modal.data, sort_order: Number(e.target.value) } })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? '保存中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
