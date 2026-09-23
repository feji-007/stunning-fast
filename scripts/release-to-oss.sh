#!/usr/bin/env bash
# ============================================================
# 绝色客户端：打包 + 上传到天翼云 ZOS（Linux/macOS bash 版）
# ------------------------------------------------------------
# 服务器：1.194.28.136 (Ubuntu Server 26.04) / 域名 jueseai.com（未备案，暂用 IP）
# 对象存储：天翼云 ZOS bucket-5620，外网 https://zhengzhou5.zos.ctyun.cn
#           公开访问 https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/
# 凭证：deploy/.oss.env（从 .oss.env.example 拷贝后填入 AccessKey/Secret）
# ------------------------------------------------------------
# 用法（在项目根目录执行）：
#   bash scripts/release-to-oss.sh                 # 当前平台打包 + 上传
#   bash scripts/release-to-oss.sh --win          # 仅打包 Windows
#   bash scripts/release-to-oss.sh --mac          # 仅打包 macOS
#   bash scripts/release-to-oss.sh --linux        # 仅打包 Linux
#   bash scripts/release-to-oss.sh --all          # 三平台全打
#   bash scripts/release-to-oss.sh --no-pack      # 跳过打包，只上传已有产物
#   bash scripts/release-to-oss.sh --dry          # 只打印上传清单，不实际传
#   bash scripts/release-to-oss.sh --check        # 仅校验 OSS 凭证与 Bucket 可达性
# ------------------------------------------------------------
# 产物位置：
#   release/                              ← electron-builder 原始产物
#   天翼云 ZOS bucket-5620/release/       ← 上传后的分发目录
#   electron-updater 拉取 latest.yml 检查更新
# ============================================================
set -euo pipefail

# ---------- 配置区 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
OSS_ENV_FILE="$PROJECT_DIR/deploy/.oss.env"
OSS_ENV_SAMPLE="$PROJECT_DIR/deploy/.oss.env.example"

# 颜色
C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[0;33m'; C_CYAN='\033[0;36m'; C_RESET='\033[0m'
info()  { echo -e "${C_GREEN}[oss] $*${C_RESET}"; }
warn()  { echo -e "${C_YELLOW}[warn] $*${C_RESET}"; }
err()   { echo -e "${C_RED}[error] $*${C_RESET}" >&2; }
step()  { echo -e "${C_CYAN}>>> $*${C_RESET}"; }

# ---------- 参数解析 ----------
ACTION_PACK=1
ACTION_DRY=""
ACTION_CHECK=""
TARGET=""
case "${1:-}" in
  --win)      TARGET="win" ;;
  --mac)      TARGET="mac" ;;
  --linux)    TARGET="linux" ;;
  --all)      TARGET="all" ;;
  --no-pack)  ACTION_PACK=0 ;;
  --dry)      ACTION_DRY="--dry" ;;
  --check)    ACTION_CHECK="--check"; ACTION_PACK=0 ;;
  ""|"--up")  TARGET="" ;;
  *) err "未知参数: $1"; echo "用法: bash $0 [--win|--mac|--linux|--all|--no-pack|--dry|--check]"; exit 1 ;;
esac

# 自动检测当前平台
if [[ -z "$TARGET" ]]; then
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) TARGET="win" ;;
    Darwin)               TARGET="mac" ;;
    Linux)                TARGET="linux" ;;
    *) err "无法识别当前系统，请用 --win/--mac/--linux 显式指定"; exit 1 ;;
  esac
  info "未指定平台，自动检测当前系统：$TARGET"
fi

# ---------- 前置检查 ----------
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  err "未找到 package.json，请在项目根目录执行"
  exit 1
fi

# 检查 deploy/.oss.env 是否就绪
ensure_oss_env() {
  if [[ ! -f "$OSS_ENV_FILE" ]]; then
    err "未找到 deploy/.oss.env"
    echo ""
    warn "首次使用，请按以下步骤配置天翼云 ZOS 凭证："
    echo "  1. 拷贝模板："
    echo "       cp deploy/.oss.env.example deploy/.oss.env"
    echo "  2. 编辑填入实际值："
    echo "       vi deploy/.oss.env"
    echo "       # OSS_ACCESS_KEY_ID       = 天翼云控制台 → 访问控制 → 用户 → AccessKey"
    echo "       # OSS_SECRET_ACCESS_KEY   = 对应 Secret（仅展示一次）"
    echo "       # OSS_BUCKET              = bucket-5620（已固定）"
    echo "       # OSS_ENDPOINT            = https://zhengzhou5.zos.ctyun.cn"
    echo "       # OSS_PUBLIC_BASE         = https://bucket-5620.zhengzhou5.zos.ctyun.cn"
    echo "  3. 在天翼云控制台为 bucket-5620 开启「公共读」或对 release/ 前缀开放匿名读"
    exit 1
  fi
  info "凭证文件：$OSS_ENV_FILE"
}

# ---------- 1. 打包 ----------
do_pack() {
  if [[ $ACTION_PACK -eq 0 ]]; then
    info "跳过打包步骤（--no-pack）"
    return
  fi

  step "1/3 打包 Electron 应用（target=$TARGET）"
  cd "$PROJECT_DIR"
  if [[ "$TARGET" == "win" ]]; then
    info "构建 Windows 安装包（nsis-web）"
    npm run build
    npx electron-builder --win --x64
  elif [[ "$TARGET" == "mac" ]]; then
    info "构建 macOS 安装包（dmg x64 + arm64）"
    npm run build
    npx electron-builder --mac --x64 --arm64
  elif [[ "$TARGET" == "linux" ]]; then
    info "构建 Linux 安装包（AppImage x64）"
    npm run build
    npx electron-builder --linux --x64
  elif [[ "$TARGET" == "all" ]]; then
    info "构建全平台（win + mac + linux）"
    npm run build
    npx electron-builder --win --x64 --linux --x64
    if [[ "$(uname -s)" == "Darwin" ]]; then
      npx electron-builder --mac --x64 --arm64
    else
      warn "当前非 macOS，跳过 mac 包；如需 mac dmg 请在 mac 上执行 bash $0 --mac"
    fi
  else
    err "未知平台：$TARGET"
    exit 1
  fi
  info "打包完成，产物目录：$RELEASE_DIR"
}

# ---------- 2. 上传到天翼云 ZOS ----------
do_upload() {
  if [[ -n "$ACTION_CHECK" ]]; then
    step "校验 OSS 凭证与 Bucket 可达性"
  elif [[ -n "$ACTION_DRY" ]]; then
    step "2/3 上传到天翼云 ZOS（DRY 模式，不实际传输）"
  else
    step "2/3 上传到天翼云 ZOS bucket-5620/release/"
  fi

  cd "$PROJECT_DIR"
  node scripts/release-to-oss.mjs $ACTION_DRY $ACTION_CHECK
}

# ---------- 3. 打印发布提示 ----------
print_summary() {
  if [[ -n "$ACTION_CHECK" ]]; then return; fi
  step "3/3 完成"
  echo ""
  info "下一步："
  echo "  1. 修改 electron-builder.yml 的 publish.url 指向 OSS："
  echo "     publish:"
  echo "       provider: generic"
  echo "       url: https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/"
  echo "       channel: latest"
  echo ""
  echo "  2. 验证下载（curl）："
  echo "     curl -sI https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/latest.yml"
  echo "     curl -sI https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/"
  echo ""
  echo "  3. 客户端 electron-updater 启动后会拉取 latest.yml 检查更新"
  echo ""
  echo "  4. 发布官网下载页（更新 site/.vitepress/config.ts 的 DOWNLOAD_BASE）："
  echo "     npm run publish:site"
  echo ""
  info "服务器端部署（独立流程）："
  echo "  - 新服务器：1.194.28.136 (Ubuntu Server 26.04)"
  echo "  - deploy/docker-deploy.sh 已适配新服务器，执行："
  echo "      bash deploy/docker-deploy.sh"
  echo "  - 域名 jueseai.com 未备案，暂用 IP；备案后改 nginx server_name + .env 的 CLIENT_API_BASE"
}

# ---------- 入口 ----------
ensure_oss_env
do_pack
do_upload
print_summary
