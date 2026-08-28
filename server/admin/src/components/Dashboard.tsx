// 仪表盘：聚合显示系统概览（供应商/模型/功能/用户数量）与使用统计（任务/用户/成功/失败 + 按服务商/模型维度，支持柱状图/饼状图/折线图/表格自由切换）。
import { useEffect, useMemo, useRef, useState } from 'react'
import { providersApi, modelsApi, featuresApi, usersApi, statsApi } from '../api'
import StatsChart, { ChartModeSwitcher, ExportMenu, type ChartMode, type ChartDatum } from './StatsChart'

interface SystemStats {
  providers: number
  models: number
  features: number
  users: number
}

interface Total {
  total_tasks: number
  total_users: number
  success_count: number
  fail_count: number
}

interface ProviderStat {
  provider_id: string
  provider_name: string | null
  task_count: number
  user_count: number
}
interface ModelStat {
  model_id: string
  provider_id: string
  model_name: string | null
  task_count: number
  user_count: number
}

const EMPTY_SYS: SystemStats = { providers: 0, models: 0, features: 0, users: 0 }
const EMPTY_TOTAL: Total = { total_tasks: 0, total_users: 0, success_count: 0, fail_count: 0 }

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function Dashboard() {
  const [sys, setSys] = useState<SystemStats>(EMPTY_SYS)
  const [total, setTotal] = useState<Total>(EMPTY_TOTAL)
  const [byProvider, setByProvider] = useState<ProviderStat[]>([])
  const [byModel, setByModel] = useState<ModelStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // 两个统计维度各自的图表模式
  const [providerMode, setProviderMode] = useState<ChartMode>('bar')
  const [modelMode, setModelMode] = useState<ChartMode>('table')
  // 图表容器引用，用于 SVG 导出
  const providerChartRef = useRef<HTMLDivElement>(null)
  const modelChartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      providersApi.list().then((r) => r.providers?.length ?? 0),
      modelsApi.list().then((r) => r.models?.length ?? 0),
      featuresApi.list().then((r) => r.features?.length ?? 0),
      usersApi.list().then((r) => r.users?.length ?? 0),
      statsApi.fetch()
    ])
      .then(([p, m, f, u, stats]) => {
        setSys({ providers: p, models: m, features: f, users: u })
        setTotal(stats.total ?? EMPTY_TOTAL)
        setByProvider(stats.byProvider ?? [])
        setByModel(stats.byModel ?? [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const providerData: ChartDatum[] = useMemo(
    () =>
      byProvider.map((p) => ({
        label: p.provider_name || p.provider_id,
        value: toNum(p.task_count),
        secondary: toNum(p.user_count)
      })),
    [byProvider]
  )

  const modelData: ChartDatum[] = useMemo(
    () =>
      byModel.map((m) => ({
        label: m.model_name || m.model_id,
        value: toNum(m.task_count),
        secondary: toNum(m.user_count),
        sublabel: m.provider_id
      })),
    [byModel]
  )

  if (loading) return <div className="text-gray-400">加载中…</div>
  if (error)
    return (
      <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
        {error}
      </div>
    )

  const systemCards = [
    { label: '供应商', value: sys.providers, icon: '🔌', color: 'bg-blue-50 text-blue-600' },
    { label: '模型', value: sys.models, icon: '🤖', color: 'bg-purple-50 text-purple-600' },
    { label: '功能入口', value: sys.features, icon: '✨', color: 'bg-amber-50 text-amber-600' },
    { label: '用户', value: sys.users, icon: '👥', color: 'bg-emerald-50 text-emerald-600' }
  ]

  const usageCards = [
    { label: '总任务数', value: toNum(total.total_tasks), icon: '🎬', color: 'bg-blue-50 text-blue-600' },
    { label: '使用用户数', value: toNum(total.total_users), icon: '👥', color: 'bg-emerald-50 text-emerald-600' },
    { label: '成功任务', value: toNum(total.success_count), icon: '✅', color: 'bg-green-50 text-green-600' },
    { label: '失败任务', value: toNum(total.fail_count), icon: '⚠️', color: 'bg-amber-50 text-amber-600' }
  ]

  return (
    <div>
      {/* 系统概览 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">系统概览</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {systemCards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl shadow-float p-6">
              <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center text-2xl`}>
                {c.icon}
              </div>
              <div className="mt-4 text-3xl font-bold text-gray-800">{c.value}</div>
              <div className="mt-1 text-sm text-gray-500">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 使用统计总览 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">使用统计</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {usageCards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl shadow-float p-6">
              <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center text-2xl`}>
                {c.icon}
              </div>
              <div className="mt-4 text-3xl font-bold text-gray-800">{c.value}</div>
              <div className="mt-1 text-sm text-gray-500">{c.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 按服务商统计（可切换图表 + 数据导出） */}
      <section className="bg-white rounded-xl shadow-float p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">按服务商统计</h3>
          <div className="flex items-center gap-2">
            <ChartModeSwitcher mode={providerMode} onChange={setProviderMode} />
            <ExportMenu
              data={providerData}
              filename="按服务商统计"
              valueLabel="任务数"
              secondaryLabel="用户数"
              canExportSVG={providerMode !== 'table'}
              containerRef={providerChartRef}
            />
          </div>
        </div>
        <div ref={providerChartRef}>
          <StatsChart
            mode={providerMode}
            data={providerData}
            valueLabel="任务数"
            secondaryLabel="用户数"
          />
        </div>
      </section>

      {/* 按模型统计（可切换图表 + 数据导出） */}
      <section className="bg-white rounded-xl shadow-float p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">按模型统计</h3>
          <div className="flex items-center gap-2">
            <ChartModeSwitcher mode={modelMode} onChange={setModelMode} />
            <ExportMenu
              data={modelData}
              filename="按模型统计"
              valueLabel="任务数"
              secondaryLabel="用户数"
              canExportSVG={modelMode !== 'table'}
              containerRef={modelChartRef}
            />
          </div>
        </div>
        <div ref={modelChartRef}>
          <StatsChart
            mode={modelMode}
            data={modelData}
            valueLabel="任务数"
            secondaryLabel="用户数"
          />
        </div>
      </section>
    </div>
  )
}
