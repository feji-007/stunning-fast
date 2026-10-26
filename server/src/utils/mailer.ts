import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config'
import { query } from '../db/pool'

/** SMTP 生效配置：数据库 system_configs 优先，env 兜底。 */
export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

/** 读取生效的 SMTP 配置：system_configs 表中非空值覆盖 env。 */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const db: Record<string, string> = {}
  try {
    const { rows } = await query<{ config_key: string; config_value: string }>(
      `SELECT config_key, config_value FROM system_configs
       WHERE config_key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from')`
    )
    for (const r of rows) db[r.config_key] = r.config_value
  } catch {
    // 表不存在等异常时静默回退 env
  }
  const pick = (dbVal: string | undefined, envVal: string) =>
    dbVal && dbVal.trim() !== '' ? dbVal.trim() : envVal
  const portRaw = pick(db.smtp_port, String(config.smtpPort))
  return {
    host: pick(db.smtp_host, config.smtpHost),
    port: Number(portRaw) || 465,
    user: pick(db.smtp_user, config.smtpUser),
    pass: pick(db.smtp_pass, config.smtpPass),
    from: pick(db.smtp_from, config.smtpFrom)
  }
}

/** 邮件服务是否已配置（缺少账号/授权码时验证码接口直接报错提示）。 */
export async function isMailConfigured(): Promise<boolean> {
  const c = await getSmtpConfig()
  return Boolean(c.user && c.pass)
}

// 传输器按配置签名缓存：后台改配置后自动重建，无需重启服务。
let cached: { signature: string; transporter: Transporter } | null = null

function getTransporter(c: SmtpConfig): Transporter {
  const signature = `${c.host}|${c.port}|${c.user}|${c.pass}`
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      transporter: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.port === 465, // QQ 邮箱 465 走 SSL，587 走 STARTTLS
        auth: { user: c.user, pass: c.pass }
      })
    }
  }
  return cached.transporter
}

/** 发送验证码邮件（scene：注册 / 登录）。 */
export async function sendVerifyCodeMail(email: string, code: string, scene: '注册' | '登录' = '注册'): Promise<void> {
  const c = await getSmtpConfig()
  await getTransporter(c).sendMail({
    from: `"绝色" <${c.from || c.user}>`,
    to: email,
    subject: `${scene}验证码`,
    text: `您的${scene}验证码是：${code}，10 分钟内有效。请勿泄露给他人。`,
    html: `<p>您的${scene}验证码是：<b style="font-size:18px;letter-spacing:2px">${code}</b></p><p>10 分钟内有效，请勿泄露给他人。</p>`
  })
}
