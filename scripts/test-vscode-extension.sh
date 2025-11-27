#!/bin/bash

# ⭐ 测试安装真实的 VSCode 插件

echo "============================================"
echo "   VSCode 扩展安装测试套件"
echo "============================================"
echo ""

echo "测试1: 通过名称安装主题插件"
echo "--------------------------------------------"
npm run extension:install -- "One Monokai Theme"
echo ""

echo "测试2: 通过 ID 直接安装插件"
echo "--------------------------------------------"
npm run extension:install -- dracula-theme.theme-dracula
echo ""

echo "测试3: 查看已安装的扩展"
echo "--------------------------------------------"
ls -la extensions/ | grep "^d" | awk '{print $NF}' | grep -v "^\.$" | grep -v "^\.\.$"
echo ""

echo "============================================"
echo "   ✅ 所有测试完成！"
echo "============================================"
