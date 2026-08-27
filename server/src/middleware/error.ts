import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../utils/http'
import { fail } from '../utils/response'
import { config } from '../config'

// 统一错误处理：HttpError 用其状态码，其余视为 500。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return fail(res, err.status, err.message, err.extra)
  }
  console.error('[error] 未捕获异常:', err)
  return fail(res, 500, config.isDev ? String(err) : '服务器内部错误')
}
