// 主框架:左侧侧栏 + 顶部栏 + 右侧内容区。导出 View 类型供 App 使用。
import { type ReactNode } from 'react'
import { type AdminUser } from '../api'

// 页面视图类型
export type View = 'dashboard' | 'providers' | 'models' | 'features' | 'videoConfig' | 'users' | 'tasks'

interface NavItem {
  key: View
  label: string
  icon: string
}

// 侧栏导航项
const NAV: NavItem[] = [
  { key: 'dashboard', label: '仪表盘', icon: '📊' },
  { key: 'providers', label: '供应商', icon: '🔌' },
  { key: 'models', label: '模型', icon: '🤖' },
  { key: 'features', label: '功能入口', icon: '✨' },
  { key: 'videoConfig', label: '视频配置', icon: '🎬' },
  { key: 'users', label: '用户管理', icon: '👥' },
  { key: 'tasks', label: '任务记录', icon: '📝' }
]

// 各页面对应的顶部标题
const TITLES: Record<View, string> = {
  dashboard: '仪表盘',
  providers: '供应商管理',
  models: '模型管理',
  features: '功能入口管理',
  videoConfig: '视频配置',
  users: '用户管理',
  tasks: '任务记录管理'
}

export default function Layout({
  currentView,
  onNav,
  user,
  onLogout,
  children
}: {
  currentView: View
  onNav: (v: View) => void
  user: AdminUser
  onLogout: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* 左侧侧栏 */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">
            S
          </div>
          <span className="ml-2 font-semibold text-gray-800">Stunning Admin</span>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {NAV.map((item) => {
            const active = currentView === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNav(item.key)}
                className={`w-full flex items-center px-6 py-2.5 text-sm transition ${
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium border-r-2 border-brand-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="mr-3 text-base">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-200 text-xs text-gray-400">v1.0.0</div>
      </aside>

      {/* 主体区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-gray-800">{TITLES[currentView]}</h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-700">{user.username}</div>
              <div className="text-xs text-gray-400">{user.role === 'admin' ? '管理员' : '用户'}</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-medium">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-8 scroll-thin">{children}</main>
      </div>
    </div>
  )
}