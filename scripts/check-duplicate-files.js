/**
 * 检查项目中重复文件的脚本
 * 通过计算文件内容的哈希值来识别完全相同的文件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 需要排除的目录（用于内容检查）
const EXCLUDE_DIRS_FOR_CONTENT = [
  'node_modules',
  '.git',
  'python_bundle',
  '.turbo',
  'win-unpacked',
  '.vscode',
  'coverage',
  '.next',
  'build',
  'out'
];

// 需要排除的目录（用于文件名检查，dist也要检查）
const EXCLUDE_DIRS_FOR_NAME = [
  'node_modules',
  '.git',
  'python_bundle',
  '.turbo',
  'win-unpacked',
  '.vscode',
  'coverage',
  '.next',
  'build',
  'out'
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
  '.log'
];

// 存储文件哈希和路径的映射
const fileHashMap = new Map();
const duplicateGroups = [];

// 存储文件名和路径的映射（用于检查同名文件）
const fileNameMap = new Map();
const sameNameGroups = [];

/**
 * 计算文件的MD5哈希值
 */
function calculateFileHash(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error(`计算文件哈希失败: ${filePath}`, error.message);
    return null;
  }
}

/**
 * 检查路径是否应该被排除（用于内容检查）
 */
function shouldExcludeForContent(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  // 检查是否在排除目录中
  for (const excludeDir of EXCLUDE_DIRS_FOR_CONTENT) {
    if (relativePath.includes(excludeDir)) {
      return true;
    }
  }
  
  // 检查文件扩展名
  const ext = path.extname(filePath).toLowerCase();
  if (EXCLUDE_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  return false;
}

/**
 * 检查路径是否应该被排除（用于文件名检查）
 */
function shouldExcludeForName(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  // 检查是否在排除目录中
  for (const excludeDir of EXCLUDE_DIRS_FOR_NAME) {
    if (relativePath.includes(excludeDir)) {
      return true;
    }
  }
  
  // 检查文件扩展名
  const ext = path.extname(filePath).toLowerCase();
  if (EXCLUDE_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  return false;
}

/**
 * 递归遍历目录，收集所有文件
 */
function walkDirectory(dir, fileList = [], excludeFunc) {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      
      // 跳过排除的路径
      if (excludeFunc(filePath)) {
        continue;
      }
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          walkDirectory(filePath, fileList, excludeFunc);
        } else if (stat.isFile()) {
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
 * 获取文件信息
 */
function getFileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      size: stat.size,
      sizeFormatted: formatFileSize(stat.size),
      modified: stat.mtime
    };
  } catch (error) {
    return null;
  }
}

/**
 * 检查同名文件
 */
function checkSameNameFiles(allFiles) {
  console.log('\n正在检查同名文件...');
  
  for (const filePath of allFiles) {
    const fileName = path.basename(filePath);
    const fileNameLower = fileName.toLowerCase();
    
    if (!fileNameMap.has(fileNameLower)) {
      fileNameMap.set(fileNameLower, []);
    }
    
    const fileInfo = getFileInfo(filePath);
    if (fileInfo) {
      fileNameMap.get(fileNameLower).push(fileInfo);
    }
  }
  
  // 找出同名文件
  for (const [fileName, files] of fileNameMap.entries()) {
    if (files.length > 1) {
      // 过滤掉明显不是重复的情况（如index.ts在不同目录是正常的）
      const uniqueDirs = new Set();
      files.forEach(f => {
        const dir = path.dirname(f.path);
        uniqueDirs.add(dir);
      });
      
      // 如果同名文件在不同目录，可能是正常的，但也需要报告
      sameNameGroups.push({
        fileName,
        files: files.sort((a, b) => a.path.localeCompare(b.path)),
        uniqueDirs: uniqueDirs.size
      });
    }
  }
  
  // 按文件数量排序
  sameNameGroups.sort((a, b) => b.files.length - a.files.length);
}

/**
 * 主函数
 */
function main() {
  console.log('开始检查重复文件...\n');
  
  const projectRoot = process.cwd();
  console.log(`项目根目录: ${projectRoot}\n`);
  
  // 收集所有文件（用于内容检查）
  console.log('正在扫描文件（内容检查）...');
  const allFilesForContent = walkDirectory(projectRoot, [], shouldExcludeForContent);
  console.log(`找到 ${allFilesForContent.length} 个文件\n`);
  
  // 收集所有文件（用于文件名检查，包括dist）
  console.log('正在扫描文件（文件名检查，包括dist目录）...');
  const allFilesForName = walkDirectory(projectRoot, [], shouldExcludeForName);
  console.log(`找到 ${allFilesForName.length} 个文件\n`);
  
  // 计算每个文件的哈希值
  console.log('正在计算文件哈希值...');
  let processedCount = 0;
  
  for (const filePath of allFilesForContent) {
    processedCount++;
    if (processedCount % 100 === 0) {
      process.stdout.write(`\r已处理: ${processedCount}/${allFilesForContent.length}`);
    }
    
    const hash = calculateFileHash(filePath);
    if (!hash) continue;
    
    if (!fileHashMap.has(hash)) {
      fileHashMap.set(hash, []);
    }
    
    const fileInfo = getFileInfo(filePath);
    if (fileInfo) {
      fileHashMap.get(hash).push(fileInfo);
    }
  }
  
  console.log(`\n完成！已处理 ${processedCount} 个文件\n`);
  
  // 找出内容重复的文件
  console.log('正在分析内容重复的文件...\n');
  
  for (const [hash, files] of fileHashMap.entries()) {
    if (files.length > 1) {
      duplicateGroups.push({
        hash,
        files: files.sort((a, b) => a.path.localeCompare(b.path))
      });
    }
  }
  
  // 按重复文件数量排序
  duplicateGroups.sort((a, b) => b.files.length - a.files.length);
  
  // 检查同名文件
  checkSameNameFiles(allFilesForName);
  
  // 生成报告
  console.log('='.repeat(80));
  console.log('重复文件检查报告');
  console.log('='.repeat(80));
  console.log(`检查时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`检查范围: ${projectRoot}`);
  console.log(`排除目录（内容检查）: ${EXCLUDE_DIRS_FOR_CONTENT.join(', ')}`);
  console.log(`排除目录（文件名检查）: ${EXCLUDE_DIRS_FOR_NAME.join(', ')}`);
  console.log(`排除扩展名: ${EXCLUDE_EXTENSIONS.join(', ')}`);
  console.log(`\n总计文件数（内容检查）: ${allFilesForContent.length}`);
  console.log(`总计文件数（文件名检查）: ${allFilesForName.length}`);
  console.log(`唯一文件数: ${fileHashMap.size}`);
  console.log(`内容重复文件组数: ${duplicateGroups.length}`);
  console.log(`同名文件组数: ${sameNameGroups.length}`);
  
  if (duplicateGroups.length === 0 && sameNameGroups.length === 0) {
    console.log('\n✅ 未发现重复文件！');
    return;
  }
  
  // 统计信息
  let totalDuplicateFiles = 0;
  let totalWastedSpace = 0;
  
  for (const group of duplicateGroups) {
    totalDuplicateFiles += group.files.length;
    // 计算浪费的空间（保留一个，其他都是重复的）
    totalWastedSpace += group.files[0].size * (group.files.length - 1);
  }
  
  if (duplicateGroups.length > 0) {
    console.log(`内容重复文件总数: ${totalDuplicateFiles}`);
    console.log(`可节省空间: ${formatFileSize(totalWastedSpace)}`);
  }
  
  // 详细报告 - 内容重复
  if (duplicateGroups.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('内容完全相同的重复文件');
    console.log('='.repeat(80));
    
    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i];
      console.log(`\n### 重复文件组 ${i + 1} (${group.files.length} 个相同文件)`);
      console.log(`哈希值: ${group.hash}`);
      console.log(`文件大小: ${group.files[0].sizeFormatted}`);
      console.log(`\n文件列表:`);
      
      for (let j = 0; j < group.files.length; j++) {
        const file = group.files[j];
        const relativePath = path.relative(projectRoot, file.path);
        console.log(`  ${j + 1}. ${relativePath}`);
        console.log(`     大小: ${file.sizeFormatted}, 修改时间: ${file.modified.toLocaleString('zh-CN')}`);
      }
      
      // 建议保留的文件（通常保留最短路径或最常用的）
      const recommendedKeep = group.files[0];
      const recommendedKeepPath = path.relative(projectRoot, recommendedKeep.path);
      console.log(`\n建议: 保留 "${recommendedKeepPath}", 删除其他 ${group.files.length - 1} 个重复文件`);
    }
  }
  
  // 详细报告 - 同名文件
  if (sameNameGroups.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('同名文件（需要人工检查是否为重复）');
    console.log('='.repeat(80));
    
    // 只显示可能有问题的情况（同名且在不同目录，或者数量较多）
    const suspiciousGroups = sameNameGroups.filter(g => 
      g.uniqueDirs > 1 && g.files.length > 1
    );
    
    if (suspiciousGroups.length > 0) {
      console.log(`\n发现 ${suspiciousGroups.length} 组可疑的同名文件：\n`);
      
      for (let i = 0; i < Math.min(suspiciousGroups.length, 20); i++) {
        const group = suspiciousGroups[i];
        console.log(`\n### ${i + 1}. 文件名: ${group.fileName} (${group.files.length} 个文件, ${group.uniqueDirs} 个不同目录)`);
        
        for (let j = 0; j < group.files.length; j++) {
          const file = group.files[j];
          const relativePath = path.relative(projectRoot, file.path);
          console.log(`  ${j + 1}. ${relativePath} (${file.sizeFormatted})`);
        }
      }
      
      if (suspiciousGroups.length > 20) {
        console.log(`\n... 还有 ${suspiciousGroups.length - 20} 组同名文件未显示`);
      }
    }
  }
  
  // 生成Markdown报告
  const reportPath = path.join(projectRoot, 'duplicate-files-report.md');
  generateMarkdownReport(reportPath, duplicateGroups, sameNameGroups, {
    totalFiles: allFilesForContent.length,
    totalFilesForName: allFilesForName.length,
    uniqueFiles: fileHashMap.size,
    duplicateGroups: duplicateGroups.length,
    sameNameGroups: sameNameGroups.length,
    totalDuplicateFiles,
    totalWastedSpace,
    checkTime: new Date().toLocaleString('zh-CN')
  });
  
  console.log(`\n\n✅ 报告已生成: ${reportPath}`);
}

/**
 * 生成Markdown格式的报告
 */
function generateMarkdownReport(reportPath, duplicateGroups, sameNameGroups, stats) {
  let content = `# 项目重复文件检查报告\n\n`;
  content += `## 检查时间\n`;
  content += `检查日期：${stats.checkTime}\n\n`;
  content += `## 检查范围\n`;
  content += `- 项目根目录：\`${process.cwd()}\`\n`;
  content += `- 排除目录（内容检查）：${EXCLUDE_DIRS_FOR_CONTENT.join(', ')}\n`;
  content += `- 排除目录（文件名检查）：${EXCLUDE_DIRS_FOR_NAME.join(', ')}\n`;
  content += `- 排除扩展名：${EXCLUDE_EXTENSIONS.join(', ')}\n\n`;
  content += `## 统计信息\n\n`;
  content += `- 总计文件数（内容检查）：${stats.totalFiles}\n`;
  content += `- 总计文件数（文件名检查）：${stats.totalFilesForName}\n`;
  content += `- 唯一文件数：${stats.uniqueFiles}\n`;
  content += `- 内容重复文件组数：${stats.duplicateGroups}\n`;
  content += `- 同名文件组数：${stats.sameNameGroups}\n`;
  
  if (stats.duplicateGroups > 0) {
    content += `- 内容重复文件总数：${stats.totalDuplicateFiles}\n`;
    content += `- 可节省空间：${stats.totalWastedSpace}\n`;
  }
  content += `\n`;
  
  // 内容完全相同的重复文件
  if (duplicateGroups.length === 0) {
    content += `## 内容完全相同的重复文件\n\n✅ **未发现内容完全相同的重复文件！**\n\n`;
  } else {
    content += `## 内容完全相同的重复文件 ⚠️\n\n`;
    
    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i];
      content += `### ${i + 1}. 重复文件组 (${group.files.length} 个相同文件)\n\n`;
      content += `**哈希值：** \`${group.hash}\`\n\n`;
      content += `**文件大小：** ${group.files[0].sizeFormatted}\n\n`;
      content += `**文件列表：**\n\n`;
      
      for (let j = 0; j < group.files.length; j++) {
        const file = group.files[j];
        const relativePath = path.relative(process.cwd(), file.path);
        content += `${j + 1}. \`${relativePath}\`\n`;
        content += `   - 大小：${file.sizeFormatted}\n`;
        content += `   - 修改时间：${file.modified.toLocaleString('zh-CN')}\n\n`;
      }
      
      const recommendedKeep = group.files[0];
      const recommendedKeepPath = path.relative(process.cwd(), recommendedKeep.path);
      content += `**建议：** 保留 \`${recommendedKeepPath}\`，删除其他 ${group.files.length - 1} 个重复文件\n\n`;
      content += `---\n\n`;
    }
  }
  
  // 同名文件
  const suspiciousGroups = sameNameGroups.filter(g => 
    g.uniqueDirs > 1 && g.files.length > 1
  );
  
  if (suspiciousGroups.length === 0) {
    content += `## 同名文件检查\n\n✅ **未发现可疑的同名文件！**\n\n`;
  } else {
    content += `## 同名文件（需要人工检查） ⚠️\n\n`;
    content += `以下文件在不同目录中有相同的文件名，需要人工检查是否为重复文件：\n\n`;
    
    for (let i = 0; i < suspiciousGroups.length; i++) {
      const group = suspiciousGroups[i];
      content += `### ${i + 1}. 文件名: \`${group.fileName}\` (${group.files.length} 个文件, ${group.uniqueDirs} 个不同目录)\n\n`;
      
      for (let j = 0; j < group.files.length; j++) {
        const file = group.files[j];
        const relativePath = path.relative(process.cwd(), file.path);
        content += `${j + 1}. \`${relativePath}\` (${file.sizeFormatted})\n`;
      }
      content += `\n---\n\n`;
    }
  }
  
  content += `## 注意事项\n\n`;
  content += `- 在删除任何文件之前，请确保：\n`;
  content += `  1. 检查所有导入该文件的代码\n`;
  content += `  2. 确认文件不再被使用\n`;
  content += `  3. 备份重要文件\n`;
  content += `  4. 测试删除后的功能是否正常\n\n`;
  content += `- 建议使用版本控制（Git）来跟踪这些更改，以便在需要时可以回滚\n`;
  content += `- 同名文件在不同目录可能是正常的（如 index.ts），需要人工判断是否为重复\n`;
  
  fs.writeFileSync(reportPath, content, 'utf-8');
}

// 运行主函数
main();

