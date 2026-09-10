#!/usr/bin/env bash
# ============================================================
# 绝色测试环境 Docker 一键部署脚本（CentOS 7.9 服务器）
# ------------------------------------------------------------
# 用法（在项目根目录本地执行）：
#   bash deploy/docker-deploy.sh            # 构建并启动
#   bash deploy/docker-deploy.sh --rebuild  # 强制重建镜像
#   bash deploy/docker-deploy.sh --down     # 停止并移除容器（保留数据）
#   bash deploy/docker-deploy.sh --logs     # 查看实时日志
#   bash deploy/docker-deploy.sh --ps       # 查看容器状态
#   bash deploy/docker-deploy.sh --setup    # 首次：在服务器安装 Docker 环境
#   bash deploy/docker-deploy.sh --reset    # 危险：清库重置（删 volume）
# ------------------------------------------------------------
# 服务器信息：公网 8.219.219.110
# 服务器系统：CentOS 7.9 64位
# 场景：测试环境
# ============================================================
set -euo pipefail

# ---------- 配置区 ----------
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
REMOTE_USER="root"
REMOTE_HOST="8.219.219.110"
REMOTE_DIR="/opt/juese"
APP_NAME="juese-test"

# 颜色
C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[0;33m'; C_CYAN='\033[0;36m'; C_RESET='\033[0m'
log()  { echo -e "${C_GREEN}[deploy] $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}[warn] $*${C_RESET}"; }
err()  { echo -e "${C_RED}[error] $*${C_RESET}" >&2; }
step() { echo -e "${C_CYAN}>>> $*${C_RESET}"; }

# ---------- 参数解析 ----------
ACTION="up"
FORCE_REBUILD=""
case "${1:-}" in
  --rebuild) ACTION="up"; FORCE_REBUILD="--no-cache" ;;
  --down)    ACTION="down" ;;
  --logs)    ACTION="logs" ;;
  --ps)      ACTION="ps" ;;
  --reset)   ACTION="reset" ;;
  --setup)   ACTION="setup" ;;
  --up|"")   ACTION="up" ;;
  *) err "未知参数: $1"; echo "用法: bash $0 [--rebuild|--down|--logs|--ps|--setup|--reset]"; exit 1 ;;
esac

# ---------- 本地函数 ----------
ensure_env_file() {
  if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
    warn "未找到 deploy/.env，从 .env.example 复制"
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  fi
}

# ---------- 远程执行 ----------
remote_exec() {
  ssh "$REMOTE_USER@$REMOTE_HOST" "$@"
}

remote_exec_heredoc() {
  ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<REMOTE
set -euo pipefail
$1
REMOTE
}

# ---------- 首次环境安装（CentOS 7.9） ----------
do_setup() {
  log "在 CentOS 7.9 服务器上安装 Docker 环境"
  step "1/4 移除旧版 docker / docker-engine（如存在）"
  remote_exec_heredoc '
yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true
'

  step "2/4 安装 yum-utils（device-mapper-persistent-data / lvm2）"
  remote_exec_heredoc '
yum install -y yum-utils device-mapper-persistent-data lvm2
'

  step "3/4 添加 CentOS 官方 docker-ce 仓库"
  remote_exec_heredoc '
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum-config-manager --enable docker-ce-stable
'

  step "4/4 安装 docker-ce + docker-compose-plugin + rsync 并启动"
  remote_exec_heredoc '
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin rsync
systemctl enable docker
systemctl start docker
# 兼容旧版 docker-compose 命令（如本地脚本调用旧版）
[[ -x /usr/local/bin/docker-compose ]] || ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null || true
docker --version
docker compose version
'

  log "Docker 环境安装完成。下一步："
  echo "  1. bash $0           # 部署应用"
  echo "  2. bash $0 --logs    # 查看日志"
}

# ---------- 各动作 ----------
do_up() {
  log "部署到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR} (CentOS 7.9)"
  step "1/4 同步 deploy/ 目录到服务器"
  remote_exec "mkdir -p $REMOTE_DIR"
  rsync -az --delete \
    --exclude '.env' \
    --exclude 'nginx.logs' \
    "$DEPLOY_DIR/" "${REMOTE_USER}@${REMOTE_HOST}:$REMOTE_DIR/"

  step "2/4 检查 .env"
  if ! remote_exec "test -f $REMOTE_DIR/.env"; then
    warn "服务器无 $REMOTE_DIR/.env，从 .env.example 复制（请编辑实际值后再跑）"
    remote_exec "cp $REMOTE_DIR/.env.example $REMOTE_DIR/.env"
    warn "已生成 $REMOTE_DIR/.env，请编辑后重跑：ssh $REMOTE_USER@$REMOTE_HOST 'vi $REMOTE_DIR/.env'"
    exit 0
  fi

  step "3/4 远程构建镜像并启动"
  remote_exec_heredoc "cd $REMOTE_DIR && docker compose build $FORCE_REBUILD && docker compose up -d"

  step "4/4 等待健康检查 + 状态"
  log "等待 server 健康检查通过（最多 60s）"
  for i in {1..12}; do
    if remote_exec "docker inspect --format='{{.State.Health.Status}}' juese-server 2>/dev/null" | grep -q healthy; then
      log "server 已 healthy"
      break
    fi
    sleep 5
  done

  remote_exec "cd $REMOTE_DIR && docker compose ps"
  echo ""
  log "部署完成。访问地址："
  echo "  API      : http://$REMOTE_HOST/api"
  echo "  管理后台 : http://$REMOTE_HOST/admin"
  echo "  健康检查 : http://$REMOTE_HOST/api/health"
  echo ""
  log "常用命令："
  echo "  查看日志 : bash $0 --logs"
  echo "  状态     : bash $0 --ps"
  echo "  停止     : bash $0 --down"
  echo "  重建     : bash $0 --rebuild"
}

do_down() {
  log "停止并移除容器（保留数据卷）"
  remote_exec_heredoc "cd $REMOTE_DIR && docker compose down"
}

do_logs() {
  remote_exec_heredoc "cd $REMOTE_DIR && docker compose logs -f --tail=200"
}

do_ps() {
  remote_exec_heredoc "cd $REMOTE_DIR && docker compose ps"
}

do_reset() {
  warn "即将删除所有容器 + 数据卷，数据将丢失！"
  read -p "确认清库重置？输入 yes 继续：" ANS
  [[ "$ANS" == "yes" ]] || { log "已取消"; exit 0; }
  remote_exec_heredoc "cd $REMOTE_DIR && docker compose down -v"
  log "已清空，重跑 bash $0 重新部署"
}

# ---------- 入口 ----------
case "$ACTION" in
  setup)  do_setup ;;
  up)     ensure_env_file; do_up ;;
  down)   do_down ;;
  logs)   do_logs ;;
  ps)     do_ps ;;
  reset)  do_reset ;;
esac
