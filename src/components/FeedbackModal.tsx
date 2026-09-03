import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { feedbackApi } from '../api/client'

// 用户反馈弹窗：提交意见反馈 + 查看历史反馈与官方回复。
const CATEGORIES = [
  { value: 'bug', label: '问题报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'experience', label: '体验反馈' },
  { value: 'other', label: '其他' }
]

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  open: { text: '待处理', cls: 'bg-amber-50 text-amber-600' },
  replied: { text: '已回复', cls: 'bg-blue-50 text-blue-600' },
  closed: { text: '已关闭', cls: 'bg-gray-100 text-gray-500' }
}

export default function FeedbackModal() {
  const setModal = useStore((s) => s.setModal)
  const user = useStore((s) => s.user)

  const [tab, setTab] = useState<'submit' | 'history'>('submit')
  const [category, setCategory] = useState('bug')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadHistory = () => {
    setLoadingHistory(true)
    feedbackApi
      .listMine()
      .then((r) => setHistory(r.feedbacks ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingHistory(false))
  }

  // 预填默认联系方式：登录用户名
  useEffect(() => {
    if (user.loggedIn && !contact) {
      setContact(user.username)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.loggedIn])

  useEffect(() => {
    if (tab === 'history') loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const submit = async () => {
    setError('')
    setInfo('')
    if (!content.trim()) {
      setError('请填写反馈内容')
      return
    }
    if (content.trim().length < 5) {
      setError('反馈内容至少 5 个字符')
      return
    }
    setSubmitting(true)
    try {
      await feedbackApi.submit({
        category,
        title: title.trim(),
        content: content.trim(),
        contact: contact.trim()
      })
      setInfo('已提交，感谢您的反馈！')
      setTitle('')
      setContent('')
      setTab('history')
    } catch (e: any) {
      setError(e?.message ?? '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/30">
      <div className="flex h-[520px] w-[640px] flex-col rounded-2xl bg-white shadow-float">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">意见反馈 / 问题报告</h2>
          <button
            onClick={() => setModal('none')}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="inline-flex w-full rounded-lg border border-black/10 bg-gray-50 p-0.5 text-xs">
            <button
              onClick={() => setTab('submit')}
              className={`flex-1 rounded-md py-1.5 ${
                tab === 'submit' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              提交反馈
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex-1 rounded-md py-1.5 ${
                tab === 'history' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              我的反馈
            </button>
          </div>
        </div>

        {tab === 'submit' ? (
          <div className="flex-1 overflow-auto scroll-thin px-5 py-4">
            {!user.loggedIn && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                当前未登录，提交的反馈将无法追溯回复，建议先登录。
              </p>
            )}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">类型</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`rounded-md px-3 py-1 text-xs ${
                      category === c.value
                        ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">标题（选填）</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
                placeholder="一句话描述你的问题或建议"
              />
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">详细内容 *</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={5000}
                className="w-full resize-none rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
                placeholder="请详细描述问题场景、复现步骤或具体建议（5~5000 字）"
              />
              <p className="mt-1 text-right text-[10px] text-gray-400">{content.length}/5000</p>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-gray-500">联系方式（选填）</label>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={120}
                className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
                placeholder="用户名 / 邮箱 / 其他联系方式，便于我们回复"
              />
            </div>

            {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}
            {info && <p className="mb-2 text-[11px] text-emerald-600">{info}</p>}

            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={submitting}
                className="rounded-lg bg-brand-500 px-5 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {submitting ? '提交中…' : '提交反馈'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto scroll-thin px-5 py-4">
            {loadingHistory ? (
              <p className="py-8 text-center text-xs text-gray-400">加载中…</p>
            ) : history.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">暂无反馈记录</p>
                <button
                  onClick={() => setTab('submit')}
                  className="mt-3 rounded-md bg-brand-50 px-3 py-1.5 text-[11px] text-brand-600 hover:bg-brand-100"
                >
                  去提交反馈
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((f) => {
                  const s = STATUS_LABEL[f.status] ?? STATUS_LABEL.open
                  const catLabel = CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category
                  return (
                    <div key={f.id} className="rounded-lg border border-black/5 bg-gray-50/50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                            {catLabel}
                          </span>
                          {f.title && (
                            <span className="text-xs font-medium text-gray-800">{f.title}</span>
                          )}
                        </div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.cls}`}>{s.text}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-700">
                        {f.content}
                      </p>
                      <p className="mt-2 text-[10px] text-gray-400">
                        {new Date(f.created_at).toLocaleString('zh-CN')}
                      </p>
                      {f.admin_reply && (
                        <div className="mt-2 rounded-md bg-blue-50/70 p-2">
                          <p className="text-[10px] font-medium text-blue-700">官方回复：</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-blue-800">
                            {f.admin_reply}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
