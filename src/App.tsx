import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import { authApi } from './api/client'
import FloatingWindow from './components/FloatingWindow'
import MainPanel from './components/MainPanel'
import LoginModal from './components/LoginModal'
import SettingsModal from './components/SettingsModal'
import FeedbackModal from './components/FeedbackModal'
import StandaloneUpdateModal from './components/StandaloneUpdateModal'
import { type UpdatePhase } from './components/UpdateModal'

// 检查是否为独立弹窗模式（URL 含 ?modal=update）
function isStandaloneUpdateMode(): boolean {
  return new URLSearchParams(window.location.search).get('modal') === 'update'
}

export default function App() {
  // 独立弹窗模式：仅渲染更新弹窗
  if (isStandaloneUpdateMode()) {
    return <StandaloneUpdateModal />
  }

  return <MainApp />
}

function MainApp() {
  const expanded = useStore((s) => s.expanded)
  const setExpanded = useStore((s) => s.setExpanded)
  const modal = useStore((s) => s.modal)
  const theme = useStore((s) => s.theme)

  const overOverlay = useRef(false)
  const collapseTimerRef = useRef<number | null>(null)
  const pointerOver = useRef(true) // 鼠标是否在窗口内

  // 主题切换：在 <html> 上增删 dark 类，触发 CSS 变量切换
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
  }, [theme])

  // 鼠标进入窗口：取消自动收起计时
  const handleEnter = () => {
    pointerOver.current = true
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }

  // 启动自动收起计时器（抽成函数，便于在模态框关闭后补启动）
  const startCollapseTimer = () => {
    if (collapseTimerRef.current) return
    collapseTimerRef.current = window.setTimeout(async () => {
      collapseTimerRef.current = null
      try {
        useStore.getState().saveStateBeforeCollapse()
        if (useStore.getState().modal !== 'none') {
          useStore.getState().setModal('none')
        }
        setExpanded(false)
        await window.api?.collapseWindow?.()
      } catch {}
    }, 60 * 1000)
  }

  // 鼠标离开窗口：5 秒后自动收起到悬浮窗（模态框打开时同样收起，收起前会先关闭模态框）
  const handleLeave = () => {
    pointerOver.current = false
    if (overOverlay.current) return
    startCollapseTimer()
  }

  // 模态框关闭时：若鼠标不在窗口内，补启动自动收起计时器
  useEffect(() => {
    if (modal === 'none' && !pointerOver.current && !collapseTimerRef.current) {
      startCollapseTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  useEffect(() => {
    const onCollapsed = () => setExpanded(false)
    const onExpanded = () => {
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

  // 启动：拉取后端系统配置；若本地仍保留登录态，校验 token 并恢复用户私有配置
  useEffect(() => {
    void useStore.getState().bootstrap()
    if (useStore.getState().user.loggedIn) {
      authApi
        .me()
        .then((r) => {
          useStore.setState((s) => ({
            user: { ...s.user, userId: r.user.id, username: r.user.username }
          }))
          void useStore.getState().pullUserConfig()
        })
        .catch(() => {
          useStore.getState().logout()
        })
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
      if (!expanded) return
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

      {(modal === 'login' || modal === 'settings' || modal === 'feedback') && (
        <div
          className="fixed inset-0 z-50 overflow-hidden rounded-2xl"
          onMouseEnter={() => (overOverlay.current = true)}
          onMouseLeave={() => (overOverlay.current = false)}
        >
          {modal === 'login' && <LoginModal />}
          {modal === 'settings' && <SettingsModal />}
          {modal === 'feedback' && <FeedbackModal />}
        </div>
      )}
    </div>
  )
}
