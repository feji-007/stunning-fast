# 部署运维

推荐架构：**应用服务器（Docker）+ 天翼云 ZOS 对象存储托管下载与官网**。下载洪峰不冲击业务接口。

## 架构总览

| 部分 | 部署位置 | 承载内容 |
| --- | --- | --- |
| 后端 API + 管理后台 + MySQL | 应用服务器（Docker Compose） | Express 服务、MySQL、admin Web |
| 安装包 / 官网 / 文档 / 更新清单 | 天翼云 ZOS（可绑定 CDN） | 静态资源 + 安装包 + `latest*.yml` |

> 应用服务器只扛 API 与数据库，下载/官网/更新全走 ZOS，带宽需求极低。

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

::: warning 存储方案
当前 `electron-builder.yml` 的 `publish.url` 与 `site/.vitepress/config.ts` 的 `DOWNLOAD_BASE` 均指向天翼云 ZOS `https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/`。后续如需绑定自定义 CDN 域名（如 `https://cdn.jueseai.com/release/`），同步修改这两处即可。
:::

## 二、天翼云 ZOS 对象存储（下载与官网）

ZOS Bucket `bucket-5620` 承载两类资源（通过 `release/` 前缀隔离安装包）：

```
bucket-5620/
└── release/                   ← 安装包 + 自动更新清单
    ├── latest.yml             ← Windows 自动更新清单
    ├── latest-mac.yml         ← macOS 自动更新清单
    ├── latest-linux.yml       ← Linux 自动更新清单
    ├── juese-{version}-setup.exe
    └── juese-{version}-*.nsis.7z
```

缓存策略由上传脚本通过 `Cache-Control` 头控制，ZOS 透传给客户端，**无需额外配置**：

| 文件类型 | Cache-Control | 说明 |
| --- | --- | --- |
| `release/latest*.yml` | `max-age=300`（5 分钟） | 更新清单，需较快生效 |
| `release/*.exe / *.dmg / *.blockmap` | `max-age=2592000, immutable`（30 天） | 安装包不变，长缓存 |
| 官网 `*.html` | `max-age=300` | 首页内容可能更新 |
| 官网 `assets/*`（js/css/图片） | `max-age=2592000, immutable` | 带 hash，可长缓存 |

::: tip 天翼云 ZOS 配置
Bucket `bucket-5620`，外网 endpoint `https://zhengzhou5.zos.ctyun.cn`，公开访问基址 `https://bucket-5620.zhengzhou5.zos.ctyun.cn`。需在控制台为 `release/` 前缀开启公共读，否则客户端无法拉取 `latest.yml`。凭证模板见 `deploy/.oss.env.example`。
:::

## 三、构建并发布安装包

### 方式 A：本地打包 + 手动上传

前置：先在 `deploy/.oss.env` 配置天翼云 ZOS 凭证（参考 `deploy/.oss.env.example`）。

```bash
# 1. 打包（生成 release/ 下的安装包与 latest*.yml）
npm run dist

# 2. 上传到天翼云 ZOS bucket-5620/release/ 前缀
npm run upload:oss
```

> 也可使用一键脚本：`powershell -File scripts\release-to-oss.ps1`（自动打包+上传）或 `bash scripts/release-to-oss.sh`。

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

Workflow 自动完成：`npm run dist` → `npm run upload:oss` → 构建 VitePress → `npm run upload:site` → 创建 GitHub Release 备份。需在仓库 Secrets 配置 `OSS_*`（`OSS_ACCESS_KEY_ID` / `OSS_SECRET_ACCESS_KEY` / `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_PUBLIC_BASE`）。

## 四、构建并发布官网

```bash
# 1. 本地构建 VitePress
cd site
npm install
npm run build          # 产物在 site/.vitepress/dist

# 2. 上传到天翼云 ZOS
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

::: tip 缓存生效
`latest*.yml` 是客户端检查更新的入口。上传脚本已为 `latest*.yml` 设置 `Cache-Control: max-age=300`（5 分钟），因此上传后最长 5 分钟内客户端可检测到新版本。ZOS 默认遵循源站 `Cache-Control` 头，无需额外配置。
:::

## 六、配置项速查

### `electron-builder.yml`

```yaml
publish:
  provider: generic
  url: https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/   # 天翼云 ZOS；后续可换自定义 CDN 域名
  channel: latest
```

### `site/.vitepress/config.ts`

```ts
// 下载分发基址：天翼云 ZOS bucket-5620/release/
const DOWNLOAD_BASE = 'https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/'
```

### `deploy/.oss.env`

天翼云 ZOS 上传凭证（发布前必需，后端运行不需要）：`OSS_ACCESS_KEY_ID` / `OSS_SECRET_ACCESS_KEY` / `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_PUBLIC_BASE` / `OSS_RELEASE_PREFIX`。模板见 `deploy/.oss.env.example`。

## 七、发布检查清单

每次发版前依次核对：

- [ ] `package.json` 中 `version` 已升版本号
- [ ] `electron-builder.yml` 中 `publish.url` 指向目标环境
- [ ] `site/.vitepress/config.ts` 的 `DOWNLOAD_BASE` 与 `publish.url` 一致
- [ ] 服务端迁移脚本（若有 schema 变更）已准备好
- [ ] 本地 `npm run dist` 产物完整，安装测试通过
- [ ] `release/latest*.yml` 中 `version` 与安装包一致
- [ ] 上传到天翼云 ZOS `release/` 后确认 `latest.yml` 可公开访问
- [ ] 浏览器访问 `<publish.url>/latest.yml` 确认新版可见
- [ ] 旧客户端启动后能拉到新版本并自动下载
- [ ] 官网 `download.md` 中版本说明已同步
