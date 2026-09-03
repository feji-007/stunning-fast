import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import type { CardSize, CardStyle, FeatureId, LayoutColumns } from '../types'
import VideoGeneration from './features/VideoGeneration'
import ResourceLibrary from './features/ResourceLibrary'
import Customize from './features/Customize'
import PlaceholderFeature from './features/PlaceholderFeature'

export default function MainPanel() {
  const features = useStore((s) => s.features)
  const activeFeature = useStore((s) => s.activeFeature)
  const openFeature = useStore((s) => s.openFeature)
  const backToPanel = useStore((s) => s.backToPanel)
  const user = useStore((s) => s.user)
  const setModal = useStore((s) => s.setModal)
  const featureViewMode = useStore((s) => s.featureViewMode)
  const toggleFeatureViewMode = useStore((s) => s.toggleFeatureViewMode)
  const panelOpacity = useStore((s) => s.panelOpacity)

  const pinned = features.filter((f) => f.pinned)
  const hidden = features.filter((f) => !f.pinned)
  const [showAll, setShowAll] = useState(false)
  const [showHiddenCards, setShowHiddenCards] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuBtnRef = useRef<HTMLButtonElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [morePos, setMorePos] = useState<{ top: number; left: number } | null>(null)
  const setExpanded = useStore((s) => s.setExpanded)
  const [isMaximized, setIsMaximized] = useState(false)

  // 响应式 tabs：根据容器宽度自动展示/隐藏功能
  const tabsRowRef = useRef<HTMLDivElement>(null)
  const tabWidthsRef = useRef<Map<string, number>>(new Map())
  const [visibleCount, setVisibleCount] = useState(999)

  const isSlimBar = activeFeature === null

  // 计算可见 tab 数量
  const recalc = () => {
    const row = tabsRowRef.current
    if (!row || tabWidthsRef.current.size === 0) return
    const rowWidth = row.clientWidth
    const PADDING = 24 // px-3 两侧
    const GAP = 4      // gap-1
    const BACK_BTN = activeFeature !== null ? 56 : 0
    const MORE_BTN = 68
    const availableWidth = rowWidth - PADDING - BACK_BTN
    let totalWidth = 0
    for (const f of features) {
      totalWidth += (tabWidthsRef.current.get(f.id) ?? 80) + GAP
    }
    if (totalWidth <= availableWidth) {
      setVisibleCount(features.length)
      return
    }
    const spaceForTabs = availableWidth - MORE_BTN
    let acc = 0
    let count = 0
    for (const f of features) {
      const w = (tabWidthsRef.current.get(f.id) ?? 80) + GAP
      if (acc + w <= spaceForTabs) { acc += w; count++ } else break
    }
    setVisibleCount(count)
  }
  const recalcRef = useRef(recalc)
  recalcRef.current = recalc

  // 首次渲染测量所有 tab 宽度并计算
  useLayoutEffect(() => {
    const row = tabsRowRef.current
    if (!row) return
    row.querySelectorAll('[data-tab-id]').forEach(tab => {
      const id = tab.getAttribute('data-tab-id')
      if (id) tabWidthsRef.current.set(id, (tab as HTMLElement).offsetWidth)
    })
    recalc()
  })

  // 容器尺寸变化时重新计算
  useEffect(() => {
    const row = tabsRowRef.current
    if (!row) return
    const ro = new ResizeObserver(() => recalcRef.current())
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  // 关闭用户菜单：外部点击
  useEffect(() => {
    if (!showUserMenu) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (userMenuBtnRef.current?.contains(t) || userMenuRef.current?.contains(t)) return
      setShowUserMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showUserMenu])

  // 关闭"更多"菜单：外部点击
  useEffect(() => {
    if (!showAll) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        moreBtnRef.current?.contains(target) ||
        moreMenuRef.current?.contains(target)
      ) {
        return
      }
      setShowAll(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showAll])

  // 计算用户菜单位置：toolbar 模式下需 openDropdown 扩展窗口；功能区模式下面板已足够
  useEffect(() => {
    let cancelled = false
    if (!showUserMenu) {
      setUserMenuPos(null)
      return
    }
    const update = async () => {
      const btn = userMenuBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 160
      const dropdownHeight = 156
      let left = rect.right - dropdownWidth
      left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))
      const top = rect.bottom + 4
      // 仅 toolbar 细长栏模式需要扩展窗口高度；功能区/功能页模式面板已足够大
      if (!featureViewMode && activeFeature === null) {
        try {
          await (window as any).api?.openDropdown?.(dropdownHeight)
        } catch {}
      }
      if (cancelled) return
      setUserMenuPos({ top, left })
    }
    update()
    const onResize = () => {
      if (!showUserMenu) return
      const btn = userMenuBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 160
      let left = rect.right - dropdownWidth
      left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))
      const top = rect.bottom + 4
      setUserMenuPos({ top, left })
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [showUserMenu])

  // 用户菜单关闭时恢复窗口（仅 toolbar 细长栏模式曾扩展过）
  useEffect(() => {
    if (!showUserMenu && !featureViewMode && activeFeature === null) {
      try {
        ;(window as any).api?.closeDropdown?.()
      } catch {}
    }
  }, [showUserMenu, featureViewMode, activeFeature])

  // 计算"更多"菜单位置
  useEffect(() => {
    let cancelled = false
    if (!showAll) {
      setMorePos(null)
      return
    }
    const update = async () => {
      const btn = moreBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 176
      const dropdownHeight = 120
      let left = rect.right - dropdownWidth
      left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))
      const top = rect.bottom + 4
      // 仅 toolbar 细长栏模式需要扩展窗口高度；功能区/功能页模式面板已足够大
      if (!featureViewMode && activeFeature === null) {
        try {
          await (window as any).api?.openDropdown?.(dropdownHeight)
        } catch {}
      }
      if (cancelled) return
      setMorePos({ top, left })
    }
    update()
    const onResize = () => {
      if (!showAll) return
      const btn = moreBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const dropdownWidth = 176
      let left = rect.right - dropdownWidth
      left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))
      const top = rect.bottom + 4
      setMorePos({ top, left })
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [showAll])

  // "更多"菜单关闭时恢复窗口（仅 toolbar 细长栏模式曾扩展过）
  useEffect(() => {
    if (!showAll && !featureViewMode && activeFeature === null) {
      try {
        ;(window as any).api?.closeDropdown?.()
      } catch {}
    }
  }, [showAll, featureViewMode, activeFeature])

  const renderFeaturePage = (id: FeatureId) => {
    switch (id) {
      case 'video':
        return <VideoGeneration />
      case 'library':
        return <ResourceLibrary />
      case 'custom':
        return <Customize />
      default:
        return <PlaceholderFeature id={id} />
    }
  }

  useEffect(() => {
    let mounted = true
    async function checkMax() {
      try {
        const max = await window.api?.isMaximized?.()
        if (mounted) setIsMaximized(!!max)
      } catch {}
    }
    // run once on mount
    checkMax()
    const onResize = async () => {
      try {
        const max = await window.api?.isMaximized?.()
        if (mounted) setIsMaximized(!!max)
      } catch {}
    }
    window.addEventListener('resize', onResize)
    return () => {
      mounted = false
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-visible rounded-2xl border border-black/5 shadow-float backdrop-blur-md"
      style={{ backgroundColor: `rgb(var(--panel-bg) / ${panelOpacity})` } as React.CSSProperties}
    >
      {/* Top bar - 始终显示，功能区展示模式下也保留 */}
      <header
        className="flex items-center justify-between border-b border-black/5 px-4 py-2.5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="text-sm font-semibold text-gray-800">绝色</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 用户菜单：按钮 + Portal 下拉 */}
          <div className="shrink-0">
            <button
              ref={userMenuBtnRef}
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-black/5"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-600">
                {user.loggedIn ? user.username.slice(0, 1).toUpperCase() : '?'}
              </span>
              <span className="text-gray-500">{user.loggedIn ? user.username : '未登录'}</span>
              <span className="text-gray-400">▾</span>
            </button>
            {showUserMenu && userMenuPos &&
              createPortal(
                <div
                  ref={userMenuRef}
                  style={{ top: userMenuPos.top, left: userMenuPos.left }}
                  className="fixed z-[9999] w-40 overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-float"
                >
                  {/* 顺序：登录/注册 → 设置 → 用户反馈 → (退出登录 仅登录态显示) */}
                  {!user.loggedIn && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        setModal('login')
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-black/5"
                    >
                      🔑 登录 / 注册
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      if (!user.loggedIn) setModal('login')
                      else setModal('settings')
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-black/5"
                  >
                    ⚙️ 设置
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      setModal('feedback')
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-black/5"
                  >
                    💬 意见反馈
                  </button>
                  {user.loggedIn && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        useStore.getState().logout()
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-black/5"
                    >
                      🚪 退出登录
                    </button>
                  )}
                </div>,
                document.body
              )}
          </div>

          {/* 网格图标：登录功能右侧，切换功能区展示 */}
          <button
            onClick={() => {
              setShowAll(false)
              setShowHiddenCards(false)
              toggleFeatureViewMode()
            }}
            title="功能区展示"
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-black/5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            ▦
          </button>

          <div className="flex items-center gap-1 ml-3">
            <button
              title="最小化"
              onClick={() => {
                window.api?.minimizeWindow?.()
              }}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-200"
            >
              ―
            </button>

            <button
              title="最大化"
              onClick={async () => {
                try {
                  await window.api?.toggleMaximizeWindow?.()
                  const max = await window.api?.isMaximized?.()
                  setIsMaximized(!!max)
                  // 最大化时自动进入视频生成面板
                  if (max && activeFeature === null) {
                    openFeature('video')
                  }
                } catch {}
              }}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-200"
            >
              □
            </button>

            <button
              title="收起到悬浮窗"
              onClick={async () => {
                // Prevent immediate hover-driven re-expand for a short window.
                ;(window as any).__suppressHoverUntil = Date.now() + 1000
                // 保存当前状态以便展开后恢复
                useStore.getState().saveStateBeforeCollapse()
                setExpanded(false)
                try {
                  await window.api?.collapseWindow?.()
                } catch {}
              }}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="rounded px-2 py-1 text-sm text-white bg-brand-600 hover:bg-brand-700 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {/* 功能区展示模式：在头部下方显示功能区网格；否则显示 tabs + 功能页 */}
      {featureViewMode ? (
        <main
          className="relative flex-1 overflow-auto scroll-thin"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <FeatureSelection
            features={showHiddenCards ? [...pinned, ...hidden] : pinned}
            onOpen={(id) => {
              // 退出功能区展示模式，在正常模式下打开功能页
              useStore.setState({ featureViewMode: false })
              openFeature(id)
            }}
          />
          {/* 更多功能：右下角，以卡片模式展开未固定的功能 */}
          {hidden.length > 0 && (
            <div
              className="absolute bottom-3 right-3"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <button
                onClick={() => setShowHiddenCards((v) => !v)}
                className="rounded-lg bg-white/90 px-3 py-1.5 text-xs text-gray-600 shadow-float hover:bg-white"
                title={showHiddenCards ? '收起更多功能' : '展开更多功能'}
              >
                {showHiddenCards ? '收起 ▴' : '更多 ▾'}
              </button>
            </div>
          )}
        </main>
      ) : (
        <>
      {/* Tabs row (feature entries) — 响应式：宽度足够时自动展示更多功能 */}
      <div ref={tabsRowRef} className="flex items-center gap-1 border-b border-black/5 px-3 py-2">
        {activeFeature !== null && (
          <button
            onClick={backToPanel}
            className="mr-1 shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-black/5"
            title="返回主功能面板"
          >
            ← 返回
          </button>
        )}
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          {features.slice(0, visibleCount).map((f) => (
            <FeatureTab
              key={f.id}
              feature={f}
              active={activeFeature === f.id}
              onClick={() =>
                activeFeature === f.id ? backToPanel() : openFeature(f.id)
              }
            />
          ))}
        </div>
        {/* 更多功能：仅有溢出时显示 */}
        {visibleCount < features.length && (
          <div className="relative shrink-0">
            <button
              ref={moreBtnRef}
              onClick={() => setShowAll((v) => !v)}
              className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-black/5"
              title="更多功能"
            >
              ···▾
            </button>
            {showAll && morePos &&
              createPortal(
                <div
                  ref={moreMenuRef}
                  style={{ top: morePos.top, left: morePos.left }}
                  className="fixed z-[9999] w-44 overflow-visible rounded-lg border border-black/5 bg-white py-1 shadow-float"
                >
                  {features.slice(visibleCount).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setShowAll(false)
                        openFeature(f.id)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-black/5"
                    >
                      <span>{f.icon}</span>
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )}
          </div>
        )}
      </div>

      {/* Body: 仅在功能页模式下显示，细长栏模式隐藏 */}
      {!isSlimBar && (
        <main className="relative flex-1 overflow-hidden">
          <div className="h-full w-full overflow-auto scroll-thin p-4">
            {activeFeature && renderFeaturePage(activeFeature)}
          </div>
        </main>
      )}
        </>
      )}
    </div>
  )
}

function FeatureTab({
  feature,
  active,
  onClick
}: {
  feature: { id: FeatureId; name: string; icon: string }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      data-tab-id={feature.id}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-brand-50 font-medium text-brand-600'
          : 'text-gray-600 hover:bg-black/5'
      }`}
    >
      <span>{feature.icon}</span>
      <span>{feature.name}</span>
    </button>
  )
}

function FeatureSelection({
  features,
  onOpen
}: {
  features: { id: FeatureId; name: string; icon: string; desc: string; pinned: boolean }[]
  onOpen: (id: FeatureId) => void
}) {
  const columns = useStore((s) => s.columns)
  const cardStyle = useStore((s) => s.cardStyle)
  const cardSize = useStore((s) => s.cardSize)

  const colClass = COLUMN_CLASSES[columns]
  const size = SIZE_CLASSES[cardSize]
  const isIconOnly = cardStyle === 'icon'

  return (
    <div className="h-full w-full p-5">
      <div className={`grid h-full auto-rows-min place-content-center ${size.gap} ${colClass}`}>
        {features.map((f) => (
          <button
            key={f.id}
            onClick={() => onOpen(f.id)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={`group flex flex-col items-start ${isIconOnly ? 'items-center justify-center' : ''} ${size.pad} ${size.gap} rounded-xl border border-black/5 bg-white text-left transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-float`}
          >
            <span className={`grid ${size.icon} shrink-0 place-items-center rounded-lg bg-brand-50 ${size.iconText}`}>
              {f.icon}
            </span>
            {cardStyle !== 'icon' && (
              <div className={isIconOnly ? '' : 'flex-1'}>
                <p className={`${size.title} font-semibold text-gray-800 ${isIconOnly ? 'text-center' : ''}`}>{f.name}</p>
                {cardStyle === 'icon-name-desc' && (
                  <p className={`mt-1 line-clamp-3 ${size.desc} leading-relaxed text-gray-400 ${isIconOnly ? 'text-center' : ''}`}>
                    {f.desc}
                  </p>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// 布局样式映射：使用完整静态类名，确保 Tailwind JIT 能扫描到
const COLUMN_CLASSES: Record<LayoutColumns, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4'
}

const SIZE_CLASSES: Record<CardSize, {
  pad: string
  gap: string
  icon: string
  iconText: string
  title: string
  desc: string
}> = {
  compact: { pad: 'p-3', gap: 'gap-2', icon: 'h-9 w-9', iconText: 'text-lg', title: 'text-xs', desc: 'text-[10px]' },
  standard: { pad: 'p-4', gap: 'gap-3', icon: 'h-11 w-11', iconText: 'text-2xl', title: 'text-sm', desc: 'text-xs' },
  loose: { pad: 'p-5', gap: 'gap-4', icon: 'h-14 w-14', iconText: 'text-3xl', title: 'text-base', desc: 'text-sm' }
}

// 主面板快捷布局切换：列数 / 卡片样式 / 卡片尺寸
function LayoutQuickSwitch() {
  const columns = useStore((s) => s.columns)
  const cardStyle = useStore((s) => s.cardStyle)
  const cardSize = useStore((s) => s.cardSize)
  const setColumns = useStore((s) => s.setColumns)
  const setCardStyle = useStore((s) => s.setCardStyle)
  const setCardSize = useStore((s) => s.setCardSize)

  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // 外部点击关闭
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 计算下拉位置：先 await openDropdown 扩展窗口，再渲染
  useEffect(() => {
    let cancelled = false
    if (!open) {
      setPos(null)
      return
    }
    const update = async () => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const w = 220
      const h = 180
      let left = rect.right - w
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      const top = rect.bottom + 4
      // 先扩展窗口高度
      try {
        await (window as any).api?.openDropdown?.(h)
      } catch {}
      if (cancelled) return
      setPos({ top, left })
    }
    update()
    const onResize = () => {
      if (!open) return
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const w = 220
      let left = rect.right - w
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
      const top = rect.bottom + 4
      setPos({ top, left })
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // 下拉关闭时恢复窗口
  useEffect(() => {
    if (!open) {
      try {
        ;(window as any).api?.closeDropdown?.()
      } catch {}
    }
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-black/5"
        title="布局设置"
      >
        🎛️
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[9999] w-56 overflow-visible rounded-lg border border-black/5 bg-white p-3 shadow-float"
          >
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">列数</p>
            <div className="mb-3 flex gap-1">
              {([2, 3, 4] as LayoutColumns[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setColumns(c)}
                  className={`flex-1 rounded px-2 py-1 text-xs ${
                    columns === c
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {c} 列
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-[11px] font-medium text-gray-500">卡片样式</p>
            <div className="mb-3 space-y-1">
              {([
                { v: 'icon' as CardStyle, label: '仅图标' },
                { v: 'icon-name' as CardStyle, label: '图标 + 名称' },
                { v: 'icon-name-desc' as CardStyle, label: '图标 + 名称 + 描述' }
              ]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setCardStyle(o.v)}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${
                    cardStyle === o.v
                      ? 'bg-brand-50 text-brand-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

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
                  className={`flex-1 rounded px-2 py-1 text-xs ${
                    cardSize === o.v
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
