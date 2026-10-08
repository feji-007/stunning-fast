// 推荐问题管理：列表/新增/编辑/删除/启用停用切换。options 用 JSON 文本编辑。
import { useEffect, useState } from 'react'
import { recommendApi } from '../api'

interface RecommendQuestion {
  id: number
  layer: string
  title: string
  options: Array<{ label: string; models: string[]; note?: string }>
  sort_order: number
  is_active: boolean
}

interface Form {
  layer: string
  title: string
  optionsText: string // JSON 字符串，编辑时用 textarea
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = {
  layer: '',
  title: '',
  optionsText: '[{"label":"","models":[]}]',
  sort_order: 0,
  is_active: true
}

// 把 options 数组转成格式化的 JSON 字符串
function optionsToText(options: any[]): string {
  return JSON.stringify(options, null, 2)
}

export default function RecommendQuestions() {
  const [list, setList] = useState<RecommendQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: number }>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    recommendApi
      .listQuestions()
      .then((r) => setList(r.questions ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleActive = (q: RecommendQuestion) => {
    recommendApi.updateQuestion(q.id, { isActive: !q.is_active })
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const remove = (q: RecommendQuestion) => {
    if (!confirm(`确认删除推荐问题「${q.title}」？`)) return
    recommendApi.removeQuestion(q.id)
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.layer.trim()) { alert('请填写层级'); return }
    if (!modal.data.title.trim()) { alert('请填写问题标题'); return }
    // 校验 options JSON
    let options: any[] = []
    try {
      options = JSON.parse(modal.data.optionsText)
      if (!Array.isArray(options)) throw new Error('不是数组')
    } catch {
      alert('选项 JSON 格式错误，请检查')
      return
    }
    setSaving(true)
    const d = modal.data
    const body: any = {
      layer: d.layer,
      title: d.title,
      options,
      sortOrder: Number(d.sort_order) || 0,
      isActive: d.is_active
    }
    const op = modal.mode === 'create' ? recommendApi.createQuestion(body) : recommendApi.updateQuestion(modal.id!, body)
    op.then(() => { setModal(null); load() })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">推荐问答管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >+ 新增问题</button>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        管理「模型推荐助手」的分层问题。每个问题包含多个选项，选项的 models 字段引用推荐模型的 ID。
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
                <th className="px-4 py-3 text-left">层级</th>
                <th className="px-4 py-3 text-left">问题标题</th>
                <th className="px-4 py-3 text-left">选项数</th>
                <th className="px-4 py-3 text-left">排序</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((q) => (
                <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{q.layer}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-md truncate" title={q.title}>{q.title}</td>
                  <td className="px-4 py-3 text-gray-600">{q.options?.length ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600">{q.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${q.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {q.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => toggleActive(q)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                      {q.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => setModal({
                        mode: 'edit', id: q.id,
                        data: {
                          layer: q.layer,
                          title: q.title,
                          optionsText: optionsToText(q.options),
                          sort_order: q.sort_order ?? 0,
                          is_active: q.is_active
                        }
                      })}
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >编辑</button>
                    <button onClick={() => remove(q)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增推荐问题' : '编辑推荐问题'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">层级</label>
                <input
                  value={modal.data.layer}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, layer: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如：第一层：核心用途"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">问题标题</label>
                <input
                  value={modal.data.title}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, title: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="问题内容"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  选项（JSON 格式）
                </label>
                <p className="mb-1 text-xs text-gray-400">
                  每个选项格式：{'{ label: string, models: string[], note?: string }'}。models 引用推荐模型的 ID。
                </p>
                <textarea
                  value={modal.data.optionsText}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, optionsText: e.target.value } })}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-xs"
                  placeholder='[{"label":"...","models":["可灵"]}]'
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
