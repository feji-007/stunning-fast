import { useState } from 'react'
import { useStore } from '../store/useStore'

// 登录 / 注册弹窗（演示版，本地账号）。
export default function LoginModal() {
  const setModal = useStore((s) => s.setModal)
  const login = useStore((s) => s.login)
  const register = useStore((s) => s.register)

  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符')
      return
    }
    if (password.length < 4) {
      setError('密码至少 4 位')
      return
    }
    if (tab === 'login') login(username.trim())
    else register(username.trim())
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/30">
      <div className="w-80 rounded-2xl bg-white p-5 shadow-float">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {tab === 'login' ? '登录' : '注册'}
          </h2>
          <button
            onClick={() => setModal('none')}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 inline-flex w-full rounded-lg border border-black/10 bg-gray-50 p-0.5 text-xs">
          <button
            onClick={() => setTab('login')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'login' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => setTab('register')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'register' ? 'bg-white font-medium text-brand-600 shadow-sm' : 'text-gray-500'
            }`}
          >
            注册
          </button>
        </div>

        <label className="mb-2 block">
          <span className="text-[11px] text-gray-500">用户名</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
            placeholder="请输入用户名"
          />
        </label>
        <label className="mb-2 block">
          <span className="text-[11px] text-gray-500">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="mt-1 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
            placeholder="请输入密码"
          />
        </label>

        {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}

        <button
          onClick={submit}
          className="w-full rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600"
        >
          {tab === 'login' ? '登录' : '注册并登录'}
        </button>
        <p className="mt-3 text-center text-[10px] text-gray-400">
          演示版账号仅保存在本地，不会上传。
        </p>
      </div>
    </div>
  )
}
