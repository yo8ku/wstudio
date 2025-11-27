/**
 * 修复 ESM 导入路径脚本
 * 功能：在编译后为所有相对路径导入添加 .js 扩展名
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '../dist/esm');

/**
 * 递归获取所有 .js 和 .d.ts 文件
 */
function getAllJsFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  
  files.forEach(file => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, fileList);
    } else if (file.endsWith('.js') || file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * 修复文件中的导入路径
 */
function fixImportsInFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  let modified = false;

  // 匹配所有相对路径导入（import ... from 和 export ... from）
  // 排除已经包含扩展名的导入
  // 使用更简单的正则表达式，分别匹配 import 和 export
  
  // 匹配 import ... from './path' 或 import './path'
  content = content.replace(/(import\s+(?:[^'"]*\s+from\s+)?['"])(\.\/[^'"]+)(['"])/g, (match, prefix, path, suffix) => {
    // 如果路径已经包含扩展名，跳过
    if (path.match(/\.(js|ts|json)$/)) {
      return match;
    }
    // 添加 .js 扩展名
    modified = true;
    return `${prefix}${path}.js${suffix}`;
  });
  
  // 匹配 export ... from './path'
  content = content.replace(/(export\s+(?:\*|(?:[^'"]*))\s+from\s+['"])(\.\/[^'"]+)(['"])/g, (match, prefix, path, suffix) => {
    // 如果路径已经包含扩展名，跳过
    if (path.match(/\.(js|ts|json)$/)) {
      return match;
    }
    // 添加 .js 扩展名
    modified = true;
    return `${prefix}${path}.js${suffix}`;
  });

  if (modified) {
    writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  
  return false;
}

// 获取所有 .js 和 .d.ts 文件
const jsFiles = getAllJsFiles(distDir);
let fixedCount = 0;

// 修复每个文件
jsFiles.forEach(file => {
  if (fixImportsInFile(file)) {
    fixedCount++;
  }
});

// 确保 dist/esm 目录中有 package.json 文件，设置 type: "module"
const packageJsonPath = join(distDir, 'package.json');
const packageJsonContent = JSON.stringify({ type: 'module' }, null, 2);
writeFileSync(packageJsonPath, packageJsonContent, 'utf-8');

console.log(`✅ 已修复 ${fixedCount}/${jsFiles.length} 个文件的 ESM 导入路径`);
console.log(`✅ 已创建 dist/esm/package.json (type: "module")`);

