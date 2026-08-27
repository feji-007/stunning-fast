# 绝色 · 部署运维指南

本文档描述「绝色」从开发到上线的完整部署方案。整体采用 **应用服务器 + OSS/CDN** 双轨架构：

| 部分 | 部署位置 | 规格 | 承载内容 |
| --- | --- | --- | --- |
| 后端 API + 管理后台 | 应用服务器 | 4C8G / 100G 系统盘 | Express 服务、MySQL、admin Web |
| 安装包 / 官网 / 文档 | OSS + CDN | 按流量计费 | 静态资源 + 安装包 + 自动更新清单 |

> 应用服务器扛计算与数据库，OSS+CDN 扛下载与静态资源带宽，两者解耦后可独立扩容。

---

## 一、应用服务器（API + 管理后台 + 数据库）

### 1.1 机器规格

- **CPU / 内存**：4 核 8G（生产最小起步；并发高可升 8C16G）
- **磁盘**：100G 系统盘 + 独立数据盘挂到 `/data`（MySQL 数据目录）
- **系统**：Ubuntu 22.04 LTS / Debian 12
- **公网带宽**：5Mbps 起（仅 API 流量，下载流量走 CDN）

### 1.2 域名与端口

| 用途 | 域名 | 端口 | 说明 |
| --- | --- | --- | --- |
| API 服务 | `api.juese.app` | 443（HTTPS） | 客户端访问的接口入口 |
| 管理后台 | `api.juese.app/admin` | 443 | 与 API 同域，路径分发 |
| MySQL | 内网 | 3306 | 仅监听 `127.0.0.1`，不暴露公网 |

> 客户端默认连接 `https://api.juese.app`，可通过环境变量 `VITE_API_BASE_URL` 覆盖。

### 1.3 安装依赖

```bash
# 1. Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. MySQL 8.x
# MySQL 通过 apt 系统包管理器安装，无需额外仓库
# (跳过 GPG key 导入)
sudo apt-get install -y mysql-server
sudo mysql_secure_installation

# 3. nginx（反向代理 + HTTPS）
sudo apt-get install -y nginx

# 4. pm2（进程守护）
sudo npm install -g pm2
```

### 1.4 数据库准备

```bash
sudo mysql <<'SQL'
CREATE USER 'juese'@'localhost' IDENTIFIED BY 'change_me_in_prod';
CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON stunning_fast.* TO 'juese'@'localhost';
FLUSH PRIVILEGES;
SQL
```

### 1.5 部署后端服务

```bash
# 拉代码
git clone <repo> /opt/juese && cd /opt/juese/server

# 安装依赖（生产依赖，跳过 devDependencies）
npm ci --omit=dev

# 配置环境变量
cp .env.example .env
# 编辑 .env：DATABASE_URL、JWT_SECRET、PORT=4178、CORS 白名单等

# 构建管理后台静态产物（首次或更新 admin 时执行）
npm run admin:build

# 构建服务端 TS
npm run build

# pm2 守护启动
pm2 start dist/index.js --name juese-api
pm2 save
pm2 startup   # 开机自启
```

> 服务启动时会自动执行 `CREATE TABLE IF NOT EXISTS` + 种子数据，**无需手动建表**。如库已存在则忽略。

### 1.6 nginx 反向代理

`/etc/nginx/sites-available/juese.conf`：

```nginx
server {
    listen 80;
    server_name api.juese.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.juese.app;

    ssl_certificate     /etc/letsencrypt/live/api.juese.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.juese.app/privkey.pem;

    # 上传体积（视频参数、用户头像等）
    client_max_body_size 20m;

    # API 接口
    location /api/ {
        proxy_pass http://127.0.0.1:4178/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 管理后台静态产物
    location /admin/ {
        alias /opt/juese/server/admin-dist/;
        try_files $uri $uri/ /admin/index.html;
    }

    # 健康检查
    location /health {
        proxy_pass http://127.0.0.1:4178/health;
    }
}
```

启用 + 重载：

```bash
sudo ln -s /etc/nginx/sites-available/juese.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS 证书使用 Let's Encrypt：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.juese.app
```

### 1.7 备份

- **数据库**：每日 03:00 `mysqldump` 到 `/data/backup/`，保留 14 天；周备归档到 OSS。
- **应用配置**：`.env` 纳入 Git 之外的密钥管理（或密钥服务），定期归档。

---

## 二、OSS + CDN（安装包 / 官网 / 文档 / 更新清单）

### 2.1 OSS 桶结构

以阿里云 OSS / 腾讯云 COS 为例，桶名 `juese-assets`：

```
juese-assets/
├── index.html                  ← 官网首页（VitePress 产物）
├── download.html
├── guide/
├── api/
├── assets/
└── releases/                   ← 安装包 + 自动更新清单
    ├── latest.yml              ← Windows 自动更新清单
    ├── latest-mac.yml          ← macOS 自动更新清单
    ├── latest-linux.yml        ← Linux 自动更新清单
    ├── juese-1.0.0-setup.exe
    ├── juese-1.0.0-setup.exe.blockmap
    ├── juese-1.0.0-x64.dmg
    ├── juese-1.0.0-arm64.dmg
    └── juese-1.0.0.AppImage
```

### 2.2 CDN 绑定

- 绑定域名：`cdn.juese.app`
- 回源：`juese-assets` 桶
- 加速类型：静态资源 + 大文件下载
- 缓存策略：
  - `releases/*` 缓存 7 天（版本号变了文件名也变，可长缓存）
  - `*.html` 缓存 5 分钟（官网/文档更新及时）
  - `assets/*` 缓存 30 天（带 hash 的静态资源）

> 客户端 `electron-builder.yml` 中 `publish.url` 已配置为 `https://cdn.juese.app/releases/`。

### 2.3 官网与文档构建发布

```bash
# 在 site/ 目录
cd site
npm ci
npm run build            # 产物在 site/.vitepress/dist

# 同步到 OSS（以 ossutil 为例）
ossutil cp -r .vitepress/dist/ oss://juese-assets/ --update
```

---

## 三、客户端打包与发布

### 3.1 本地打包

```bash
# 项目根目录
npm ci
npm run dist              # 构建 + electron-builder 产出安装包到 release/
```

产物（以 1.0.0 为例）：

```
release/
├── juese-1.0.0-setup.exe               # Windows NSIS 安装包
├── juese-1.0.0-setup.exe.blockmap      # 增量更新用
├── latest.yml                          # Windows 自动更新清单
├── juese-1.0.0-x64.dmg                 # macOS Intel
├── juese-1.0.0-arm64.dmg               # macOS Apple Silicon
├── latest-mac.yml                      # macOS 自动更新清单
├── juese-1.0.0.AppImage                # Linux
└── latest-linux.yml                    # Linux 自动更新清单
```

### 3.2 发布到 CDN

将 `release/` 下全部产物上传到 OSS `releases/` 目录：

```bash
ossutil cp -r release/ oss://juese-assets/releases/ --update
# 触发 CDN 缓存刷新（重要：latest*.yml 必须立即生效）
ossutil cdn-refresh --path https://cdn.juese.app/releases/latest.yml
ossutil cdn-refresh --path https://cdn.juese.app/releases/latest-mac.yml
ossutil cdn-refresh --path https://cdn.juese.app/releases/latest-linux.yml
```

> `latest*.yml` 是 electron-updater 检查更新的入口，**发布后必须刷新 CDN 缓存**，否则客户端读到旧清单。

### 3.3 客户端更新流程

1. 客户端启动时（`electron/main.ts` 中 `app.whenReady`）调用 `autoUpdater.checkForUpdatesAndNotify()`。
2. electron-updater 拉 `https://cdn.juese.app/releases/latest.yml`，比对版本号。
3. 有新版本 → 静默下载新安装包到本地缓存（`autoDownload = true`）。
4. 下载完成触发 `update-downloaded` 事件；用户下次退出应用时自动安装（`autoInstallOnAppQuit = true`）。
5. 开发模式下跳过更新检查，避免缺失 `app-update.yml` 报错。

---

## 四、域名清单

| 域名 | 类型 | 指向 | 用途 |
| --- | --- | --- | --- |
| `juese.app` | A / CNAME | OSS 静态网站托管 | 官网入口 |
| `cdn.juese.app` | CNAME | CDN 加速域名 | 安装包、官网资源、更新清单 |
| `api.juese.app` | A | 应用服务器公网 IP | API + 管理后台 |
| `docs.juese.app`（可选） | CNAME | CDN | 文档站独立子域 |

> 三个域名解析独立，便于流量拆分与故障隔离。

---

## 五、环境变量速查

### 服务端 `server/.env`

```ini
# 数据库
DATABASE_URL=mysql://juese:change_me_in_prod@127.0.0.1:3306/stunning_fast

# JWT
JWT_SECRET=please_use_a_long_random_string
JWT_EXPIRES_IN=7d

# 服务
PORT=4178
NODE_ENV=production
CORS_ORIGIN=https://juese.app

# 管理后台初始账号（仅首次种子数据使用）
ADMIN_INIT_USERNAME=admin
ADMIN_INIT_PASSWORD=admin123
```

### 客户端打包时

```bash
# 覆盖客户端连接的 API 地址（默认 https://api.juese.app）
$env:VITE_API_BASE_URL="https://api.juese.app"
npm run dist
```

---

## 六、发布检查清单（Release Checklist）

每次发版前依次核对：

- [ ] `package.json` 中 `version` 已升版本号
- [ ] `electron-builder.yml` 中 `publish.url` 指向生产 CDN
- [ ] 服务端迁移脚本（若有 schema 变更）已准备好
- [ ] 本地 `npm run dist` 产物完整，安装测试通过
- [ ] `release/latest*.yml` 中 `version` 与安装包一致
- [ ] 上传到 OSS `releases/` 后刷新 CDN 缓存
- [ ] 浏览器访问 `https://cdn.juese.app/releases/latest.yml` 确认新版可见
- [ ] 旧客户端启动后能拉到新版本并自动下载
- [ ] 官网 `download.md` 中版本说明已同步

---

## 七、常见问题

**Q1：客户端提示「检查更新失败」？**
A：优先确认 `https://cdn.juese.app/releases/latest.yml` 浏览器可访问；其次检查 CDN 缓存是否已刷新。

**Q2：管理后台打不开 `/admin`？**
A：检查 `npm run admin:build` 是否执行、nginx `alias` 路径是否正确指向 `server/admin-dist/`。

**Q3：服务重启后表会重建吗？**
A：不会。schema 使用 `CREATE TABLE IF NOT EXISTS`，已存在的表会被跳过。

**Q4：如何修改管理后台初始账号密码？**
A：首次启动后立即登录 `admin/admin123` 修改密码；或直接在 `users` 表中改 `password_hash`（bcryptjs）。

**Q5：能否自建内部更新源？**
A：可以。修改 `electron-builder.yml` 的 `publish.url` 指向私有 OSS/内网 Nginx 静态服务即可，协议兼容 generic provider。