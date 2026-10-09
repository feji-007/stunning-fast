import { useEffect, useRef, useState } from 'react'
import { bootstrapApi } from '../api/client'
import type { RecommendQuestion, RecommendModel } from '../types'

// ===== 消息类型 =====
interface ChatMessage {
  role: 'assistant' | 'user'
  text: string
  layer?: string
}

// ===== 组件 =====
export default function RecommendationAssistantModal() {
  // 推荐数据（从后端 bootstrap 拉取）
  const [questions, setQuestions] = useState<RecommendQuestion[]>([])
  const [modelInfo, setModelInfo] = useState<Record<string, RecommendModel>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)
  const [comboNote, setComboNote] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 拉取推荐配置（复用 /api/bootstrap 接口）
  useEffect(() => {
    bootstrapApi.fetch()
      .then((data) => {
        const qs = data.recommendQuestions ?? []
        setQuestions(qs)
        setModelInfo(data.recommendModels ?? {})
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

  // 加载中
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div className="flex h-[600px] w-[400px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
          <div className="text-gray-400">加载中…</div>
        </div>
      </div>
    )
  }

  // 加载失败或无数据
  if (error || questions.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-3">
        <div className="flex h-[600px] w-[400px] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
          <div className="text-gray-500 text-sm">{error || '暂无推荐问题数据'}</div>
          <button
            onClick={handleClose}
            className="rounded-xl bg-brand-400 px-6 py-2 text-xs font-medium text-white hover:bg-brand-500"
          >关闭</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-3">
      <div className="flex h-[600px] w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gradient-to-r from-brand-50 to-white px-4 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-lg">
            🤖
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-800">模型推荐助手</h2>
            <p className="text-[10px] text-gray-400">
              {finished ? '已完成' : `${currentQ + 1} / ${questions.length}`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="grid h-7 w-7 place-items-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* 进度条 */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-brand-400 transition-all duration-300"
            style={{ width: `${((finished ? questions.length : currentQ) / questions.length) * 100}%` }}
          />
        </div>

        {/* 对话区域 */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
          {messages.map((msg, i) => (
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
          {finished && (
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
      </div>
    </div>
  )
}
