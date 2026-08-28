import express from 'express'
import cors from 'cors'
import { config } from './config'
import { ensureSchema } from './db/schema'
import { seedAll } from './db/seed'
import { pingDb } from './db/pool'
import apiRoutes from './routes'
import { errorHandler } from './middleware/error'

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

  // 4. 启动 HTTP 服务
  const app = express()
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
      credentials: true
    })
  )
  app.use(express.json({ limit: '50mb' }))

  // 路由
  app.use('/api', apiRoutes)

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
  })
}

bootstrap().catch((err) => {
  console.error('[startup] 启动失败：', err)
  process.exit(1)
})
