// 免费模型资源聚合（步骤二）：列表 / 筛选 / 增删改 / 手动链接校验
import { useEffect, useState } from 'react'
import { freeResourcesApi, type FreeResource } from '../api'

const CATEGORIES: { v: string; l: string }[] = [
  { v: 'open_source',      l: '📦 开源权重' },
  { v: 'vendor_free_tier', l: '🎁 厂商免费额度' },
  { v: 'local_deploy',     l: '💻 本地部署方案' },
  { v: 'online_trial',     l: '🌐 在线试用' },
  { v: 'community',        l: '👥 社区镜像/教程' },
]

const STATUS_BADGE: Record<string, { cls: string; l: string }> = {
  normal:    { cls: 'bg-emerald-100 text-emerald-700',  l: '✓ 正常' },
  restricted: { cls: 'bg-amber-100 text-amber-700',     l: '⚠ 受限' },
  invalid:   { cls: 'bg-rose-100 text-rose-700',        l: '✕ 失效' },
}

interface FormState {
  id: string
  title: string
  category: string
  model_id: string
  url: string
  license: string
  commercial_allowed: boolean
  free_quota: string
  entry_type: string
  region: string
  notes: string
  source_url: string
  sort_order: number
  is_active: boolean
  status: string
}

const blankForm = (): FormState => ({
  id: '', title: '', category: 'vendor_free_tier', model_id: '',
  url: '', license: '', commercial_allowed: false,
  free_quota: '', entry_type: 'official', region: '',
  notes: '', source_url: '', sort_order: 0, is_active: true, status: 'normal'
})

export default function FreeResources() {
  const [list, setList] = useState<FreeResource[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await freeResourcesApi.list({ status: statusFilter, category: catFilter, q })
      setList(r.resources)
    } catch (e: any) {
      alert('加载失败：' + (e.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, catFilter])

  const openCreate = () => {
    setEditingId(null)
    setForm(blankForm())
    setModalOpen(true)
  }
  const openEdit = (r: FreeResource) => {
    setEditingId(r.id)
    setForm({
      id: r.id, title: r.title, category: r.category,
      model_id: r.model_id ?? '', url: r.url, license: r.license,
      commercial_allowed: r.commercial_allowed,
      free_quota: r.free_quota, entry_type: r.entry_type, region: r.region,
      notes: r.notes ?? '', source_url: r.source_url,
      sort_order: r.sort_order, is_active: r.is_active, status: r.status
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.id || !form.title || !form.url) { alert('ID / 标题 / URL 必填'); return }
    setSaving(true)
    try {
      const b = {
        id: form.id, title: form.title, category: form.category,
        modelId: form.model_id || null, url: form.url, license: form.license,
        commercialAllowed: form.commercial_allowed,
        freeQuota: form.free_quota, entryType: form.entry_type, region: form.region,
        notes: form.notes || null, sourceUrl: form.source_url,
        sortOrder: Number(form.sort_order) || 0,
        isActive: form.is_active, status: form.status
      }
      if (editingId) await freeResourcesApi.update(editingId, b)
      else await freeResourcesApi.create(b)
      setModalOpen(false)
      await load()
    } catch (e: any) {
      alert('保存失败：' + (e.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`确认删除 ${id} 吗？`)) return
    try { await freeResourcesApi.remove(id); await load() }
    catch (e: any) { alert('删除失败：' + (e.message ?? e)) }
  }

  const handleCheck = async (id: string) => {
    try {
      const r = await freeResourcesApi.check(id)
      const info = STATUS_BADGE[r.status]?.l ?? r.status
      alert(`校验完成：${info}\n${r.failReason ? '原因：' + r.failReason : ''}`)
      await load()
    } catch (e: any) {
      alert('校验失败：' + (e.message ?? e))
    }
  }

  const submitSearch = () => load()

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          placeholder="搜索 ID / 标题 / URL…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">全部分类</option>
          {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">全部状态</option>
          <option value="normal">正常</option>
          <option value="restricted">受限</option>
          <option value="invalid">失效</option>
        </select>
        <button onClick={submitSearch} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">搜索</button>
        <div className="flex-1" />
        <button onClick={openCreate} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">+ 新增资源</button>
      </div>

      {/* 表格 */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">ID</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">标题</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">分类</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">URL</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">商用</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">状态</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">校验</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">启用</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">加载中…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">暂无免费资源，点击右上角"+ 新增资源"添加第一条</td></tr>
            ) : list.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.normal
              const catLabel = CATEGORIES.find((c) => c.v === r.category)?.l ?? r.category
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.id}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.title}</td>
                  <td className="px-3 py-2 text-gray-600">{catLabel}</td>
                  <td className="px-3 py-2 max-w-[240px] truncate">
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{r.url}</a>
                  </td>
                  <td className="px-3 py-2 text-center">{r.commercial_allowed ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-center"><span className={`rounded px-2 py-0.5 text-xs ${badge.cls}`}>{badge.l}</span></td>
                  <td className="px-3 py-2 text-center text-xs text-gray-500">
                    {r.last_check_at ? new Date(r.last_check_at).toLocaleString('zh-CN', { hour12: false }) : '未校验'}
                    {r.check_count > 0 && <div className="text-[10px]">累计 {r.check_count} 次</div>}
                    {r.fail_reason && <div className="text-[10px] text-rose-500 max-w-[140px] truncate" title={r.fail_reason}>{r.fail_reason}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">{r.is_active ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button onClick={() => handleCheck(r.id)} className="rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50">校验</button>
                    <button onClick={() => openEdit(r)} className="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100">编辑</button>
                    <button onClick={() => handleDelete(r.id)} className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50">删除</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[560px] max-h-[85vh] overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">{editingId ? '编辑免费资源' : '新增免费资源'}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="资源 ID（唯一）" required>
                <input value={form.id} disabled={!!editingId} onChange={(e) => setForm({ ...form, id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100" placeholder="vendor-kling-free" />
              </Field>
              <Field label="标题" required>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="分类" required>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1">
                  {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </Field>
              <Field label="关联模型 ID（可选）">
                <input value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="对应 models.id" />
              </Field>
              <Field label="URL" required full>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="https://…" />
              </Field>
              <Field label="授权">
                <input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="MIT / Apache / 免费额度 / API 付费" />
              </Field>
              <Field label="免费额度">
                <input value={form.free_quota} onChange={(e) => setForm({ ...form, free_quota: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="20 条/天" />
              </Field>
              <Field label="入口类型">
                <select value={form.entry_type} onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1">
                  <option value="official">官方</option>
                  <option value="community">社区</option>
                  <option value="mirror">镜像</option>
                </select>
              </Field>
              <Field label="地区">
                <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="CN / US / 全球" />
              </Field>
              <Field label="来源 URL">
                <input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="信息来源页面" />
              </Field>
              <Field label="排序权重">
                <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="状态">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1">
                  <option value="normal">正常</option>
                  <option value="restricted">受限</option>
                  <option value="invalid">失效</option>
                </select>
              </Field>
              <Field label=" ">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={form.commercial_allowed}
                    onChange={(e) => setForm({ ...form, commercial_allowed: e.target.checked })} />
                  <span>允许商用</span>
                </label>
                <label className="ml-4 inline-flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <span>对客户端可见</span>
                </label>
              </Field>
              <Field label="备注" full>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" rows={2} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-0.5 block text-xs text-gray-500">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  )
}
