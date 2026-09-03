import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import type { CardSize, CardStyle, Feature, LayoutColumns, Theme } from '../../types'

// 自定义：DIY 界面，布局调整 + 功能展示位 + 系统偏好。
export default function Customize() {
  const features = useStore((s) => s.features)
  const pinFeature = useStore((s) => s.pinFeature)
  const reorderFeatures = useStore((s) => s.reorderFeatures)
  const storeAutoLaunch = useStore((s) => s.autoLaunch)
  const setAutoLaunchStore = useStore((s) => s.setAutoLaunch)

  // 布局状态
  const columns = useStore((s) => s.columns)
  const cardStyle = useStore((s) => s.cardStyle)
  const cardSize = useStore((s) => s.cardSize)
  const setColumns = useStore((s) => s.setColumns)
  const setCardStyle = useStore((s) => s.setCardStyle)
  const setCardSize = useStore((s) => s.setCardSize)

  // 面板尺寸
  const storePanelW = useStore((s) => s.panelWidth)
  const storePanelH = useStore((s) => s.panelHeight)
  const setPanelSize = useStore((s) => s.setPanelSize)
  // 面板透明度
  const panelOpacity = useStore((s) => s.panelOpacity)
  const setPanelOpacity = useStore((s) => s.setPanelOpacity)
  // 主题
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  const [autoLaunch, setAutoLaunch] = useState(storeAutoLaunch)
  const [panelW, setPanelW] = useState(String(storePanelW))
  const [panelH, setPanelH] = useState(String(storePanelH))

  useEffect(() => {
    window.api?.getAutoLaunch?.().then((v) => setAutoLaunch(v))
  }, [])

  const pinned = features.filter((f) => f.pinned)
  const hidden = features.filter((f) => !f.pinned)

  // 拖拽排序
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      return
    }
    const next = [...pinned]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(targetIdx, 0, moved)
    reorderFeatures([...next, ...hidden])
    setDragIdx(null)
  }

  const togglePin = (f: Feature, toPinned: boolean) => {
    pinFeature(f.id, toPinned)
  }

  const toggleAutoLaunch = async (v: boolean) => {
    setAutoLaunch(v)
    setAutoLaunchStore(v)
    await window.api?.setAutoLaunch?.(v)
  }

  const applyPanelSize = () => {
    const w = Math.max(320, Math.min(3840, Number(panelW) || 1200))
    const h = Math.max(240, Math.min(2160, Number(panelH) || 720))
    setPanelW(String(w))
    setPanelH(String(h))
    setPanelSize(w, h)
    // 立即应用窗口尺寸
    try {
      ;(window as any).api?.expandWindowTo?.({ width: w, height: h })
    } catch {}
  }

  const resetPanelSize = () => {
    setPanelW('1200')
    setPanelH('720')
    setPanelSize(1200, 720)
    try {
      ;(window as any).api?.expandWindowTo?.({ width: 1200, height: 720 })
    } catch {}
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* 主题 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800">主题</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          切换主面板的明色 / 暗色外观。
        </p>
        <div className="mt-3 flex gap-1">
          {([
            { v: 'light' as Theme, label: '☀ 明色' },
            { v: 'dark' as Theme, label: '☾ 暗色' }
          ]).map((o) => (
            <button
              key={o.v}
              onClick={() => setTheme(o.v)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                theme === o.v
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* 布局调整 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-800">布局调整</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          实时调整主面板功能区的网格列数、卡片内容与密度。
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">列数</p>
            <div className="flex gap-1">
              {([2, 3, 4] as LayoutColumns[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setColumns(c)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                    columns === c
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {c} 列
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">卡片样式</p>
            <div className="flex flex-col gap-1">
              {([
                { v: 'icon' as CardStyle, label: '仅图标' },
                { v: 'icon-name' as CardStyle, label: '图标 + 名称' },
                { v: 'icon-name-desc' as CardStyle, label: '图标 + 名称 + 描述' }
              ]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setCardStyle(o.v)}
                  className={`rounded-lg px-2 py-1.5 text-left text-xs ${
                    cardStyle === o.v
                      ? 'bg-brand-50 text-brand-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">卡片尺寸</p>
            <div className="flex gap-1">
              {([
                { v: 'compact' as CardSize, label: '紧凑' },
                { v: 'standard' as CardSize, label: '标准' },
                { v: 'loose' as CardSize, label: '宽松' }
              ]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setCardSize(o.v)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                    cardSize === o.v
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 面板尺寸 */}
      <section className="border-t border-black/5 pt-4">
        <h2 className="text-sm font-semibold text-gray-800">面板尺寸</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          自定义主面板默认宽高，启动时按此尺寸打开。
        </p>
        <div className="mt-3 flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">宽度</span>
            <input
              type="number"
              value={panelW}
              onChange={(e) => setPanelW(e.target.value)}
              className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
              min={320}
              max={3840}
            />
          </label>
          <span className="pb-2 text-xs text-gray-400">×</span>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500">高度</span>
            <input
              type="number"
              value={panelH}
              onChange={(e) => setPanelH(e.target.value)}
              className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-brand-400"
              min={240}
              max={2160}
            />
          </label>
          <button
            onClick={applyPanelSize}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs text-white hover:bg-brand-600"
          >
            应用
          </button>
          <button
            onClick={resetPanelSize}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200"
          >
            恢复默认
          </button>
        </div>
      </section>

      {/* 面板透明度 */}
      <section className="border-t border-black/5 pt-4">
        <h2 className="text-sm font-semibold text-gray-800">面板透明度</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          调节主面板背景的透明程度，数值越低越透明。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={panelOpacity}
            onChange={(e) => setPanelOpacity(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
          <span className="w-12 text-right text-xs text-gray-600">
            {Math.round(panelOpacity * 100)}%
          </span>
        </div>
      </section>

      {/* 功能展示位（拖拽排序） */}
      <section className="border-t border-black/5 pt-4">
        <h2 className="text-sm font-semibold text-gray-800">功能展示位</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          拖拽行重新排序；不常用功能移入「隐藏区」，通过 ···▾ 展开。
        </p>

        <p className="mt-3 mb-1.5 text-[11px] font-medium text-gray-500">默认展示区</p>
        <div className="space-y-1.5">
          {pinned.map((f, i) => (
            <Row
              key={f.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragIdx(null)}
              highlight={dragIdx === i}
            >
              <span className="cursor-grab text-gray-400 active:cursor-grabbing">⠿</span>
              <span className="text-base">{f.icon}</span>
              <span className="flex-1 text-xs text-gray-700">{f.name}</span>
              <button
                onClick={() => togglePin(f, false)}
                className="rounded px-2 py-0.5 text-[11px] text-gray-500 hover:bg-black/5"
              >
                移入隐藏区
              </button>
            </Row>
          ))}
          {pinned.length === 0 && (
            <p className="py-2 text-center text-[11px] text-gray-400">暂无展示功能</p>
          )}
        </div>

        <p className="mt-3 mb-1.5 text-[11px] font-medium text-gray-500">隐藏区</p>
        <div className="space-y-1.5">
          {hidden.map((f) => (
            <Row key={f.id}>
              <span className="text-base">{f.icon}</span>
              <span className="flex-1 text-xs text-gray-700">{f.name}</span>
              <button
                onClick={() => togglePin(f, true)}
                className="rounded px-2 py-0.5 text-[11px] text-brand-600 hover:bg-brand-50"
              >
                移入展示区
              </button>
            </Row>
          ))}
          {hidden.length === 0 && (
            <p className="py-2 text-center text-[11px] text-gray-400">隐藏区为空</p>
          )}
        </div>
      </section>

      {/* 系统偏好 */}
      <section className="border-t border-black/5 pt-4">
        <h2 className="text-sm font-semibold text-gray-800">系统偏好</h2>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
          <div>
            <p className="text-xs text-gray-700">开机自启</p>
            <p className="text-[11px] text-gray-400">登录系统后自动启动，默认关闭</p>
          </div>
          <Toggle checked={autoLaunch} onChange={toggleAutoLaunch} />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
          <div>
            <p className="text-xs text-gray-700">悬浮窗置顶</p>
            <p className="text-[11px] text-gray-400">始终保持在其他窗口之上</p>
          </div>
          <Toggle
            checked={true}
            onChange={(v) => window.api?.setAlwaysOnTop?.(v)}
          />
        </div>
      </section>
    </div>
  )
}

function Row({
  children,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  highlight
}: {
  children: React.ReactNode
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
  highlight?: boolean
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 ${
        highlight
          ? 'border-brand-300 bg-brand-50/40'
          : 'border-black/5'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-brand-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-4' : 'left-0.5'
        }`}
      />
    </button>
  )
}
