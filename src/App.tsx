import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import { authApi, clearToken, getToken } from './api/client'
import { clearLoginStorage, loadAutoLoginCredential } from './utils/loginStorage'
import FloatingWindow from './components/FloatingWindow'
import MainPanel from './components/MainPanel'
import LoginModal from './components/LoginModal'
import SettingsModal from './components/SettingsModal'
import FeedbackModal from './components/FeedbackModal'
import StandaloneUpdateModal from './components/StandaloneUpdateModal'
import RecommendationAssistantModal from './components/RecommendationAssistantModal'
import { type UpdatePhase } from './components/UpdateModal'

// 检查是否为独立弹窗模式（URL 含 ?modal=xxx）
function getStandaloneModal(): string | null {
  return new URLSearchParams(window.location.search).get('modal')
}

export default function App() {
  const modal = getStandaloneModal()
  // 独立弹窗（AI 助手）与主窗口是不同 BrowserWindow，sessionStorage 不共享；
  // 这里统一恢复登录态：token 可能来自 URL hash（主进程注入）或共享的 localStorage。
  const restoring = useStandaloneSessionRestore(modal === 'recommendation')
  // 独立弹窗模式：仅渲染对应弹窗
  if (modal === 'update') {
    return <StandaloneUpdateModal />
  }
  if (modal === 'recommendation') {
    if (restoring) {
      return (
        <div className="flex h-full w-full items-center justify-center p-3">
          <div className="text-xs text-gray-400">加载中…</div>
        </div>
      )
    }
    return <RecommendationAssistantModal />
  }

  return <MainApp />
}

/** 独立弹窗的登录态恢复：有 token 时静默校验并写入登录态 */
function useStandaloneSessionRestore(enabled: boolean): boolean {
  const [restoring, setRestoring] = useState(enabled)

  useEffect(() => {
    if (!enabled) {
      setRestoring(false)
      return
    }
    let cancelled = false
    void (async () => {
      const token = getToken()
      if (!token || useStore.getState().user.loggedIn) {
        if (!cancelled) setRestoring(false)
        return
      }
      try {
        const r = await authApi.me()
        if (cancelled) return
        useStore.setState((s) => ({
          user: { ...s.user, loggedIn: true, userId: r.user.id, username: r.user.username, token }
        }))
      } catch {
        // 校验失败保持未登录态，由弹窗展示登录引导
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return restoring
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

  // 启动：拉取后端系统配置；优先自动登录，其次恢复同一会话内的登录态
  useEffect(() => {
    void (async () => {
      const store = useStore.getState()
      void store.bootstrap()

      // 1) 优先读取自动登录标识：存在且未过期（7 天）则直接完成登录并进入主界面
      const auto = await loadAutoLoginCredential()
      if (auto.status === 'ok') {
        try {
          await store.login(auto.username, auto.password, { persistToken: true })
          return
        } catch (e: any) {
          // 凭证已失效（401）才清除本地登录信息；网络异常保留记录，下次启动重试
          if (e?.status === 401) clearLoginStorage()
        }
      } else if (auto.status === 'expired') {
        // 自动登录已过期：连持久化的登录态一起清除，必须重新登录
        clearToken()
      }

      // 2) 同一会话内刷新页面：已有 token 时静默校验并恢复登录态（不写入任何本地存储）
      const token = getToken()
      if (!token || useStore.getState().user.loggedIn) return
      try {
        const r = await authApi.me()
        useStore.setState((s) => ({
          user: { ...s.user, loggedIn: true, userId: r.user.id, username: r.user.username, token }
        }))
        void useStore.getState().pullUserConfig()
      } catch (e: any) {
        if (e?.status === 401) {
          clearToken()
          clearLoginStorage()
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 模态框打开/关闭时调整窗口尺寸
  useEffect(() => {
    if (modal !== 'none') {
      // 设置/登录/反馈弹窗统一使用 1200×720
      const dims = { width: 1200, height: 720 }
      try {
        ;(window as any).api?.expandWindowTo?.(dims)
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

  // 登录弹窗首次打开后保持挂载（仅隐藏）：自动收起、关闭或切到其它弹窗时都不销毁实例，
  // 重新打开时已输入的账号密码、Tab 与各面板状态都还在。
  const [loginMounted, setLoginMounted] = useState(modal === 'login')
  useEffect(() => {
    if (modal === 'login') setLoginMounted(true)
  }, [modal])

  // 布局：悬浮窗 | 主面板
  return (
    <div onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="h-screen w-screen">
      {!expanded ? <FloatingWindow /> : <MainPanel />}

      {loginMounted && (
        <div
          hidden={modal !== 'login'}
          className="fixed inset-0 z-50 overflow-hidden rounded-2xl"
          onMouseEnter={() => (overOverlay.current = true)}
          onMouseLeave={() => (overOverlay.current = false)}
        >
          <LoginModal />
        </div>
      )}

      {(modal === 'settings' || modal === 'feedback') && (
        <div
          className="fixed inset-0 z-50 overflow-hidden rounded-2xl"
          onMouseEnter={() => (overOverlay.current = true)}
          onMouseLeave={() => (overOverlay.current = false)}
        >
          {modal === 'settings' && <SettingsModal />}
          {modal === 'feedback' && <FeedbackModal />}
        </div>
      )}
    </div>
  )
}
