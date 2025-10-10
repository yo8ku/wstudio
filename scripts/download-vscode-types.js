#!/usr/bin/env node
/**
 * 下载 VSCode 类型定义
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TYPES_URL = 'https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/vscode.d.ts';
const OUTPUT_PATH = path.join(__dirname, '../packages/extension-api/src/vscode-compat/vscode.d.ts');

console.log('正在下载 VSCode 类型定义...');

https.get(TYPES_URL, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    fs.writeFileSync(OUTPUT_PATH, data);
    console.log('VSCode 类型定义已下载到:', OUTPUT_PATH);
  });
}).on('error', (err) => {
  console.error('下载失败:', err.message);
  process.exit(1);
});



