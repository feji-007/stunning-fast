import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'

// 密码强度等级
type StrengthLevel = 'weak' | 'medium' | 'strong'

// 注册密码规则提示
const PASSWORD_RULE_HINT = '密码需8-20位，含大小写字母、数字、特殊符号中的至少三种'

// 计算密码强度
function calcPasswordStrength(pwd: string): { level: StrengthLevel; score: number } {
  let score = 0
  const hasLower = /[a-z]/.test(pwd)
  const hasUpper = /[A-Z]/.test(pwd)
  const hasDigit = /\d/.test(pwd)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pwd)
  const typeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length

  if (pwd.length >= 8) score += 1
  if (typeCount >= 2) score += 1
  if (typeCount >= 3) score += 1
  if (pwd.length >= 12 && typeCount >= 3) score += 1

  let level: StrengthLevel = 'weak'
  if (score >= 3) level = 'strong'
  else if (score >= 2) level = 'medium'

  return { level, score }
}

// 校验注册密码是否符合规则
function validateRegisterPassword(pwd: string): boolean {
  if (pwd.length < 8 || pwd.length > 20) return false
  const hasLower = /[a-z]/.test(pwd)
  const hasUpper = /[A-Z]/.test(pwd)
  const hasDigit = /\d/.test(pwd)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pwd)
  const typeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length
  return typeCount >= 3
}

// 登录 / 注册弹窗：调用后端 /api/auth/login|register，返回真实 JWT。
export default function LoginModal() {
  const setModal = useStore((s) => s.setModal)
  const login = useStore((s) => s.login)
  const register = useStore((s) => s.register)

  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const switchTab = (t: 'login' | 'register') => {
    setTab(t)
    setUsername('')
    setPassword('')
    setError('')
    setShowPassword(false)
  }

  const strength = useMemo(() => calcPasswordStrength(password), [password])
  const strengthColor: Record<StrengthLevel, string> = {
    weak: 'bg-red-400',
    medium: 'bg-yellow-400',
    strong: 'bg-green-500'
  }
  const strengthText: Record<StrengthLevel, string> = {
    weak: '弱',
    medium: '中',
    strong: '强'
  }

  const submit = async () => {
    setError('')
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符')
      return
    }
    // 注册时校验密码强度
    if (tab === 'register' && !validateRegisterPassword(password)) {
      setError(PASSWORD_RULE_HINT)
      return
    }
    if (tab === 'login' && password.length < 4) {
      setError('密码至少 4 位')
      return
    }
    setLoading(true)
    try {
      if (tab === 'login') await login(username.trim(), password)
      else await register(username.trim(), password)
    } catch (e: any) {
      setError(e?.message ?? '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/30">
      <div className="w-80 rounded-2xl bg-white p-5">
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
            onClick={() => switchTab('login')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'login' ? 'bg-white font-medium text-brand-600' : 'text-gray-500'
            }`}
          >
            登录
          </button>
          <button
            onClick={() => switchTab('register')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'register' ? 'bg-white font-medium text-brand-600' : 'text-gray-500'
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
            autoComplete="username"
          />
        </label>
        <label className="mb-2 block">
          <span className="text-[11px] text-gray-500">密码</span>
          <div className="relative mt-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && submit()}
              className="w-full rounded-lg border border-black/10 px-3 py-1.5 pr-8 text-xs outline-none focus:border-brand-400"
              placeholder="请输入密码"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          {/* 注册时显示密码强度条 */}
          {tab === 'register' && password.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${strengthColor[strength.level]}`}
                  style={{ width: `${(strength.score / 4) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">{strengthText[strength.level]}</span>
            </div>
          )}
        </label>

        {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? '处理中…' : tab === 'login' ? '登录' : '注册并登录'}
        </button>
        <p className="mt-3 text-center text-[10px] text-gray-400">
          账号由后台统一管理，登录后可同步个人配置。
        </p>
      </div>
    </div>
  )
}
