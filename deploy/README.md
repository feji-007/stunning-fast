# 绝色测试环境 - Docker 部署

服务器：公网 `1.194.28.136` · 系统 Ubuntu Server 26.04 64位 · 域名 `jueseai.com`（未 ICP 备案，暂用 IP）· 测试环境

## 文件清单

| 文件 | 用途 |
|---|---|
| `Dockerfile` | 多阶段构建后端镜像（builder 构 TS/SPA + runtime 只装 prod 依赖） |
| `docker-compose.yml` | 编排 mysql + server + nginx 三容器 |
| `nginx.juese.conf` | 容器内 Nginx 反代配置（挂载到 nginx 容器） |
| `.env.example` | compose 变量模板（拷贝为 .env 后修改） |
| `.dockerignore` | 缩小构建上下文 |
| `docker-deploy.sh` | Linux/macOS 上传源码并在服务器构建脚本 |
| `docker-deploy.ps1` | Windows PowerShell 上传源码并在服务器构建脚本 |

## 一次性准备

### 服务器端（Ubuntu Server 26.04，仅做一次）

脚本已内置 `--setup` 子命令，会通过 `apt-get` 安装 docker-ce 全套环境：

```bash
# 方式 A：用脚本内置命令（推荐，自动用 apt-get 装 docker-ce + compose 插件 + rsync + unzip）
bash deploy/docker-deploy.sh --setup
# Windows 本地：powershell -File deploy\docker-deploy.ps1 -Setup
```

```bash
# 方式 B：手动执行等价命令
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin rsync unzip
systemctl enable docker && systemctl start docker
docker --version && docker compose version
```

### 本地（仅做一次）

- 配 SSH 免密：`ssh-copy-id root@1.194.28.136`

## 部署方式

### Windows 本地（使用系统自带 Windows PowerShell 5.1）
```powershell
# 首次：在 deploy\ 下生成 .env 并按需修改
copy deploy\.env.example deploy\.env
notepad deploy\.env

# 一键部署：上传构建上下文，服务器构建镜像并启动
powershell -File deploy\docker-deploy.ps1

# 服务器无缓存重新构建
powershell -File deploy\docker-deploy.ps1 -Rebuild
```

### macOS/Linux 本地
```bash
# 首次：在 deploy/ 下生成 .env 并按需修改
cp deploy/.env.example deploy/.env
vi deploy/.env

# 一键部署：上传构建上下文，服务器构建镜像并启动
bash deploy/docker-deploy.sh

# 服务器无缓存重新构建
bash deploy/docker-deploy.sh --rebuild
```

脚本自动完成：同步项目根目录（排除无关构建产物）→ 服务器 `docker compose build` → `docker compose up -d` → 健康检查。

服务器上的 `deploy/.env` 保存数据库、JWT 和管理员密码。首次部署若服务器没有 `.env`，脚本只会生成模板并退出，请通过 SSH 编辑服务器上的文件后重新执行部署。

## 访问地址

| 项 | 地址 |
|---|---|
| API | `http://1.194.28.136/api` |
| 管理后台 | `http://1.194.28.136/admin` |
| 健康检查 | `http://1.194.28.136/api/health` |

## 常用命令

| 场景 | Linux/macOS | Windows |
|---|---|---|
| 首次装 Docker 环境 | `bash deploy/docker-deploy.sh --setup` | `powershell -File deploy\docker-deploy.ps1 -Setup` |
| 部署/更新 | `bash deploy/docker-deploy.sh` | `powershell -File deploy\docker-deploy.ps1` |
| 强制重建镜像 | `bash deploy/docker-deploy.sh --rebuild` | `powershell -File deploy\docker-deploy.ps1 -Rebuild` |
| 查看实时日志 | `bash deploy/docker-deploy.sh --logs` | `powershell -File deploy\docker-deploy.ps1 -Logs` |
| 查看容器状态 | `bash deploy/docker-deploy.sh --ps` | `powershell -File deploy\docker-deploy.ps1 -Ps` |
| 停止（保留数据） | `bash deploy/docker-deploy.sh --down` | `powershell -File deploy\docker-deploy.ps1 -Down` |
| 清库重置（危险） | `bash deploy/docker-deploy.sh --reset` | `powershell -File deploy\docker-deploy.ps1 -Reset` |

## 架构

```
公网 1.194.28.136:80
        │
        ▼
┌─────────────────────────────────────────┐
│ Docker 网络: juese_net                  │
│                                         │
│  ┌──────────┐    ┌────────────────┐    │
│  │  nginx   │───▶│  server (Node) │    │
│  │  :80     │    │  :4178         │    │
│  └──────────┘    └────┬───────────┘    │
│                       │                 │
│                       ▼                 │
│                 ┌───────────┐           │
│                 │  mysql    │           │
│                 │  :3306    │           │
│                 └───────────┘           │
│                 数据卷: juese_mysql_data │
└─────────────────────────────────────────┘
```

- `nginx`、`server`、`mysql` 三容器同网络
- `mysql:3306` 与 `server:4178` 仅绑定 `127.0.0.1`，公网不可直达
- 数据持久化到 named volume `juese_mysql_data`

## 安全组放行

云控制台安全组规则：

| 端口 | 方向 | 用途 |
|---|---|---|
| 80/TCP | 公网入 | Nginx |
| 22/TCP | 公网入（建议白名单） | SSH |
| 4178/TCP | **不放行** | server 仅容器内访问 |
| 3306/TCP | **不放行** | MySQL 仅容器内访问 |

## 测试场景说明

- 测试环境放开 `CORS_ORIGIN=*`，JWT 用默认 secret
- CDN 地址与 [site/.vitepress/config.ts](file:///e:/projects/stunning-fast/site/.vitepress/config.ts) 的下载基址**未修改**，因为安装包分发属于客户端分发链路，与后端测试部署解耦，可保留原样不动
- 后续转正式环境，再调整 `JWT_SECRET`、`CORS_ORIGIN`、`CLIENT_API_BASE` 并启用 HTTPS

## 升级 HTTPS（jueseai.com 备案后）

1. 在天翼云控制台完成 `jueseai.com` 的 ICP 备案
2. 修改 `deploy/nginx.juese.conf`：
   ```nginx
   server_name jueseai.com www.jueseai.com;
   ```
3. 配置 HTTPS（可选，用 Let's Encrypt）：
   ```nginx
   listen 443 ssl http2;
   ssl_certificate     /etc/letsencrypt/live/jueseai.com/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/jueseai.com/privkey.pem;
   ```
4. 把 `.env` 的 `CLIENT_API_BASE` 改为 `https://jueseai.com`，重跑部署脚本。
