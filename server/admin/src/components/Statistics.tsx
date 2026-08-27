// 使用统计:按服务商 / 模型 维度统计任务数与用户数,顶部展示总览卡片。
import { useEffect, useState } from 'react'
import { statsApi } from '../api'

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
interface Total {
  total_tasks: number
  total_users: number
  success_count: number
  fail_count: number
}

const EMPTY: Total = { total_tasks: 0, total_users: 0, success_count: 0, fail_count: 0 }

// 计算最大值用于条形宽度
function pct(v: number, max: number) {
  return max > 0 ? Math.round((v / max) * 100) : 0
}

export default function Statistics() {
  const [byProvider, setByProvider] = useState<ProviderStat[]>([])
  const [byModel, setByModel] = useState<ModelStat[]>([])
  const [total, setTotal] = useState<Total>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    statsApi
      .fetch()
      .then((d) => {
        setByProvider(d.byProvider ?? [])
        setByModel(d.byModel ?? [])
        setTotal(d.total ?? EMPTY)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-400">加载中…</div>
  if (error)
    return (
      <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
        {error}
      </div>
    )

  const maxProviderTask = Math.max(1, ...byProvider.map((p) => Number(p.task_count) || 0))
  const maxModelTask = Math.max(1, ...byModel.map((m) => Number(m.task_count) || 0))

  const overview = [
    { label: '总任务数', value: total.total_tasks, icon: '🎬', color: 'bg-blue-50 text-blue-600' },
    { label: '使用用户数', value: total.total_users, icon: '👥', color: 'bg-emerald-50 text-emerald-600' },
    { label: '成功任务', value: total.success_count, icon: '✅', color: 'bg-green-50 text-green-600' },
    { label: '失败任务', value: total.fail_count, icon: '⚠️', color: 'bg-amber-50 text-amber-600' }
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-6">使用统计</h2>

      {/* 总览卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {overview.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-float p-6">
            <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center text-2xl`}>
              {c.icon}
            </div>
            <div className="mt-4 text-3xl font-bold text-gray-800">{Number(c.value) || 0}</div>
            <div className="mt-1 text-sm text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* 按服务商统计 */}
      <div className="bg-white rounded-xl shadow-float p-6 mb-8">
        <h3 className="text-base font-semibold text-gray-800 mb-4">按服务商统计</h3>
        {byProvider.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">暂无数据</div>
        ) : (
          <div className="space-y-4">
            {byProvider.map((p) => {
              const tasks = Number(p.task_count) || 0
              const users = Number(p.user_count) || 0
              return (
                <div key={p.provider_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800">
                      {p.provider_name || p.provider_id}
                    </span>
                    <span className="text-gray-500">
                      任务 <b className="text-gray-800">{tasks}</b> · 用户{' '}
                      <b className="text-gray-800">{users}</b>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all"
                      style={{ width: `${pct(tasks, maxProviderTask)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 按模型统计 */}
      <div className="bg-white rounded-xl shadow-float p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">按模型统计</h3>
        {byModel.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3 text-left">模型</th>
                  <th className="px-4 py-3 text-left">服务商</th>
                  <th className="px-4 py-3 text-left">任务数</th>
                  <th className="px-4 py-3 text-left">使用用户数</th>
                  <th className="px-4 py-3 text-left">占比</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((m) => {
                  const tasks = Number(m.task_count) || 0
                  const users = Number(m.user_count) || 0
                  return (
                    <tr key={m.model_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {m.model_name || m.model_id}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{m.provider_id}</td>
                      <td className="px-4 py-3 text-gray-800">{tasks}</td>
                      <td className="px-4 py-3 text-gray-800">{users}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full"
                              style={{ width: `${pct(tasks, maxModelTask)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{pct(tasks, maxModelTask)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
