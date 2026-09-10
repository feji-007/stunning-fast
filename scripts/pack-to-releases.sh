#!/usr/bin/env bash
# ============================================================
# 绝色客户端：打包 + 上传到 deploy/releases 目录
# ------------------------------------------------------------
# 用法（在项目根目录执行）：
#   bash scripts/pack-to-releases.sh            # 当前平台打包 + 上传
#   bash scripts/pack-to-releases.sh --win      # 仅打包 Windows
#   bash scripts/pack-to-releases.sh --mac      # 仅打包 macOS（需 mac 环境）
#   bash scripts/pack-to-releases.sh --linux    # 仅打包 Linux
#   bash scripts/pack-to-releases.sh --all      # 三平台全打（仅 mac/linux 可交叉编译部分目标）
#   bash scripts/pack-to-releases.sh --no-pack  # 跳过打包，只把已有产物拷到 deploy/releases
# ------------------------------------------------------------
# 产物位置：
#   release/                     ← electron-builder 原始产物
#   deploy/releases/             ← 上传后的分发目录（docker compose 挂载到 nginx）
# 部署方式：上传后跑 bash deploy/docker-deploy.sh 同步到服务器
# ============================================================
set -euo pipefail

# ---------- 配置区 ----------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
DEPLOY_RELEASES="$PROJECT_DIR/deploy/releases"

# 颜色
C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[0;33m'; C_CYAN='\033[0;36m'; C_RESET='\033[0m'
log()  { echo -e "${C_GREEN}[pack] $*${C_RESET}"; }
warn() { echo -e "${C_YELLOW}[warn] $*${C_RESET}"; }
err()  { echo -e "${C_RED}[error] $*${C_RESET}" >&2; }
step() { echo -e "${C_CYAN}>>> $*${C_RESET}"; }

# ---------- 参数解析 ----------
TARGET="auto"
NO_PACK=false
case "${1:-}" in
  --win)    TARGET="win" ;;
  --mac)    TARGET="mac" ;;
  --linux)  TARGET="linux" ;;
  --all)    TARGET="all" ;;
  --no-pack) NO_PACK=true ;;
  "")       TARGET="auto" ;;
  *) err "未知参数: $1"; echo "用法: bash $0 [--win|--mac|--linux|--all|--no-pack]"; exit 1 ;;
esac

# ---------- 平台检测 ----------
detect_platform() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) echo "win" ;;
    Darwin)               echo "mac" ;;
    Linux)                echo "linux" ;;
    *)                    echo "unknown" ;;
  esac
}

if [[ "$TARGET" == "auto" ]]; then
  TARGET="$(detect_platform)"
  log "未指定平台，自动检测当前系统：$TARGET"
fi

# ---------- 前置检查 ----------
[[ -d "$PROJECT_DIR" ]] || { err "项目目录不存在：$PROJECT_DIR"; exit 1; }
[[ -f "$PROJECT_DIR/package.json" ]] || { err "未找到 package.json，请在项目根目录执行"; exit 1; }
command -v npm >/dev/null || { err "未安装 Node.js/npm"; exit 1; }

# ---------- 1. 打包 ----------
do_pack() {
  if [[ "$NO_PACK" == "true" ]]; then
    log "跳过打包步骤（--no-pack）"
    return
  fi

  step "1/3 打包 Electron 应用（target=$TARGET）"
  cd "$PROJECT_DIR"

  case "$TARGET" in
    win)
      log "构建 Windows 安装包（nsis-web）"
      npm run build
      npx electron-builder --win --x64
      ;;
    mac)
      log "构建 macOS 安装包（dmg x64 + arm64）"
      npm run build
      npx electron-builder --mac --x64 --arm64
      ;;
    linux)
      log "构建 Linux 安装包（AppImage x64）"
      npm run build
      npx electron-builder --linux --x64
      ;;
    all)
      log "构建全平台（win + mac + linux）"
      npm run build
      npx electron-builder --win --x64 --linux --x64
      # macOS 交叉编译通常不可用，按需手动在 mac 上跑 --mac
      if [[ "$(detect_platform)" == "mac" ]]; then
        npx electron-builder --mac --x64 --arm64
      else
        warn "当前非 macOS，跳过 mac 包；如需 mac dmg 请在 mac 上执行 bash $0 --mac"
      fi
      ;;
    *)
      err "未知平台：$TARGET"; exit 1 ;;
  esac

  log "打包完成，产物目录：$RELEASE_DIR"
}

# ---------- 2. 同步到 deploy/releases ----------
do_upload() {
  step "2/3 同步到 $DEPLOY_RELEASES"

  mkdir -p "$DEPLOY_RELEASES"

  # 清理旧产物（保留 .gitkeep）
  find "$DEPLOY_RELEASES" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true

  # 需要拷贝的文件清单：
  #   - latest.yml / latest-mac.yml / latest-linux.yml（electron-updater 元信息）
  #   - juese-*-setup.exe / juese-*.dmg / juese-*.AppImage / juese-*.snap
  #   - juese-*.blockmap（增量更新用，可选）
  local copied=0
  local patterns=(
    "latest.yml"
    "latest-mac.yml"
    "latest-linux.yml"
    "*.exe"
    "*.dmg"
    "*.AppImage"
    "*.snap"
    "*.blockmap"
  )

  for pattern in "${patterns[@]}"; do
    # shell 跨平台 glob：用 ls + 2>/dev/null 兼容（MINGW/CYGWIN 下 find 行为可能怪异）
    # shellcheck disable=SC2086
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      [[ -f "$RELEASE_DIR/$f" ]] || continue
      cp -v "$RELEASE_DIR/$f" "$DEPLOY_RELEASES/" 2>/dev/null && copied=$((copied + 1)) || true
    done < <(cd "$RELEASE_DIR" && ls -1 $pattern 2>/dev/null)
  done

  if [[ $copied -eq 0 ]]; then
    warn "未在 $RELEASE_DIR 找到任何产物；请先确认 npm run dist 已成功"
    exit 1
  fi

  log "已拷贝 $copied 个文件到 $DEPLOY_RELEASES"
}

# ---------- 3. 打印部署提示 ----------
print_summary() {
  step "3/3 完成"
  echo ""
  log "deploy/releases 当前内容："
  ls -la "$DEPLOY_RELEASES" 2>/dev/null | grep -v '^total' | grep -v '\.gitkeep$' || true
  echo ""
  log "下一步："
  echo "  1. 推送到服务器："
  echo "     bash deploy/docker-deploy.sh        # 会同步 deploy/ 到服务器（包含 releases/）"
  echo "     或仅同步 releases/："
  echo "     rsync -az deploy/releases/ root@8.219.219.110:/opt/juese/releases/"
  echo ""
  echo "  2. 验证下载："
  echo "     curl -sI http://8.219.219.110/releases/latest.yml"
  echo "     curl -sI http://8.219.219.110/releases/"
  echo ""
  echo "  3. 客户端 electron-updater 会拉取 latest.yml 检查更新"
}

# ---------- 入口 ----------
do_pack
do_upload
print_summary
