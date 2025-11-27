# ⭐ 测试安装真实的 VSCode 插件

Write-Host "============================================" -ForegroundColor Blue
Write-Host "   VSCode 扩展安装测试套件" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

Write-Host "测试1: 通过名称安装主题插件" -ForegroundColor Cyan
Write-Host "--------------------------------------------" -ForegroundColor Gray
npm run extension:install -- "One Monokai Theme"
Write-Host ""

Write-Host "测试2: 通过 ID 直接安装插件" -ForegroundColor Cyan
Write-Host "--------------------------------------------" -ForegroundColor Gray
npm run extension:install -- dracula-theme.theme-dracula
Write-Host ""

Write-Host "测试3: 查看已安装的扩展" -ForegroundColor Cyan
Write-Host "--------------------------------------------" -ForegroundColor Gray
Get-ChildItem extensions -Directory | Select-Object Name | ForEach-Object { Write-Host "  ✓ $($_.Name)" -ForegroundColor Green }
Write-Host ""

Write-Host "============================================" -ForegroundColor Blue
Write-Host "   ✅ 所有测试完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Blue
