#!/usr/bin/env node
/**
 * 测试 VSCode 扩展兼容性
 */

const fs = require('fs');
const path = require('path');

function testExtension(extensionPath) {
  console.log(`\n测试扩展: ${extensionPath}`);
  
  // 读取 package.json
  const manifestPath = path.join(extensionPath, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ 未找到 package.json');
    return false;
  }
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  
  // 检查必要字段
  const requiredFields = ['name', 'version', 'engines'];
  for (const field of requiredFields) {
    if (!manifest[field]) {
      console.error(`❌ 缺少必要字段: ${field}`);
      return false;
    }
  }
  
  // 检查引擎版本
  if (manifest.engines?.vscode) {
    console.log(`✓ VSCode 引擎版本: ${manifest.engines.vscode}`);
  }
  
  // 检查激活事件
  if (manifest.activationEvents) {
    console.log(`✓ 激活事件: ${manifest.activationEvents.join(', ')}`);
  }
  
  // 检查贡献点
  if (manifest.contributes) {
    const contributions = Object.keys(manifest.contributes);
    console.log(`✓ 贡献点: ${contributions.join(', ')}`);
  }
  
  console.log('✓ 扩展兼容性测试通过');
  return true;
}

// 从命令行参数获取扩展路径
const extensionPath = process.argv[2];

if (!extensionPath) {
  console.error('用法: node test-vscode-extension.js <扩展路径>');
  process.exit(1);
}

const success = testExtension(extensionPath);
process.exit(success ? 0 : 1);



