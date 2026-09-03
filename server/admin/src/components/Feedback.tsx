// 意见反馈管理：列表/筛选/查看详情/回复/状态流转/删除。
import { useEffect, useMemo, useState } from 'react'
import { feedbackApi } from '../api'

interface Feedback {
  id: number
  user_id: number
  username: string | null
  category: string
  title: string
  content: string
  contact: string
  status: 'open' | 'replied' | 'closed'
  admin_reply: string | null
  created_at: string
  updated_at: string
}

const CATEGORIES = [
  { value: 'bug', label: '问题报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验反馈' },
  { value: 'other', label: '其他' }
]
const STATUSES = [
  { value: 'open', label: '待处理', cls: 'bg-amber-50 text-amber-600' },
  { value: 'replied', label: '已回复', cls: 'bg-blue-50 text-blue-600' },
  { value: 'closed', label: '已关闭', cls: 'bg-gray-100 text-gray-500' }
]

function catLabel(v: string): string {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v
}
function statusLabel(v: string): string {
  return STATUSES.find((s) => s.value === v)?.label ?? v
}
function statusCls(v: string): string {
  return STATUSES.find((s) => s.value === v)?.cls ?? 'bg-gray-100 text-gray-500'
}

export default function FeedbackPage() {
  const [list, setList] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 筛选与分页
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // 详情 / 回复
  const [detail, setDetail] = useState<Feedback | null>(null)
  const [reply, setReply] = useState('')
  const [newStatus, setNewStatus] = useState<'open' | 'replied' | 'closed' | ''>('')
  const [saving, setSaving] = useState(false)

  const load = (opts: { status?: string; category?: string; keyword?: string; page?: number } = {}) => {
    setLoading(true)
    setError('')
    const params: Record<string, any> = {
      page: opts.page ?? page,
      pageSize
    }
    const s = opts.status ?? status
    const c = opts.category ?? category
    const k = opts.keyword ?? keyword
    if (s) params.status = s
    if (c) params.category = c
    if (k) params.keyword = k
    feedbackApi
      .list(params)
      .then((r) => {
        setList(r.feedbacks ?? [])
        setTotal(r.total ?? 0)
        setTotalPages(r.totalPages ?? 0)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 应用筛选：重置到第一页
  const applyFilter = () => {
    setPage(1)
    load({ page: 1, status, category, keyword })
  }

  const resetFilter = () => {
    setStatus('')
    setCategory('')
    setKeyword('')
    setPage(1)
    load({ page: 1, status: '', category: '', keyword: '' })
  }

  const gotoPage = (p: number) => {
    if (p < 1 || (totalPages > 0 && p > totalPages)) return
    setPage(p)
    load({ page: p })
  }

  const openDetail = (f: Feedback) => {
    setDetail(f)
    setReply(f.admin_reply ?? '')
    setNewStatus(f.status)
    setSaving(false)
  }

  const saveReply = () => {
    if (!detail) return
    setSaving(true)
    const body: any = {}
    if (reply !== (detail.admin_reply ?? '')) body.adminReply = reply
    if (newStatus && newStatus !== detail.status) body.status = newStatus
    if (body.adminReply === undefined && body.status === undefined) {
      setSaving(false)
      setDetail(null)
      return
    }
    feedbackApi
      .update(detail.id, body)
      .then(() => {
        setDetail(null)
        load({ page })
      })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  const remove = (f: Feedback) => {
    if (!confirm(`确认删除反馈 #${f.id}?`)) return
    feedbackApi
      .remove(f.id)
      .then(() => load({ page }))
      .catch((e: Error) => alert(e.message))
  }

  const pageRange = useMemo(() => {
    const arr: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    for (let i = start; i <= end; i++) arr.push(i)
    return arr
  }, [page, totalPages])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">意见反馈管理</h2>
        <div className="text-sm text-gray-500">共 {total} 条</div>
      </div>

      {/* 筛选条 */}
      <div className="bg-white rounded-xl shadow-float p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">全部状态</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">全部类型</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
            placeholder="标题/内容关键字"
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-56"
          />
          <button
            onClick={applyFilter}
            className="px-4 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
          >
            查询
          </button>
          <button
            onClick={resetFilter}
            className="px-4 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
          >
            重置
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* 列表 */}
      <div className="bg-white rounded-xl shadow-float overflow-hidden mb-4">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无反馈数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">提交人</th>
                <th className="px-4 py-3 text-left">类型</th>
                <th className="px-4 py-3 text-left">标题</th>
                <th className="px-4 py-3 text-left">内容</th>
                <th className="px-4 py-3 text-left">联系方式</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">提交时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{f.id}</td>
                  <td className="px-4 py-3 text-gray-700">{f.username ?? `用户#${f.user_id}`}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {catLabel(f.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">
                    {f.title || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[240px] truncate" title={f.content}>
                    {f.content}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{f.contact || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusCls(f.status)}`}>
                      {statusLabel(f.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(f.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openDetail(f)}
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >
                      查看/回复
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

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => gotoPage(1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            首页
          </button>
          <button
            onClick={() => gotoPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            上一页
          </button>
          {pageRange.map((p) => (
            <button
              key={p}
              onClick={() => gotoPage(p)}
              className={`px-3 py-1 text-sm rounded border ${
                p === page
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => gotoPage(page + 1)}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            下一页
          </button>
          <button
            onClick={() => gotoPage(totalPages)}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            末页
          </button>
        </div>
      )}

      {/* 详情 / 回复弹窗 */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">
                反馈详情 #{detail.id}
              </h3>
              <button
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">提交人</div>
                  <div className="text-gray-800">{detail.username ?? `用户#${detail.user_id}`}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">类型</div>
                  <div className="text-gray-800">{catLabel(detail.category)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">联系方式</div>
                  <div className="text-gray-800">{detail.contact || '-'}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">标题</div>
                <div className="text-gray-800">{detail.title || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">内容</div>
                <div className="whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-gray-700">
                  {detail.content}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                提交于 {new Date(detail.created_at).toLocaleString('zh-CN')}
                {detail.updated_at !== detail.created_at && (
                  <span> · 更新于 {new Date(detail.updated_at).toLocaleString('zh-CN')}</span>
                )}
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="text-xs text-gray-500 mb-1">状态</div>
                <div className="flex gap-1.5">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setNewStatus(s.value as any)}
                      className={`px-3 py-1 rounded text-xs ${
                        newStatus === s.value
                          ? 'bg-brand-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">回复内容</div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="填写回复内容后保存将自动标记为「已回复」"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
                <p className="text-right text-[10px] text-gray-400 mt-1">{reply.length}/2000</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setDetail(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={saveReply}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
