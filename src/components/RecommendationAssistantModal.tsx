import { useEffect, useMemo, useRef, useState } from 'react'
import { bootstrapApi } from '../api/client'
import type { RecommendQuestion, RecommendModel, GuideQuestion } from '../types'

// ===== 消息类型 =====
interface ChatMessage {
  role: 'assistant' | 'user'
  text: string
  layer?: string
}

// ===== 侧栏两种对话 =====
type TabKey = 'guide' | 'recommend'

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: 'guide', icon: '📖', label: '使用指南' },
  { key: 'recommend', icon: '🤖', label: '模型推荐' }
]

// ===== 组件 =====
export default function RecommendationAssistantModal() {
  const [tab, setTab] = useState<TabKey>('recommend')

  // 推荐数据（从后端 bootstrap 拉取）
  const [questions, setQuestions] = useState<RecommendQuestion[]>([])
  const [modelInfo, setModelInfo] = useState<Record<string, RecommendModel>>({})
  // 使用指南问答（从后端 bootstrap 拉取）
  const [guideQuestions, setGuideQuestions] = useState<GuideQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)
  const [comboNote, setComboNote] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 使用指南：当前展开的问答
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 拉取推荐配置（复用 /api/bootstrap 接口）
  useEffect(() => {
    bootstrapApi.fetch()
      .then((data) => {
        const qs = data.recommendQuestions ?? []
        setQuestions(qs)
        setModelInfo(data.recommendModels ?? {})
        setGuideQuestions(data.guideQuestions ?? [])
        setLoading(false)
        // 数据就绪后初始化第一条问题
        if (qs.length > 0) {
          setMessages([
            { role: 'assistant', text: qs[0].title, layer: qs[0].layer },
          ])
        }
      })
      .catch((e: Error) => {
        setError(e.message || '加载失败')
        setLoading(false)
      })
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, finished])

  const handleAnswer = (opt: { label: string; models: string[]; note?: string }) => {
    // 记录用户回答
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: opt.label },
    ])

    // 累加模型得分（投票算法，保留原逻辑）
    setScores((prev) => {
      const next = { ...prev }
      for (const m of opt.models) {
        next[m] = (next[m] ?? 0) + 1
      }
      return next
    })

    // 记录组合推荐备注
    if (opt.note) setComboNote(opt.note)

    // 下一题或结束
    const nextQ = currentQ + 1
    if (nextQ < questions.length) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: questions[nextQ].title, layer: questions[nextQ].layer },
        ])
        setCurrentQ(nextQ)
      }, 300)
    } else {
      setTimeout(() => setFinished(true), 300)
    }
  }

  const handleRestart = () => {
    if (questions.length === 0) return
    setMessages([{ role: 'assistant', text: questions[0].title, layer: questions[0].layer }])
    setCurrentQ(0)
    setScores({})
    setFinished(false)
    setComboNote(null)
  }

  const handleClose = () => {
    window.api?.closeRecommendationWindow?.().catch(() => {})
  }

  // 排序结果
  const ranked = Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  const topModel = ranked[0]?.[0]
  const runnerUps = ranked.slice(1, 3).map(([k]) => k)

  // 使用指南按分类分组（保持后端排序）
  const guideGroups = useMemo(() => {
    const map = new Map<string, GuideQuestion[]>()
    for (const g of guideQuestions) {
      const key = g.category?.trim() || '其他'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(g)
    }
    return [...map.entries()]
  }, [guideQuestions])

  // 公共 Header（标题 + 关闭）
  const renderHeader = (title: string, subtitle?: string) => (
    <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-gray-800">{title}</h2>
        {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
      </div>
      <button
        onClick={handleClose}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        title="关闭"
      >
        ✕
      </button>
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div className="flex h-[600px] w-[500px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
          <div className="text-gray-400">加载中…</div>
        </div>
      </div>
    )
  }

  // 加载失败
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div className="flex h-[600px] w-[500px] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
          <div className="text-gray-500 text-sm">{error}</div>
          <button
            onClick={handleClose}
            className="rounded-xl bg-brand-400 px-6 py-2 text-xs font-medium text-white hover:bg-brand-500"
          >关闭</button>
        </div>
      </div>
    )
  }

  // ===== 使用指南视图：常见问题列表式 =====
  const renderGuide = () => (
    <>
      {renderHeader('使用指南', `${guideQuestions.length} 个常见问题`)}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
        {guideGroups.length === 0 ? (
          <p className="pt-10 text-center text-xs text-gray-400">暂无使用指南内容</p>
        ) : guideGroups.map(([category, items]) => (
          <div key={category} className="space-y-2">
            <p className="px-0.5 text-[10px] font-medium tracking-wide text-gray-400">{category}</p>
            {items.map((g) => {
              const open = expandedId === g.id
              return (
                <button
                  key={g.id}
                  onClick={() => setExpandedId(open ? null : g.id)}
                  className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-100 text-[9px] font-medium text-brand-500">
                      Q
                    </span>
                    <span className="flex-1 text-xs leading-relaxed text-gray-700">{g.question}</span>
                    <span className={`text-[10px] text-gray-300 transition ${open ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {open && (
                    <p className="mt-2 whitespace-pre-wrap border-l-2 border-brand-100 pl-2.5 text-[11px] leading-relaxed text-gray-500">
                      {g.answer}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )

  // ===== 模型推荐视图：分层问答 + 结果 =====
  const renderRecommend = () => (
    <>
      {renderHeader(
        '模型推荐助手',
        questions.length > 0 ? (finished ? '已完成' : `${currentQ + 1} / ${questions.length}`) : undefined
      )}

      {/* 进度条 */}
      {questions.length > 0 && (
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-brand-400 transition-all duration-300"
            style={{ width: `${((finished ? questions.length : currentQ) / questions.length) * 100}%` }}
          />
        </div>
      )}

      {/* 对话区域 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
        {questions.length === 0 ? (
          <p className="pt-10 text-center text-xs text-gray-400">暂无推荐问题数据</p>
        ) : messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[85%]">
              {msg.layer && (
                <p className="mb-1 text-[10px] font-medium text-brand-500">{msg.layer}</p>
              )}
              <div
                className={
                  msg.role === 'user'
                    ? 'rounded-2xl rounded-tr-sm bg-brand-400 px-3.5 py-2 text-xs text-white'
                    : 'rounded-2xl rounded-tl-sm bg-gray-100 px-3.5 py-2 text-xs leading-relaxed text-gray-700'
                }
              >
                {msg.text}
              </div>
            </div>
          </div>
        ))}

        {/* 结果区域 */}
        {finished && questions.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex justify-start">
              <div className="max-w-[90%]">
                <div className="rounded-2xl rounded-tl-sm bg-brand-50 px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-brand-700">分析完成，以下是推荐结果</p>
                  {comboNote && (
                    <p className="mb-2 rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px] text-amber-700">
                      💡 {comboNote}
                    </p>
                  )}

                  {/* 首推模型 */}
                  {topModel && modelInfo[topModel] && (
                    <div className="mb-2 rounded-xl bg-white p-3 shadow-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full bg-brand-400 px-2 py-0.5 text-[10px] font-medium text-white">
                          首推
                        </span>
                        <span className="text-sm font-semibold text-gray-800">{modelInfo[topModel].name}</span>
                      </div>
                      <p className="mb-1.5 text-[11px] leading-relaxed text-gray-500">
                        {modelInfo[topModel].desc}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {modelInfo[topModel].tag.split(' · ').map((t) => (
                          <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 备选模型 */}
                  {runnerUps.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-gray-400">备选推荐</p>
                      {runnerUps.map((m) => modelInfo[m] && (
                        <div key={m} className="rounded-lg bg-white/70 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-gray-700">{modelInfo[m].name}</span>
                            <span className="text-[10px] text-gray-400">· {scores[m]} 票</span>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">
                            {modelInfo[m].tag}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 无匹配 */}
                  {!topModel && (
                    <p className="text-xs text-gray-500">
                      根据你的回答，没有特别突出的单一模型推荐。建议根据核心用途直接选择即可。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 选项区域 */}
      {!finished && questions[currentQ] && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          {questions[currentQ].options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(opt)}
              className="group flex w-full items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-600 transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-gray-300 text-[9px] text-gray-400 transition group-hover:border-brand-400 group-hover:text-brand-500">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1 leading-relaxed">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 完成后操作栏 */}
      {finished && (
        <div className="flex gap-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
          <button
            onClick={handleRestart}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            重新测试
          </button>
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-brand-400 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-500"
          >
            完成
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="flex h-full w-full items-center justify-center p-3">
      <div className="flex h-[600px] w-[500px] overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
        {/* 左侧导航：使用指南 / 模型推荐 */}
        <aside className="flex w-[92px] shrink-0 flex-col border-r border-gray-100 bg-gray-50/70">
          <div className="flex h-14 flex-col items-center justify-center gap-0.5 border-b border-gray-100">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-500 text-base text-white shadow-sm">
              ⚡
            </span>
            <span className="text-[10px] font-semibold text-gray-500">AI 助手</span>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {TABS.map((t) => {
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] transition ${
                    active
                      ? 'bg-white font-medium text-brand-600 shadow-sm ring-1 ring-brand-100'
                      : 'text-gray-500 hover:bg-white/70 hover:text-gray-700'
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  {t.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* 右侧内容区 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === 'guide' ? renderGuide() : renderRecommend()}
        </div>
      </div>
    </div>
  )
}
