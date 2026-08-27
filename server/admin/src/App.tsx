// 应用根组件:根据登录态显示登录页或主后台;通过 useState 切换页面视图。
import { useEffect, useState } from 'react'
import Login from './components/Login'
import Layout, { type View } from './components/Layout'
import Dashboard from './components/Dashboard'
import Providers from './components/Providers'
import Models from './components/Models'
import Features from './components/Features'
import VideoConfig from './components/VideoConfig'
import Users from './components/Users'
import Tasks from './components/Tasks'
import Statistics from './components/Statistics'
import { authApi, getStoredUser, clearAuth, getToken, type AdminUser } from './api'

export default function App() {
  // 当前登录用户(初始从 localStorage 读取)
  const [user, setUser] = useState<AdminUser | null>(getStoredUser())
  // 当前页面视图
  const [view, setView] = useState<View>('dashboard')
  // 启动校验中(只在有 token 时需要校验)
  const [booting, setBooting] = useState<boolean>(!!getToken())

  useEffect(() => {
    // 已有 token 时校验有效性
    if (!getToken()) {
      setBooting(false)
      return
    }
    authApi
      .me()
      .then((res) => setUser(res.user))
      .catch(() => {
        clearAuth()
        setUser(null)
      })
      .finally(() => setBooting(false))
  }, [])

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        加载中…
      </div>
    )
  }

  // 未登录显示登录页
  if (!user) {
    return <Login onLogin={(u) => setUser(u)} />
  }

  // 已登录显示主后台
  return (
    <Layout
      currentView={view}
      onNav={setView}
      user={user}
      onLogout={() => {
        clearAuth()
        setUser(null)
        setView('dashboard')
      }}
    >
      {view === 'dashboard' && <Dashboard />}
      {view === 'providers' && <Providers />}
      {view === 'models' && <Models />}
      {view === 'features' && <Features />}
      {view === 'videoConfig' && <VideoConfig />}
      {view === 'users' && <Users />}
      {view === 'tasks' && <Tasks />}
      {view === 'statistics' && <Statistics />}
    </Layout>
  )
}