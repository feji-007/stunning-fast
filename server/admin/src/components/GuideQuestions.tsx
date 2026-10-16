// 使用指南管理：列表/新增/编辑/删除/启用停用切换。question + answer 文本编辑。
import { useEffect, useState } from 'react'
import { guideApi } from '../api'

interface GuideQuestion {
  id: number
  category: string
  question: string
  answer: string
  sort_order: number
  is_active: boolean
}

interface Form {
  category: string
  question: string
  answer: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = {
  category: '',
  question: '',
  answer: '',
  sort_order: 0,
  is_active: true
}

export default function GuideQuestions() {
  const [list, setList] = useState<GuideQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: number }>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    guideApi
      .listQuestions()
      .then((r) => setList(r.questions ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleActive = (q: GuideQuestion) => {
    guideApi.updateQuestion(q.id, { isActive: !q.is_active })
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const remove = (q: GuideQuestion) => {
    if (!confirm(`确认删除问答「${q.question}」？`)) return
    guideApi.removeQuestion(q.id)
      .then(() => load()).catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.question.trim()) { alert('请填写问题'); return }
    if (!modal.data.answer.trim()) { alert('请填写答案'); return }
    setSaving(true)
    const d = modal.data
    const body: any = {
      category: d.category,
      question: d.question,
      answer: d.answer,
      sortOrder: Number(d.sort_order) || 0,
      isActive: d.is_active
    }
    const op = modal.mode === 'create' ? guideApi.createQuestion(body) : guideApi.updateQuestion(modal.id!, body)
    op.then(() => { setModal(null); load() })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">使用指南管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >+ 新增问答</button>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        管理客户端 AI 助手弹窗「使用指南」中展示的常见问题。相同分类的问题会归为一组，按排序值依次展示。
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
                <th className="px-4 py-3 text-left">分类</th>
                <th className="px-4 py-3 text-left">问题</th>
                <th className="px-4 py-3 text-left">答案</th>
                <th className="px-4 py-3 text-left">排序</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((q) => (
                <tr key={q.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{q.category || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-sm truncate" title={q.question}>{q.question}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-md truncate" title={q.answer}>{q.answer}</td>
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
                          category: q.category || '',
                          question: q.question,
                          answer: q.answer,
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
              {modal.mode === 'create' ? '新增使用指南问答' : '编辑使用指南问答'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">分类</label>
                <input
                  value={modal.data.category}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, category: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如：快速上手 / 常见问题（相同分类会归为一组）"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">问题</label>
                <input
                  value={modal.data.question}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, question: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="问题内容"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">答案</label>
                <textarea
                  value={modal.data.answer}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, answer: e.target.value } })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="答案内容"
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
