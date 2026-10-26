import { Router } from 'express'
import { query } from '../../db/pool'
import { badRequest } from '../../utils/http'
import { ok } from '../../utils/response'
import { requireAuth, requireAdmin } from '../../middleware/auth'
import { getSmtpConfig } from '../../utils/mailer'

const router = Router()

const SMTP_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] as const

async function upsertConfig(key: string, value: string) {
  await query(
    `INSERT INTO system_configs (config_key, config_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
    [key, value]
  )
}

/** 获取 SMTP 配置（管理员）：授权码不回显，仅返回 hasPass 标记。 */
router.get('/smtp', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const c = await getSmtpConfig()
    ok(res, {
      smtp: {
        host: c.host,
        port: c.port,
        user: c.user,
        from: c.from,
        hasPass: Boolean(c.pass)
      }
    })
  } catch (e) {
    next(e)
  }
})

/** 保存 SMTP 配置（管理员）：pass 留空表示不修改已有授权码。 */
router.put('/smtp', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const b = req.body ?? {}
    if (!b.host || !String(b.host).trim()) throw badRequest('SMTP 主机不能为空')
    const port = Number(b.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw badRequest('端口不正确')
    if (!b.user || !String(b.user).trim()) throw badRequest('邮箱账号不能为空')

    await upsertConfig('smtp_host', String(b.host).trim())
    await upsertConfig('smtp_port', String(port))
    await upsertConfig('smtp_user', String(b.user).trim())
    await upsertConfig('smtp_from', String(b.from ?? '').trim())
    // 授权码仅在填写时更新，留空保留原值
    if (typeof b.pass === 'string' && b.pass.trim() !== '') {
      await upsertConfig('smtp_pass', b.pass.trim())
    }
    ok(res, null, '已保存')
  } catch (e) {
    next(e)
  }
})

export default router
