import express from 'express'
import cors from 'cors'
import path from 'path'
import { config } from './config'
import { ensureSchema } from './db/schema'
import { seedAll } from './db/seed'
import { seedTools, backfillToolProviderLinks } from './db/seed-tools'
import { applyResourceLinkFixes, applyPikaApiMigration, applyNewProviderProtocols } from './db/link-fixes'
import { pingDb } from './db/pool'
import apiRoutes from './routes'
import { errorHandler } from './middleware/error'
import { startFrChecker, stopFrChecker, runOnce } from './modules/freeResources/checker'

async function bootstrap() {
  // 1. 检查数据库连接
  const ok = await pingDb()
  if (!ok) {
    console.error('[startup] 数据库连接失败，请检查 .env 中 DATABASE_URL')
    console.error('           MySQL 需先创建库：CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
    process.exit(1)
  }
  console.log('[startup] 数据库连接成功（MySQL）')

  // 2. 幂等建表（表已存在则跳过，不重建不清空）
  await ensureSchema()

  // 3. 种子数据（各表为空时才插入，不覆盖管理员修改）
  await seedAll()

  // 3.5 工具导购目录种子（30 家主流 AI 视频工具，幂等，有 meta 标记避免重复）
  await seedTools()

  // 3.6 老库升级：回填工具 ↔ 供应商关联（只执行一次）
  await backfillToolProviderLinks()

  // 3.7 修正失效的资源链接并补齐免费资源的模型关联（只执行一次）
  await applyResourceLinkFixes()

  // 3.8 Pika 供应商迁移到新开发者 API（只执行一次）
  await applyPikaApiMigration()

  // 3.9 补入 Google/HeyGen/Synthesia/D-ID 供应商、模型及工具关联（只执行一次）
  await applyNewProviderProtocols()

  // 4. 启动 HTTP 服务
  const app = express()
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
      credentials: true
    })
  )
  app.use(express.json({ limit: '50mb' }))

  // API 路由
  app.use('/api', apiRoutes)

  // 管理后台 SPA：构建产物位于 admin/dist，直接挂载在 /admin（非 /api/admin）
  // Vite 构建时 base: '/admin/'，因此静态资源路径以 /admin/ 开头
  const adminDist = path.join(__dirname, '../admin/dist')
  app.use('/admin', express.static(adminDist, { index: ['index.html'] }))
  // SPA history 路由回退：/admin 下所有子路径都返回 index.html
  app.get('/admin/*', (_req, res) => {
    res.sendFile(path.join(adminDist, 'index.html'), (err) => {
      if (err) res.status(404).send('管理后台未构建，请先 npm run admin:build')
    })
  })

  // 根路径：跳转到管理后台
  app.get('/', (_req, res) => res.redirect('/admin'))

  // 统一错误处理
  app.use(errorHandler)

  app.listen(config.port, () => {
    console.log('========================================================')
    console.log(' 绝色后台管理系统已启动')
    console.log('--------------------------------------------------------')
    console.log(`  API      : http://localhost:${config.port}/api`)
    console.log(`  管理后台 : http://localhost:${config.port}/admin`)
    console.log(`  健康检查 : http://localhost:${config.port}/api/health`)
    console.log('--------------------------------------------------------')
    console.log(`  管理员账号：${config.adminUsername} / ${config.adminPassword}`)
    console.log('========================================================')
    // 免费资源定时校验调度器启动（立即启动；首次延迟 runOnce 在 checker 内部）
    startFrChecker()
  })
}

/** 优雅退出：清理定时器 + 释放 DB 连接后再退出 */
function registerGracefulShutdown() {
  const cleanup = async (signal: string) => {
    console.log(`\n[shutdown] 收到 ${signal}，开始清理…`)
    stopFrChecker()
    // tsx watch 热重载时也会触发 SIGTERM；若有需要可在此关闭 DB pool
    process.exit(0)
  }
  process.on('SIGINT', () => cleanup('SIGINT'))
  process.on('SIGTERM', () => cleanup('SIGTERM'))
}
registerGracefulShutdown()

bootstrap().catch((err) => {
  console.error('[startup] 启动失败：', err)
  process.exit(1)
})
