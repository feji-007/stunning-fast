#!/usr/bin/env powershell
# ============================================================
# 绝色客户端：打包 + 上传到天翼云 ZOS（Windows PowerShell 5.1 兼容版）
# ------------------------------------------------------------
# 服务器：1.194.28.136 (Ubuntu Server 26.04) / 域名 jueseai.com（未备案，暂用 IP）
# 对象存储：天翼云 ZOS bucket-5620，外网 https://zhengzhou5.zos.ctyun.cn
#           公开访问 https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/
# 凭证：deploy/.oss.env（从 .oss.env.example 拷贝后填入 AccessKey/Secret）
# ------------------------------------------------------------
# 用法（在项目根目录执行）：
#   powershell -File scripts\release-to-oss.ps1                 # 当前平台打包 + 上传
#   powershell -File scripts\release-to-oss.ps1 -Win            # 仅打包 Windows
#   powershell -File scripts\release-to-oss.ps1 -Mac            # 仅打包 macOS（需 mac 环境）
#   powershell -File scripts\release-to-oss.ps1 -Linux          # 仅打包 Linux
#   powershell -File scripts\release-to-oss.ps1 -All            # 三平台全打
#   powershell -File scripts\release-to-oss.ps1 -NoPack         # 跳过打包，只上传已有产物
#   powershell -File scripts\release-to-oss.ps1 -Dry            # 只打印上传清单，不实际传
#   powershell -File scripts\release-to-oss.ps1 -Check          # 仅校验 OSS 凭证与 Bucket 可达性
# ------------------------------------------------------------
# 产物位置：
#   release\                   ← electron-builder 原始产物
#   天翼云 ZOS bucket-5620/release/  ← 上传后的分发目录
#   electron-updater 拉取 latest.yml 检查更新
# ============================================================
param(
  [switch]$Win,
  [switch]$Mac,
  [switch]$Linux,
  [switch]$All,
  [switch]$NoPack,
  [switch]$Dry,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

# ---------- 配置区 ----------
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir   = Split-Path -Parent $ScriptDir
$ReleaseDir   = Join-Path $ProjectDir 'release'
$OssEnvFile   = Join-Path $ProjectDir 'deploy\.oss.env'
$OssEnvSample = Join-Path $ProjectDir 'deploy\.oss.env.example'

function Info($m) { Write-Host "[oss] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[error] $m" -ForegroundColor Red }
function Step($m) { Write-Host ">>> $m" -ForegroundColor Cyan }

# ---------- 外部命令 ----------
function Invoke-Native([string]$command, [string[]]$arguments) {
  & $command @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$command 执行失败，退出码：$LASTEXITCODE"
  }
}

# ---------- 平台检测 ----------
function Detect-Platform {
  if ($env:OS -eq 'Windows_NT') { return 'win' }
  if ($IsMacOS -eq $true) { return 'mac' }
  if ($IsLinux -eq $true) { return 'linux' }
  return 'unknown'
}

# 解析目标平台
if ($All)      { $Target = 'all' }
elseif ($Win)  { $Target = 'win' }
elseif ($Mac)  { $Target = 'mac' }
elseif ($Linux){ $Target = 'linux' }
else { $Target = Detect-Platform; Info "未指定平台，自动检测当前系统：$Target" }

# ---------- 前置检查 ----------
if (-not (Test-Path "$ProjectDir\package.json")) {
  Err "未找到 package.json，请在项目根目录执行"
  exit 1
}

# 检查 deploy/.oss.env 是否就绪
function Ensure-OssEnv {
  if (-not (Test-Path $OssEnvFile)) {
    Err "未找到 deploy\.oss.env"
    Write-Host ""
    Warn "首次使用，请按以下步骤配置天翼云 ZOS 凭证："
    Write-Host "  1. 拷贝模板："
    Write-Host "       copy deploy\.oss.env.example deploy\.oss.env"
    Write-Host "  2. 编辑填入实际值："
    Write-Host "       notepad deploy\.oss.env"
    Write-Host "       # OSS_ACCESS_KEY_ID       = 天翼云控制台 → 访问控制 → 用户 → AccessKey"
    Write-Host "       # OSS_SECRET_ACCESS_KEY   = 对应 Secret（仅展示一次）"
    Write-Host "       # OSS_BUCKET              = bucket-5620（已固定）"
    Write-Host "       # OSS_ENDPOINT            = https://zhengzhou5.zos.ctyun.cn"
    Write-Host "       # OSS_PUBLIC_BASE         = https://bucket-5620.zhengzhou5.zos.ctyun.cn"
    Write-Host "  3. 在天翼云控制台为 bucket-5620 开启「公共读」或对 release/ 前缀开放匿名读"
    exit 1
  }
  # 已存在，提示路径
  Info "凭证文件：$OssEnvFile"
}

# ---------- 1. 打包 ----------
function Do-Pack {
  if ($NoPack) {
    Info "跳过打包步骤（-NoPack）"
    return
  }
  if ($Check) { return }

  Step "1/3 打包 Electron 应用（target=$Target）"
  Push-Location $ProjectDir
  try {
    if ($Target -eq 'win') {
      Info "构建 Windows 安装包（nsis-web）"
      Invoke-Native 'npm' @('run', 'build')
      Invoke-Native 'npx' @('electron-builder', '--win', '--x64')
    }
    elseif ($Target -eq 'mac') {
      Info "构建 macOS 安装包（dmg x64 + arm64）"
      Invoke-Native 'npm' @('run', 'build')
      Invoke-Native 'npx' @('electron-builder', '--mac', '--x64', '--arm64')
    }
    elseif ($Target -eq 'linux') {
      Info "构建 Linux 安装包（AppImage x64）"
      Invoke-Native 'npm' @('run', 'build')
      Invoke-Native 'npx' @('electron-builder', '--linux', '--x64')
    }
    elseif ($Target -eq 'all') {
      Info "构建全平台（win + mac + linux）"
      Invoke-Native 'npm' @('run', 'build')
      Invoke-Native 'npx' @('electron-builder', '--win', '--x64', '--linux', '--x64')
      $platform = Detect-Platform
      if ($platform -eq 'mac') {
        Invoke-Native 'npx' @('electron-builder', '--mac', '--x64', '--arm64')
      }
      else {
        Warn "当前非 macOS，跳过 mac 包；如需 mac dmg 请在 mac 上执行 powershell -File scripts\release-to-oss.ps1 -Mac"
      }
    }
    else {
      Err "未知平台：$Target"
      exit 1
    }
    Info "打包完成，产物目录：$ReleaseDir"
  }
  finally {
    Pop-Location
  }
}

# ---------- 2. 上传到天翼云 ZOS ----------
function Do-Upload {
  if ($Check) {
    Step "校验 OSS 凭证与 Bucket 可达性"
  } elseif ($Dry) {
    Step "2/3 上传到天翼云 ZOS（DRY 模式，不实际传输）"
  } else {
    Step "2/3 上传到天翼云 ZOS bucket-5620/release/"
  }

  $nodeArgs = @('scripts\release-to-oss.mjs')
  if ($Dry)   { $nodeArgs += '--dry' }
  if ($Check) { $nodeArgs += '--check' }
  Push-Location $ProjectDir
  try {
    Invoke-Native 'node' $nodeArgs
  }
  finally {
    Pop-Location
  }
}

# ---------- 3. 打印发布提示 ----------
function Print-Summary {
  if ($Check) { return }
  Step "3/3 完成"
  Write-Host ''
  Info '下一步：'
  Write-Host '  1. 修改 electron-builder.yml 的 publish.url 指向 OSS：'
  Write-Host '     publish:'
  Write-Host '       provider: generic'
  Write-Host '       url: https://bucket-5620.zhengzhou5.zos.ctyun.cn/release'
  Write-Host '       channel: latest'
  Write-Host ''
  Write-Host '  2. 验证下载（curl）：'
  Write-Host '     curl.exe -sI https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/latest.yml'
  Write-Host '     curl.exe -sI https://bucket-5620.zhengzhou5.zos.ctyun.cn/release/'
  Write-Host ''
  Write-Host '  3. 客户端 electron-updater 启动后会拉取 latest.yml 检查更新'
  Write-Host ''
  Write-Host '  4. 发布官网下载页（更新 site/.vitepress/config.ts 的 DOWNLOAD_BASE）：'
  Write-Host '     npm run publish:site'
  Write-Host ''
  Info '服务器端部署（独立流程）：'
  Write-Host '  - 新服务器：1.194.28.136 (Ubuntu Server 26.04)'
  Write-Host '  - deploy/docker-deploy.ps1 已适配新服务器，执行：'
  Write-Host '      powershell -File deploy\docker-deploy.ps1'
  Write-Host '  - 域名 jueseai.com 未备案，暂用 IP；备案后改 nginx server_name + .env 的 CLIENT_API_BASE'
}

# ---------- 入口 ----------
Ensure-OssEnv
Do-Pack
Do-Upload
Print-Summary
