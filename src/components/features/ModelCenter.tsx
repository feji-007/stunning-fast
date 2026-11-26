import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { ProviderModel } from '../../types'

/**
 * 步骤一：模型中心（从 ResourceLibrary 中独立出来的模型百科页）
 * 功能：模型列表 → 筛选 → 详情 → 横向对比（最多 4 个）
 */

// ——— 工具函数（可复用） ———
export const scoreColor = (score?: number) => {
  if (!score || score === 0) return 'text-gray-400'
  if (score >= 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-rose-500'
}

export const scoreBg = (score?: number) => {
  if (!score || score === 0) return 'bg-gray-100 text-gray-400'
  if (score >= 70) return 'bg-emerald-50 text-emerald-600 border-emerald-200'
  if (score >= 40) return 'bg-amber-50 text-amber-600 border-amber-200'
  return 'bg-rose-50 text-rose-500 border-rose-200'
}

export const deploymentLabel: Record<string, string> = {
  cloud: '云端调用',
  local: '本地部署',
  hybrid: '混合'
}

export const licenseLabel: Record<string, { cls: string }> = {
  '': { cls: 'bg-gray-50 text-gray-400' },
  'MIT': { cls: 'bg-emerald-50 text-emerald-600' },
  'Apache': { cls: 'bg-emerald-50 text-emerald-600' },
  '商用': { cls: 'bg-rose-50 text-rose-600' },
  '免费额度': { cls: 'bg-sky-50 text-sky-600' },
  'API 付费': { cls: 'bg-amber-50 text-amber-600' },
}

// ——— 主组件 ———
export default function ModelCenter() {
  const providers = useStore((s) => s.providers)

  // 把所有供应商的 models 打平成一个列表
  const allModels = useMemo(() => providers.flatMap((p) => p.models ?? []), [providers])

  // 从所有模型中提取不重复的场景标签（供筛选下拉使用）
  const allScenarios = useMemo(() => {
    const set = new Set<string>()
    allModels.forEach((m) => (m.scenarios ?? []).forEach((s) => set.add(s)))
    return Array.from(set).sort()
  }, [allModels])

  // —— 筛选状态 ——
  const [q, setQ] = useState('')
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [scenarioFilter, setScenarioFilter] = useState<string>('')
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'i2v' | 'first_last' | 'reference'>('all')
  const [deploymentFilter, setDeploymentFilter] = useState<string>('')
  const [commercialFilter, setCommercialFilter] = useState<'all' | 'allowed' | 'restricted'>('all')
  const [sortBy, setSortBy] = useState<'default' | 'score' | 'price'>('default')

  // —— 详情 / 对比 ——
  const [selected, setSelected] = useState<ProviderModel | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  // —— 筛选后的列表 ——
  const filtered = useMemo(() => {
    let r = allModels
    if (providerFilter) r = r.filter((m) => m.provider === providerFilter)
    if (scenarioFilter) r = r.filter((m) => (m.scenarios ?? []).includes(scenarioFilter))
    if (capabilityFilter === 'i2v') r = r.filter((m) => m.supportsI2V)
    if (capabilityFilter === 'first_last') r = r.filter((m) => m.supportsFirstLast)
    if (capabilityFilter === 'reference') r = r.filter((m) => m.supportsReference)
    if (deploymentFilter) r = r.filter((m) => (m.deployment ?? 'cloud') === deploymentFilter)
    if (commercialFilter === 'allowed') r = r.filter((m) => m.commercialAllowed)
    if (commercialFilter === 'restricted') r = r.filter((m) => !m.commercialAllowed)
    if (q.trim()) {
      const kw = q.trim().toLowerCase()
      r = r.filter((m) =>
        m.name.toLowerCase().includes(kw) ||
        m.desc.toLowerCase().includes(kw) ||
        m.id.toLowerCase().includes(kw) ||
        (m.scenarios ?? []).some((s) => s.toLowerCase().includes(kw))
      )
    }
    if (sortBy === 'score') r = [...r].sort((a, b) => (b.verifiedScore ?? 0) - (a.verifiedScore ?? 0))
    if (sortBy === 'price') r = [...r].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    return r
  }, [allModels, providerFilter, scenarioFilter, capabilityFilter, deploymentFilter, commercialFilter, q, sortBy])

  // —— 对比操作 ——
  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 4) return prev // 最多 4 个
      return [...prev, id]
    })
  }

  const compareList = useMemo(
    () => compareIds.map((id) => allModels.find((m) => m.id === id)).filter(Boolean) as ProviderModel[],
    [compareIds, allModels]
  )

  const hasAnyFilter = providerFilter || scenarioFilter || capabilityFilter !== 'all' ||
    deploymentFilter || commercialFilter !== 'all' || q

  const clearFilters = () => {
    setQ(''); setProviderFilter(''); setScenarioFilter('')
    setCapabilityFilter('all'); setDeploymentFilter(''); setCommercialFilter('all'); setSortBy('default')
  }

  // —— 渲染 ——
  return (
    <div className="h-full flex">
      {/* 主列表区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">模型中心</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                共 {allModels.length} 个模型 · 当前筛选 {filtered.length} 个
              </p>
            </div>
            {compareIds.length > 0 && (
              <button
                onClick={() => setShowCompare(true)}
                className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 transition-colors"
              >
                开始对比 ({compareIds.length}/4)
              </button>
            )}
          </div>

          {/* 筛选区 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索模型名称 / ID / 描述 / 场景…"
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">全部供应商</option>
              {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select value={scenarioFilter} onChange={(e) => setScenarioFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">全部场景</option>
              {allScenarios.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select value={capabilityFilter} onChange={(e) => setCapabilityFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">全部能力</option>
              <option value="i2v">支持图生视频</option>
              <option value="first_last">支持首尾帧</option>
              <option value="reference">支持参考图</option>
            </select>
            <select value={deploymentFilter} onChange={(e) => setDeploymentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">全部部署</option>
              <option value="cloud">云端调用</option>
              <option value="local">本地部署</option>
              <option value="hybrid">混合</option>
            </select>
            <select value={commercialFilter} onChange={(e) => setCommercialFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="all">商用不限</option>
              <option value="allowed">允许商用</option>
              <option value="restricted">商用受限</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="default">默认排序</option>
              <option value="score">实测评分高→低</option>
              <option value="price">价格低→高</option>
            </select>
            {hasAnyFilter && (
              <button onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 underline">清除</button>
            )}
          </div>
        </div>

        {/* 卡片列表 */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400 text-sm">
              没有找到匹配的模型
            </div>
          )}
          {filtered.map((m) => {
            const selectedForCompare = compareIds.includes(m.id)
            const provider = providers.find((p) => p.id === m.provider)
            return (
              <div
                key={m.id}
                className={`relative rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedForCompare ? 'border-brand-500 bg-brand-50/30' : 'border-gray-100 bg-white'
                }`}
                onClick={() => setSelected(m)}
              >
                {/* 对比勾选 */}
                <label
                  className="absolute top-3 right-3 cursor-pointer z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedForCompare}
                    onChange={() => toggleCompare(m.id)}
                    disabled={!selectedForCompare && compareIds.length >= 4}
                    className="rounded border-gray-300"
                  />
                  <span className="ml-1 text-[11px] text-gray-500">对比</span>
                </label>

                {/* 名称 + 供应商 */}
                <div className="pr-16">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{m.name}</h3>
                    {provider && (
                      <span className="text-xs text-gray-400">· {provider.name}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{m.id}</p>
                </div>

                {/* 描述 */}
                <p className="mt-2 text-xs text-gray-600 line-clamp-2">{m.desc || '暂无描述'}</p>

                {/* 标签行 */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.scenarios?.slice(0, 3).map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-sky-50 text-sky-600 border border-sky-100">{s}</span>
                  ))}
                  {m.scenarios && m.scenarios.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{m.scenarios.length - 3}</span>
                  )}
                  {m.supportsI2V && <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-100">图生视频</span>}
                  {m.supportsFirstLast && <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-50 text-cyan-600 border border-cyan-100">首尾帧</span>}
                  {m.supportsReference && <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-100">参考图</span>}
                </div>

                {/* 底部：评分 + 授权 */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] border ${scoreBg(m.verifiedScore)}`}>
                      实测 {m.verifiedScore ?? 0}/100
                    </span>
                    {m.license && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${(licenseLabel[m.license] || licenseLabel['']).cls}`}>
                        {m.license}
                      </span>
                    )}
                    {m.commercialAllowed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600">✓ 商用</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-gray-400">
                    <span>{deploymentLabel[m.deployment ?? 'cloud']}</span>
                    {m.price != null && m.price > 0 && (
                      <span className="text-amber-600">¥{m.price}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 详情侧面板 */}
      {selected && (
        <ModelDetailPanel
          model={selected}
          onClose={() => setSelected(null)}
          onToggleCompare={toggleCompare}
          isCompared={compareIds.includes(selected.id)}
          allModels={allModels}
        />
      )}

      {/* 对比弹窗 */}
      {showCompare && (
        <ModelCompareModal
          models={compareList}
          onClose={() => setShowCompare(false)}
          onRemove={toggleCompare}
        />
      )}
    </div>
  )
}

// ——— 详情侧面板（export 供 ResourceLibrary 复用） ———
export function ModelDetailPanel({
  model, onClose, onToggleCompare, isCompared, allModels
}: {
  model: ProviderModel
  onClose: () => void
  onToggleCompare: (id: string) => void
  isCompared: boolean
  allModels: ProviderModel[]
}) {
  const provider = useStore((s) => s.providers).find((p) => p.id === model.provider)

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-gray-100 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">模型详情</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* 基本档案 */}
        <section>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h4 className="text-base font-semibold text-gray-900">{model.name}</h4>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{model.id}</p>
              {provider && <p className="text-xs text-gray-500 mt-1">供应商：{provider.name}</p>}
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${scoreColor(model.verifiedScore)}`}>
                {model.verifiedScore ?? 0}
              </div>
              <div className="text-[10px] text-gray-400">实测评分</div>
            </div>
          </div>
          {model.desc && (
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">{model.desc}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.scenarios?.map((s) => (
              <span key={s} className="px-1.5 py-0.5 rounded text-[11px] bg-sky-50 text-sky-600 border border-sky-100">{s}</span>
            ))}
          </div>
        </section>

        {/* 能力边界 */}
        {model.capabilities && (
          <section>
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">能力边界</h5>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{model.capabilities}</p>
          </section>
        )}

        {/* 支持的能力 */}
        <section>
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">支持的能力</h5>
          <div className="grid grid-cols-2 gap-2">
            <CapRow label="图生视频" value={model.supportsI2V} />
            <CapRow label="首尾帧" value={model.supportsFirstLast} />
            <CapRow label="参考图" value={model.supportsReference} />
          </div>
          {model.resolution && (
            <p className="mt-3 text-xs text-gray-500">分辨率档：{model.resolution}P · 速度档：{model.speed} · 价格：¥{model.price}</p>
          )}
        </section>

        {/* 使用限制 */}
        {model.limitsText && (
          <section>
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">使用限制</h5>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{model.limitsText}</p>
          </section>
        )}

        {/* 授权与部署 */}
        <section>
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">授权与部署</h5>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <InfoRow label="授权类型" value={model.license || '—'} />
            <InfoRow label="商用" value={model.commercialAllowed ? '允许' : '受限'} />
            <InfoRow label="部署方式" value={deploymentLabel[model.deployment ?? 'cloud']} />
          </div>
        </section>

        {/* 来源 */}
        {model.sourceUrl && (
          <section>
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">内容来源</h5>
            <a href={model.sourceUrl} target="_blank" rel="noreferrer"
              className="text-sm text-brand-600 hover:underline break-all">
              {model.sourceUrl}
            </a>
          </section>
        )}
      </div>

      {/* 底部操作 */}
      <div className="border-t border-gray-100 p-4 space-y-2">
        <button
          onClick={() => onToggleCompare(model.id)}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            isCompared
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {isCompared ? '从对比中移除' : '加入对比'}
        </button>
        {model.docsUrl && (
          <a href={model.docsUrl} target="_blank" rel="noreferrer"
            className="block w-full text-center py-2 rounded-lg text-sm text-brand-600 border border-brand-200 hover:bg-brand-50 transition-colors">
            🔗 查看官方文档
          </a>
        )}
        {allModels.length === 0 && <p className="text-xs text-gray-400 text-center mt-2">暂无可对比模型</p>}
      </div>
    </div>
  )
}

function CapRow({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className={`px-2 py-1.5 rounded-lg text-xs flex items-center justify-between ${
      value ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-400 border border-gray-100'
    }`}>
      <span>{label}</span>
      <span>{value ? '✓' : '✗'}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase">{label}</div>
      <div className="text-sm text-gray-700 mt-0.5">{value}</div>
    </div>
  )
}

// ——— 横向对比弹窗（export 供 ResourceLibrary 复用） ———
export function ModelCompareModal({
  models, onClose, onRemove
}: {
  models: ProviderModel[]
  onClose: () => void
  onRemove: (id: string) => void
}) {
  if (models.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-gray-500">请先在模型列表中勾选要对比的模型</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 text-sm bg-gray-100 rounded-lg">关闭</button>
        </div>
      </div>
    )
  }

  // 对比的字段行
  const rows: Array<{ label: string; key: keyof ProviderModel; render?: (m: ProviderModel) => React.ReactNode }> = [
    { label: '供应商', key: 'provider', render: (m) => m.provider },
    { label: '实测评分', key: 'verifiedScore', render: (m) => (
      <span className={`font-bold ${scoreColor(m.verifiedScore)}`}>{m.verifiedScore ?? 0}</span>
    )},
    { label: '价格', key: 'price', render: (m) => m.price != null && m.price > 0 ? `¥${m.price}` : '—' },
    { label: '分辨率', key: 'resolution', render: (m) => m.resolution ? `${m.resolution}P` : '—' },
    { label: '速度档', key: 'speed', render: (m) => m.speed ?? '—' },
    { label: '图生视频', key: 'supportsI2V', render: (m) => m.supportsI2V ? '✓' : '✗' },
    { label: '首尾帧', key: 'supportsFirstLast', render: (m) => m.supportsFirstLast ? '✓' : '✗' },
    { label: '参考图', key: 'supportsReference', render: (m) => m.supportsReference ? '✓' : '✗' },
    { label: '商用允许', key: 'commercialAllowed', render: (m) => m.commercialAllowed ? '✓' : '✗' },
    { label: '部署方式', key: 'deployment', render: (m) => deploymentLabel[m.deployment ?? 'cloud'] },
    { label: '授权类型', key: 'license', render: (m) => m.license || '—' },
    { label: '适用场景', key: 'scenarios', render: (m) => (
      <div className="flex flex-wrap gap-0.5">
        {m.scenarios?.map((s) => (
          <span key={s} className="px-1 py-0.5 rounded text-[10px] bg-sky-50 text-sky-600 border border-sky-100">{s}</span>
        )) || <span className="text-gray-400 text-[10px]">—</span>}
      </div>
    )},
    { label: '能力边界', key: 'capabilities', render: (m) => (
      <p className="text-xs text-gray-600 leading-relaxed max-w-[220px]">{m.capabilities || '—'}</p>
    )},
    { label: '使用限制', key: 'limitsText', render: (m) => (
      <p className="text-xs text-gray-600 leading-relaxed max-w-[220px]">{m.limitsText || '—'}</p>
    )},
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-[90vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">模型横向对比</h3>
            <p className="text-xs text-gray-500 mt-0.5">最多对比 4 个模型</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 w-40 border-b border-gray-200">维度</th>
                {models.map((m) => (
                  <th key={m.id} className="px-4 py-3 text-center border-b border-gray-200 min-w-[180px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                      <span className="text-[11px] text-gray-400">{m.id}</span>
                      <button
                        onClick={() => onRemove(m.id)}
                        className="text-[11px] text-rose-500 hover:underline mt-1"
                      >× 移除</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.key as string} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                  <td className="sticky left-0 bg-inherit px-4 py-2.5 text-xs font-medium text-gray-600 border-b border-gray-100">
                    {row.label}
                  </td>
                  {models.map((m) => (
                    <td key={m.id} className="px-4 py-2.5 text-center text-sm text-gray-700 border-b border-gray-100">
                      {row.render ? row.render(m) : String(m[row.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-100 px-6 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
