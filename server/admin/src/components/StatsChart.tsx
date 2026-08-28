// 统计图表：支持柱状图 / 饼状图 / 折线图 / 表格图 四种模式自由切换，纯 SVG 实现。
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type ChartMode = 'bar' | 'pie' | 'line' | 'table'

export interface ChartDatum {
  label: string
  value: number
  secondary?: number
  sublabel?: string
}

interface StatsChartProps {
  mode: ChartMode
  data: ChartDatum[]
  valueLabel?: string
  secondaryLabel?: string
}

// 图表配色（按序循环）
const PALETTE = [
  '#4f46e5', // brand-600
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#6366f1' // indigo-500
]

function color(i: number) {
  return PALETTE[i % PALETTE.length]
}

// 模式切换按钮组
export function ChartModeSwitcher({
  mode,
  onChange
}: {
  mode: ChartMode
  onChange: (m: ChartMode) => void
}) {
  const modes: { key: ChartMode; label: string; icon: string }[] = [
    { key: 'bar', label: '柱状图', icon: '📊' },
    { key: 'pie', label: '饼状图', icon: '🥧' },
    { key: 'line', label: '折线图', icon: '📈' },
    { key: 'table', label: '表格', icon: '📋' }
  ]
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5">
      {modes.map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition ${
              active
                ? 'bg-white text-brand-700 font-medium shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="mr-1">{m.icon}</span>
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

const W = 560
const H = 280
const PAD = { top: 20, right: 20, bottom: 50, left: 40 }

// 柱状图
function BarChart({
  data,
  valueLabel,
  secondaryLabel
}: {
  data: ChartDatum[]
  valueLabel?: string
  secondaryLabel?: string
}) {
  if (data.length === 0) return <Empty />
  const showSecondary = data.some((d) => d.secondary != null)
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.value, showSecondary ? d.secondary ?? 0 : 0))
  )
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const groupW = chartW / data.length
  const barW = showSecondary ? Math.min(28, groupW / 3) : Math.min(40, groupW / 2)

  // 4 条网格线
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* 网格线 */}
      {gridVals.map((g, i) => {
        const y = PAD.top + chartH - (g / max) * chartH
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10 }}>
              {g}
            </text>
          </g>
        )
      })}
      {/* 柱体 */}
      {data.map((d, i) => {
        const cx = PAD.left + groupW * (i + 0.5)
        const h = (d.value / max) * chartH
        const y = PAD.top + chartH - h
        return (
          <g key={i}>
            <rect
              x={cx - (showSecondary ? barW + 1 : barW / 2)}
              y={y}
              width={barW}
              height={h}
              rx={3}
              fill={color(i)}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {showSecondary && (
              <rect
                x={cx + 1}
                y={PAD.top + chartH - ((d.secondary ?? 0) / max) * chartH}
                width={barW}
                height={((d.secondary ?? 0) / max) * chartH}
                rx={3}
                fill={color(i)}
                opacity={0.4}
              >
                <title>{`${d.label}: ${d.secondary ?? 0}`}</title>
              </rect>
            )}
            {/* x 轴标签 */}
            <text
              x={cx}
              y={PAD.top + chartH + 16}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 11 }}
            >
              {truncate(d.label)}
            </text>
          </g>
        )
      })}
      {/* 图例 */}
      {showSecondary && (
        <g transform={`translate(${PAD.left}, ${H - 14})`}>
          <rect width={10} height={10} fill="#4f46e5" rx={2} />
          <text x={14} y={9} className="fill-gray-500" style={{ fontSize: 10 }}>
            {valueLabel || '主值'}
          </text>
          <rect x={90} width={10} height={10} fill="#4f46e5" opacity={0.4} rx={2} />
          <text x={104} y={9} className="fill-gray-500" style={{ fontSize: 10 }}>
            {secondaryLabel || '次值'}
          </text>
        </g>
      )}
    </svg>
  )
}

// 饼状图
function PieChart({ data, valueLabel }: { data: ChartDatum[]; valueLabel?: string }) {
  if (data.length === 0) return <Empty />
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <Empty />
  const cx = W / 2
  const cy = H / 2 - 10
  const r = Math.min(W, H) / 2 - 40
  const innerR = r * 0.55

  let acc = 0
  const slices = data.map((d, i) => {
    const start = (acc / total) * Math.PI * 2
    acc += d.value
    const end = (acc / total) * Math.PI * 2
    const large = end - start > Math.PI ? 1 : 0
    const x1 = cx + r * Math.sin(start)
    const y1 = cy - r * Math.cos(start)
    const x2 = cx + r * Math.sin(end)
    const y2 = cy - r * Math.cos(end)
    const xi2 = cx + innerR * Math.sin(end)
    const yi2 = cy - innerR * Math.cos(end)
    const xi1 = cx + innerR * Math.sin(start)
    const yi1 = cy - innerR * Math.cos(start)
    // 单一切片（100%）画一个完整环
    if (data.length === 1) {
      return (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill={color(i)} stroke="#fff" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
        </g>
      )
    }
    const path = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi2} ${yi2}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1}`,
      'Z'
    ].join(' ')
    return (
      <path key={i} d={path} fill={color(i)} stroke="#fff" strokeWidth={2}>
        <title>{`${d.label}: ${d.value} (${pct(d.value, total)}%)`}</title>
      </path>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {slices}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-gray-800 font-semibold"
        style={{ fontSize: 20 }}
      >
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>
        {valueLabel || '总数'}
      </text>
      {/* 图例 */}
      <g transform={`translate(${PAD.left}, ${H - 14})`}>
        {data.map((d, i) => {
          const x = (i % 4) * 130
          const row = Math.floor(i / 4)
          return (
            <g key={i} transform={`translate(${x}, ${row * 14})`}>
              <rect width={10} height={10} fill={color(i)} rx={2} />
              <text x={14} y={9} className="fill-gray-500" style={{ fontSize: 10 }}>
                {truncate(d.label, 10)} ({pct(d.value, total)}%)
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// 折线图
function LineChart({
  data,
  valueLabel,
  secondaryLabel
}: {
  data: ChartDatum[]
  valueLabel?: string
  secondaryLabel?: string
}) {
  if (data.length === 0) return <Empty />
  const showSecondary = data.some((d) => d.secondary != null)
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.value, showSecondary ? d.secondary ?? 0 : 0))
  )
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0

  const points = (sel: 'value' | 'secondary') =>
    data
      .map((d, i) => {
        const v = sel === 'value' ? d.value : d.secondary ?? 0
        const x = PAD.left + stepX * i
        const y = PAD.top + chartH - (v / max) * chartH
        return `${x},${y}`
      })
      .join(' ')

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* 网格线 */}
      {gridVals.map((g, i) => {
        const y = PAD.top + chartH - (g / max) * chartH
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" className="fill-gray-400" style={{ fontSize: 10 }}>
              {g}
            </text>
          </g>
        )
      })}
      {/* 主折线 */}
      <polyline
        points={points('value')}
        fill="none"
        stroke={PALETTE[0]}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((d, i) => {
        const x = PAD.left + stepX * i
        const y = PAD.top + chartH - (d.value / max) * chartH
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3.5} fill="#fff" stroke={PALETTE[0]} strokeWidth={2}>
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
            <text
              x={x}
              y={PAD.top + chartH + 16}
              textAnchor="middle"
              className="fill-gray-500"
              style={{ fontSize: 11 }}
            >
              {truncate(d.label)}
            </text>
          </g>
        )
      })}
      {/* 次折线 */}
      {showSecondary && (
        <>
          <polyline
            points={points('secondary')}
            fill="none"
            stroke={PALETTE[0]}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.6}
          />
          {data.map((d, i) => {
            const x = PAD.left + stepX * i
            const y = PAD.top + chartH - ((d.secondary ?? 0) / max) * chartH
            return (
              <circle key={i} cx={x} cy={y} r={3} fill={PALETTE[0]} opacity={0.6}>
                <title>{`${d.label}: ${d.secondary ?? 0}`}</title>
              </circle>
            )
          })}
          <g transform={`translate(${PAD.left}, ${H - 14})`}>
            <line x1={0} y1={5} x2={18} y2={5} stroke={PALETTE[0]} strokeWidth={2.5} />
            <text x={22} y={9} className="fill-gray-500" style={{ fontSize: 10 }}>
              {valueLabel || '主值'}
            </text>
            <line x1={90} y1={5} x2={108} y2={5} stroke={PALETTE[0]} strokeWidth={2} strokeDasharray="5 4" opacity={0.6} />
            <text x={112} y={9} className="fill-gray-500" style={{ fontSize: 10 }}>
              {secondaryLabel || '次值'}
            </text>
          </g>
        </>
      )}
    </svg>
  )
}

// 表格图
function TableView({
  data,
  valueLabel,
  secondaryLabel
}: {
  data: ChartDatum[]
  valueLabel?: string
  secondaryLabel?: string
}) {
  if (data.length === 0) return <Empty />
  const total = data.reduce((s, d) => s + d.value, 0)
  const showSecondary = data.some((d) => d.secondary != null)
  const showSublabel = data.some((d) => d.sublabel)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="px-4 py-3 text-left">名称</th>
            {showSublabel && <th className="px-4 py-3 text-left">归属</th>}
            <th className="px-4 py-3 text-left">{valueLabel || '任务数'}</th>
            {showSecondary && <th className="px-4 py-3 text-left">{secondaryLabel || '用户数'}</th>}
            <th className="px-4 py-3 text-left">占比</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const p = pct(d.value, total)
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{d.label}</td>
                {showSublabel && <td className="px-4 py-3 text-gray-600">{d.sublabel}</td>}
                <td className="px-4 py-3 text-gray-800">{d.value}</td>
                {showSecondary && <td className="px-4 py-3 text-gray-800">{d.secondary ?? 0}</td>}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${p}%`, backgroundColor: color(i) }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{p}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Empty() {
  return <div className="py-12 text-center text-gray-400 text-sm">暂无数据</div>
}

function pct(v: number, max: number) {
  return max > 0 ? Math.round((v / max) * 100) : 0
}

function truncate(s: string, n = 6) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ===== 数据导出 =====

// 触发浏览器下载
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// CSV 单元格转义
function csvCell(s: string | number) {
  const str = String(s)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

interface ExportLabels {
  valueLabel?: string
  secondaryLabel?: string
}

// 导出 CSV（带 BOM，Excel 友好）
export function exportCSV(data: ChartDatum[], filename: string, labels?: ExportLabels) {
  const hasSub = data.some((d) => d.sublabel)
  const hasSec = data.some((d) => d.secondary != null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const headers = ['名称']
  if (hasSub) headers.push('归属')
  headers.push(labels?.valueLabel || '数值')
  if (hasSec) headers.push(labels?.secondaryLabel || '次值')
  headers.push('占比(%)')
  const rows = data.map((d) => {
    const row = [csvCell(d.label)]
    if (hasSub) row.push(csvCell(d.sublabel ?? ''))
    row.push(csvCell(d.value))
    if (hasSec) row.push(csvCell(d.secondary ?? 0))
    row.push(csvCell(total > 0 ? ((d.value / total) * 100).toFixed(2) : '0.00'))
    return row.join(',')
  })
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`)
}

// 导出 JSON
export function exportJSON(data: ChartDatum[], filename: string, labels?: ExportLabels) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const items = data.map((d) => {
    const o: Record<string, unknown> = { 名称: d.label }
    if (d.sublabel) o['归属'] = d.sublabel
    o[labels?.valueLabel || '数值'] = d.value
    if (d.secondary != null) o[labels?.secondaryLabel || '次值'] = d.secondary
    o['占比(%)'] = total > 0 ? Number(((d.value / total) * 100).toFixed(2)) : 0
    return o
  })
  const json = JSON.stringify({ total, items }, null, 2)
  downloadBlob(new Blob([json], { type: 'application/json;charset=utf-8;' }), `${filename}.json`)
}

// 导出 SVG（将已渲染的 SVG 节点序列化下载）
export function exportSVG(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(clone)
  const blob = new Blob(
    ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n', xml],
    { type: 'image/svg+xml;charset=utf-8;' }
  )
  downloadBlob(blob, `${filename}.svg`)
}

// 导出菜单：下拉按钮，Portal 渲染到 body（遵循项目下拉约定），支持 CSV / JSON / SVG。
export function ExportMenu({
  data,
  filename,
  valueLabel,
  secondaryLabel,
  canExportSVG,
  containerRef
}: {
  data: ChartDatum[]
  filename: string
  valueLabel?: string
  secondaryLabel?: string
  canExportSVG?: boolean
  containerRef: RefObject<HTMLDivElement>
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen((v) => !v)
  }

  const labels: ExportLabels = { valueLabel, secondaryLabel }
  const doCSV = () => {
    exportCSV(data, filename, labels)
    setOpen(false)
  }
  const doJSON = () => {
    exportJSON(data, filename, labels)
    setOpen(false)
  }
  const doSVG = () => {
    const svg = containerRef.current?.querySelector('svg') as SVGSVGElement | null
    if (svg) exportSVG(svg, filename)
    setOpen(false)
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center px-2.5 py-1.5 text-xs rounded-md text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
      >
        <span className="mr-1">⬇</span>导出
      </button>
      {open &&
        createPortal(
          <div
            className="z-50 min-w-[140px] bg-white rounded-lg shadow-lg border border-gray-200 py-1"
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
          >
            <button
              onClick={doCSV}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              导出 CSV
            </button>
            <button
              onClick={doJSON}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              导出 JSON
            </button>
            {canExportSVG && (
              <button
                onClick={doSVG}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                导出 SVG
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

export default function StatsChart({
  mode,
  data,
  valueLabel,
  secondaryLabel
}: StatsChartProps) {
  switch (mode) {
    case 'bar':
      return <BarChart data={data} valueLabel={valueLabel} secondaryLabel={secondaryLabel} />
    case 'pie':
      return <PieChart data={data} valueLabel={valueLabel} />
    case 'line':
      return <LineChart data={data} valueLabel={valueLabel} secondaryLabel={secondaryLabel} />
    case 'table':
    default:
      return <TableView data={data} valueLabel={valueLabel} secondaryLabel={secondaryLabel} />
  }
}
