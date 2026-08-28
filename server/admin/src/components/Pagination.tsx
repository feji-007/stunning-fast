/**
 * 通用分页组件。
 * 显示：<  首页  1 2 ... 6 7 8 ... N  尾页  >
 * 外加每页条数下拉（10 / 20 / 50 / 100）与总条数。
 *
 * 重要：父组件在 onChange 里调用 load() 时必须显式传 pageSize 参数，
 * 不能依赖组件闭包里的 pageSize 状态（React.setState 是异步的，
 * setPageSize(ns) 之后紧接着调用的 load() 仍会读取旧的 20 条）。
 */
import React from 'react'

export interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface Props extends PaginationState {
  onChange: (state: { page: number; pageSize: number }) => void
  pageSizeOptions?: number[]
}

const PAGE_SIZE_OPTIONS_DEFAULT = [10, 20, 50, 100]

function buildPages(current: number, total: number): (number | '…')[] {
  if (total <= 0) return []
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

const Pagination: React.FC<Props> = ({ page, pageSize, total, totalPages, onChange, pageSizeOptions }) => {
  const safePage = Math.max(1, page)
  const safeTotal = Math.max(0, totalPages)
  const options = pageSizeOptions ?? PAGE_SIZE_OPTIONS_DEFAULT
  const pages = buildPages(safePage, safeTotal)

  const btn =
    'min-w-[32px] h-8 px-2 rounded border text-sm disabled:opacity-40 disabled:cursor-not-allowed ' +
    'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
  const activeBtn = 'min-w-[32px] h-8 px-2 rounded border text-sm border-amber-400 bg-amber-50 text-amber-700 font-semibold'
  const ellipsis = 'min-w-[32px] h-8 flex items-center justify-center text-gray-400 text-sm'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>
          共 <b className="text-gray-700">{total}</b> 条，第{' '}
          <b className="text-gray-700">{safeTotal === 0 ? 0 : safePage}</b> / {safeTotal} 页
        </span>
        <select
          value={pageSize}
          onChange={(e) => onChange({ page: 1, pageSize: Number(e.target.value) })}
          className="h-8 rounded border border-gray-200 bg-white px-2 text-xs"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n} 条 / 页
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button className={btn} disabled={safePage <= 1} onClick={() => onChange({ page: 1, pageSize })} title="首页">
          «
        </button>
        <button className={btn} disabled={safePage <= 1} onClick={() => onChange({ page: safePage - 1, pageSize })} title="上一页">
          ‹
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`e-${i}`} className={ellipsis}>
              …
            </span>
          ) : (
            <button
              key={p}
              className={p === safePage ? activeBtn : btn}
              onClick={() => onChange({ page: p as number, pageSize })}
            >
              {p}
            </button>
          )
        )}
        <button
          className={btn}
          disabled={safePage >= safeTotal}
          onClick={() => onChange({ page: safePage + 1, pageSize })}
          title="下一页"
        >
          ›
        </button>
        <button
          className={btn}
          disabled={safePage >= safeTotal}
          onClick={() => onChange({ page: safeTotal, pageSize })}
          title="尾页"
        >
          »
        </button>
      </div>
    </div>
  )
}

export default Pagination
