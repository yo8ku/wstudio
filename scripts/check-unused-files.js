/**
 * 检查项目中未使用的文件
 * 分析导入/导出关系，找出未被引用的文件
 */

const fs = require('fs');
const path = require('path');

// 需要排除的目录
const EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  '.git',
  'python_bundle',
  '.turbo',
  'win-unpacked',
  '.vscode',
  'coverage',
  '.next',
  'build',
  'out',
  'tmp',
  'log',
  'resources',
  'docs',
  'scripts'
];

// 需要排除的文件扩展名
const EXCLUDE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.pak',
  '.bin',
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
  '.log',
  '.md',
  '.json',
  '.jsonc',
  '.yml',
  '.yaml',
  '.lock',
  '.txt',
  '.psd'
];

// 需要检查的文件扩展名
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// 入口文件（这些文件会被使用，即使没有被导入）
const ENTRY_FILES = [
  'packages/main/src/index.ts',
  'packages/renderer/src/index.tsx',
  'packages/shared/src/index.ts',
  'packages/theme/src/index.ts',
  'packages/plugin-system/src/index.ts',
  'packages/global-rag/src/index.ts',
  'electron.js',
  'preload.js',
  'packages/main/extension-host/index.ts'
];

// 存储所有文件
const allFiles = new Map();
// 存储被引用的文件
const usedFiles = new Set();
// 存储导入关系
const importMap = new Map();

/**
 * 检查路径是否应该被排除
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  for (const excludeDir of EXCLUDE_DIRS) {
    if (relativePath.includes(excludeDir)) {
      return true;
    }
  }
  
  const ext = path.extname(filePath).toLowerCase();
  if (EXCLUDE_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否是源代码文件
 */
function isSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext);
}

/**
 * 规范化导入路径
 */
function normalizeImportPath(importPath, fromFile) {
  // 移除扩展名
  let normalized = importPath.replace(/\.(ts|tsx|js|jsx)$/, '');
  
  // 处理相对路径
  if (normalized.startsWith('./') || normalized.startsWith('../')) {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, normalized);
    return path.relative(process.cwd(), resolved).replace(/\\/g, '/');
  }
  
  // 处理绝对路径（从项目根目录开始）
  if (normalized.startsWith('packages/')) {
    return normalized;
  }
  
  // 处理别名路径（如 @note-studio/shared）
  if (normalized.startsWith('@note-studio/')) {
    // 尝试解析别名
    const aliasMap = {
      '@note-studio/shared': 'packages/shared/src',
      '@note-studio/theme': 'packages/theme/src',
      '@note-studio/plugin-system': 'packages/plugin-system/src',
      '@note-studio/global-rag': 'packages/global-rag/src'
    };
    
    const parts = normalized.split('/');
    const alias = parts[0];
    if (aliasMap[alias]) {
      const rest = parts.slice(1).join('/');
      return `${aliasMap[alias]}/${rest}`;
    }
  }
  
  return null;
}

/**
 * 提取文件中的导入语句
 */
function extractImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = [];
    
    // 匹配各种导入语句
    const importPatterns = [
      /import\s+.*?\s+from\s+['"](.+?)['"]/g,
      /import\s+['"](.+?)['"]/g,
      /require\s*\(\s*['"](.+?)['"]\s*\)/g,
      /export\s+.*?\s+from\s+['"](.+?)['"]/g
    ];
    
    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath && !importPath.startsWith('http') && !importPath.startsWith('data:')) {
          const normalized = normalizeImportPath(importPath, filePath);
          if (normalized) {
            imports.push(normalized);
          }
        }
      }
    }
    
    return imports;
  } catch (error) {
    return [];
  }
}

/**
 * 查找文件（支持多种可能的路径）
 */
function findFile(importPath) {
  // 尝试直接路径
  if (fs.existsSync(importPath) && fs.statSync(importPath).isFile()) {
    return importPath;
  }
  
  // 尝试添加扩展名
  for (const ext of SOURCE_EXTENSIONS) {
    const filePath = importPath + ext;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  
  // 尝试 index 文件
  for (const ext of SOURCE_EXTENSIONS) {
    const filePath = path.join(importPath, `index${ext}`);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }
  
  return null;
}

/**
 * 递归遍历目录，收集所有文件
 */
function walkDirectory(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      
      if (shouldExclude(filePath)) {
        continue;
      }
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          walkDirectory(filePath, fileList);
        } else if (stat.isFile() && isSourceFile(filePath)) {
          fileList.push(filePath);
        }
      } catch (error) {
        // 忽略无法访问的文件
        continue;
      }
    }
  } catch (error) {
    // 忽略无法访问的目录
  }
  
  return fileList;
}

/**
 * 标记文件为已使用
 */
function markAsUsed(filePath) {
  const normalized = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  usedFiles.add(normalized);
  
  // 递归标记导入的文件
  const imports = importMap.get(normalized) || [];
  for (const importPath of imports) {
    const foundFile = findFile(importPath);
    if (foundFile && !usedFiles.has(path.relative(process.cwd(), foundFile).replace(/\\/g, '/'))) {
      markAsUsed(foundFile);
    }
  }
}

/**
 * 主函数
 */
function main() {
  console.log('开始检查未使用的文件...\n');
  
  const projectRoot = process.cwd();
  console.log(`项目根目录: ${projectRoot}\n`);
  
  // 收集所有源代码文件
  console.log('正在扫描源代码文件...');
  const sourceFiles = walkDirectory(projectRoot);
  console.log(`找到 ${sourceFiles.length} 个源代码文件\n`);
  
  // 存储文件信息
  for (const filePath of sourceFiles) {
    const normalized = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    allFiles.set(normalized, {
      path: filePath,
      normalized,
      size: fs.statSync(filePath).size
    });
  }
  
  // 提取所有导入关系
  console.log('正在分析导入关系...');
  let processedCount = 0;
  
  for (const filePath of sourceFiles) {
    processedCount++;
    if (processedCount % 100 === 0) {
      process.stdout.write(`\r已处理: ${processedCount}/${sourceFiles.length}`);
    }
    
    const normalized = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const imports = extractImports(filePath);
    importMap.set(normalized, imports);
  }
  
  console.log(`\n完成！已分析 ${processedCount} 个文件\n`);
  
  // 从入口文件开始标记已使用的文件
  console.log('正在标记已使用的文件...\n');
  
  for (const entryFile of ENTRY_FILES) {
    const entryPath = path.join(projectRoot, entryFile);
    if (fs.existsSync(entryPath)) {
      markAsUsed(entryPath);
    }
  }
  
  // 找出未使用的文件
  const unusedFiles = [];
  for (const [normalized, fileInfo] of allFiles.entries()) {
    if (!usedFiles.has(normalized)) {
      unusedFiles.push(fileInfo);
    }
  }
  
  // 按文件大小排序
  unusedFiles.sort((a, b) => b.size - a.size);
  
  // 生成报告
  console.log('='.repeat(80));
  console.log('未使用文件检查报告');
  console.log('='.repeat(80));
  console.log(`检查时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`检查范围: ${projectRoot}`);
  console.log(`\n总计文件数: ${sourceFiles.length}`);
  console.log(`已使用文件数: ${usedFiles.size}`);
  console.log(`未使用文件数: ${unusedFiles.length}`);
  
  if (unusedFiles.length === 0) {
    console.log('\n✅ 未发现未使用的文件！');
    return;
  }
  
  // 统计信息
  let totalSize = 0;
  for (const file of unusedFiles) {
    totalSize += file.size;
  }
  
  console.log(`未使用文件总大小: ${formatFileSize(totalSize)}`);
  
  // 按目录分组
  const filesByDir = new Map();
  for (const file of unusedFiles) {
    const dir = path.dirname(file.normalized);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir).push(file);
  }
  
  // 详细报告
  console.log('\n' + '='.repeat(80));
  console.log('详细报告');
  console.log('='.repeat(80));
  
  const sortedDirs = Array.from(filesByDir.entries()).sort((a, b) => b[1].length - a[1].length);
  
  for (const [dir, files] of sortedDirs) {
    console.log(`\n### ${dir} (${files.length} 个未使用文件)`);
    
    for (const file of files.slice(0, 20)) { // 只显示前20个
      console.log(`  - ${file.normalized} (${formatFileSize(file.size)})`);
    }
    
    if (files.length > 20) {
      console.log(`  ... 还有 ${files.length - 20} 个文件未显示`);
    }
  }
  
  // 生成Markdown报告
  const reportPath = path.join(projectRoot, 'unused-files-report.md');
  generateMarkdownReport(reportPath, unusedFiles, filesByDir, {
    totalFiles: sourceFiles.length,
    usedFiles: usedFiles.size,
    unusedFiles: unusedFiles.length,
    totalSize,
    checkTime: new Date().toLocaleString('zh-CN')
  });
  
  console.log(`\n\n✅ 报告已生成: ${reportPath}`);
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 生成Markdown格式的报告
 */
function generateMarkdownReport(reportPath, unusedFiles, filesByDir, stats) {
  let content = `# 未使用文件检查报告\n\n`;
  content += `## 检查时间\n`;
  content += `检查日期：${stats.checkTime}\n\n`;
  content += `## 统计信息\n\n`;
  content += `- 总计文件数：${stats.totalFiles}\n`;
  content += `- 已使用文件数：${stats.usedFiles}\n`;
  content += `- 未使用文件数：${stats.unusedFiles}\n`;
  content += `- 未使用文件总大小：${formatFileSize(stats.totalSize)}\n\n`;
  
  if (unusedFiles.length === 0) {
    content += `## 结果\n\n✅ **未发现未使用的文件！**\n`;
  } else {
    content += `## 未使用的文件 ⚠️\n\n`;
    content += `**注意**: 以下文件未被任何其他文件导入或引用。请仔细检查后再决定是否删除。\n\n`;
    
    const sortedDirs = Array.from(filesByDir.entries()).sort((a, b) => b[1].length - a[1].length);
    
    for (const [dir, files] of sortedDirs) {
      content += `### ${dir} (${files.length} 个文件)\n\n`;
      
      for (const file of files) {
        content += `- \`${file.normalized}\` (${formatFileSize(file.size)})\n`;
      }
      content += `\n`;
    }
  }
  
  content += `## 注意事项\n\n`;
  content += `- 此报告基于静态分析，可能无法检测到动态导入或运行时加载的文件\n`;
  content += `- 某些文件可能是配置文件、测试文件或未来计划使用的文件\n`;
  content += `- 在删除任何文件之前，请确保：\n`;
  content += `  1. 检查文件是否在配置中被引用\n`;
  content += `  2. 检查文件是否在运行时动态加载\n`;
  content += `  3. 检查文件是否是测试文件或文档\n`;
  content += `  4. 备份重要文件\n`;
  content += `  5. 测试删除后的功能是否正常\n\n`;
  content += `- 建议使用版本控制（Git）来跟踪这些更改，以便在需要时可以回滚\n`;
  
  fs.writeFileSync(reportPath, content, 'utf-8');
}

// 运行主函数
main();






