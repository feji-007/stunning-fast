import { useEffect, useRef, useState } from 'react'

// ===== 数据定义 =====

interface Option {
  label: string
  models: string[]
  note?: string
}

interface Question {
  layer: string
  title: string
  options: Option[]
}

const QUESTIONS: Question[] = [
  {
    layer: '第一层：核心用途',
    title: '你制作这个视频，最主要的目标是什么？',
    options: [
      { label: '讲一个故事，有角色、有对话、有情节推进', models: ['可灵'] },
      { label: '展示一个产品/服务，要快速、批量地产出', models: ['Seedance'] },
      { label: '做一条有电影感、艺术感的短片，追求画面质感', models: ['Veo', 'Runway'] },
      { label: '做竖屏短视频，要视觉冲击力、特效感强', models: ['Pika'] },
      { label: '手头有现成素材（图/视频），想通过对话反复改', models: ['Gemini Omni'] },
    ],
  },
  {
    layer: '第二层：角色一致性',
    title: '视频里是否会出现同一个角色/产品，并且需要在多个镜头里保持一致？',
    options: [
      { label: '是，角色/产品必须在不同场景里看起来完全一样', models: ['Runway', '可灵'] },
      { label: '是，但只需要大致像，不要求像素级一致', models: ['可灵', 'Seedance'] },
      { label: '不需要，每个镜头可以不一样', models: [] },
    ],
  },
  {
    layer: '第三层：镜头控制',
    title: '你对镜头运动（推拉摇移、光影变化）的控制要求有多高？',
    options: [
      { label: '很高，我需要精确指定镜头怎么动、光怎么打', models: ['Veo'] },
      { label: '中等，我描述大概感觉就行，模型自己发挥', models: ['可灵', 'Seedance'] },
      { label: '不高，我主要靠后期剪辑，生成片段能用就行', models: ['Pika', 'Seedance'] },
    ],
  },
  {
    layer: '第四层：效率 vs 精细打磨',
    title: '你更看重"快速出多个版本挑一个"，还是"反复调整打磨一个精品"？',
    options: [
      { label: '快速出多个版本，效率优先', models: ['Seedance', 'Pika'] },
      { label: '反复调整，精细打磨，时间不是问题', models: ['可灵', 'Veo', 'Runway'] },
      { label: '先用快的出草稿，再用好的精修', models: ['Seedance', '可灵', 'Veo'], note: '组合推荐：Seedance 草稿 + 可灵/Veo 精修' },
    ],
  },
  {
    layer: '第五层：输入素材',
    title: '你手头已经有哪些素材？',
    options: [
      { label: '只有文字想法', models: [] },
      { label: '有参考图片，想基于图生成', models: ['Runway', '可灵', 'Pika'] },
      { label: '有现成视频/音频，想混合编辑', models: ['Gemini Omni'] },
      { label: '有产品图，想做成动态广告', models: ['Seedance', 'Pika'] },
    ],
  },
  {
    layer: '第六层：时长与叙事复杂度',
    title: '你需要的单条视频大概多长？',
    options: [
      { label: '几秒到十几秒，一个镜头就够', models: ['Pika', 'Seedance', 'Veo'] },
      { label: '30秒左右，需要几个镜头切换', models: ['Seedance', '可灵'] },
      { label: '1分钟以上，有完整叙事', models: ['可灵'], note: '可灵智能分镜能力强，或建议分段生成后剪辑' },
    ],
  },
  {
    layer: '第七层：音频需求',
    title: '视频是否需要原生对话、音效或配乐？',
    options: [
      { label: '需要角色对话，且口型/语音要同步', models: ['Veo', '可灵'] },
      { label: '只需要背景音乐/音效，后期加就行', models: [] },
      { label: '不需要音频', models: [] },
    ],
  },
]

const MODEL_INFO: Record<string, { name: string; desc: string; tag: string }> = {
  '可灵': {
    name: '可灵 Kling',
    desc: '擅长叙事性视频、角色一致性、智能分镜，多语言对话支持。适合有情节、需要多镜头切换的视频。',
    tag: '叙事 · 角色一致 · 分镜',
  },
  'Seedance': {
    name: 'Seedance',
    desc: '快速批量产出，30秒单次生成，性价比高。适合产品展示、效率优先的场景。',
    tag: '量产 · 快速 · 30秒',
  },
  'Veo': {
    name: 'Veo',
    desc: '对专业摄影术语理解极强，精确运镜控制，原生音频生成。适合追求电影感和画面质感的短片。',
    tag: '电影感 · 运镜 · 原生音频',
  },
  'Runway': {
    name: 'Runway',
    desc: '世界一致性强，角色/场景在多镜头中保持高度一致。适合精细打磨、追求品质的项目。',
    tag: '世界一致 · 精细打磨',
  },
  'Pika': {
    name: 'Pika',
    desc: '竖屏短视频利器，视觉冲击力强，特效感突出。适合短视频平台内容创作。',
    tag: '竖屏 · 特效 · 视觉冲击',
  },
  'Gemini Omni': {
    name: 'Gemini Omni',
    desc: '多模态混合输入（图/视频/音频），对话式编辑。适合已有素材、想通过对话反复修改的场景。',
    tag: '多模态 · 对话式编辑',
  },
}

// ===== 消息类型 =====
interface ChatMessage {
  role: 'assistant' | 'user'
  text: string
  layer?: string
}

// ===== 组件 =====
export default function RecommendationAssistantModal() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [scores, setScores] = useState<Record<string, number>>({})
  const [finished, setFinished] = useState(false)
  const [comboNote, setComboNote] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 初始化：发送第一条问题
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        text: QUESTIONS[0].title,
        layer: QUESTIONS[0].layer,
      },
    ])
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, finished])

  const handleAnswer = (opt: Option) => {
    // 记录用户回答
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: opt.label },
    ])

    // 累加模型得分
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
    if (nextQ < QUESTIONS.length) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: QUESTIONS[nextQ].title, layer: QUESTIONS[nextQ].layer },
        ])
        setCurrentQ(nextQ)
      }, 300)
    } else {
      setTimeout(() => setFinished(true), 300)
    }
  }

  const handleRestart = () => {
    setMessages([{ role: 'assistant', text: QUESTIONS[0].title, layer: QUESTIONS[0].layer }])
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
              {finished ? '已完成' : `${currentQ + 1} / ${QUESTIONS.length}`}
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
            style={{ width: `${((finished ? QUESTIONS.length : currentQ) / QUESTIONS.length) * 100}%` }}
          />
        </div>

        {/* 对话区域 */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={msg.role === 'user' ? 'max-w-[85%]' : 'max-w-[85%]'}>
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
                    {topModel && MODEL_INFO[topModel] && (
                      <div className="mb-2 rounded-xl bg-white p-3 shadow-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-full bg-brand-400 px-2 py-0.5 text-[10px] font-medium text-white">
                            首推
                          </span>
                          <span className="text-sm font-semibold text-gray-800">{MODEL_INFO[topModel].name}</span>
                        </div>
                        <p className="mb-1.5 text-[11px] leading-relaxed text-gray-500">
                          {MODEL_INFO[topModel].desc}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {MODEL_INFO[topModel].tag.split(' · ').map((t) => (
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
                        {runnerUps.map((m) => MODEL_INFO[m] && (
                          <div key={m} className="rounded-lg bg-white/70 px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-gray-700">{MODEL_INFO[m].name}</span>
                              <span className="text-[10px] text-gray-400">· {scores[m]} 票</span>
                            </div>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">
                              {MODEL_INFO[m].tag}
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
        {!finished && (
          <div className="space-y-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
            {QUESTIONS[currentQ].options.map((opt, i) => (
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
