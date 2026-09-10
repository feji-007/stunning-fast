#!/usr/bin/env powershell
# ============================================================
# 绝色测试环境 Docker 一键部署脚本（Windows PowerShell 5.1 兼容版，目标 CentOS 7.9）
# ------------------------------------------------------------
# 用法（在项目根目录本地执行）：
#   powershell -File deploy\docker-deploy.ps1                 # 构建并启动
#   powershell -File deploy\docker-deploy.ps1 -Rebuild        # 强制重建镜像
#   powershell -File deploy\docker-deploy.ps1 -Down           # 停止并移除容器（保留数据）
#   powershell -File deploy\docker-deploy.ps1 -Logs           # 查看实时日志
#   powershell -File deploy\docker-deploy.ps1 -Ps             # 查看容器状态
#   powershell -File deploy\docker-deploy.ps1 -Setup          # 首次：在 CentOS 7.9 上安装 Docker
#   powershell -File deploy\docker-deploy.ps1 -Reset          # 危险：清库重置（删 volume）
# ------------------------------------------------------------
# 服务器信息：公网 8.219.219.110
# 服务器系统：CentOS 7.9 64位
# 场景：测试环境
# ============================================================
param(
  [switch]$Rebuild,
  [switch]$Down,
  [switch]$Logs,
  [switch]$Ps,
  [switch]$Setup,
  [switch]$Reset
)

$ErrorActionPreference = 'Stop'

# ---------- 配置区 ----------
$DeployDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $DeployDir
$RemoteUser = 'root'
$RemoteHost = '8.219.219.110'
$RemoteDir  = '/opt/juese'

function Info($m)  { Write-Host "[deploy] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[warn] $m"   -ForegroundColor Yellow }
function Err($m)   { Write-Host "[error] $m"  -ForegroundColor Red }
function Step($m)  { Write-Host ">>> $m"      -ForegroundColor Cyan }

function Invoke-Remote([string]$cmd) {
  # Windows PowerShell 5.1 下 ssh 调用，命令本身是给 Linux shell 执行的，直接传字符串
  & ssh "$RemoteUser@$RemoteHost" $cmd
}

function Ensure-EnvFile {
  if (-not (Test-Path "$DeployDir\.env")) {
    Warn "未找到 deploy\.env，从 .env.example 复制"
    Copy-Item "$DeployDir\.env.example" "$DeployDir\.env"
  }
}

# ---------- 首次环境安装（CentOS 7.9） ----------
function Deploy-Setup {
  Info "在 CentOS 7.9 服务器上安装 Docker 环境"
  Step "1/4 移除旧版 docker / docker-engine（如存在）"
  Invoke-Remote "yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null; true"

  Step "2/4 安装 yum-utils / device-mapper-persistent-data / lvm2"
  Invoke-Remote "yum install -y yum-utils device-mapper-persistent-data lvm2"

  Step "3/4 添加 CentOS 官方 docker-ce 仓库"
  Invoke-Remote "yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo; yum-config-manager --enable docker-ce-stable"

  Step "4/4 安装 docker-ce + docker-compose-plugin + rsync 并启动"
  Invoke-Remote "yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin rsync; systemctl enable docker; systemctl start docker; (ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null); docker --version; docker compose version"

  Info "Docker 环境安装完成。下一步："
  Write-Host "  1. powershell -File deploy\docker-deploy.ps1           # 部署应用"
  Write-Host "  2. powershell -File deploy\docker-deploy.ps1 -Logs      # 查看日志"
}

# ---------- 各动作 ----------
function Deploy-Up([bool]$rebuild) {
  Info "部署到 $RemoteUser@$RemoteHost`:$RemoteDir (CentOS 7.9)"
  Step "1/4 同步 deploy/ 目录到服务器"
  Invoke-Remote "mkdir -p $RemoteDir"
  # Windows 下用 scp 同步整个目录（PowerShell 5.1 下 scp 不支持通配符展开，用目录拷贝）
  & scp -r "$DeployDir" "$RemoteUser@$RemoteHost`:$RemoteDir-deploy-tmp"
  Invoke-Remote "rm -rf $RemoteDir; mv $RemoteDir-deploy-tmp $RemoteDir"

  Step "2/4 检查 .env"
  $envExists = (Invoke-Remote "test -f $RemoteDir/.env && echo yes || echo no") -join ''
  if ($envExists -ne 'yes') {
    Warn "服务器无 $RemoteDir/.env，从 .env.example 复制（请编辑实际值后再跑）"
    Invoke-Remote "cp $RemoteDir/.env.example $RemoteDir/.env"
    Warn "已生成 $RemoteDir/.env，请编辑后重跑：ssh $RemoteUser@$RemoteHost 'vi $RemoteDir/.env'"
    return
  }

  Step "3/4 远程构建镜像并启动"
  $buildArgs = if ($rebuild) { 'build --no-cache' } else { 'build' }
  Invoke-Remote "cd $RemoteDir && docker compose $buildArgs && docker compose up -d"

  Step "4/4 等待健康检查 + 状态"
  Info "等待 server 健康检查通过（最多 60s）"
  for ($i = 1; $i -le 12; $i++) {
    $status = (Invoke-Remote "docker inspect --format='{{.State.Health.Status}}' juese-server 2>/dev/null") -join ''
    if ($status -eq 'healthy') {
      Info "server 已 healthy"
      break
    }
    Start-Sleep -Seconds 5
  }

  Invoke-Remote "cd $RemoteDir && docker compose ps"
  Write-Host ''
  Info "部署完成。访问地址："
  Write-Host "  API      : http://$RemoteHost/api"
  Write-Host "  管理后台 : http://$RemoteHost/admin"
  Write-Host "  健康检查 : http://$RemoteHost/api/health"
  Write-Host ''
  Info "常用命令："
  Write-Host "  查看日志 : powershell -File deploy\docker-deploy.ps1 -Logs"
  Write-Host "  状态     : powershell -File deploy\docker-deploy.ps1 -Ps"
  Write-Host "  停止     : powershell -File deploy\docker-deploy.ps1 -Down"
  Write-Host "  重建     : powershell -File deploy\docker-deploy.ps1 -Rebuild"
}

function Deploy-Down {
  Info "停止并移除容器（保留数据卷）"
  Invoke-Remote "cd $RemoteDir && docker compose down"
}

function Deploy-Logs {
  Invoke-Remote "cd $RemoteDir && docker compose logs -f --tail=200"
}

function Deploy-Ps {
  Invoke-Remote "cd $RemoteDir && docker compose ps"
}

function Deploy-Reset {
  Warn "即将删除所有容器 + 数据卷，数据将丢失！"
  $ans = Read-Host '确认清库重置？输入 yes 继续'
  if ($ans -ne 'yes') { Info '已取消'; return }
  Invoke-Remote "cd $RemoteDir && docker compose down -v"
  Info '已清空，重跑 powershell -File deploy\docker-deploy.ps1 重新部署'
}

# ---------- 入口 ----------
if ($Reset)  { Deploy-Reset; return }
if ($Down)   { Deploy-Down; return }
if ($Logs)   { Deploy-Logs; return }
if ($Ps)     { Deploy-Ps; return }
if ($Setup)  { Deploy-Setup; return }
Ensure-EnvFile
Deploy-Up -rebuild $Rebuild.IsPresent
