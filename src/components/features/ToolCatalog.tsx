import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { favoritesApi, toolsApi } from '../../api/client'
import type { Tool, ToolDetail } from '../../types'
import ToolCard from '../tools/ToolCard'
import ToolDetailPanel from '../tools/ToolDetailPanel'
import SetupWizard from '../tools/SetupWizard'
import ResourceLibrary from './ResourceLibrary'
import {
  CATEGORY_LABEL,
  SCENARIO_LABEL
} from '../tools/toolMeta'

type Tab = 'catalog' | 'favorites' | 'dev'
type QuickFilter = 'all' | 'free' | 'api' | 'beginner' | 'oss' | 'audio' | '4k'
type SortBy = 'default' | 'free' | 'beginner'

const QUICK_FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: '全部工具' },
  { value: 'free', label: '免费 / 有免费额度' },
  { value: 'api', label: '有 API' },
  { value: 'beginner', label: '新手友好' },
  { value: 'oss', label: '开源本地跑' },
  { value: 'audio', label: '音视频同步' },
  { value: '4k', label: '支持 4K' }
]

const CATEGORY_FILTERS = [
  'text-to-video',
  'image-to-video',
  'avatar',
  'lip-sync',
  'open-source',
  'editing',
  'multi-reference'
]

const SCENARIO_FILTERS = [
  'shorts',
  'talking-head',
  'cinematic',
  'character-consistency',
  'photo-to-video',
  'local-gpu',
  'cheap'
]

/**
 * 工具库（资源库主页面）：
 * 面向新手展示"有哪些 AI 视频工具、适合谁、多少钱、怎么配置"。
 * 原有的模型接入管理保留在「开发者接入」标签内，避免功能丢失。
 */
export default function ToolCatalog() {
  const tools = useStore((s) => s.tools)
  const user = useStore((s) => s.user)
  const setModal = useStore((s) => s.setModal)
  const developerMode = useStore((s) => s.developerMode)

  const [tab, setTab] = useState<Tab>('catalog')
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [scenario, setScenario] = useState('')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('default')

  const [loading, setLoading] = useState(tools.length === 0)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [setupTool, setSetupTool] = useState<Tool | ToolDetail | null>(null)
  const [toast, setToast] = useState('')
  const [showSubmit, setShowSubmit] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2500)
  }

  // 关闭开发者模式时，若正停留在模型接入页则回到目录
  useEffect(() => {
    if (!developerMode && tab === 'dev') setTab('catalog')
  }, [developerMode, tab])

  // bootstrap 未带回工具时，兜底直接拉一次
  useEffect(() => {
    if (tools.length > 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    toolsApi
      .list({ limit: 200 })
      .then((r) => {
        if (!cancelled) useStore.setState({ tools: r.tools })
      })
      .catch(() => {
        if (!cancelled) showToast('工具目录加载失败，请检查后台服务')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tools.length])

  // 登录后拉取收藏
  useEffect(() => {
    if (!user.loggedIn) {
      setFavoriteIds([])
      return
    }
    let cancelled = false
    favoritesApi
      .list()
      .then((r) => {
        if (!cancelled) setFavoriteIds((r.favorites ?? []).map((f) => f.tool_id))
      })
      .catch(() => {
        // 静默：收藏不是主链路
      })
    return () => {
      cancelled = true
    }
  }, [user.loggedIn])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let list = tools.filter((t) => {
      if (category && !t.categories.includes(category)) return false
      if (scenario && !t.scenarios.includes(scenario)) return false
      if (quick === 'free' && t.pricingTier !== 'free' && t.pricingTier !== 'freemium') return false
      if (quick === 'api' && !t.hasApi) return false
      if (quick === 'beginner' && t.difficulty !== 'beginner') return false
      if (quick === 'oss' && !t.hasOpenSource) return false
      if (quick === 'audio' && !t.syncedAudio) return false
      if (quick === '4k' && !/4k/i.test(t.maxResolution)) return false
      if (kw) {
        const hay = `${t.name} ${t.provider} ${t.subtitle} ${t.shortDesc} ${t.categories.join(' ')} ${t.scenarios.join(' ')}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    if (sortBy === 'free') {
      list = [...list].sort((a, b) => {
        const rank = (t: Tool) => (t.pricingTier === 'free' ? 0 : t.pricingTier === 'freemium' ? 1 : 2)
        return rank(a) - rank(b)
      })
    } else if (sortBy === 'beginner') {
      list = [...list].sort((a, b) => {
        const rank = (t: Tool) => (t.difficulty === 'beginner' ? 0 : t.difficulty === 'intermediate' ? 1 : 2)
        return rank(a) - rank(b)
      })
    }
    return list
  }, [tools, keyword, category, scenario, quick, sortBy])

  const favoriteTools = useMemo(
    () => tools.filter((t) => favoriteIds.includes(t.id)),
    [tools, favoriteIds]
  )

  const detailTool = detailId ? tools.find((t) => t.id === detailId) : undefined

  const toggleFavorite = async (tool: Tool) => {
    if (!user.loggedIn) {
      showToast('登录后即可收藏工具')
      setModal('login')
      return
    }
    const isFav = favoriteIds.includes(tool.id)
    setFavoriteIds((prev) => (isFav ? prev.filter((id) => id !== tool.id) : [...prev, tool.id]))
    try {
      if (isFav) await favoritesApi.remove(tool.id)
      else await favoritesApi.add(tool.id)
    } catch {
      // 失败回滚
      setFavoriteIds((prev) => (isFav ? [...prev, tool.id] : prev.filter((id) => id !== tool.id)))
      showToast('操作失败，请稍后重试')
    }
  }

  const hasDedicatedLibrary = tools.length > 0

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* 头部 + 标签页 */}
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">AI 视频工具库</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {hasDedicatedLibrary
                ? `${tools.length} 款主流工具 · 按需求筛选，帮你选对并配好 API`
                : '工具目录加载中…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSubmit(true)}
            className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-brand-300 hover:text-brand-600"
            title="提交未收录的工具"
          >
            + 提交新工具
          </button>
        </div>

        <div className="mt-2.5 flex gap-1 rounded-lg bg-gray-100 p-1">
          {([
            { v: 'catalog', label: '工具目录' },
            { v: 'favorites', label: `我的收藏${favoriteIds.length ? ` · ${favoriteIds.length}` : ''}` },
            ...(developerMode ? [{ v: 'dev' as Tab, label: '开发者：模型接入' }] : [])
          ] as Array<{ v: Tab; label: string }>).map((o) => (
            <button
              key={o.v}
              onClick={() => setTab(o.v)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === o.v ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-[11px] text-brand-700">
          {toast}
        </div>
      )}

      {tab === 'dev' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ResourceLibrary />
        </div>
      ) : tab === 'favorites' ? (
        <div className="min-h-0 flex-1 overflow-auto scroll-thin pr-1">
          {!user.loggedIn ? (
            <EmptyState
              title="登录后可以收藏工具"
              desc="收藏会同步到账号，换设备也能看到。"
              action="去登录"
              onAction={() => setModal('login')}
            />
          ) : favoriteTools.length === 0 ? (
            <EmptyState
              title="还没有收藏"
              desc="在工具目录里点击卡片右上角的 ☆ 即可收藏。"
              action="去挑工具"
              onAction={() => setTab('catalog')}
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {favoriteTools.map((t) => (
                <ToolCard
                  key={t.id}
                  tool={t}
                  favorited
                  onOpen={() => setDetailId(t.id)}
                  onToggleFavorite={(e) => {
                    e.stopPropagation()
                    void toggleFavorite(t)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 筛选区 */}
          <div className="shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索工具名 / 厂商 / 场景，例如：口播、免费、Runway…"
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="shrink-0 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[11px] text-gray-600 outline-none"
              >
                <option value="default">默认排序</option>
                <option value="free">免费优先</option>
                <option value="beginner">新手优先</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1">
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setQuick(f.value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                    quick === f.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-gray-400">类别</span>
              <FilterChip active={!category} label="全部" onClick={() => setCategory('')} />
              {CATEGORY_FILTERS.map((c) => (
                <FilterChip
                  key={c}
                  active={category === c}
                  label={CATEGORY_LABEL[c] ?? c}
                  onClick={() => setCategory(category === c ? '' : c)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-gray-400">需求</span>
              <FilterChip active={!scenario} label="不限" onClick={() => setScenario('')} />
              {SCENARIO_FILTERS.map((s) => (
                <FilterChip
                  key={s}
                  active={scenario === s}
                  label={SCENARIO_LABEL[s] ?? s}
                  onClick={() => setScenario(scenario === s ? '' : s)}
                />
              ))}
            </div>
          </div>

          {/* 卡片网格 */}
          <div className="min-h-0 flex-1 overflow-auto scroll-thin pr-1">
            {loading ? (
              <p className="py-8 text-center text-[11px] text-gray-400">正在加载工具目录…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="没有匹配的工具"
                desc="换个关键词，或减少筛选条件试试。也欢迎提交你用过但未收录的工具。"
                action="提交新工具"
                onAction={() => setShowSubmit(true)}
              />
            ) : (
              <>
                <p className="mb-2 text-[11px] text-gray-400">共 {filtered.length} 款</p>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((t) => (
                    <ToolCard
                      key={t.id}
                      tool={t}
                      favorited={favoriteIds.includes(t.id)}
                      onOpen={() => setDetailId(t.id)}
                      onToggleFavorite={(e) => {
                        e.stopPropagation()
                        void toggleFavorite(t)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {detailId && (
        <ToolDetailPanel
          toolId={detailId}
          fallback={detailTool}
          favorited={favoriteIds.includes(detailId)}
          onClose={() => setDetailId(null)}
          onToggleFavorite={() => {
            if (detailTool) void toggleFavorite(detailTool)
          }}
          onSetup={(t) => setSetupTool(t)}
        />
      )}

      {setupTool && <SetupWizard tool={setupTool} onClose={() => setSetupTool(null)} />}

      {showSubmit && <SubmitToolOverlay onClose={() => setShowSubmit(false)} onDone={showToast} />}
    </div>
  )
}

function FilterChip({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
        active ? 'bg-brand-50 font-medium text-brand-600' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyState({
  title,
  desc,
  action,
  onAction
}: {
  title: string
  desc: string
  action: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="h-8 w-8 rounded-full bg-gray-100" />
      <p className="text-xs font-medium text-gray-600">{title}</p>
      <p className="max-w-xs text-[11px] leading-relaxed text-gray-400">{desc}</p>
      <button
        onClick={onAction}
        className="mt-1 rounded-lg border border-brand-300 bg-brand-50/60 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-100"
      >
        {action}
      </button>
    </div>
  )
}

/** 提交未收录工具（走后端 feedback 接口，人工审核后入库） */
function SubmitToolOverlay({
  onClose,
  onDone
}: {
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [toolName, setToolName] = useState('')
  const [toolUrl, setToolUrl] = useState('')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!toolName.trim()) {
      setError('请填写工具名称')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await toolsApi.feedback({
        toolName: toolName.trim(),
        toolUrl: toolUrl.trim(),
        message: message.trim(),
        userContact: contact.trim()
      })
      onDone('已提交，感谢补充')
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <p className="text-sm font-semibold text-gray-800">提交新工具</p>
          <button onClick={onClose} className="grid h-6 w-6 place-items-center rounded-md text-gray-400 hover:bg-black/5">
            ✕
          </button>
        </header>
        <div className="space-y-2 px-4 py-3">
          <input
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="工具名称（必填）"
            className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <input
            value={toolUrl}
            onChange={(e) => setToolUrl(e.target.value)}
            placeholder="官网地址"
            className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="它适合做什么？有什么亮点或限制？"
            rows={3}
            className="w-full resize-none rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="联系方式（可选）"
            className="w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
          />
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-black/5 px-4 py-2.5">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? '提交中…' : '提交'}
          </button>
        </footer>
      </div>
    </div>
  )
}
