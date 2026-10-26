import { Router } from 'express'
import { query, queryOne } from '../../db/pool'
import { signToken } from '../../utils/jwt'
import { hashPassword, verifyPassword } from '../../utils/password'
import { badRequest, unauthorized } from '../../utils/http'
import { ok, getAuthUser } from '../../utils/response'
import { requireAuth } from '../../middleware/auth'
import { isMailConfigured, sendVerifyCodeMail } from '../../utils/mailer'

const router = Router()

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/

/** 发送邮箱验证码（purpose：register 注册 / login 登录）：60 秒内限发一次，验证码 10 分钟有效。 */
router.post('/send-email-code', async (req, res, next) => {
  try {
    if (!(await isMailConfigured())) throw badRequest('邮件服务未配置，请联系管理员')
    const { email, purpose } = req.body ?? {}
    if (!email || !EMAIL_RE.test(email)) throw badRequest('邮箱格式不正确')
    if (purpose === 'login') {
      const u = await queryOne<{ is_active: boolean }>('SELECT is_active FROM users WHERE email = ?', [email])
      if (!u) throw badRequest('该邮箱未注册')
      if (!u.is_active) throw badRequest('该账号已被禁用')
    } else {
      const taken = await queryOne('SELECT 1 FROM users WHERE email = ?', [email])
      if (taken) throw badRequest('该邮箱已注册，请直接登录')
    }
    const recent = await queryOne(
      'SELECT 1 FROM email_verify_codes WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)',
      [email]
    )
    if (recent) throw badRequest('发送太频繁，请 60 秒后再试')
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await query(
      'INSERT INTO email_verify_codes (email, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [email, code]
    )
    try {
      await sendVerifyCodeMail(email, code, purpose === 'login' ? '登录' : '注册')
    } catch {
      // 发送失败时作废刚写入的验证码，避免用户拿着收不到的码重试
      await query('DELETE FROM email_verify_codes WHERE email = ? AND code = ?', [email, code])
      throw badRequest('验证码邮件发送失败，请检查邮箱地址或稍后再试')
    }
    ok(res, null, '验证码已发送，请查收邮件')
  } catch (e) {
    next(e)
  }
})

/** 登录：用户名 + 密码，返回 JWT。 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码不能为空')
    const row = await queryOne<{
      id: number; username: string; password_hash: string; role: string; is_active: boolean
    }>('SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?', [username])
    if (!row || !row.is_active) throw unauthorized('用户不存在或已禁用')
    const okPwd = await verifyPassword(password, row.password_hash)
    if (!okPwd) throw unauthorized('密码错误')
    const token = signToken({ id: row.id, username: row.username, role: row.role as 'admin' | 'user' })
    ok(res, {
      token,
      user: { id: row.id, username: row.username, role: row.role }
    })
  } catch (e) {
    next(e)
  }
})

/** 邮箱验证码登录：邮箱 + 验证码，返回 JWT。 */
router.post('/login-email', async (req, res, next) => {
  try {
    const { email, code } = req.body ?? {}
    if (!email || !EMAIL_RE.test(email)) throw badRequest('邮箱格式不正确')
    if (!code || !/^\d{6}$/.test(code)) throw badRequest('请输入 6 位邮箱验证码')
    const codeRow = await queryOne<{ id: number; code: string }>(
      `SELECT id, code FROM email_verify_codes
       WHERE email = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email]
    )
    if (!codeRow || codeRow.code !== code) throw badRequest('验证码错误或已过期')
    const row = await queryOne<{
      id: number; username: string; role: string; is_active: boolean
    }>('SELECT id, username, role, is_active FROM users WHERE email = ?', [email])
    if (!row || !row.is_active) throw unauthorized('该邮箱未注册或已禁用')
    await query('UPDATE email_verify_codes SET used = 1 WHERE id = ?', [codeRow.id])
    const token = signToken({ id: row.id, username: row.username, role: row.role as 'admin' | 'user' })
    ok(res, {
      token,
      user: { id: row.id, username: row.username, role: row.role }
    })
  } catch (e) {
    next(e)
  }
})

/** 注册：用户名 + 密码 + 邮箱验证码，创建普通用户（管理员需在后台创建）。 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, email, code } = req.body ?? {}
    if (!username || !password) throw badRequest('用户名和密码不能为空')
    if (username.length < 2) throw badRequest('用户名至少 2 个字符')
    if (password.length < 4) throw badRequest('密码至少 4 位')
    if (!email || !EMAIL_RE.test(email)) throw badRequest('邮箱格式不正确')
    if (!code || !/^\d{6}$/.test(code)) throw badRequest('请输入 6 位邮箱验证码')
    const exists = await queryOne('SELECT 1 FROM users WHERE username = ?', [username])
    if (exists) throw badRequest('用户名已被占用')
    const emailTaken = await queryOne('SELECT 1 FROM users WHERE email = ?', [email])
    if (emailTaken) throw badRequest('该邮箱已注册，请直接登录')
    const codeRow = await queryOne<{ id: number; code: string }>(
      `SELECT id, code FROM email_verify_codes
       WHERE email = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email]
    )
    if (!codeRow || codeRow.code !== code) throw badRequest('验证码错误或已过期')
    await query('UPDATE email_verify_codes SET used = 1 WHERE id = ?', [codeRow.id])
    const hash = await hashPassword(password)
    const r = await query(
      `INSERT INTO users (username, password_hash, email, role, is_active)
       VALUES (?, ?, ?, 'user', TRUE)`,
      [username, hash, email]
    )
    const id = r.insertId ?? 0
    const token = signToken({ id, username, role: 'user' })
    ok(res, { token, user: { id, username, role: 'user' } }, '注册成功')
  } catch (e) {
    next(e)
  }
})

/** 获取当前登录用户信息。 */
router.get('/me', requireAuth, (req, res) => {
  const u = getAuthUser(req)
  ok(res, { user: u })
})

export default router