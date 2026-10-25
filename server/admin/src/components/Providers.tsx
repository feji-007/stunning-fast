// 供应商管理:列表/新增/编辑/删除/启用停用切换。支持列排序+分页。
import { useEffect, useMemo, useState } from 'react'
import { providersApi } from '../api'
import SortableTh from './SortableTh'
import Pagination from './Pagination'

interface Provider {
  id: string
  name: string
  key_hint: string
  url: string
  api_base_url: string
  api_key_url: string
  protocol: string
  submit_path: string
  status_path: string
  submit_path_i2v: string
  status_path_i2v: string
  source: string
  sort_order: number
  is_active: boolean
}

interface Form {
  name: string
  key_hint: string
  url: string
  api_base_url: string
  api_key_url: string
  protocol: string
  submit_path: string
  status_path: string
  submit_path_i2v: string
  status_path_i2v: string
  source: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = {
  name: '', key_hint: '', url: '', api_base_url: '', api_key_url: '',
  protocol: '', submit_path: '', status_path: '', submit_path_i2v: '', status_path_i2v: '',
  source: 'system', sort_order: 0, is_active: true
}

// 协议 -> 默认路径（仅作表单占位提示；留空时主进程不再回退，需在此显式填写）
const PROTOCOL_DEFAULTS: Record<string, { submit: string; status: string; submitI2v?: string; statusI2v?: string }> = {
  dashscope: { submit: '/services/aigc/video-generation/video-synthesis', status: '/tasks/{taskId}' },
  ark:       { submit: '/contents/generations/tasks',                     status: '/contents/generations/tasks/{taskId}' },
  kling:     { submit: '/videos/text2video',                              status: '/videos/text2video/{taskId}',
               submitI2v: '/videos/image2video', statusI2v: '/videos/image2video/{taskId}' },
  minimax:   { submit: '/v1/video_generation',                           status: '/v1/query/video_generation?task_id={taskId}' },
  zhipu:     { submit: '/api/paas/v4/videos/generations',                status: '/api/paas/v4/videos/generations/{taskId}' },
  runway:    { submit: '/v1/text_to_video',                               status: '/v1/tasks/{taskId}' },
  luma:      { submit: '/generations',                                    status: '/generations/{taskId}' },
  openai:    { submit: '/v1/videos',                                      status: '/v1/videos/{taskId}' },
  pika:      { submit: '/v1/videos',                                      status: '/v1/videos/{taskId}' }
}

const PROVIDER_GETTERS: Record<string, (p: Provider) => string | number> = {
  id: (p) => p.id,
  name: (p) => p.name,
  key: (p) => p.key_hint,
  url: (p) => p.url,
  apiBase: (p) => p.api_base_url,
  apiKey: (p) => p.api_key_url,
  protocol: (p) => p.protocol ?? '',
  source: (p) => p.source ?? 'system',
  sort: (p) => p.sort_order ?? 0,
  status: (p) => (p.is_active ? 1 : 0)
}

export default function Providers() {
  const [list, setList] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: string }>(null)
  const [saving, setSaving] = useState(false)
  const [sortField, setSortField] = useState('sort')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  // 分页
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const load = (targetPage = page, targetSize: number = pageSize) => {
    setLoading(true)
    setError('')
    providersApi
      .list({ page: targetPage, pageSize: targetSize })
      .then((r) => {
        setList(r.providers ?? [])
        setTotal(r.total ?? (r.providers?.length ?? 0))
        setPage(r.page ?? targetPage)
        setPageSize(r.pageSize ?? targetSize)
        setTotalPages(r.totalPages ?? Math.max(1, Math.ceil((r.total ?? 0) / targetSize)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1, pageSize) }, [])

  const sortedList = useMemo(() => {
    const getter = PROVIDER_GETTERS[sortField] ?? PROVIDER_GETTERS.sort
    const dir = sortOrder === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const va = getter(a); const vb = getter(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [list, sortField, sortOrder])

  const onSort = (field: string) => {
    if (field === sortField) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortOrder('asc') }
  }

  const toggleActive = (p: Provider) => {
    providersApi.update(p.id, { isActive: !p.is_active })
      .then(() => load(page, pageSize)).catch((e: Error) => alert(e.message))
  }

  const remove = (p: Provider) => {
    if (!confirm(`确认删除供应商「${p.name}」?`)) return
    providersApi.remove(p.id)
      .then(() => load(page === 1 ? 1 : (sortedList.length === 1 ? Math.max(1, page - 1) : page), pageSize))
      .catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.name.trim()) { alert('请填写供应商名称'); return }
    setSaving(true)
    // 后端接收 camelCase: id / name / keyHint / url / apiBaseUrl / apiKeyUrl / source / sortOrder / isActive
    const d = modal.data
    const body: any = {
      name: d.name,
      keyHint: d.key_hint,
      url: d.url,
      apiBaseUrl: d.api_base_url,
      apiKeyUrl: d.api_key_url,
      protocol: d.protocol,
      submitPath: d.submit_path,
      statusPath: d.status_path,
      submitPathI2v: d.submit_path_i2v,
      statusPathI2v: d.status_path_i2v,
      source: d.source,
      sortOrder: Number(d.sort_order) || 0,
      isActive: d.is_active
    }
    if (modal.mode === 'create') {
      // 管理端新增表单没有 id 输入框, 用 name 规范化
      body.id = (d.name || '').trim().toLowerCase().replace(/\s+/g, '-')
      if (!body.id) { alert('请填写供应商名称以生成 ID'); setSaving(false); return }
    }
    const op = modal.mode === 'create' ? providersApi.create(body) : providersApi.update(modal.id!, body)
    op.then(() => { setModal(null); load(page, pageSize) })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">供应商管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >+ 新增供应商</button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无数据</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <SortableTh label="ID" field="id" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="名称" field="name" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="密钥提示" field="key" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="官网/API端点" field="apiBase" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="来源" field="source" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="排序" field="sort" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="状态" field="status" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {p.name}
                    {p.protocol && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[11px] font-mono">{p.protocol}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.key_hint || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-gray-700">{p.url || '-'}</div>
                    {p.api_base_url && (
                      <div className="text-[11px] text-gray-400 mt-0.5" title="API 调用端点">{p.api_base_url}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.source === 'user' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      {p.source === 'user' ? '用户' : '系统'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => toggleActive(p)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                      {p.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => setModal({
                        mode: 'edit', id: p.id,
                        data: {
                          name: p.name, key_hint: '', url: p.url || '', api_base_url: p.api_base_url || '', api_key_url: p.api_key_url || '',
                          protocol: p.protocol || '', submit_path: p.submit_path || '', status_path: p.status_path || '',
                          submit_path_i2v: p.submit_path_i2v || '', status_path_i2v: p.status_path_i2v || '',
                          source: p.source ?? 'system', sort_order: p.sort_order ?? 0, is_active: p.is_active
                        }
                      })}
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >编辑</button>
                    <button onClick={() => remove(p)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={page} pageSize={pageSize} total={total} totalPages={totalPages}
          onChange={({ page: np, pageSize: ns }) => {
            if (ns !== pageSize) { setPageSize(ns); setPage(1); load(1, ns) }
            else { setPage(np); load(np, ns) }
          }}
        />
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-float w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto scroll-thin">
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              {modal.mode === 'create' ? '新增供应商' : '编辑供应商'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">名称</label>
                <input
                  value={modal.data.name}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如:火山引擎"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  API Key 提示 {modal.mode === 'edit' && '(留空不修改)'}
                </label>
                <input
                  type="text"
                  value={modal.data.key_hint}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, key_hint: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如:sk-xxxxxxxx,可留空"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">官网</label>
                <input
                  value={modal.data.url}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, url: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">
                  API 调用端点 {modal.mode === 'edit' && '(留空使用内置默认值)'}
                </label>
                <input
                  value={modal.data.api_base_url}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, api_base_url: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://..."
                />
                <p className="mt-1 text-xs text-gray-400">主进程发起真实生成请求时使用的基础地址；可改为代理/替代端点。必填，留空将无法发起生成</p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">
                  API Key 获取地址 {modal.mode === 'edit' && '(留空使用内置默认值)'}
                </label>
                <input
                  value={modal.data.api_key_url}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, api_key_url: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://..."
                />
                <p className="mt-1 text-xs text-gray-400">客户端「接入API」按钮点击后跳转的网页，通常为该平台控制台的密钥管理页；非 API 调用地址</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">生成协议</label>
                <select
                  value={modal.data.protocol}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, protocol: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">（未选择）</option>
                  <option value="dashscope">DashScope（通义万相）</option>
                  <option value="ark">Ark（火山引擎 Seedance）</option>
                  <option value="kling">可灵（Kling）</option>
                  <option value="minimax">MiniMax</option>
                  <option value="zhipu">智谱 CogVideoX</option>
                  <option value="runway">Runway Gen-3</option>
                  <option value="luma">Luma Dream Machine</option>
                  <option value="openai">OpenAI Sora</option>
                  <option value="pika">Pika</option>
                </select>
                <p className="mt-1 text-xs text-gray-400">决定请求体格式、鉴权方式与状态解析；必须选择，客户端不再按供应商 ID 推断</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">提交路径</label>
                <input
                  value={modal.data.submit_path}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, submit_path: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={PROTOCOL_DEFAULTS[modal.data.protocol]?.submit ?? '/...'}
                />
                <p className="mt-1 text-xs text-gray-400">相对 API 调用端点的任务提交路径；必填，留空将无法发起生成</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">查询路径</label>
                <input
                  value={modal.data.status_path}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, status_path: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={PROTOCOL_DEFAULTS[modal.data.protocol]?.status ?? '/...'}
                />
                <p className="mt-1 text-xs text-gray-400">相对 API 调用端点的任务查询路径，支持 {'{taskId}'} 占位符；必填，留空将无法查询任务</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">图生视频提交路径 <span className="text-gray-400 text-xs">（可选）</span></label>
                <input
                  value={modal.data.submit_path_i2v}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, submit_path_i2v: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="留空则沿用提交路径"
                />
                <p className="mt-1 text-xs text-gray-400">仅当图生视频需要独立端点时填写（例如可灵 /videos/image2video）；留空或无图生视频需求时自动复用上方"任务提交路径"</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">图生视频查询路径 <span className="text-gray-400 text-xs">（可选）</span></label>
                <input
                  value={modal.data.status_path_i2v}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, status_path_i2v: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="留空则沿用查询路径"
                />
                <p className="mt-1 text-xs text-gray-400">仅当图生视频查询端点与主流程不同时填写，支持 {'{taskId}'} 占位符；留空则复用上方"任务查询路径"</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">来源</label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                  {modal.data.source === 'user' ? '用户（历史数据）' : '系统'}
                </div>
                <p className="mt-1 text-xs text-gray-400">用户自定义资源仅存客户端本地，后台新增固定为系统来源</p>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">排序</label>
                <input
                  type="number"
                  value={modal.data.sort_order}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, sort_order: Number(e.target.value) } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">状态</label>
                <select
                  value={modal.data.is_active ? '1' : '0'}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, is_active: e.target.value === '1' } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="1">启用</option>
                  <option value="0">停用</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >取消</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60"
              >{saving ? '保存中…' : '确认'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
