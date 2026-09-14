<#
.SYNOPSIS
    自动配置 Windows 到 Linux 服务器的 SSH 密钥免密登录。

.DESCRIPTION
    1. 检查本地是否存在 ED25519 SSH 密钥对，若不存在则生成。
    2. 将本地公钥上传至远程服务器的 ~/.ssh/authorized_keys。
    3. 设置远程服务器正确的目录和文件权限。
    4. 验证免密登录是否配置成功。

.PARAMETER RemoteUser
    远程服务器用户名 (默认: root)

.PARAMETER RemoteHost
    远程服务器 IP 地址或域名

.EXAMPLE
    .\Setup-SSHKey.ps1 -RemoteUser "admin" -RemoteHost "192.168.1.100"
#>

param(
    [string]$RemoteUser = "root",
    [string]$RemoteHost = "8.219.219.110"
)

# --------------------------
# 配置区域
# --------------------------
$SshDir = "$env:USERPROFILE\.ssh"
$PrivateKeyPath = "$SshDir\id_ed25519"
$PublicKeyPath = "$SshDir\id_ed25519.pub"
$Comment = "deploy-script@$env:COMPUTERNAME"

# --------------------------
# 辅助函数
# --------------------------
function Write-Step {
    param([string]$Message)
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# --------------------------
# 主逻辑
# --------------------------

Write-Step "1. 检查并生成 SSH 密钥对"

# 检查 .ssh 目录是否存在
if (-not (Test-Path $SshDir)) {
    New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
    Write-Success "创建目录: $SshDir"
}

# 检查密钥对是否存在
if ((Test-Path $PrivateKeyPath) -and (Test-Path $PublicKeyPath)) {
    Write-Success "本地密钥对已存在: $PrivateKeyPath"
} else {
    Write-Host "本地未找到 ED25519 密钥，正在生成..." -ForegroundColor Yellow
    try {
        # -N "" 表示空 passphrase (无密码)，-t ed25519 指定算法
        #ssh-keygen -t ed25519 -f $PrivateKeyPath -C $Comment -N ''
		echo "`n`n" | ssh-keygen -t ed25519 -f $PrivateKeyPath -C $Comment
        if ($LASTEXITCODE -eq 0) {
            Write-Success "密钥对生成成功"
        } else {
            Write-Error-Custom "密钥生成失败，请检查 ssh-keygen 是否可用"
        }
    } catch {
        Write-Error-Custom "生成密钥时发生异常: $_"
    }
}

Write-Step "2. 部署公钥到远程服务器 ($RemoteUser@$RemoteHost)"

# 读取公钥内容
if (-not (Test-Path $PublicKeyPath)) {
    Write-Error-Custom "无法读取公钥文件: $PublicKeyPath"
}

# 构建远程命令
# 1. mkdir -p ~/.ssh : 确保目录存在
# 2. chmod 700 ~/.ssh : 设置目录权限 (仅所有者可读写执行)
# 3. cat >> ~/.ssh/authorized_keys : 追加公钥
# 4. chmod 600 ~/.ssh/authorized_keys : 设置文件权限 (仅所有者可读写)
$RemoteCommand = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

Write-Host "正在上传公钥... (此时可能需要输入一次服务器密码)" -ForegroundColor Yellow

# 标准管道方法 (推荐)
try {
    # 使用 cmd /c type 以确保原始字节流传输，避免 PowerShell 可能的编码干扰
    cmd /c "type `"$PublicKeyPath`" | ssh -o StrictHostKeyChecking=no $RemoteUser@$RemoteHost `"$RemoteCommand`""
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "公钥部署成功"
    } else {
        Write-Error-Custom "公钥部署失败。请检查网络连接、用户名/IP是否正确，以及是否输入了正确的密码。"
    }
} catch {
    Write-Error-Custom "执行部署命令时出错: $_"
}

Write-Step "3. 验证免密登录"

Write-Host "正在测试连接..." -ForegroundColor Yellow

# 尝试执行一个简单的远程命令
try {
    $output = ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no $RemoteUser@$RemoteHost "echo 'SSH_Connection_Success'" 2>&1
    
    if ($output -match "SSH_Connection_Success") {
        Write-Success "免密登录配置成功！"
        Write-Host "`n你现在可以在脚本中使用 scp 和 ssh 而无需输入密码。" -ForegroundColor Green
    } else {
        Write-Host "[WARN] 连接似乎建立了，但未收到预期响应。输出: $output" -ForegroundColor Yellow
        Write-Host "请手动尝试: ssh $RemoteUser@$RemoteHost" -ForegroundColor Yellow
    }
} catch {
    Write-Error-Custom "验证失败。可能原因：密码错误、权限配置错误或网络问题。"
}

Write-Host "`n完成。" -ForegroundColor Cyan
