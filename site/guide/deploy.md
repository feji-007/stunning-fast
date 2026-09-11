# 部署运维

推荐架构：**应用服务器（Docker）+ Cloudflare R2/CDN 托管下载与官网**。下载洪峰不冲击业务接口。

## 架构总览

| 部分 | 部署位置 | 承载内容 |
| --- | --- | --- |
| 后端 API + 管理后台 + MySQL | 应用服务器（Docker Compose） | Express 服务、MySQL、admin Web |
| 安装包 / 官网 / 文档 / 更新清单 | Cloudflare R2 + CDN | 静态资源 + 安装包 + `latest*.yml` |

> 应用服务器只扛 API 与数据库，下载/官网/更新全走 R2+CDN，带宽需求极低。

## 一、应用服务器（Docker 部署）

项目根目录 `deploy/` 提供 Docker 化部署套件（`Dockerfile` + `docker-compose.yml` + `nginx.juese.conf` + 一键脚本），编排 `nginx` / `server` / `mysql` 三容器，数据持久化到 named volume。

```bash
# 首次：在 deploy/ 下生成 .env 并按需修改
cp deploy/.env.example deploy/.env

# 一键部署（Linux/macOS）
bash deploy/docker-deploy.sh
# Windows 本地
powershell -File deploy\docker-deploy.ps1
```

脚本自动完成：同步 `deploy/` 到服务器 → 远程 `docker compose build && up -d` → 健康检查 → 打印访问地址。

::: tip 详细命令清单
首次装 Docker、强制重建镜像、查看日志、停止、清库重置等完整命令与排错见仓库 [`deploy/README.md`](https://github.com/)。
:::

::: warning 测试环境 vs 正式环境
当前 `electron-builder.yml` 的 `publish.url` 与 `site/.vitepress/config.ts` 的 `DOWNLOAD_BASE` 均指向测试服务器 `http://8.219.219.110/releases/`。转正式环境时改为 `https://cdn.juese.app/releases/` 并启用 HTTPS（修改 `deploy/nginx.juese.conf` 与 `.env` 的 `CLIENT_API_BASE`）。
:::

## 二、Cloudflare R2 + CDN（下载与官网）

R2 桶 `juese-assets` 承载两类资源：

```
juese-assets/
├── releases/                  ← 安装包 + 自动更新清单
│   ├── latest.yml             ← Windows 自动更新清单
│   ├── latest-mac.yml         ← macOS 自动更新清单
│   ├── latest-linux.yml       ← Linux 自动更新清单
│   ├── juese-{version}-setup.exe
│   └── juese-{version}-*.nsis.7z
└── （根目录）                  ← 官网与文档静态产物
    ├── index.html
    ├── download.html
    └── guide/ ...
```

缓存策略由上传脚本通过 `Cache-Control` 头控制，Cloudflare 默认遵循源站规则，**无需额外配置**：

| 文件类型 | Cache-Control | 说明 |
| --- | --- | --- |
| `releases/latest*.yml` | `max-age=300`（5 分钟） | 更新清单，需较快生效 |
| `releases/*.exe / *.dmg / *.blockmap` | `max-age=2592000, immutable`（30 天） | 安装包不变，长缓存 |
| 官网 `*.html` | `max-age=300` | 首页内容可能更新 |
| 官网 `assets/*`（js/css/图片） | `max-age=2592000, immutable` | 带 hash，可长缓存 |

::: tip Cloudflare R2 详细配置
创建桶、API Token、绑定自定义域名、Cache Purge token 的完整步骤见 [Cloudflare 配置](/guide/cloudflare-setup)。
:::

## 三、构建并发布安装包

### 方式 A：本地打包 + 手动上传

前置：先在 `scripts/.env` 配置 R2 凭证（参考 `scripts/.env.example`）。

```bash
# 1. 打包（生成 release/ 下的安装包与 latest*.yml）
npm run dist

# 2. 上传到 R2 的 releases/ 前缀并刷新 CDN 缓存
npm run upload:release
```

产物（以 1.0.0 为例）：

```
release/
├── nsis-web/
│   ├── juese-1.0.0-setup.exe         # Windows web installer（约 676 KB）
│   ├── juese-1.0.0-x64.nsis.7z       # 完整包
│   └── latest.yml                    # Windows 自动更新清单
└── win-unpacked/                     # 解压版（不上传，仅本地调试用）
```

### 方式 B：CI 自动发布（推荐）

推送 `v*` 标签触发 [.github/workflows/release.yml](https://github.com/)：

```bash
git tag v1.2.3
git push origin v1.2.3
```

Workflow 自动完成：`npm run dist` → `npm run upload:release` → 构建 VitePress → `npm run upload:site` → 创建 GitHub Release 备份。需在仓库 Secrets 配置 `R2_*` 与 `CF_*`（详见 [Cloudflare 配置 > CI/CD Secrets](/guide/cloudflare-setup#_9-cicd-secrets-github-actions)）。

## 四、构建并发布官网

```bash
# 1. 本地构建 VitePress
cd site
npm install
npm run build          # 产物在 site/.vitepress/dist

# 2. 上传到 R2 根目录并刷新首页缓存
cd ..
npm run upload:site
```

CI（方式 B）已内置此步骤，推标签即自动发布。

## 五、自动更新机制

客户端内置 electron-updater，启动后从 `publish.url` 拉取 `latest.yml` 检测更新：

1. 客户端启动（`electron/main.ts` 的 `app.whenReady`）调用 `autoUpdater.checkForUpdatesAndNotify()`。
2. electron-updater 拉 `<publish.url>/latest.yml`，比对版本号。
3. 有新版本 → 静默下载新安装包到本地缓存（`autoDownload = true`）。
4. 下载完成触发 `update-downloaded`；用户下次退出应用时自动安装（`autoInstallOnAppQuit = true`）。
5. 开发模式跳过更新检查，避免缺失 `app-update.yml` 报错。

::: warning 发布后必须刷新 CDN
`latest*.yml` 是客户端检查更新的入口。`upload:release` 脚本已内置 CDN 缓存刷新（需配 `CF_API_TOKEN`/`CF_ZONE_ID`）；若未配置，最长等 5 分钟短缓存过期后生效。
:::

## 六、配置项速查

### `electron-builder.yml`

```yaml
publish:
  provider: generic
  url: http://8.219.219.110/releases/   # 测试环境；正式换 https://cdn.juese.app/releases/
  channel: latest
```

### `site/.vitepress/config.ts`

```ts
// 下载分发基址：测试环境用云服务器公网 IP + Nginx 托管
// 正式环境换 CDN 域名，如 https://cdn.juese.app/releases/
const DOWNLOAD_BASE = 'http://8.219.219.110/releases/'
```

### `scripts/.env`

R2 上传凭证（发布前必需，后端运行不需要）：`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE` / `CF_API_TOKEN` / `CF_ZONE_ID`。模板见 `scripts/.env.example`。

## 七、发布检查清单

每次发版前依次核对：

- [ ] `package.json` 中 `version` 已升版本号
- [ ] `electron-builder.yml` 中 `publish.url` 指向目标环境
- [ ] `site/.vitepress/config.ts` 的 `DOWNLOAD_BASE` 与 `publish.url` 一致
- [ ] 服务端迁移脚本（若有 schema 变更）已准备好
- [ ] 本地 `npm run dist` 产物完整，安装测试通过
- [ ] `release/latest*.yml` 中 `version` 与安装包一致
- [ ] 上传到 R2 `releases/` 后 CDN 缓存已刷新
- [ ] 浏览器访问 `<publish.url>/latest.yml` 确认新版可见
- [ ] 旧客户端启动后能拉到新版本并自动下载
- [ ] 官网 `download.md` 中版本说明已同步
