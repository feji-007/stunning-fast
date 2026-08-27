# 绝色 · Stunning Fast

> AI 视频生成桌面助手 —— 悬浮窗模式 · 多模型聚合 · 后台统一管理 · 自动更新。

**绝色**是基于 Electron 的轻量桌面应用，启动后以迷你悬浮窗驻留桌面，悬停展开主面板，离开自动折叠。内置视频生成、资源库、自定义三大功能，已接入通义万相 / 火山 Seedance / 快手可灵等多家视频生成 API。配套 **Node 后端 + MySQL** 统一管理供应商/模型/用户/密钥/视频参数，并提供 **VitePress 官网** 与 **Cloudflare R2+CDN 发布链路**。

## 功能特性

### 客户端
- 悬浮窗交互：迷你触点，悬停展开，离开自动折叠，可拖动并记忆位置
- 免登录启动，受限功能才弹登录/注册
- 视频生成：模型/清晰度/宽高比可选，进度回显，内嵌预览下载
- 资源库 + 自定义（功能排序、置顶、开机自启）
- 多供应商共存，协议差异由主进程归一化

### 后台管理
- 供应商/模型/功能/视频参数 全部后台维护，告别硬编码
- 用户配置隔离：系统配置全局共享，个人密钥与布局按用户隔离
- 浏览器访问 Web 后台（`/admin`），角色权限（admin/user）
- 数据库表与种子数据服务启动自动建（存在则跳过）

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面运行时 | Electron 31 + electron-updater（自动更新） |
| 渲染层 | React 18 + TypeScript + Vite 5 + TailwindCSS 3 |
| 状态 | Zustand（持久化）+ electron-store |
| 后端 | Node.js + Express + JWT + bcryptjs |
| 数据库 | MySQL 8.x |
| 管理后台 | React + Vite + Tailwind（托管于后端 `/admin`） |
| 官网/文档 | VitePress（`site/`） |
| 发布 | electron-builder（nsis-web）+ Cloudflare R2+CDN |
| CI/CD | GitHub Actions |

## 系统架构

| 端 | 位置 | 职责 |
| --- | --- | --- |
| 客户端 | 桌面（Electron） | UI + 视频生成（本地调模型 API） |
| 后端 | 应用服务器 | Express API + MySQL + 管理后台 |
| 官网/文档 | R2+CDN | VitePress 静态站 |
| 发布链路 | R2+CDN | web installer + 7z + latest.yml |

应用服务器只扛 API，下载/官网/更新全走 R2+CDN，带宽需求极低。

## 项目结构

```
stunning-fast/
├── electron/          # 主进程（窗口/托盘/IPC/视频生成/自动更新）
├── src/                # 渲染层（React 组件 + 状态 + API 客户端）
├── server/             # 后端（Express + MySQL + 管理后台 + SQL）
│   ├── src/            #   routes / db / middleware / config
│   ├── admin/          #   管理后台源码
│   └── sql/init.sql    #   建表脚本
├── site/               # VitePress 官网/文档
├── scripts/            # R2 上传脚本（upload-release / upload-site / r2-client）
├── .github/workflows/  # CI/CD 自动发布
├── electron-builder.yml
├── DEPLOY.md           # 部署文档
├── SETUP.md            # 启动文档
└── package.json
```

## 环境要求

- Node.js ≥ 18（推荐 20+）
- MySQL 8.x
- Windows 10/11（客户端）；Linux（后端服务器）

## 快速开始

```bash
# 1. 建库
mysql -u root -p < server/sql/init.sql

# 2. 配置后端环境变量
cp server/.env.example server/.env   # 按需改数据库密码

# 3. 启动后端（自动建表 + 种子 + 托管 /admin）
cd server && npm install && npm run admin:build && npm run dev

# 4. 启动客户端（项目根目录）
cd .. && npm install && npm run dev
```

管理后台：`http://localhost:4178/admin`（账号 `admin/admin123`）
详细启动步骤见 [SETUP.md](./SETUP.md)。

## 配置

| 文件 | 用途 | 必填 |
| --- | --- | --- |
| `server/.env` | 后端（数据库/JWT/管理员） | 启动后端必需 |
| `scripts/.env` | R2 上传凭证 | 发布前必需 |

模板见各目录 `.env.example`（`.env` 已被 git 忽略，含密钥勿提交）。

## 打包与发布

```bash
# 打包（生成 web installer + 7z + latest.yml）
npm run dist

# 上传到 R2（需先配 scripts/.env）
npm run upload:release   # 上传安装包 + 清单 + 刷新 CDN
npm run upload:site      # 上传官网
```

- Windows 产物：`release/nsis-web/juese-{version}-setup.exe`（约 676 KB web installer）+ `.nsis.7z`（完整包）
- CI 自动发布：`git tag v1.2.3 && git push origin v1.2.3`（见 `.github/workflows/release.yml`）
- 详见 [DEPLOY.md](./DEPLOY.md) 与 [site/guide/cloudflare-setup.md](./site/guide/cloudflare-setup.md)

## 自动更新

客户端内置 electron-updater，启动后从 `https://cdn.juese.app/releases/latest.yml` 检测更新，有新版静默下载、退出时安装。仅打包后生效（开发模式跳过）。

## 主题色：绝色巴黎香槟

| 色阶 | 色值 | 用途 |
| --- | --- | --- |
| `brand-50` | `#FBF5EA` | 象牙香槟底 |
| `brand-400` | `#CDA050` | 亮香槟金 |
| `brand-500` | `#946C29` | 古金（主按钮） |

完整色阶见 `tailwind.config.js` 的 `brand` 色阶，全站 `brand-*` 自动跟随。

## 已接入视频生成供应商

| 供应商 | 鉴权 | 模型 |
| --- | --- | --- |
| 通义万相 (DashScope) | Bearer `sk-xxx` | wan2.7 / 2.6 / 2.2 / 2.1-turbo / 2.1-plus |
| 火山 Seedance (Ark) | Bearer `volc-sk-xxx` | Seedance 2.5 / 2.0 / 2.0-fast / 1.5-pro / 1.0-pro-fast |
| 快手可灵 (Kling) | JWT（AK:SK） | kling-v3 / v2-master / v2.5-turbo / v1.6 |

> 供应商/模型现由后台管理维护，客户端启动拉取 `bootstrap` 配置聚合接口。

## 文档

- [SETUP.md](./SETUP.md) — 启动指南
- [DEPLOY.md](./DEPLOY.md) — 部署运维
- [site/guide/](./site/guide/) — 安装 / 部署 / 服务器配置 / Cloudflare 配置
- [site/](./site/) — VitePress 官网（`cd site && npm run dev` 本地预览）

## License

MIT