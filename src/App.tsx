import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import FloatingWindow from './components/FloatingWindow'
import MainPanel from './components/MainPanel'
import LoginModal from './components/LoginModal'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const expanded = useStore((s) => s.expanded)
  const setExpanded = useStore((s) => s.setExpanded)
  const modal = useStore((s) => s.modal)

  const overOverlay = useRef(false)
  const collapseTimerRef = useRef<number | null>(null)

  // 鼠标进入窗口：取消自动收起计时
  const handleEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }

  // 鼠标离开窗口：60 秒后自动收起到悬浮窗
  const handleLeave = () => {
    if (overOverlay.current) return
    if (collapseTimerRef.current) return
    collapseTimerRef.current = window.setTimeout(async () => {
      collapseTimerRef.current = null
      try {
        // 保存当前状态以便展开后恢复
        useStore.getState().saveStateBeforeCollapse()
        setExpanded(false)
        await window.api?.collapseWindow?.()
      } catch {}
    }, 60 * 1000)
  }

  useEffect(() => {
    const onCollapsed = () => setExpanded(false)
    const onExpanded = () => {
      // 从悬浮窗展开时恢复之前的状态（restoreFromCollapse 已设 expanded=true，这里不重复）
      if (!useStore.getState().expanded) {
        useStore.getState().restoreFromCollapse()
      }
    }
    const offCollapsed = window.api?.onCollapsed?.(onCollapsed)
    const offExpanded = window.api?.onExpanded?.(onExpanded)
    return () => {
      offCollapsed?.()
      offExpanded?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 模态框打开/关闭时调整窗口尺寸
  useEffect(() => {
    if (modal !== 'none') {
      try {
        ;(window as any).api?.expandWindowTo?.({ width: 700, height: 520 })
      } catch {}
    } else {
      const { featureViewMode, panelWidth, panelHeight, activeFeature, expanded } = useStore.getState()
      if (!expanded) return // 悬浮窗模式不调整
      if (activeFeature !== null) {
        try {
          ;(window as any).api?.expandWindowTo?.({ width: panelWidth, height: panelHeight })
        } catch {}
      } else if (featureViewMode) {
        try {
          ;(window as any).api?.expandWindowTo?.({ width: 680, height: 440 })
        } catch {}
      } else {
        try {
          ;(window as any).api?.expandWindowTo?.({ width: 450, height: 100 })
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  const [, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 布局：悬浮窗 | 主面板
  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="h-screen w-screen">
      {!expanded ? <FloatingWindow /> : <MainPanel />}

      {(modal === 'login' || modal === 'settings') && (
        <div
          className="fixed inset-0 z-50"
          onMouseEnter={() => (overOverlay.current = true)}
          onMouseLeave={() => (overOverlay.current = false)}
        >
          {modal === 'login' && <LoginModal />}
          {modal === 'settings' && <SettingsModal />}
        </div>
      )}
    </div>
  )
}
