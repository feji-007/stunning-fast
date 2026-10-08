// 推荐模型管理：列表/新增/编辑/删除/启用停用切换。
import { useEffect, useState } from 'react'
import { recommendApi } from '../api'

interface RecommendModel {
  id: string
  name: string
  description: string
  tag: string
  sort_order: number
  is_active: boolean
}

interface Form {
  id: string
  name: string
  desc: string
  tag: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = { id: '', name: '', desc: '', tag: '', sort_order: 0, is_active: true }

export default function RecommendModels() {
  const [list, setList] = useState<RecommendModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: string }>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    recommendApi
      .listModels()
      .then((r) => setList(r.models ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleActive = (m: RecommendModel) => {
    recommendApi.updateModel(m.id, { isActive: !m.is_active })
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const remove = (m: RecommendModel) => {
    if (!confirm(`确认删除推荐模型「${m.name}」？`)) return
    recommendApi.removeModel(m.id)
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.id.trim()) { alert('请填写模型 ID'); return }
    if (!modal.data.name.trim()) { alert('请填写模型名称'); return }
    setSaving(true)
    const d = modal.data
    const body: any = {
      id: d.id,
      name: d.name,
      desc: d.desc,
      tag: d.tag,
      sortOrder: Number(d.sort_order) || 0,
      isActive: d.is_active
    }
    const op = modal.mode === 'create' ? recommendApi.createModel(body) : recommendApi.updateModel(modal.id!, body)
    op.then(() => { setModal(null); load() })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">推荐模型管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >+ 新增模型</button>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        管理「模型推荐助手」中展示的模型信息。模型 ID 需与推荐问题选项中的 models 字段对应。
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无数据</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">名称</th>
                <th className="px-4 py-3 text-left">描述</th>
                <th className="px-4 py-3 text-left">标签</th>
                <th className="px-4 py-3 text-left">排序</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={m.description}>{m.description}</td>
                  <td className="px-4 py-3 text-gray-600">{m.tag || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {m.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => toggleActive(m)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                      {m.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => setModal({
                        mode: 'edit', id: m.id,
                        data: {
                          id: m.id,
                          name: m.name,
                          desc: m.description,
                          tag: m.tag || '',
                          sort_order: m.sort_order ?? 0,
                          is_active: m.is_active
                        }
                      })}
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >编辑</button>
                    <button onClick={() => remove(m)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增推荐模型' : '编辑推荐模型'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">模型 ID</label>
                <input
                  value={modal.data.id}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, id: e.target.value } })}
                  disabled={modal.mode === 'edit'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="例如：可灵（与问题选项中 models 字段对应）"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">显示名称</label>
                <input
                  value={modal.data.name}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如：可灵 Kling"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">描述</label>
                <textarea
                  value={modal.data.desc}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, desc: e.target.value } })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="模型的推荐说明文字"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">标签</label>
                <input
                  value={modal.data.tag}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, tag: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如：叙事 · 角色一致 · 分镜（用 · 分隔）"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">排序</label>
                  <input
                    type="number"
                    value={modal.data.sort_order}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, sort_order: Number(e.target.value) } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">状态</label>
                  <select
                    value={modal.data.is_active ? '1' : '0'}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, is_active: e.target.value === '1' } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >取消</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >{saving ? '保存中…' : '确认'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
