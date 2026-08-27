/** 业务错误：携带 HTTP 状态码与可读消息。 */
export class HttpError extends Error {
  readonly status: number
  readonly extra?: Record<string, unknown>
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const badRequest = (msg: string, extra?: Record<string, unknown>) =>
  new HttpError(400, msg, extra)
export const unauthorized = (msg = '未登录或登录已过期') => new HttpError(401, msg)
export const forbidden = (msg = '无权限访问') => new HttpError(403, msg)
export const notFound = (msg = '资源不存在') => new HttpError(404, msg)
export const conflict = (msg = '资源已存在') => new HttpError(409, msg)
