# 绝色后台管理系统 · 启动说明

本系统由三部分组成，协同工作：

| 部分 | 目录 | 说明 |
| --- | --- | --- |
| 后端服务 | `server/` | Express + MySQL，提供 API 与管理后台静态托管 |
| 管理后台 Web UI | `server/admin/` | React + Vite + Tailwind，浏览器访问，构建产物由后端托管 |
| 桌面客户端 | 根目录 | Electron + React，启动时从后端拉取配置 |

---

## 一、环境要求

- **Node.js** ≥ 18（已在 Node 20 / 24 验证）
- **MySQL** ≥ 8.0（本地或可访问的远程实例）
- 桌面客户端构建需 Electron（已在 Electron 31 验证）

---

## 二、数据库准备

1. 启动 MySQL 服务。
2. 创建数据库（默认库名 `stunning_fast`）：

```bash
# 用 psql
mysql -u root -p -e "CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 或进入 mysql 客户端后执行
CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> 无需手动建表。服务启动时会用 `CREATE TABLE IF NOT EXISTS` 幂等建表，并在表为空时插入种子数据（供应商 / 模型 / 功能入口 / 视频参数 / 管理员账号）。已有数据不会被覆盖。

---

## 三、后端服务启动

```bash
cd server
npm install          # 首次安装依赖
npm run dev          # 开发模式（tsx watch，改代码自动重启）
```

启动后控制台会依次输出：

```
[db] 表结构检查完成（已存在则跳过）
[seed] providers + models 已初始化（9 供应商）   # 仅首次
[seed] features 已初始化（6 功能入口）           # 仅首次
[seed] video_config_options 已初始化（18 项）    # 仅首次
[seed] 管理员账号已创建：admin / admin123（请及时修改密码）  # 仅首次
[server] 后台服务已启动: http://localhost:4178
[server] 管理后台: http://localhost:4178/admin
```

生产部署：

```bash
cd server
npm run build        # 编译 TS -> dist/
npm start            # node dist/index.js
```

> 管理后台 Web UI 的构建产物位于 `server/admin/dist`，由后端在 `/admin` 路径托管。若尚未构建，访问 `/admin` 会提示「管理后台未构建，请先 npm run admin:build」。

---

## 四、管理后台 Web UI

### 方式 A：用后端托管的构建产物（推荐，生产/日常）

```bash
cd server
npm run admin:install   # 首次：安装 admin 依赖
npm run admin:build     # 构建到 admin/dist
```

随后访问：<http://localhost:4178/admin>

### 方式 B：开发模式（热更新）

```bash
cd server
npm run admin:dev       # Vite 独立服务，默认 http://localhost:5174
```

访问 Vite 给出的地址（如 <http://localhost:5174>），它会代理到后端 `:4178`。

### 登录

- 默认管理员：`admin` / `admin123`
- 登录后可在「用户管理」页新增用户、修改密码、调整角色（admin / user）

> 管理员可在管理后台维护所有**系统配置**：供应商、模型、功能入口、视频生成参数、用户账号。

---

## 五、桌面客户端启动

```bash
# 在项目根目录
npm install          # 首次安装依赖
npm run dev          # 开发模式：Vite + Electron
```

客户端启动流程：

1. 调用 `GET /api/bootstrap` 拉取系统配置（供应商 / 模型 / 功能入口 / 视频参数），替代客户端原硬编码。
2. 若本地仍有登录态（JWT），调用 `GET /api/auth/me` 校验；失效则自动登出。
3. 后端不可达时，回退到内置默认配置，UI 仍可浏览（但无法登录 / 同步）。

生产打包：

```bash
npm run build        # vite build + tsc -p electron/tsconfig.json
npm start            # 生产模式启动 Electron
```

---

## 六、配置说明（.env）

后端配置全部带默认值，不配 `.env` 也能以开发默认值启动。需要自定义时在 `server/` 下创建 `.env`（参考 `.env.example`）：

```ini
PORT=4178
DATABASE_URL=mysql://root:root@localhost:3306/stunning_fast
JWT_SECRET=stunning-fast-dev-secret-change-me   # 生产请改随机长串
JWT_EXPIRES_IN=7d
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123                          # 仅首次创建管理员用，之后改密码请走后台
CORS_ORIGIN=*
CLIENT_API_BASE=http://localhost:4178            # 客户端默认连接地址
```

客户端连接地址：客户端默认连 `http://localhost:4178`，如需改地址，修改 `src/api/client.ts` 顶部 `DEFAULT_API_BASE`，或通过 localStorage 键 `stunning-fast-api-base` 覆盖。

---

## 七、API 接口一览

所有接口统一响应：`{ code: number, message: string, data: any }`（`code === 0` 为成功）。
需鉴权接口在 Header 携带 `Authorization: Bearer <token>`。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 否 | 登录，返回 JWT + 用户信息 |
| POST | `/api/auth/register` | 否 | 注册新用户 |
| GET | `/api/auth/me` | 是 | 获取当前用户 |
| GET | `/api/bootstrap` | 否 | 客户端启动聚合配置（系统配置只读） |
| GET/POST/PUT/DELETE | `/api/providers` | 读否 / 写 admin | 供应商管理 |
| GET/POST/PUT/DELETE | `/api/models` | 读否 / 写 admin | 模型管理 |
| GET/POST/PUT/DELETE | `/api/features` | 读否 / 写 admin | 功能入口管理 |
| GET/POST/PUT/DELETE | `/api/video-config` | 读否 / 写 admin | 视频参数选项管理 |
| GET/POST/PUT/DELETE | `/api/users` | admin | 用户账号管理 |
| GET/POST/DELETE | `/api/user/api-keys` | 是（user） | **当前用户**私有 API 密钥 |
| GET/POST | `/api/user/configs` | 是（user） | **当前用户**私有布局配置 |
| GET | `/api/health` | 否 | 健康检查 |

---

## 八、数据隔离说明

系统配置与用户配置分离，用户之间互相隔离：

- **系统配置**（providers / models / features / video_config_options / users）：全局共享，**公开读**、**仅管理员写**。所有用户看到同一份。
- **用户私有配置**（user_api_keys / user_configs）：按 `user_id` 隔离。每个用户**只能看到系统配置 + 自己的设置**，无法看到其他用户的密钥与布局。

客户端同步逻辑：

- 用户密钥：本地保存（zustand persist）+ 登录后同步到后端 `user_api_keys`；登录时从后端拉取并合并。
- 布局配置（列数 / 卡片样式 / 面板尺寸 / 透明度 / 功能排序）：本地保存 + 变更后防抖（800ms）推送到后端 `user_configs`；登录时从后端拉取并应用。

---

## 九、数据库表结构

系统配置表（全局）：

- `providers(id, name, key_hint, url, sort_order, is_active, ...)`
- `models(id, provider_id→providers, name, type, description, supports_i2v, resolution, speed, price, ...)`
- `features(id, name, icon, description, pinned, sort_order, is_active, ...)`
- `video_config_options(id, config_key, option_value, option_label, sort_order, is_active, UNIQUE(config_key, option_value))`
- `users(id, username UNIQUE, password_hash, role, is_active, ...)`

用户私有配置表（按 user_id 隔离）：

- `user_api_keys(id, user_id→users, provider_id, encrypted_key, UNIQUE(user_id, provider_id))`
- `user_configs(id, user_id→users, config_key, config_value, config_type, UNIQUE(user_id, config_key))`

---

## 十、常见问题

**Q：启动报「数据库连接失败」？**
A：确认 MySQL 已运行、`DATABASE_URL` 正确、库已创建（`stunning_fast`）。可用 `mysql -u root -p -e "SELECT 1;" stunning_fast` 验证连通。

**Q：访问 `/admin` 提示「管理后台未构建」？**
A：先执行 `cd server && npm run admin:build`。

**Q：`npm install` 在 server 目录报 `bcrypt` 编译失败？**
A：本项目已改用纯 JS 的 `bcryptjs`（同 API）。若仍报错，确认 `package.json` 依赖是 `bcryptjs` 而非 `bcrypt`，删 `node_modules` 与 `package-lock.json` 重装。

**Q：桌面客户端登录提示「无法连接后台服务」？**
A：后端服务未启动或端口不是 4178。先 `cd server && npm run dev`，再启动客户端。

**Q：改了系统配置，客户端没生效？**
A：客户端在启动时拉取一次 bootstrap。重启客户端即可刷新；或客户端内重新进入功能页会读取 store 中已加载的配置。

**Q：管理员密码忘了？**
A：连库执行 `UPDATE users SET password_hash='' WHERE username='admin';` 后重启服务（会因空 hash 无法登录），或直接删该行让服务重建（仅当 username 非默认时）；更稳妥的是用 SQL 重置（需用 bcryptjs 重新生成 hash）。日常建议通过另一管理员在后台改密。
