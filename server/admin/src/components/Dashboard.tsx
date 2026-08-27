// 仪表盘:聚合显示供应商/模型/功能/用户数量,数字卡片展示。
import { useEffect, useState } from 'react'
import { providersApi, modelsApi, featuresApi, usersApi } from '../api'

interface Stats {
  providers: number
  models: number
  features: number
  users: number
}

const EMPTY: Stats = { providers: 0, models: 0, features: 0, users: 0 }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      providersApi.list().then((r) => r.providers?.length ?? 0),
      modelsApi.list().then((r) => r.models?.length ?? 0),
      featuresApi.list().then((r) => r.features?.length ?? 0),
      usersApi.list().then((r) => r.users?.length ?? 0)
    ])
      .then(([p, m, f, u]) => setStats({ providers: p, models: m, features: f, users: u }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: '供应商', value: stats.providers, icon: '🔌', color: 'bg-blue-50 text-blue-600' },
    { label: '模型', value: stats.models, icon: '🤖', color: 'bg-purple-50 text-purple-600' },
    { label: '功能入口', value: stats.features, icon: '✨', color: 'bg-amber-50 text-amber-600' },
    { label: '用户', value: stats.users, icon: '👥', color: 'bg-emerald-50 text-emerald-600' }
  ]

  if (loading) return <div className="text-gray-400">加载中…</div>
  if (error)
    return (
      <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
        {error}
      </div>
    )

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-6">系统概览</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-float p-6">
            <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center text-2xl`}>
              {c.icon}
            </div>
            <div className="mt-4 text-3xl font-bold text-gray-800">{c.value}</div>
            <div className="mt-1 text-sm text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 bg-white rounded-xl shadow-float p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-2">欢迎使用</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          通过左侧导航管理视频生成服务的供应商、模型、功能入口、视频配置和后台用户。
        </p>
      </div>
    </div>
  )
}