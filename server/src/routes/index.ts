import { Router, static as expressStatic } from 'express'
import path from 'path'
import authRoute from '../modules/auth/route'
import bootstrapRoute from '../modules/bootstrap/route'
import providersRoute from '../modules/providers/route'
import modelsRoute from '../modules/models/route'
import featuresRoute from '../modules/features/route'
import videoConfigRoute from '../modules/videoConfig/route'
import usersRoute from '../modules/users/route'
import userApiKeysRoute from '../modules/userApiKeys/route'
import userConfigsRoute from '../modules/userConfigs/route'
import tasksRoute from '../modules/tasks/route'

const api = Router()

// 健康检查
api.get('/health', (_req, res) => res.json({ code: 0, message: 'ok' }))

// 认证
api.use('/auth', authRoute)
// 客户端启动聚合配置
api.use('/bootstrap', bootstrapRoute)

// 系统配置（公开读 / 管理员写）
api.use('/providers', providersRoute)
api.use('/models', modelsRoute)
api.use('/features', featuresRoute)
api.use('/video-config', videoConfigRoute)
api.use('/users', usersRoute)

// 任务记录（客户端写入 / 管理员查看统计）
api.use('/tasks', tasksRoute)

// 用户私有配置（按用户隔离）
api.use('/user/api-keys', userApiKeysRoute)
api.use('/user/configs', userConfigsRoute)

// 管理后台 SPA 静态托管：构建产物位于 admin/dist
// 开发模式由 Vite 独立服务（默认 http://localhost:5174），不在此托管。
const adminDist = path.join(__dirname, '../../admin/dist')
api.use('/admin', expressStatic(adminDist, { index: ['index.html'] }))
// 管理后台前端 SPA history 路由回退
api.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'), (err) => {
    if (err) res.status(404).send('管理后台未构建，请先 npm run admin:build')
  })
})

export default api
