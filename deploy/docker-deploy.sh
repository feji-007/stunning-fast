#!/usr/bin/env bash
# ============================================================
# 绝色测试环境 Docker 一键部署脚本（Ubuntu Server 26.04 服务器）
# ------------------------------------------------------------
# 用法（在项目根目录本地执行）：
#   bash deploy/docker-deploy.sh            # 上传源码并在服务器构建
#   bash deploy/docker-deploy.sh --rebuild  # 服务器无缓存重建
#   bash deploy/docker-deploy.sh --down     # 停止并移除容器（保留数据）
#   bash deploy/docker-deploy.sh --logs     # 查看实时日志
#   bash deploy/docker-deploy.sh --ps       # 查看容器状态
#   bash deploy/docker-deploy.sh --setup    # 首次：在服务器安装 Docker 环境
#   bash deploy/docker-deploy.sh --reset    # 危险：清库重置（删 volume）
# ------------------------------------------------------------
# 服务器信息：公网 1.194.28.136
# 服务器系统：Ubuntu Server 26.04 64位
# 域名：jueseai.com（未 ICP 备案，暂用 IP；备案后改 nginx server_name + CLIENT_API_BASE）
# 场景：测试环境
# ============================================================
set -euo pipefail

# ---------- 配置区 ----------
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
REMOTE_USER="root"
REMOTE_HOST="1.194.28.136"
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

# ---------- 首次环境安装（Ubuntu Server 26.04） ----------
do_setup() {
  log "在 Ubuntu Server 26.04 服务器上安装 Docker 环境（Ubuntu 官方仓库）"
  # 说明：放弃 Docker 官方仓库（download.docker.com），原因：
  #   1. Ubuntu 26.04 (resolute) 太新，Docker 官方仓库尚未为 resolute 代号发布软件包
  #   2. 国内访问 download.docker.com 不稳定，GPG 密钥下载经常 connection reset
  #   3. 非交互式 SSH 下 gpg --dearmor 报 /dev/tty 错误
  # 改用 Ubuntu 官方仓库的 docker.io + docker-compose-v2 + containerd 包：
  #   - docker.io 29.1.3 提供 docker 命令
  #   - docker-compose-v2 2.40.3 提供 docker compose 子命令（等效 docker-compose-plugin）
  #   - containerd 2.2.2 提供容器运行时
  step "1/3 移除旧版 docker / docker-engine（如存在）"
  remote_exec_heredoc '
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
'

  step "2/3 apt update + 安装 docker.io + docker-compose-v2 + containerd + rsync + unzip"
  remote_exec_heredoc '
apt-get update
apt-get install -y docker.io docker-compose-v2 containerd rsync unzip
'

  step "3/3 启动 docker 服务并设为开机自启"
  remote_exec_heredoc '
systemctl enable docker
systemctl start docker
docker --version
docker compose version
'

  log "Docker 环境安装完成。下一步："
  echo "  1. bash $0           # 部署应用"
  echo "  2. bash $0 --logs    # 查看日志"
}

# ---------- 各动作 ----------
do_up() {
  log "部署到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR} (Ubuntu Server 26.04)"
  step "1/4 同步项目根目录到服务器"
  remote_exec "mkdir -p $REMOTE_DIR"
  rsync -az --delete \
    --exclude '.env' \
    --exclude 'nginx.logs' \
    --exclude '.git' \
    --exclude '.github' \
    --exclude '.vscode' \
    --exclude '.idea' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude 'dist-electron' \
    --exclude 'release' \
    --exclude 'build' \
    --exclude '.cache' \
    --exclude 'electron' \
    --exclude 'scripts' \
    --exclude '*.log' \
    --exclude '*.tsbuildinfo' \
    --exclude '*.bat' \
    --exclude '*.ps1' \
    "$PROJECT_DIR/" "${REMOTE_USER}@${REMOTE_HOST}:$REMOTE_DIR/"

  step "2/4 检查服务器 .env"
  if ! remote_exec "test -f $REMOTE_DIR/deploy/.env"; then
    warn "服务器无 $REMOTE_DIR/deploy/.env，从 .env.example 复制（请编辑实际值后再跑）"
    remote_exec "cp $REMOTE_DIR/deploy/.env.example $REMOTE_DIR/deploy/.env"
    warn "已生成 $REMOTE_DIR/deploy/.env，请编辑后重跑：ssh $REMOTE_USER@$REMOTE_HOST 'vi $REMOTE_DIR/deploy/.env'"
    exit 0
  fi

  step "3/4 远程构建镜像并启动"
  remote_exec_heredoc "cd $REMOTE_DIR/deploy && docker compose build $FORCE_REBUILD && docker compose up -d"

  step "4/4 等待健康检查 + 状态"
  log "等待 server 健康检查通过（最多 60s）"
  for i in {1..12}; do
    if remote_exec "docker inspect --format='{{.State.Health.Status}}' juese-server 2>/dev/null" | grep -q healthy; then
      log "server 已 healthy"
      break
    fi
    sleep 5
  done

  remote_exec "cd $REMOTE_DIR/deploy && docker compose ps"
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
  remote_exec_heredoc "cd $REMOTE_DIR/deploy && docker compose down"
}

do_logs() {
  remote_exec_heredoc "cd $REMOTE_DIR/deploy && docker compose logs -f --tail=200"
}

do_ps() {
  remote_exec_heredoc "cd $REMOTE_DIR/deploy && docker compose ps"
}

do_reset() {
  warn "即将删除所有容器 + 数据卷，数据将丢失！"
  read -p "确认清库重置？输入 yes 继续：" ANS
  [[ "$ANS" == "yes" ]] || { log "已取消"; exit 0; }
  remote_exec_heredoc "cd $REMOTE_DIR/deploy && docker compose down -v"
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
