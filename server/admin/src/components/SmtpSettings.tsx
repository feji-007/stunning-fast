// 邮件配置：管理员维护 SMTP 参数（用于注册邮箱验证码）。授权码不回显，留空表示不修改。
import { useEffect, useState } from 'react'
import { systemConfigApi } from '../api'

export default function SmtpSettings() {
  const [host, setHost] = useState('smtp.qq.com')
  const [port, setPort] = useState('465')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [hasPass, setHasPass] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    systemConfigApi
      .getSmtp()
      .then((res) => {
        setHost(res.smtp.host)
        setPort(String(res.smtp.port))
        setUser(res.smtp.user)
        setFrom(res.smtp.from)
        setHasPass(res.smtp.hasPass)
      })
      .catch((e) => setMessage({ type: 'err', text: e?.message ?? '加载失败' }))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setMessage(null)
    if (!host.trim()) return setMessage({ type: 'err', text: '请填写 SMTP 主机' })
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535)
      return setMessage({ type: 'err', text: '端口不正确' })
    if (!user.trim()) return setMessage({ type: 'err', text: '请填写邮箱账号' })
    if (!hasPass && !pass.trim())
      return setMessage({ type: 'err', text: '请填写邮箱授权码' })
    setSaving(true)
    try {
      await systemConfigApi.saveSmtp({
        host: host.trim(),
        port: portNum,
        user: user.trim(),
        from: from.trim(),
        ...(pass.trim() ? { pass: pass.trim() } : {})
      })
      if (pass.trim()) setHasPass(true)
      setPass('')
      setMessage({ type: 'ok', text: '已保存，立即生效' })
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message ?? '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">加载中…</div>

  const inputCls =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

  return (
    <div className="max-w-lg">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-800">SMTP 邮件服务</h2>
        <p className="mb-5 text-xs text-gray-400">
          用于发送注册邮箱验证码。保存后立即生效，无需重启服务。
        </p>

        <div className="mb-4 flex gap-3">
          <label className="flex-1">
            <span className="text-xs text-gray-500">SMTP 主机</span>
            <input value={host} onChange={(e) => setHost(e.target.value)} className={inputCls} placeholder="smtp.qq.com" />
          </label>
          <label className="w-28">
            <span className="text-xs text-gray-500">端口</span>
            <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="465" />
          </label>
        </div>

        <label className="mb-4 block">
          <span className="text-xs text-gray-500">邮箱账号</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} placeholder="your-qq@qq.com" autoComplete="off" />
        </label>

        <label className="mb-4 block">
          <span className="text-xs text-gray-500">授权码{hasPass ? '（已保存，留空则不修改）' : ''}</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className={inputCls}
            placeholder={hasPass ? '••••••••' : 'QQ 邮箱设置中生成的授权码'}
            autoComplete="new-password"
          />
        </label>

        <label className="mb-5 block">
          <span className="text-xs text-gray-500">发件人地址（选填，默认使用邮箱账号）</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} placeholder="留空则与邮箱账号一致" />
        </label>

        {message && (
          <p className={`mb-3 text-xs ${message.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
            {message.text}
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存配置'}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-700">
        <p className="font-medium">QQ 邮箱授权码获取方式</p>
        <p>登录 QQ 邮箱网页版 → 设置 → 账号 → POP3/IMAP/SMTP 服务 → 开启服务并生成授权码（16 位，不是 QQ 密码）。465 端口走 SSL，587 端口走 STARTTLS。</p>
      </div>
    </div>
  )
}
