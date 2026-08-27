// 功能入口管理:列表/新增/编辑/删除;pinned 开关切换。
import { useEffect, useState } from 'react'
import { featuresApi } from '../api'

interface Feature {
  id: string
  name: string
  icon: string
  description: string
  pinned: boolean
  sort_order: number
  is_active: boolean
}

interface Form {
  name: string
  icon: string
  description: string
  pinned: boolean
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = {
  name: '',
  icon: '',
  description: '',
  pinned: false,
  sort_order: 0,
  is_active: true
}

export default function Features() {
  const [list, setList] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: string }>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    featuresApi
      .list()
      .then((r) => setList(r.features ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const togglePinned = (f: Feature) => {
    featuresApi
      .update(f.id, { pinned: !f.pinned })
      .then(load)
      .catch((e: Error) => alert(e.message))
  }

  const remove = (f: Feature) => {
    if (!confirm(`确认删除功能「${f.name}」?`)) return
    featuresApi
      .remove(f.id)
      .then(load)
      .catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.name.trim()) {
      alert('请填写功能名称')
      return
    }
    setSaving(true)
    const op = modal.mode === 'create' ? featuresApi.create(modal.data) : featuresApi.update(modal.id!, modal.data)
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
        <h2 className="text-lg font-semibold text-gray-800">功能入口管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >
          + 新增功能
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-float overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">图标</th>
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">说明</th>
                <th className="px-4 py-3 text-left">置顶</th>
                <th className="px-4 py-3 text-left">排序</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{f.id}</td>
                  <td className="px-4 py-3 text-xl">{f.icon || '·'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{f.name}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{f.description || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePinned(f)}
                      className={`px-2 py-0.5 rounded text-xs ${
                        f.pinned ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {f.pinned ? '已置顶' : '置顶'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{f.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        f.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {f.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() =>
                        setModal({
                          mode: 'edit',
                          id: f.id,
                          data: {
                            name: f.name,
                            icon: f.icon || '',
                            description: f.description || '',
                            pinned: f.pinned,
                            sort_order: f.sort_order ?? 0,
                            is_active: f.is_active
                          }
                        })
                      }
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => remove(f)}
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

      {/* 新增/编辑弹窗 */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增功能' : '编辑功能'}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">图标</label>
                  <input
                    value={modal.data.icon}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, icon: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-center text-xl"
                    placeholder="🎬"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-1">名称</label>
                  <input
                    value={modal.data.name}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">说明</label>
                <textarea
                  value={modal.data.description}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, description: e.target.value } })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={modal.data.pinned}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, pinned: e.target.checked } })}
                    className="rounded"
                  />
                  置顶
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={modal.data.is_active}
                    onChange={(e) =>
                      setModal({ ...modal, data: { ...modal.data, is_active: e.target.checked } })
                    }
                    className="rounded"
                  />
                  启用
                </label>
                <div className="flex-1">
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