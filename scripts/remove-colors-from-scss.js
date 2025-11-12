/**
 * 自动化脚本：从所有 .scss 文件中移除颜色样式
 * 
 * 功能：
 * 1. 扫描所有 .scss 文件
 * 2. 移除所有颜色相关的 CSS 属性（background-color, color, border-color等）
 * 3. 在文件顶部添加 @import colors.css
 * 4. 保留布局相关的样式
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 需要移除的颜色相关属性
const colorProperties = [
  'background-color',
  'background',
  'color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-shadow',
  'fill',
  'stroke',
  'outline-color',
];

// 需要保留的特殊情况
const keepPatterns = [
  'background: none',
  'background: transparent',
  'border: none',
];

/**
 * 计算相对路径深度，用于生成正确的 import 路径
 */
function getImportPath(filePath) {
  const relativePath = path.relative('packages/renderer/src', path.dirname(filePath));
  const depth = relativePath.split(path.sep).length;
  const prefix = '../'.repeat(depth);
  return `${prefix}styles/colors.css`;
}

/**
 * 判断是否是颜色相关的行
 */
function isColorLine(line) {
  // 跳过注释
  if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
    return false;
  }

  // 检查是否包含需要保留的特殊情况
  for (const pattern of keepPatterns) {
    if (line.includes(pattern)) {
      return false;
    }
  }

  // 检查是否包含颜色属性
  for (const prop of colorProperties) {
    // 检查是否是该属性的声明
    if (line.includes(`${prop}:`) || line.includes(`${prop} :`)) {
      // 但要保留没有值的边框声明，如 border: 1px solid;
      if (prop.includes('border') && /border.*:\s*\d+px\s+solid\s*;/.test(line)) {
        return false;
      }
      return true;
    }
  }

  // 检查 opacity 和 filter 属性
  if (line.includes('opacity:') && !line.includes('opacity: 1')) {
    return true;
  }

  return false;
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const newLines = [];
  
  let hasImport = false;
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查是否已经有 import
    if (line.includes('@import') && line.includes('colors.css')) {
      hasImport = true;
    }

    // 跳过颜色相关的行
    if (isColorLine(line)) {
      skipNext = false;
      continue;
    }

    newLines.push(line);
  }

  // 在文件顶部添加 import（如果还没有）
  if (!hasImport) {
    const importPath = getImportPath(filePath);
    const headerComment = `/**
 * ${path.basename(path.dirname(filePath))} 样式 - 只负责布局
 * 颜色样式在 colors.css 中统一管理
 */
@import '${importPath}';

`;
    
    // 找到第一个非注释、非空行的位置
    let insertIndex = 0;
    for (let i = 0; i < newLines.length; i++) {
      const line = newLines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        insertIndex = i;
        break;
      }
    }
    
    // 插入 header
    newLines.splice(insertIndex, 0, headerComment);
  }

  // 写回文件
  const newContent = newLines.join('\n');
  fs.writeFileSync(filePath, newContent, 'utf-8');
  
  console.log(`✓ Processed: ${filePath}`);
}

/**
 * 主函数
 */
function main() {
  const scssFiles = glob.sync('packages/renderer/src/**/*.scss');
  
  console.log(`Found ${scssFiles.length} SCSS files\n`);
  
  for (const file of scssFiles) {
    try {
      processFile(file);
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\n✓ All done! Processed ${scssFiles.length} files`);
}

main();

