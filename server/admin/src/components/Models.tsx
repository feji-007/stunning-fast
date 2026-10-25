// 模型管理:列表/新增/编辑/删除;分页;所有字段（含能力、默认参数）均由后台维护
import { useEffect, useMemo, useState } from 'react'
import { modelsApi, providersApi } from '../api'
import SortableTh from './SortableTh'
import Pagination from './Pagination'

interface Model {
  id: string
  provider_id: string
  name: string
  type: string
  description: string
  supports_i2v: boolean
  supports_first_last: boolean
  supports_reference: boolean
  resolution: string
  speed: string
  price: number | string
  default_resolution: string
  default_ratio: string
  default_duration: string
  docs_url: string
  source: string
  sort_order: number
  is_active: boolean
}

interface Provider {
  id: string
  name: string
}

interface Form {
  id: string
  provider_id: string
  name: string
  type: string
  description: string
  supports_i2v: boolean
  supports_first_last: boolean
  supports_reference: boolean
  resolution: string
  speed: string
  price: number | string
  default_resolution: string
  default_ratio: string
  default_duration: string
  docs_url: string
  source: string
  sort_order: number
  is_active: boolean
}

const EMPTY_FORM: Form = {
  id: '',
  provider_id: '',
  name: '',
  type: 'video',
  description: '',
  supports_i2v: false,
  supports_first_last: false,
  supports_reference: false,
  resolution: '720',
  speed: '60',
  price: '0',
  default_resolution: '720P',
  default_ratio: '16:9',
  default_duration: '5',
  docs_url: '',
  source: 'system',
  sort_order: 0,
  is_active: true
}

const MODEL_GETTERS: Record<string, (m: Model) => string | number> = {
  id: (m) => m.id,
  provider: (m) => m.provider_id,
  name: (m) => m.name,
  type: (m) => m.type,
  source: (m) => m.source ?? 'system',
  price: (m) => Number(m.price) || 0,
  sort: (m) => m.sort_order ?? 0
}

export default function Models() {
  const [list, setList] = useState<Model[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; data: Form; id?: string }>(null)
  const [saving, setSaving] = useState(false)
  // 过滤
  const [filterProvider, setFilterProvider] = useState('')
  const [filterName, setFilterName] = useState('')
  // 排序（client 侧; 服务器先按 sort_order/id 返回）
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
    Promise.all([
      modelsApi.list({ page: targetPage, pageSize: targetSize }),
      providersApi.list()
    ])
      .then(([m, p]) => {
        setList(m.models ?? [])
        setTotal(m.total ?? 0)
        setPage(m.page ?? targetPage)
        setPageSize(m.pageSize ?? targetSize)
        setTotalPages(m.totalPages ?? 1)
        // providers 可能分页也可能不分页, p.providers 中保留全量
        setProviders(p.providers ?? [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id

  const filteredList = useMemo(() => {
    let r = list
    if (filterProvider) r = r.filter((m) => m.provider_id === filterProvider)
    if (filterName.trim()) {
      const kw = filterName.trim().toLowerCase()
      r = r.filter((m) => m.name.toLowerCase().includes(kw) || m.id.toLowerCase().includes(kw))
    }
    const getter = MODEL_GETTERS[sortField] ?? MODEL_GETTERS.sort
    const dir = sortOrder === 'asc' ? 1 : -1
    return [...r].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [list, filterProvider, filterName, sortField, sortOrder])

  const onSort = (field: string) => {
    if (field === sortField) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const remove = (m: Model) => {
    if (!confirm(`确认删除模型「${m.name}」?`)) return
    modelsApi
      .remove(m.id)
      .then(() => load(page === 1 ? 1 : (filteredList.length === 1 ? Math.max(1, page - 1) : page), pageSize))
      .catch((e: Error) => alert(e.message))
  }

  const save = () => {
    if (!modal) return
    if (!modal.data.provider_id) { alert('请选择供应商'); return }
    if (!modal.data.name.trim()) { alert('请填写模型名称'); return }
    setSaving(true)
    // 后端 API 接收 camelCase: id / providerId / name / type / description /
    //   supportsI2V / supportsFirstLast / supportsReference / resolution / speed /
    //   price / defaultResolution / defaultRatio / defaultDuration / source / sortOrder / isActive
    const d = modal.data
    const body: any = {
      providerId: d.provider_id,
      name: d.name,
      type: d.type,
      description: d.description,
      supportsI2V: !!d.supports_i2v,
      supportsFirstLast: !!d.supports_first_last,
      supportsReference: !!d.supports_reference,
      resolution: Number(d.resolution) || 0,
      speed: Number(d.speed) || 0,
      price: Number(d.price) || 0,
      defaultResolution: d.default_resolution,
      defaultRatio: d.default_ratio,
      defaultDuration: d.default_duration,
      docsUrl: d.docs_url,
      source: d.source,
      sortOrder: Number(d.sort_order) || 0,
      isActive: d.is_active
    }
    if (modal.mode === 'create') {
      body.id = (d.id || '').trim()
      if (!body.id) { alert('请填写模型 ID'); setSaving(false); return }
    }
    const op = modal.mode === 'create' ? modelsApi.create(body) : modelsApi.update(modal.id!, body)
    op
      .then(() => { setModal(null); load(page, pageSize) })
      .catch((e: Error) => alert(e.message))
      .finally(() => setSaving(false))
  }

  // 能力字段全部由数据库维护，后台可随时修改，客户端不再做本地覆盖
  const CapCheckbox: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  )

  const FilterInfo = (
    <span className="ml-auto text-xs text-gray-400">
      共 {total} 条{ (filterProvider || filterName) ? `，匹配 ${filteredList.length} 条` : '' }
    </span>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">模型管理</h2>
        <button
          onClick={() => setModal({ mode: 'create', data: { ...EMPTY_FORM, provider_id: providers[0]?.id ?? '' } })}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700"
        >
          + 新增模型
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <div className="mb-4 flex items-center gap-3 bg-white rounded-xl shadow-float px-4 py-3">
        <span className="text-xs text-gray-500">筛选</span>
        <select
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">全部服务商</option>
          {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        <input
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          placeholder="按名称 / ID 搜索"
          className="flex-1 max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {FilterInfo}
        {(filterProvider || filterName) && (
          <button
            onClick={() => { setFilterProvider(''); setFilterName('') }}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
          >清除</button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 text-center text-gray-400">{total === 0 ? '暂无数据' : '无匹配结果'}</div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <SortableTh label="ID" field="id" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="供应商" field="provider" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="名称" field="name" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="类型" field="type" current={sortField} order={sortOrder} onSort={onSort} />
                <SortableTh label="来源" field="source" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-left">说明</th>
                <th className="px-4 py-3 text-left">图生视频</th>
                <th className="px-4 py-3 text-left">首尾帧</th>
                <th className="px-4 py-3 text-left">参考图</th>
                <th className="px-4 py-3 text-left">分辨率</th>
                <th className="px-4 py-3 text-left">速度</th>
                <SortableTh label="价格" field="price" current={sortField} order={sortOrder} onSort={onSort} />
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.id}</td>
                  <td className="px-4 py-3 text-gray-700">{providerName(m.provider_id)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                  <td className="px-4 py-3 text-gray-600">{m.type || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      m.source === 'user' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {m.source === 'user' ? '用户' : '系统'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{m.description || '-'}</td>
                  <td className="px-4 py-3">
                    {m.supports_i2v
                      ? <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-600">支持</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">不支持</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.supports_first_last
                      ? <span className="px-2 py-0.5 rounded text-xs bg-cyan-50 text-cyan-600">支持</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {m.supports_reference
                      ? <span className="px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-600">支持</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{m.resolution || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.speed || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.price ?? '-'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => setModal({
                        mode: 'edit', id: m.id,
                        data: {
                          id: m.id, provider_id: m.provider_id, name: m.name, type: m.type || 'video',
                          description: m.description || '', supports_i2v: m.supports_i2v,
                          supports_first_last: m.supports_first_last, supports_reference: m.supports_reference,
                          resolution: m.resolution || '', speed: m.speed || '',
                          price: String(m.price ?? '0'),
                          default_resolution: m.default_resolution || '',
                          default_ratio: m.default_ratio || '',
                          default_duration: m.default_duration || '',
                          docs_url: m.docs_url || '',
                          source: m.source ?? 'system',
                          sort_order: m.sort_order ?? 0,
                          is_active: m.is_active
                        }
                      })}
                      className="px-2 py-1 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100"
                    >编辑</button>
                    <button
                      onClick={() => remove(m)}
                      className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                    >删除</button>
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
              {modal.mode === 'create' ? '新增模型' : '编辑模型'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {modal.mode === 'create' && (
                <div className="col-span-2">
                  <label className="block text-sm text-gray-700 mb-1">模型 ID（唯一标识，创建后不可修改）</label>
                  <input
                    value={modal.data.id}
                    onChange={(e) => setModal({ ...modal, data: { ...modal.data, id: e.target.value.trim() } })}
                    placeholder="例如: volcano-hunyuan-video-1.3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
                  />
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">供应商</label>
                <select
                  value={modal.data.provider_id}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, provider_id: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">请选择</option>
                  {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">名称</label>
                <input
                  value={modal.data.name}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">类型</label>
                <input
                  value={modal.data.type}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, type: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">来源</label>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-500">
                  {modal.data.source === 'user' ? '用户（历史数据）' : '系统'}
                </div>
                <p className="mt-1 text-xs text-gray-400">所有字段（含能力与默认参数）均由后台数据库统一管理，客户端不再做本地覆盖</p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">说明</label>
                <textarea
                  value={modal.data.description}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, description: e.target.value } })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-700 mb-1">了解模型详情 URL</label>
                <input
                  value={modal.data.docs_url}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, docs_url: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="https://...(客户端「了解模型详情」按钮跳转地址，留空则不显示跳转)"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">分辨率</label>
                <input
                  value={modal.data.resolution}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, resolution: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">速度</label>
                <input
                  value={modal.data.speed}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, speed: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">价格</label>
                <input
                  type="number"
                  value={modal.data.price}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, price: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">默认分辨率</label>
                <input
                  value={modal.data.default_resolution}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, default_resolution: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如 1080P（留空则沿用上次选择）"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">默认比例</label>
                <input
                  value={modal.data.default_ratio}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, default_ratio: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如 16:9（留空则沿用上次选择）"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">默认时长</label>
                <input
                  value={modal.data.default_duration}
                  onChange={(e) => setModal({ ...modal, data: { ...modal.data, default_duration: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="例如 5（秒，留空则沿用上次选择）"
                />
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
              <div className="col-span-2 grid grid-cols-4 gap-3 pt-2 border-t border-gray-100">
                <CapCheckbox
                  label="支持图生视频 (i2v)"
                  checked={modal.data.supports_i2v}
                  onChange={(v) => setModal({ ...modal!, data: { ...modal!.data, supports_i2v: v } })}
                />
                <CapCheckbox
                  label="首尾帧模式"
                  checked={modal.data.supports_first_last}
                  onChange={(v) => setModal({ ...modal!, data: { ...modal!.data, supports_first_last: v } })}
                />
                <CapCheckbox
                  label="参考图模式"
                  checked={modal.data.supports_reference}
                  onChange={(v) => setModal({ ...modal!, data: { ...modal!.data, supports_reference: v } })}
                />
                <CapCheckbox
                  label="启用（客户端可见）"
                  checked={modal.data.is_active}
                  onChange={(v) => setModal({ ...modal!, data: { ...modal!.data, is_active: v } })}
                />
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
