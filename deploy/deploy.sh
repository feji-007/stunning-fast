#!/usr/bin/env bash
# ============================================================
# 绝色后端一键部署脚本（云服务器：8.219.219.110）
# ------------------------------------------------------------
# 用法（在项目根目录本地执行）：
#   bash deploy/deploy.sh
#
# 功能：
#   1. 本地构建后端 (server/dist) 与管理后台 (server/admin/dist)
#   2. 通过 rsync/scp 把产物 + .env + nginx 配置同步到服务器
#   3. 远程执行：npm ci --omit=dev、数据库迁移、pm2 重启、nginx reload
#
# 前置条件：
#   - 本地能 ssh root@8.219.219.110（已配公钥免密）
#   - 服务器已装好：Node.js 18+、MySQL 8.x、Nginx、PM2、rsync
#   - 服务器已建库：CREATE DATABASE stunning_fast CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#   - server/.env 已填好（参考 .env.production.example）
# ============================================================
set -euo pipefail

# ---------- 配置区（按需修改） ----------
REMOTE_USER="root"
REMOTE_HOST="8.219.219.110"
REMOTE_DIR="/opt/juese"                 # 服务器部署目录
NGINX_CONF_SRC="deploy/nginx.juese.conf"
NGINX_CONF_DST="/etc/nginx/conf.d/juese.conf"
APP_NAME="juese-server"

# 颜色
C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[0;33m'; C_RESET='\033[0m'
log()  { echo -e "${C_GREEN}[deploy] $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}[warn] $*${C_RESET}"; }
err()  { echo -e "${C_RED}[error] $*${C_RESET}" >&2; }

# ---------- 0. 前置检查 ----------
[[ -f server/.env ]] || { err "未找到 server/.env，请先创建"; exit 1; }
[[ -f deploy/nginx.juese.conf ]] || { err "未找到 Nginx 配置"; exit 1; }
command -v rsync >/dev/null || { warn "本地未安装 rsync，将回退到 scp"; USE_SCP=1; }

# ---------- 1. 本地构建 ----------
log "1/5 本地构建后端 (server/dist)"
( cd server && npm ci && npm run build )

log "2/5 本地构建管理后台 (server/admin/dist)"
( cd server/admin && npm ci && npm run build )

# ---------- 3. 同步到服务器 ----------
log "3/5 同步文件到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}/server/admin"

# 同步后端运行所需文件（不传 src、ts、tests 等）
if [[ "${USE_SCP:-0}" == "1" ]]; then
  scp -r server/dist server/package.json server/.env "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/server/"
  scp -r server/admin/dist "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/server/admin/"
else
  rsync -az --delete server/dist server/package.json server/.env "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/server/"
  rsync -az --delete server/admin/dist "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/server/admin/"
fi

# 同步 Nginx 配置
log "3/5 同步 Nginx 配置到 ${NGINX_CONF_DST}"
scp "${NGINX_CONF_SRC}" "${REMOTE_USER}@${REMOTE_HOST}:${NGINX_CONF_DST}"

# ---------- 4. 远程：安装生产依赖 + 迁移 + 重启 ----------
log "4/5 远程安装生产依赖 + 数据库迁移 + PM2 重启"
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<REMOTE
set -euo pipefail
cd ${REMOTE_DIR}/server
echo "[remote] 安装生产依赖（跳过 devDependencies）"
npm ci --omit=dev --no-audit --no-fund

echo "[remote] 数据库迁移（幂等）"
npx tsx src/db/migrate.ts || echo "[remote] 跳过迁移或无 migration 脚本"

echo "[remote] PM2 重启"
pm2 describe ${APP_NAME} >/dev/null 2>&1 && pm2 restart ${APP_NAME} --update-env || pm2 start dist/index.js --name ${APP_NAME}
pm2 save
REMOTE

# ---------- 5. 远程：Nginx 测试 + 重载 ----------
log "5/5 远程 Nginx 测试 + 重载"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "nginx -t && nginx -s reload"

# ---------- 6. 部署后自检 ----------
log "部署完成，进行自检..."
sleep 2
if curl -fsS "http://${REMOTE_HOST}/api/health" >/dev/null 2>&1; then
  log "健康检查通过：http://${REMOTE_HOST}/api/health"
else
  warn "健康检查未通过，请排查：ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 logs ${APP_NAME} --lines 50'"
fi

echo ""
log "访问地址："
echo "  API      : http://${REMOTE_HOST}/api"
echo "  管理后台 : http://${REMOTE_HOST}/admin"
echo "  健康检查 : http://${REMOTE_HOST}/api/health"
echo ""
log "常用远程命令："
echo "  查看日志 : ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 logs ${APP_NAME} --lines 100'"
echo "  重启服务 : ssh ${REMOTE_USER}@${REMOTE_HOST} 'pm2 restart ${APP_NAME}'"
echo "  重载 Nginx: ssh ${REMOTE_USER}@${REMOTE_HOST} 'nginx -s reload'"
