import { useEffect, useState } from 'react'
import type { Tool, ToolDetail } from '../../types'
import { toolsApi } from '../../api/client'
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  PRICING_LABEL,
  SCENARIO_LABEL,
  canQuickTry,
  difficultyClass,
  pricingClass
} from './toolMeta'
import { openExternal } from './SimpleMarkdown'

interface Props {
  toolId: string
  fallback?: Tool
  favorited: boolean
  onClose: () => void
  onToggleFavorite: () => void
  onSetup: (tool: Tool | ToolDetail) => void
}

/** 工具详情：讲清楚亮点、限制、价格、能力边界，并给出下一步动作 */
export default function ToolDetailPanel({
  toolId,
  fallback,
  favorited,
  onClose,
  onToggleFavorite,
  onSetup
}: Props) {
  const [detail, setDetail] = useState<ToolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    toolsApi
      .detail(toolId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? '加载详情失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toolId])

  const tool: Tool | ToolDetail = detail ?? fallback ?? ({} as Tool)
  if (!fallback && !detail) return null

  const deprecated = /停服|关停/.test(tool.notes || '')

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 border-b border-black/5 bg-gradient-to-br from-brand-50 via-white to-white px-4 py-3.5">
          <div className="flex items-start gap-3">
            {tool.logoUrl ? (
              <img
                src={tool.logoUrl}
                alt={tool.name}
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-semibold text-white">
                {tool.name?.slice(0, 1) || '?'}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-gray-800">{tool.name}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {tool.provider}
                    {tool.subtitle ? ` · ${tool.subtitle}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleFavorite}
                    className={`rounded-md px-2 py-1 text-base ${
                      favorited ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
                    }`}
                    title={favorited ? '取消收藏' : '收藏'}
                  >
                    {favorited ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="grid h-6 w-6 place-items-center rounded-md text-gray-400 hover:bg-black/5"
                    title="关闭"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${pricingClass(tool.pricingTier)}`}>
              {PRICING_LABEL[tool.pricingTier]}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyClass(tool.difficulty)}`}>
              {DIFFICULTY_LABEL[tool.difficulty]}
            </span>
            {tool.syncedAudio && (
              <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-600">音视频同步</span>
            )}
            {tool.hasApi && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">有 API</span>
            )}
            {tool.hasWebApp && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Web 可用</span>
            )}
            {tool.hasMobileApp && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">手机 App</span>
            )}
            {tool.hasOpenSource && (
              <span className="rounded bg-lime-50 px-1.5 py-0.5 text-[10px] text-lime-700">开源</span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto scroll-thin px-4 py-3">
          {loading && <p className="text-[11px] text-gray-400">加载详情中…</p>}
          {error && !detail && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              {error}，以下为基础信息
            </p>
          )}

          {deprecated && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-600">
              ⚠️ 该工具已停服，不建议继续投入。请优先考虑 Veo 3.1 / Kling / Runway 等替代方案。
            </div>
          )}

          <p className="text-xs leading-relaxed text-gray-600">{tool.shortDesc}</p>

          {tool.startingPrice && (
            <div className="mt-3 rounded-xl border border-black/5 bg-gray-50/70 px-3 py-2">
              <p className="text-[11px] text-gray-400">起步价格</p>
              <p className="mt-0.5 text-xs font-medium text-gray-700">{tool.startingPrice}</p>
            </div>
          )}

          {detail && detail.highlights.length > 0 && (
            <section className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-gray-700">主要亮点</p>
              <ul className="ml-4 list-disc space-y-1 text-[11px] leading-relaxed text-gray-600">
                {detail.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>
          )}

          {detail && detail.limitations.length > 0 && (
            <section className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-gray-700">需要注意的限制</p>
              <ul className="ml-4 list-disc space-y-1 text-[11px] leading-relaxed text-gray-500">
                {detail.limitations.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Spec label="最高分辨率" value={tool.maxResolution || '—'} />
            <Spec label="单次时长" value={tool.maxClipSec ? `${tool.maxClipSec}s` : '—'} />
            <Spec label="文生视频" value={tool.supportsT2v ? '支持' : '不支持'} />
            <Spec label="图生视频" value={tool.supportsI2v ? '支持' : '不支持'} />
          </section>

          {(tool.categories.length > 0 || tool.scenarios.length > 0) && (
            <section className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold text-gray-700">类别与适用场景</p>
              <div className="flex flex-wrap gap-1">
                {tool.categories.map((c) => (
                  <span key={c} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
                    {CATEGORY_LABEL[c] ?? c}
                  </span>
                ))}
                {tool.scenarios.map((s) => (
                  <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    {SCENARIO_LABEL[s] ?? s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {tool.notes && (
            <p className="mt-3 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-500">
              备注：{tool.notes}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-black/5 px-4 py-2.5">
          <span className="text-[10px] text-gray-400">
            {canQuickTry(tool) ? '支持在绝色内快速体验' : '仅提供配置引导'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openExternal(tool.officialUrl)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              去官网
            </button>
            <button
              type="button"
              onClick={() => onSetup(tool)}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              配置引导 / 获取 Key
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/5 bg-white px-2 py-1.5">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-medium text-gray-700">{value}</p>
    </div>
  )
}
