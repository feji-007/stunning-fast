import type { MouseEvent } from 'react'
import type { Tool } from '../../types'
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  PRICING_LABEL,
  difficultyClass,
  pricingClass
} from './toolMeta'

interface Props {
  tool: Tool
  favorited: boolean
  onOpen: () => void
  onToggleFavorite: (e: MouseEvent) => void
}

/** 工具目录卡片：新手一眼看懂"是什么 / 多少钱 / 难不难 / 有没有 API" */
export default function ToolCard({ tool, favorited, onOpen, onToggleFavorite }: Props) {
  const initial = tool.name.trim().slice(0, 1).toUpperCase()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-black/5 bg-white p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        {tool.logoUrl ? (
          <img
            src={tool.logoUrl}
            alt={tool.name}
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-semibold text-white">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{tool.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-400">
                {tool.subtitle || tool.provider}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleFavorite}
              title={favorited ? '取消收藏' : '收藏'}
              className={`shrink-0 rounded-md px-1.5 py-0.5 text-sm transition-colors ${
                favorited ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
              }`}
            >
              {favorited ? '★' : '☆'}
            </button>
          </div>
        </div>
      </div>

      <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-500">
        {tool.shortDesc}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${pricingClass(tool.pricingTier)}`}>
          {PRICING_LABEL[tool.pricingTier]}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyClass(tool.difficulty)}`}>
          {DIFFICULTY_LABEL[tool.difficulty]}
        </span>
        {tool.syncedAudio && (
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-600">音视频同步</span>
        )}
        {tool.hasOpenSource && (
          <span className="rounded bg-lime-50 px-1.5 py-0.5 text-[10px] text-lime-700">开源</span>
        )}
        {tool.maxResolution && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
            最高 {tool.maxResolution}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/5 pt-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {tool.categories.slice(0, 2).map((c) => (
            <span key={c} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
              {CATEGORY_LABEL[c] ?? c}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-[11px] text-gray-500">
          {tool.startingPrice || '价格见官网'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="flex-1 rounded-lg bg-brand-50 px-2 py-1.5 text-[11px] font-medium text-brand-600 transition-colors hover:bg-brand-100"
        >
          查看详情与配置
        </button>
      </div>
    </div>
  )
}
