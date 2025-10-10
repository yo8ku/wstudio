# Note Studio 开发服务器启动脚本

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Note Studio 开发环境启动" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 设置环境变量
$env:NODE_ENV="development"

# 启动 Vite 开发服务器（后台）
Write-Host "[1/2] 启动 Vite 开发服务器..." -ForegroundColor Yellow
Start-Job -ScriptBlock {
    Set-Location $using:PWD
    pnpm exec vite --config packages/renderer/vite.config.ts
} | Out-Null

# 等待 Vite 服务器启动
Write-Host "等待 Vite 服务器启动..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 检查 Vite 是否运行
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -Method Head -TimeoutSec 5
    Write-Host "✓ Vite 开发服务器已启动 (http://localhost:5173)" -ForegroundColor Green
} catch {
    Write-Host "✗ Vite 开发服务器启动失败" -ForegroundColor Red
    exit 1
}

# 启动 Electron
Write-Host "[2/2] 启动 Electron 应用..." -ForegroundColor Yellow
pnpm exec electron .

# 清理：关闭 Vite 服务器
Write-Host ""
Write-Host "关闭开发服务器..." -ForegroundColor Gray
Get-Job | Stop-Job
Get-Job | Remove-Job

