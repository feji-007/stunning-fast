// 测试辅助：启动临时 Express 服务、生成管理员令牌、模拟数据库删除结果。
import express, { type Router } from 'express'
import { mock } from 'node:test'
import type { AddressInfo } from 'node:net'
import { errorHandler } from '../src/middleware/error'
import { signToken } from '../src/utils/jwt'
import { pool } from '../src/db/pool'

export const ADMIN = { id: 1, username: 'admin', role: 'admin' as const }

/** 挂载路由并在随机端口启动临时服务，回调执行完毕后自动关闭。 */
export async function withServer(
  prefix: string,
  router: Router,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express()
  app.use(express.json())
  app.use(prefix, router)
  app.use(errorHandler)

  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  }
}

/** 管理员 Bearer 令牌请求头。 */
export function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${signToken(ADMIN)}` }
}

/** 发送 JSON POST 请求，返回状态码与响应体。 */
export async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  return { status: res.status, body: await res.json() }
}

/**
 * 模拟 pool.query 返回 DELETE 结果。
 * 路由中的 query() 包装函数会读取 affectedRows，因此这里返回 ResultSetHeader。
 */
export function mockDeleteQuery(affectedRows: number) {
  return mock.method(pool, 'query', (async () => [{ affectedRows }]) as any)
}
