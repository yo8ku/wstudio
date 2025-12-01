/**
 * 安全删除未使用文件的脚本
 * 只删除明确可以安全删除的文件（示例文件、测试文件、临时文件）
 */

const fs = require('fs');
const path = require('path');

// 可以安全删除的文件列表
const FILES_TO_DELETE = [
  // 临时文件
  'temp_pipeline.js',
  
  // 示例文件
  'packages/renderer/src/stores/modalStore.example.ts',
  'packages/renderer/src/components/Layout/MenuBar.example.tsx',
  'packages/main/src/services/CompatibilityService.example.ts',
  'packages/renderer/src/components/ModeThinking/example.tsx',
  'packages/renderer/src/components/FileIcon/Example.tsx',
  'packages/renderer/src/components/Icons/USAGE_EXAMPLE.tsx',
  
  // 测试文件（如果项目不使用测试）
  'packages/renderer/src/utils/__tests__/markdownRenderer.test.ts',
  'packages/renderer/src/utils/__tests__/aiResponseFormatter.test.ts',
];

// 需要检查的目录（如果目录为空，也删除）
const DIRS_TO_CHECK = [
  'packages/renderer/src/utils/__tests__',
];

/**
 * 删除文件
 */
function deleteFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    return { deleted: false, reason: '文件不存在' };
  }
  
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return { deleted: false, reason: '不是文件' };
    }
    
    const size = stat.size;
    fs.unlinkSync(fullPath);
    return { deleted: true, size, reason: '成功删除' };
  } catch (error) {
    return { deleted: false, reason: `删除失败: ${error.message}` };
  }
}

/**
 * 删除空目录
 */
function deleteEmptyDir(dirPath) {
  const fullPath = path.join(process.cwd(), dirPath);
  
  if (!fs.existsSync(fullPath)) {
    return { deleted: false, reason: '目录不存在' };
  }
  
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      return { deleted: false, reason: '不是目录' };
    }
    
    // 检查目录是否为空
    const files = fs.readdirSync(fullPath);
    if (files.length > 0) {
      return { deleted: false, reason: '目录不为空' };
    }
    
    fs.rmdirSync(fullPath);
    return { deleted: true, reason: '成功删除空目录' };
  } catch (error) {
    return { deleted: false, reason: `删除失败: ${error.message}` };
  }
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
 * 主函数
 */
function main() {
  console.log('开始安全删除未使用的文件...\n');
  
  const projectRoot = process.cwd();
  console.log(`项目根目录: ${projectRoot}\n`);
  
  const results = {
    files: [],
    totalSize: 0,
    success: 0,
    failed: 0
  };
  
  // 删除文件
  console.log('正在删除文件...\n');
  
  for (const filePath of FILES_TO_DELETE) {
    const result = deleteFile(filePath);
    
    results.files.push({
      path: filePath,
      ...result
    });
    
    if (result.deleted) {
      results.totalSize += result.size || 0;
      results.success++;
      console.log(`  ✓ ${filePath} (${formatFileSize(result.size || 0)})`);
    } else {
      results.failed++;
      console.log(`  ✗ ${filePath} - ${result.reason}`);
    }
  }
  
  // 检查并删除空目录
  console.log('\n正在检查空目录...\n');
  
  for (const dirPath of DIRS_TO_CHECK) {
    const result = deleteEmptyDir(dirPath);
    
    if (result.deleted) {
      console.log(`  ✓ ${dirPath} (空目录已删除)`);
    } else if (result.reason !== '目录不为空') {
      console.log(`  - ${dirPath} - ${result.reason}`);
    }
  }
  
  // 输出总结
  console.log('\n' + '='.repeat(80));
  console.log('删除完成');
  console.log('='.repeat(80));
  console.log(`成功删除: ${results.success} 个文件`);
  console.log(`失败: ${results.failed} 个文件`);
  console.log(`释放空间: ${formatFileSize(results.totalSize)}`);
  
  if (results.success > 0) {
    console.log('\n已删除的文件:');
    results.files
      .filter(f => f.deleted)
      .forEach(f => {
        console.log(`  - ${f.path} (${formatFileSize(f.size || 0)})`);
      });
  }
  
  console.log('\n✅ 安全删除完成！');
  console.log('\n注意: 这些文件已从项目中删除。');
  console.log('如果使用 Git，可以通过 git checkout 恢复这些文件。');
}

// 运行主函数
main();






