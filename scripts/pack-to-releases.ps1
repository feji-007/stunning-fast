#!/usr/bin/env powershell
# ============================================================
# 绝色客户端：打包 + 上传到 deploy\releases 目录（Windows PowerShell 5.1 兼容版）
# ------------------------------------------------------------
# 用法（在项目根目录执行）：
#   powershell -File scripts\pack-to-releases.ps1                 # 当前平台打包 + 上传
#   powershell -File scripts\pack-to-releases.ps1 -Win             # 仅打包 Windows
#   powershell -File scripts\pack-to-releases.ps1 -Mac             # 仅打包 macOS（需 mac 环境）
#   powershell -File scripts\pack-to-releases.ps1 -Linux           # 仅打包 Linux
#   powershell -File scripts\pack-to-releases.ps1 -All             # 三平台全打
#   powershell -File scripts\pack-to-releases.ps1 -NoPack          # 跳过打包，只把已有产物拷到 deploy\releases
# ------------------------------------------------------------
# 产物位置：
#   release\                    ← electron-builder 原始产物
#   deploy\releases\             ← 上传后的分发目录（docker compose 挂载到 nginx）
# 部署方式：上传后跑 powershell -File deploy\docker-deploy.ps1 同步到服务器
# ============================================================
param(
  [switch]$Win,
  [switch]$Mac,
  [switch]$Linux,
  [switch]$All,
  [switch]$NoPack
)

$ErrorActionPreference = 'Stop'

# ---------- 配置区 ----------
$ProjectDir    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReleaseDir     = Join-Path $ProjectDir 'release'
$DeployReleases = Join-Path $ProjectDir 'deploy\releases'

function Info($m) { Write-Host "[pack] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "[error] $m" -ForegroundColor Red }
function Step($m) { Write-Host ">>> $m" -ForegroundColor Cyan }

# ---------- 平台检测（用 if/elseif 避免 switch 嵌套解析问题） ----------
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
else {
  $Target = Detect-Platform
  Info "未指定平台，自动检测当前系统：$Target"
}

# ---------- 前置检查 ----------
if (-not (Test-Path "$ProjectDir\package.json")) {
  Err "未找到 package.json，请在项目根目录执行"
  exit 1
}

# ---------- 1. 打包 ----------
function Do-Pack {
  if ($NoPack) {
    Info "跳过打包步骤（-NoPack）"
    return
  }

  Step "1/3 打包 Electron 应用（target=$Target）"
  Push-Location $ProjectDir
  try {
    if ($Target -eq 'win') {
      Info "构建 Windows 安装包（nsis-web）"
      npm run build
      npx electron-builder --win --x64
    }
    elseif ($Target -eq 'mac') {
      Info "构建 macOS 安装包（dmg x64 + arm64）"
      npm run build
      npx electron-builder --mac --x64 --arm64
    }
    elseif ($Target -eq 'linux') {
      Info "构建 Linux 安装包（AppImage x64）"
      npm run build
      npx electron-builder --linux --x64
    }
    elseif ($Target -eq 'all') {
      Info "构建全平台（win + mac + linux）"
      npm run build
      npx electron-builder --win --x64 --linux --x64
      $platform = Detect-Platform
      if ($platform -eq 'mac') {
        npx electron-builder --mac --x64 --arm64
      }
      else {
        Warn "当前非 macOS，跳过 mac 包；如需 mac dmg 请在 mac 上执行 powershell -File scripts\pack-to-releases.ps1 -Mac"
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

# ---------- 2. 同步到 deploy\releases ----------
function Do-Upload {
  Step "2/3 同步到 $DeployReleases"

  if (-not (Test-Path $DeployReleases)) {
    New-Item -ItemType Directory -Path $DeployReleases -Force | Out-Null
  }

  # 清理旧产物（保留 .gitkeep）
  Get-ChildItem -Path $DeployReleases -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.gitkeep' } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  # electron-builder 产物分布：
  #   release\nsis-web\*.exe / *.7z / latest.yml    (Windows nsis-web target)
  #   release\*.dmg / *.AppImage / *.blockmap        (mac/linux target，根目录)
  #   release\latest-mac.yml / latest-linux.yml       (根目录)
  # 排除：release\win-unpacked\、mac\、linux-unpacked\（解压版，不分发）
  #       builder-*.yml / builder-*.yaml（构建器调试文件，不分发）
  $patterns = @(
    'latest.yml',
    'latest-mac.yml',
    'latest-linux.yml',
    '*.exe',
    '*.dmg',
    '*.AppImage',
    '*.snap',
    '*.blockmap'
  )

  $targets = @()
  foreach ($pattern in $patterns) {
    $files = Get-ChildItem -Path $ReleaseDir -Recurse -Filter $pattern -File -ErrorAction SilentlyContinue
    foreach ($f in $files) {
      # 排除解压目录（win-unpacked/mac/linux-unpacked）
      if ($f.FullName -match '\\(win-unpacked|mac|linux-unpacked)\\') { continue }
      # 排除 builder- 调试文件
      if ($f.Name -like 'builder-*') { continue }
      $targets += $f
    }
  }

  # 去重（同一文件可能匹配多个 pattern）
  $targets = $targets | Sort-Object FullName -Unique

  $copied = 0
  foreach ($f in $targets) {
    Copy-Item -Path $f.FullName -Destination $DeployReleases -Force
    Write-Host "  $($f.Name)  (来自 $($f.Directory.Name)\)" -ForegroundColor DarkGray
    $copied = $copied + 1
  }

  if ($copied -eq 0) {
    Warn "未在 $ReleaseDir 找到任何产物；请先确认 npm run dist 已成功"
    exit 1
  }

  Info "已拷贝 $copied 个文件到 $DeployReleases"
}

# ---------- 3. 打印部署提示 ----------
function Print-Summary {
  Step "3/3 完成"
  Write-Host ''
  Info "deploy\releases 当前内容："
  Get-ChildItem -Path $DeployReleases -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.gitkeep' } |
    Format-Table Name, Length, LastWriteTime -AutoSize
  Write-Host ''
  Info "下一步："
  Write-Host "  1. 推送到服务器："
  Write-Host "     powershell -File deploy\docker-deploy.ps1        # 会同步 deploy\ 到服务器（包含 releases\）"
  Write-Host "     或仅同步 releases\："
  Write-Host "     scp -r deploy\releases\* root@8.219.219.110:/opt/juese/releases/"
  Write-Host ''
  Write-Host "  2. 验证下载："
  Write-Host "     curl.exe -sI http://8.219.219.110/releases/latest.yml"
  Write-Host "     curl.exe -sI http://8.219.219.110/releases/"
  Write-Host ''
  Write-Host "  3. 客户端 electron-updater 会拉取 latest.yml 检查更新"
}

# ---------- 入口 ----------
Do-Pack
Do-Upload
Print-Summary
