import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { authApi } from '../api/client'
import {
  getStoredLoginPreferences,
  isLoginStorageSupported,
  loadRememberedCredential
} from '../utils/loginStorage'

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/

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

/** 验证码倒计时（秒）：每个面板独立计时，互不影响 */
function useCodeCountdown() {
  const [countdown, setCountdown] = useState(0)
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(t)
    // 仅在倒计时启停时重建定时器，避免每秒重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown > 0])
  return [countdown, setCountdown] as const
}

function UsernameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="mb-2 block">
      <span className="text-[11px] text-gray-500">用户名</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
        placeholder="请输入用户名"
        autoComplete="username"
      />
    </label>
  )
}

function PasswordField({
  value,
  onChange,
  show,
  onToggleShow,
  onEnter,
  autoComplete
}: {
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  onEnter: () => void
  autoComplete: string
}) {
  return (
    <label className="mb-2 block">
      <span className="text-[11px] text-gray-500">密码</span>
      <div className="relative mt-1">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          className="w-full rounded-lg border border-black/10 px-3 py-1.5 pr-8 text-xs outline-none focus:border-brand-400"
          placeholder="请输入密码"
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? '🙈' : '👁'}
        </button>
      </div>
    </label>
  )
}

function EmailCodeFields({
  email,
  onEmailChange,
  code,
  onCodeChange,
  onSend,
  sending,
  countdown,
  onEnter
}: {
  email: string
  onEmailChange: (v: string) => void
  code: string
  onCodeChange: (v: string) => void
  onSend: () => void
  sending: boolean
  countdown: number
  onEnter: () => void
}) {
  return (
    <>
      <label className="mb-2 block">
        <span className="text-[11px] text-gray-500">邮箱</span>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
          placeholder="用于接收验证码"
          autoComplete="email"
        />
      </label>
      <label className="mb-2 block">
        <span className="text-[11px] text-gray-500">邮箱验证码</span>
        <div className="mt-1 flex gap-2">
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && onEnter()}
            className="w-full flex-1 rounded-lg border border-black/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
            placeholder="6 位验证码"
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || countdown > 0}
            className="shrink-0 rounded-lg border border-brand-400 px-2.5 text-[11px] text-brand-600 hover:bg-brand-50 disabled:border-black/10 disabled:text-gray-400"
          >
            {countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中…' : '获取验证码'}
          </button>
        </div>
      </label>
    </>
  )
}

/** 登录面板：实例常驻，切换 Tab 仅隐藏，输入内容与登录方式都保留 */
function LoginPane() {
  const login = useStore((s) => s.login)
  const loginEmail = useStore((s) => s.loginEmail)

  // 登录方式：账号密码 / 邮箱验证码
  const [mode, setMode] = useState<'password' | 'email'>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useCodeCountdown()
  // 记住密码 / 下次自动登录（两者相互独立）
  const [rememberPassword, setRememberPassword] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)
  // 浏览器不支持 localStorage / Web Crypto 时降级：不展示可用勾选项，登录流程不受影响
  const storageSupported = useMemo(() => isLoginStorageSupported(), [])

  // 打开登录表单时：恢复上次勾选状态，并用本地保存的账号密码自动填充
  useEffect(() => {
    if (!storageSupported) return
    let alive = true
    void (async () => {
      const prefs = getStoredLoginPreferences()
      const remembered = await loadRememberedCredential()
      if (!alive) return
      setRememberPassword(prefs.rememberPassword)
      setAutoLogin(prefs.autoLogin)
      if (remembered) {
        setUsername(remembered.username)
        setPassword(remembered.password)
      }
    })()
    return () => {
      alive = false
    }
  }, [storageSupported])

  const sendCode = async () => {
    setError('')
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('请输入正确的邮箱地址')
      return
    }
    setSendingCode(true)
    try {
      await authApi.sendEmailCode(trimmed, 'login')
      setCountdown(60)
    } catch (e: any) {
      setError(e?.message ?? '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async () => {
    setError('')
    // 邮箱验证码登录：只校验邮箱 + 验证码
    if (mode === 'email') {
      if (!EMAIL_RE.test(email.trim())) {
        setError('请输入正确的邮箱地址')
        return
      }
      if (!/^\d{6}$/.test(code.trim())) {
        setError('请输入 6 位邮箱验证码')
        return
      }
    } else {
      if (username.trim().length < 2) {
        setError('用户名至少 2 个字符')
        return
      }
      if (password.length < 4) {
        setError('密码至少 4 位')
        return
      }
    }
    setLoading(true)
    try {
      if (mode === 'email') {
        await loginEmail(email.trim(), code.trim())
        // 实例常驻，登录成功后清掉验证码，避免残留在隐藏面板里
        setCode('')
      } else {
        // 仅「下次自动登录」需要跨会话保留 token；勾选项随登录一起写入本地存储
        await login(username.trim(), password, {
          persistToken: autoLogin,
          prefs: { rememberPassword, autoLogin }
        })
        // 实例常驻，登录成功后清掉密码，避免明文长期留在内存
        setPassword('')
      }
    } catch (e: any) {
      setError(e?.message ?? '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {mode === 'password' ? (
        <>
          <UsernameField value={username} onChange={setUsername} />
          <PasswordField
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggleShow={() => setShowPassword((v) => !v)}
            onEnter={() => !loading && submit()}
            autoComplete="current-password"
          />

          {/* 记住密码 / 下次自动登录：两者相互独立 */}
          <div className="mb-3">
            <div className="flex items-center gap-4">
              <label
                className={`flex items-center gap-1.5 text-[11px] ${
                  storageSupported ? 'cursor-pointer text-gray-600' : 'cursor-not-allowed text-gray-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  disabled={!storageSupported || loading}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  className="h-3 w-3 accent-brand-500"
                />
                记住密码
              </label>
              <label
                className={`flex items-center gap-1.5 text-[11px] ${
                  storageSupported ? 'cursor-pointer text-gray-600' : 'cursor-not-allowed text-gray-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={autoLogin}
                  disabled={!storageSupported || loading}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                  className="h-3 w-3 accent-brand-500"
                />
                下次自动登录
              </label>
            </div>
            {!storageSupported && (
              <p className="mt-1 text-[10px] text-gray-400">
                当前环境不支持本地存储，已停用记住密码与自动登录
              </p>
            )}
          </div>
        </>
      ) : (
        <EmailCodeFields
          email={email}
          onEmailChange={setEmail}
          code={code}
          onCodeChange={setCode}
          onSend={sendCode}
          sending={sendingCode}
          countdown={countdown}
          onEnter={() => !loading && submit()}
        />
      )}

      {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {loading ? '处理中…' : '登录'}
      </button>

      <p className="mt-2 text-center">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'password' ? 'email' : 'password'))
            setError('')
          }}
          className="text-[11px] text-brand-600 hover:underline"
        >
          {mode === 'password' ? '使用邮箱验证码登录' : '使用账号密码登录'}
        </button>
      </p>
    </>
  )
}

/** 注册面板：实例常驻，切换 Tab 仅隐藏，输入内容不会与登录面板串用 */
function RegisterPane() {
  const register = useStore((s) => s.register)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useCodeCountdown()

  const strength = useMemo(() => calcPasswordStrength(password), [password])

  const sendCode = async () => {
    setError('')
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('请输入正确的邮箱地址')
      return
    }
    setSendingCode(true)
    try {
      await authApi.sendEmailCode(trimmed, 'register')
      setCountdown(60)
    } catch (e: any) {
      setError(e?.message ?? '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const submit = async () => {
    setError('')
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符')
      return
    }
    if (!validateRegisterPassword(password)) {
      setError(PASSWORD_RULE_HINT)
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('请输入正确的邮箱地址')
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError('请输入 6 位邮箱验证码')
      return
    }
    setLoading(true)
    try {
      await register(username.trim(), password, email.trim(), code.trim())
      // 实例常驻，注册成功后清掉密码与验证码，避免残留在隐藏面板里
      setPassword('')
      setCode('')
    } catch (e: any) {
      setError(e?.message ?? '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <UsernameField value={username} onChange={setUsername} />
      <PasswordField
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        onEnter={() => !loading && submit()}
        autoComplete="new-password"
      />

      {/* 注册密码强度提示 */}
      {password.length > 0 && (
        <div className="-mt-1 mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${strengthColor[strength.level]}`}
              style={{ width: `${(strength.score / 4) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{strengthText[strength.level]}</span>
        </div>
      )}

      <EmailCodeFields
        email={email}
        onEmailChange={setEmail}
        code={code}
        onCodeChange={setCode}
        onSend={sendCode}
        sending={sendingCode}
        countdown={countdown}
        onEnter={() => !loading && submit()}
      />

      {error && <p className="mb-2 text-[11px] text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={loading}
        className="w-full rounded-lg bg-brand-500 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {loading ? '处理中…' : '注册并登录'}
      </button>
    </>
  )
}

// 登录 / 注册弹窗：调用后端 /api/auth/login|register，返回真实 JWT。
// 稳定挂载：登录面板与注册面板始终存在，切换 Tab 只隐藏不卸载，避免输入内容与实例被销毁。
export default function LoginModal() {
  const setModal = useStore((s) => s.setModal)
  const [tab, setTab] = useState<'login' | 'register'>('login')

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
            data-testid="tab-login"
            onClick={() => setTab('login')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'login' ? 'bg-white font-medium text-brand-600' : 'text-gray-500'
            }`}
          >
            登录
          </button>
          <button
            data-testid="tab-register"
            onClick={() => setTab('register')}
            className={`flex-1 rounded-md py-1 ${
              tab === 'register' ? 'bg-white font-medium text-brand-600' : 'text-gray-500'
            }`}
          >
            注册
          </button>
        </div>

        {/* 两个面板常驻：hidden 仅隐藏当前非激活面板，实例与输入状态都保留 */}
        <div hidden={tab !== 'login'} data-testid="login-pane">
          <LoginPane />
        </div>
        <div hidden={tab !== 'register'} data-testid="register-pane">
          <RegisterPane />
        </div>

        <p className="mt-3 text-center text-[10px] text-gray-400">
          账号由后台统一管理，登录后可同步个人配置。
        </p>
      </div>
    </div>
  )
}
