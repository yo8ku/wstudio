#!/usr/bin/env node
/**
 * 构建扩展宿主进程
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('构建扩展宿主进程...');

const mainPath = path.join(__dirname, '../packages/main');

try {
  execSync('npm run build', {
    cwd: mainPath,
    stdio: 'inherit'
  });
  
  console.log('✓ 扩展宿主进程构建完成');
} catch (error) {
  console.error('✗ 构建失败:', error.message);
  process.exit(1);
}



