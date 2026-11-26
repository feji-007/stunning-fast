// AI 视频工具导购目录管理：列表 / 筛选 / 搜索 / 增删改
import { useEffect, useState } from 'react'
import { toolsApi, type Tool } from '../api'

const DIFFICULTY_OPTIONS = [
  { v: 'beginner', l: '🟢 新手友好' },
  { v: 'intermediate', l: '🟡 中等难度' },
  { v: 'advanced', l: '🔴 进阶专业' },
]
const PRICING_OPTIONS = [
  { v: 'free', l: '免费' },
  { v: 'freemium', l: '免费增值' },
  { v: 'paid', l: '付费' },
  { v: 'enterprise', l: '企业级' },
]

interface FormState {
  id: string
  name: string
  subtitle: string
  provider: string
  official_url: string
  api_docs_url: string
  api_key_url: string
  logo_url: string
  banner_url: string
  categories: string
  scenarios: string
  difficulty: string
  pricing_tier: string
  starting_price: string
  has_api: boolean
  has_web_app: boolean
  has_mobile_app: boolean
  has_open_source: boolean
  synced_audio: boolean
  max_resolution: string
  max_clip_sec: number
  supports_i2v: boolean
  supports_t2v: boolean
  supports_reference: boolean
  short_desc: string
  highlights: string
  limitations: string
  setup_steps: string
  notes: string
  artificial_analysis_score: number
  sort_order: number
  is_active: boolean
}

const blankForm = (): FormState => ({
  id: '', name: '', subtitle: '', provider: '',
  official_url: '', api_docs_url: '', api_key_url: '',
  logo_url: '', banner_url: '',
  categories: '', scenarios: '',
  difficulty: 'beginner', pricing_tier: 'free', starting_price: '',
  has_api: false, has_web_app: true, has_mobile_app: false,
  has_open_source: false, synced_audio: false,
  max_resolution: '', max_clip_sec: 0,
  supports_i2v: false, supports_t2v: true, supports_reference: false,
  short_desc: '', highlights: '', limitations: '', setup_steps: '', notes: '',
  artificial_analysis_score: 0, sort_order: 0, is_active: true
})

export default function Tools() {
  const [list, setList] = useState<Tool[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [pricingFilter, setPricingFilter] = useState('')
  const [diffFilter, setDiffFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await toolsApi.list({
        search: q, pricing_tier: pricingFilter, difficulty: diffFilter, limit: 100
      })
      setList(r.tools ?? [])
      setTotal(r.total ?? 0)
    } catch (e: any) {
      alert('加载失败：' + (e.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(blankForm())
    setModalOpen(true)
  }

  const openEdit = (t: Tool) => {
    setEditingId(t.id)
    setForm({
      id: t.id, name: t.name, subtitle: t.subtitle, provider: t.provider,
      official_url: t.official_url, api_docs_url: t.api_docs_url, api_key_url: t.api_key_url,
      logo_url: t.logo_url, banner_url: t.banner_url,
      categories: t.categories, scenarios: t.scenarios,
      difficulty: t.difficulty, pricing_tier: t.pricing_tier, starting_price: t.starting_price,
      has_api: t.has_api, has_web_app: t.has_web_app, has_mobile_app: t.has_mobile_app,
      has_open_source: t.has_open_source, synced_audio: t.synced_audio,
      max_resolution: t.max_resolution, max_clip_sec: t.max_clip_sec,
      supports_i2v: t.supports_i2v, supports_t2v: t.supports_t2v, supports_reference: t.supports_reference,
      short_desc: t.short_desc, highlights: t.highlights, limitations: t.limitations,
      setup_steps: t.setup_steps, notes: t.notes,
      artificial_analysis_score: t.artificial_analysis_score,
      sort_order: t.sort_order, is_active: t.is_active
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.id || !form.name) { alert('工具 ID 和名称必填'); return }
    setSaving(true)
    try {
      const b: any = {
        id: form.id, name: form.name, subtitle: form.subtitle, provider: form.provider,
        officialUrl: form.official_url, apiDocsUrl: form.api_docs_url, apiKeyUrl: form.api_key_url,
        logoUrl: form.logo_url, bannerUrl: form.banner_url,
        categories: form.categories, scenarios: form.scenarios,
        difficulty: form.difficulty, pricingTier: form.pricing_tier,
        startingPrice: form.starting_price,
        hasApi: form.has_api, hasWebApp: form.has_web_app, hasMobileApp: form.has_mobile_app,
        hasOpenSource: form.has_open_source, syncedAudio: form.synced_audio,
        maxResolution: form.max_resolution, maxClipSec: Number(form.max_clip_sec) || 0,
        supportsI2v: form.supports_i2v, supportsT2v: form.supports_t2v,
        supportsReference: form.supports_reference,
        shortDesc: form.short_desc, highlights: form.highlights,
        limitations: form.limitations, setupSteps: form.setup_steps, notes: form.notes,
        artificialAnalysisScore: Number(form.artificial_analysis_score) || 0,
        sortOrder: Number(form.sort_order) || 0,
        isActive: form.is_active
      }
      if (editingId) {
        delete b.id  // update 不需要传 id
        await toolsApi.update(editingId, b)
      } else {
        await toolsApi.create(b)
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      alert('保存失败：' + (e.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`确认删除工具 ${id} 吗？`)) return
    try {
      await toolsApi.remove(id)
      await load()
    } catch (e: any) {
      alert('删除失败：' + (e.message ?? e))
    }
  }

  const handleSearch = () => load()

  const boolTag = (v: boolean, label: string) =>
    v ? <span className="text-emerald-600 text-xs">✓ {label}</span> : null

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl shadow-float px-4 py-3">
        <span className="text-xs text-gray-500">筛选</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索名称 / 服务商 / 描述…"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 flex-1 max-w-xs"
        />
        <select value={pricingFilter} onChange={(e) => setPricingFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">全部价格</option>
          {PRICING_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <select value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">全部难度</option>
          {DIFFICULTY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <button onClick={handleSearch} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700">搜索</button>
        {(q || pricingFilter || diffFilter) && (
          <button onClick={() => { setQ(''); setPricingFilter(''); setDiffFilter(''); load() }}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">清除</button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-400">共 {total} 条</span>
        <button onClick={openCreate} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">+ 新增工具</button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl shadow-float overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无工具，点击右上角"+ 新增工具"添加第一条</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">服务商</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">价格</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">难度</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">标签</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">能力</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">评分</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">排序</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">启用</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((t) => {
                const diffLabel = DIFFICULTY_OPTIONS.find((o) => o.v === t.difficulty)?.l ?? t.difficulty
                const priceLabel = PRICING_OPTIONS.find((o) => o.v === t.pricing_tier)?.l ?? t.pricing_tier
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 max-w-[140px] truncate">{t.id}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">{t.name}</div>
                      {t.short_desc && <div className="text-xs text-gray-400 max-w-[200px] truncate">{t.short_desc}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.provider || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-600">{priceLabel}</span>
                      {t.starting_price && <div className="text-[10px] text-gray-400 mt-0.5">{t.starting_price}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs">{diffLabel}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {t.categories ? (
                        <div className="flex flex-wrap gap-1">
                          {t.categories.split(',').slice(0, 3).map((c) => (
                            <span key={c} className="px-1.5 py-0.5 rounded text-[10px] bg-sky-50 text-sky-600">{c.trim()}</span>
                          ))}
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5 text-[10px]">
                        {t.has_api && <span className="text-indigo-600">✓ API</span>}
                        {t.has_web_app && <span className="text-sky-600">✓ 网页</span>}
                        {t.has_mobile_app && <span className="text-purple-600">✓ 移动端</span>}
                        {t.has_open_source && <span className="text-amber-600">✓ 开源</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs font-medium ${
                        t.artificial_analysis_score >= 70 ? 'text-emerald-600'
                        : t.artificial_analysis_score >= 40 ? 'text-amber-600' : 'text-gray-400'
                      }`}>{t.artificial_analysis_score || '-'}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{t.sort_order}</td>
                    <td className="px-3 py-2 text-center">{t.is_active ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button onClick={() => openEdit(t)} className="rounded px-2 py-0.5 text-xs bg-brand-50 text-brand-700 hover:bg-brand-100">编辑</button>
                      <button onClick={() => handleDelete(t.id)} className="rounded px-2 py-0.5 text-xs bg-red-50 text-red-600 hover:bg-red-100">删除</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[720px] max-h-[88vh] overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-gray-800">{editingId ? '编辑工具' : '新增工具'}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* 基本信息 */}
              <div className="col-span-2 pt-1 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">基本信息</span>
              </div>
              <Field label="工具 ID" required>
                <input value={form.id} disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 font-mono"
                  placeholder="kling-runway" />
              </Field>
              <Field label="名称" required>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="副标题">
                <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="一句话描述" />
              </Field>
              <Field label="服务商">
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="快手 / 可灵 / Runway" />
              </Field>
              <Field label="分类标签" full>
                <input value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                  placeholder="视频生成, AI, 文生视频（逗号分隔）" />
              </Field>
              <Field label="适用场景" full>
                <input value={form.scenarios} onChange={(e) => setForm({ ...form, scenarios: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                  placeholder="shorts, talking-head, 产品展示, 动画（逗号分隔）" />
              </Field>
              <Field label="简短描述" full>
                <input value={form.short_desc} onChange={(e) => setForm({ ...form, short_desc: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>

              {/* 链接 */}
              <div className="col-span-2 pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">链接地址</span>
              </div>
              <Field label="官网 URL" full>
                <input value={form.official_url} onChange={(e) => setForm({ ...form, official_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="https://…" />
              </Field>
              <Field label="API 文档 URL">
                <input value={form.api_docs_url} onChange={(e) => setForm({ ...form, api_docs_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="API Key 申请 URL">
                <input value={form.api_key_url} onChange={(e) => setForm({ ...form, api_key_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="Logo URL">
                <input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="Banner URL">
                <input value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>

              {/* 定价与难度 */}
              <div className="col-span-2 pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">定价与难度</span>
              </div>
              <Field label="定价模式">
                <select value={form.pricing_tier} onChange={(e) => setForm({ ...form, pricing_tier: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1">
                  {PRICING_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="起步价格">
                <input value={form.starting_price} onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="¥0 / $20 起" />
              </Field>
              <Field label="上手难度">
                <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1">
                  {DIFFICULTY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="排序权重">
                <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>

              {/* 支持能力 */}
              <div className="col-span-2 pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">平台支持</span>
              </div>
              <div className="col-span-2 flex flex-wrap gap-4 pt-1">
                <Checkbox label="有 API" checked={form.has_api} onChange={(v) => setForm({ ...form, has_api: v })} />
                <Checkbox label="网页版" checked={form.has_web_app} onChange={(v) => setForm({ ...form, has_web_app: v })} />
                <Checkbox label="移动端" checked={form.has_mobile_app} onChange={(v) => setForm({ ...form, has_mobile_app: v })} />
                <Checkbox label="开源" checked={form.has_open_source} onChange={(v) => setForm({ ...form, has_open_source: v })} />
                <Checkbox label="语音同步" checked={form.synced_audio} onChange={(v) => setForm({ ...form, synced_audio: v })} />
                <Checkbox label="启用" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="col-span-2 pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">视频生成能力</span>
              </div>
              <div className="col-span-2 flex flex-wrap gap-4 pt-1">
                <Checkbox label="文生视频" checked={form.supports_t2v} onChange={(v) => setForm({ ...form, supports_t2v: v })} />
                <Checkbox label="图生视频" checked={form.supports_i2v} onChange={(v) => setForm({ ...form, supports_i2v: v })} />
                <Checkbox label="参考图" checked={form.supports_reference} onChange={(v) => setForm({ ...form, supports_reference: v })} />
              </div>
              <Field label="最高分辨率">
                <input value={form.max_resolution} onChange={(e) => setForm({ ...form, max_resolution: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1" placeholder="4K / 1080P" />
              </Field>
              <Field label="最大时长（秒）">
                <input type="number" value={form.max_clip_sec} onChange={(e) => setForm({ ...form, max_clip_sec: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>

              {/* 内容详情 */}
              <div className="col-span-2 pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-500">内容详情（支持 Markdown）</span>
              </div>
              <Field label="亮点" full>
                <textarea value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })}
                  rows={2} className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="局限" full>
                <textarea value={form.limitations} onChange={(e) => setForm({ ...form, limitations: e.target.value })}
                  rows={2} className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="使用步骤" full>
                <textarea value={form.setup_steps} onChange={(e) => setForm({ ...form, setup_steps: e.target.value })}
                  rows={3} className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="备注" full>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
              <Field label="综合评分 (0-100)">
                <input type="number" min={0} max={100}
                  value={form.artificial_analysis_score}
                  onChange={(e) => setForm({ ...form, artificial_analysis_score: Number(e.target.value) })}
                  className="w-full rounded border border-gray-300 px-2 py-1" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50">
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

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      {label}
    </label>
  )
}
