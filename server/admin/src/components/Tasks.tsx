// 任务记录管理:列出每次视频生成任务，支持按服务商/模型/用户/状态过滤 + 列排序 + 删除。
import { useEffect, useMemo, useState } from 'react'
import { tasksApi, providersApi, modelsApi, usersApi } from '../api'
import SortableTh from './SortableTh'

interface Task {
  id: number
  user_id: number
  username: string | null
  provider_id: string
  model_id: string
  gen_mode: string
  status: string
  resolution: string
  ratio: string
  duration: string
  prompt: string
  video_url: string
  error_message: string
  created_at: string
}

interface Option { id: string; name: string }
interface UserOption { id: number; username: string }

// 任务记录可排序字段 → 取值函数（client 侧二次排序，配合 server 排序）
const TASK_GETTERS: Record<string, (t: Task) => string | number> = {
  id: (t) => t.id,
  user: (t) => t.username ?? '',
  provider: (t) => t.provider_id,
  model: (t) => t.model_id,
  status: (t) => t.status,
  created: (t) => new Date(t.created_at).getTime() || 0
}

const fmtDate = (s: string) => {
  if (!s) return '-'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function Tasks() {
  const [list, setList] = useState<Task[]>([])
  const [providers, setProviders] = useState<Option[]>([])
  const [models, setModels] = useState<Option[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 过滤条件
  const [filterProvider, setFilterProvider] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 排序（client 侧）
  const [sortField, setSortField] = useState('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 排序请求参数（同步到 server 端，避免 client 与 server 不一致）
  const [serverSort, setServerSort] = useState({ field: 'created', order: 'desc' as 'asc' | 'desc' })

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([
      tasksApi.list({ sort: serverSort.field, order: serverSort.order }),
      providersApi.list().then((r) => (r.providers ?? []).map((p: any) => ({ id: p.id, name: p.name }))),
      modelsApi.list().then((r) => (r.models ?? []).map((m: any) => ({ id: m.id, name: m.name }))),
      usersApi.list().then((r) => (r.users ?? []).map((u: any) => ({ id: u.id, username: u.username })))
    ])
      .then(([t, p, m, u]) => {
        setList(t.tasks ?? [])
        setProviders(p)
        setModels(m)
        setUsers(u)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSort])

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id

  // client 侧过滤
  const filteredList = useMemo(() => {
    let r = list
    if (filterProvider) r = r.filter((t) => t.provider_id === filterProvider)
    if (filterModel) r = r.filter((t) => t.model_id === filterModel)
    if (filterUser) r = r.filter((t) => String(t.user_id) === filterUser)
    if (filterStatus) r = r.filter((t) => t.status === filterStatus)
    const getter = TASK_GETTERS[sortField] ?? TASK_GETTERS.created
    const dir = sortOrder === 'asc' ? 1 : -1
    return [...r].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [list, filterProvider, filterModel, filterUser, filterStatus, sortField, sortOrder])

  const onSort = (field: string) => {
    if (field === sortField) {
      const next = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(next)
      setServerSort({ field, order: next })
    } else {
      setSortField(field)
      setSortOrder('asc')
      setServerSort({ field, order: 'asc' })
    }
  }

  const remove = (t: Task) => {
    if (!confirm(`确认删除任务 #${t.id}?`)) return
    tasksApi
      .remove(t.id)
      .then(load)
      .catch((e: Error) => alert(e.message))
  }

  const hasFilter = filterProvider || filterModel || filterUser || filterStatus

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">任务记录管理</h2>
        <span className="text-xs text-gray-400">共 {filteredList.length} 条</span>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* 过滤搜索栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl shadow-float px-4 py-3">
        <span className="text-xs text-gray-500">筛选</span>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部服务商</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部模型</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部用户</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.username}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="fail">失败</option>
        </select>
        {hasFilter && (
          <button
            onClick={() => {
              setFilterProvider('')
              setFilterModel('')
              setFilterUser('')
              setFilterStatus('')
            }}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >
            清除
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无任务记录</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-gray-400">无匹配结果</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <SortableTh label="#" field="id" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="用户" field="user" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="服务商" field="provider" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="模型" field="model" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-left">模式</th>
                <SortableTh label="状态" field="status" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-left">参数</th>
                <th className="px-4 py-3 text-left">提示词</th>
                <SortableTh label="创建时间" field="created" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{t.id}</td>
                  <td className="px-4 py-3 text-gray-700">{t.username ?? `#${t.user_id}`}</td>
                  <td className="px-4 py-3 text-gray-600">{providerName(t.provider_id)}</td>
                  <td className="px-4 py-3 text-gray-700">{modelName(t.model_id)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                      {t.gen_mode === 'i2v' ? '图生视频' : '文生视频'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        t.status === 'success'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {t.status === 'success' ? '成功' : '失败'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {t.resolution || '-'} · {t.ratio || '-'} · {t.duration || '-'}s
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={t.prompt}>
                    {t.prompt || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {t.video_url && (
                      <a
                        href={t.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      >
                        查看
                      </a>
                    )}
                    <button
                      onClick={() => remove(t)}
                      className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
