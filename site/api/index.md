# API 接口

所有接口统一响应 `{ code, message, data }`，`code === 0` 为成功。需鉴权接口在 Header 携带 `Authorization: Bearer <token>`。

## 认证

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | /api/auth/login | 否 | 登录，返回 JWT + 用户信息 |
| POST | /api/auth/register | 否 | 注册新用户 |
| GET | /api/auth/me | 是 | 获取当前用户 |

## 客户端聚合

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/bootstrap | 否 | 启动聚合配置（系统配置只读） |
| GET | /api/health | 否 | 健康检查 |

## 系统配置（公开读 / 管理员写）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST/PUT/DELETE | /api/providers | 供应商管理 |
| GET/POST/PUT/DELETE | /api/models | 模型管理 |
| GET/POST/PUT/DELETE | /api/features | 功能入口管理 |
| GET/POST/PUT/DELETE | /api/video-config | 视频参数选项 |
| GET/POST/PUT/DELETE | /api/users | 用户账号管理 |

## 任务与反馈

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET/POST | /api/tasks | 是 | 视频生成任务记录（客户端写入 / 管理员查看统计），支持分页（`page` / `pageSize` / `sort` / `order`） |
| POST/GET | /api/feedback | 是 | 用户意见反馈（客户端提交 / 管理员查看处理） |

## 用户私有配置（按用户隔离）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET/POST/DELETE | /api/user/api-keys | 是 | 当前用户私有 API 密钥 |
| GET/POST | /api/user/configs | 是 | 当前用户私有布局配置 |

## 数据隔离

- 系统配置：全局共享，公开读、仅管理员写。
- 任务与反馈：用户只能看到自己的记录；管理员可查看全部并统计。
- 用户私有配置：按 user_id 隔离，仅可见系统配置与本人设置。

## 管理后台

- 后端在 `/admin` 路径托管管理后台 SPA（构建产物位于 `server/admin/dist`）。
- 开发模式由 Vite 独立服务（默认 `http://localhost:5174`），代理到后端 `:4178`。
- 若未构建，访问 `/admin` 会提示「管理后台未构建，请先 npm run admin:build」。
