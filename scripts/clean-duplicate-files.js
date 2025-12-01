/**
 * 清理重复文件的脚本
 * 安全地删除构建产物中的重复文件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 是否静默模式（用于构建前自动清理）
const SILENT_MODE = process.argv.includes('--silent');

// 需要删除的目录（这些是构建时复制的，可以安全删除）
const DIRS_TO_DELETE = [
  'dist',  // 根目录的旧dist目录
  'packages/main/dist/packages',  // main包中复制的依赖包
];

// 需要保留的目录（这些是正常的构建输出）
const DIRS_TO_KEEP = [
  'packages/main/dist/main',  // main包自己的构建输出
  'packages/shared/dist',
  'packages/theme/dist',
  'packages/plugin-system/dist',
  'packages/renderer/dist',
  'packages/global-rag/dist',
];

/**
 * 检查路径是否应该保留
 */
function shouldKeep(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  for (const keepDir of DIRS_TO_KEEP) {
    if (normalizedPath.includes(keepDir.replace(/\\/g, '/'))) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查路径是否应该删除
 */
function shouldDelete(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // 先检查是否应该保留
  if (shouldKeep(filePath)) {
    return false;
  }
  
  // 检查是否在删除列表中
  for (const deleteDir of DIRS_TO_DELETE) {
    if (normalizedPath.includes(deleteDir.replace(/\\/g, '/'))) {
      return true;
    }
  }
  
  // 检查是否是packages/main/dist下的其他目录（除了main）
  if (normalizedPath.includes('packages/main/dist/') && 
      !normalizedPath.includes('packages/main/dist/main')) {
    return true;
  }
  
  return false;
}

/**
 * 递归删除目录
 */
function deleteDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { deleted: false, reason: '目录不存在' };
  }
  
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { deleted: false, reason: '不是目录' };
    }
    
    fs.rmSync(dirPath, { recursive: true, force: true });
    return { deleted: true, reason: '成功删除' };
  } catch (error) {
    return { deleted: false, reason: `删除失败: ${error.message}` };
  }
}

/**
 * 删除文件
 */
function deleteFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { deleted: false, reason: '文件不存在' };
  }
  
  try {
    fs.unlinkSync(filePath);
    return { deleted: true, reason: '成功删除' };
  } catch (error) {
    return { deleted: false, reason: `删除失败: ${error.message}` };
  }
}

/**
 * 获取目录大小
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        totalSize += getDirectorySize(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  } catch (error) {
    // 忽略错误
  }
  
  return totalSize;
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
  if (!SILENT_MODE) {
    console.log('开始清理重复文件...\n');
  }
  
  const projectRoot = process.cwd();
  if (!SILENT_MODE) {
    console.log(`项目根目录: ${projectRoot}\n`);
  }
  
  const results = {
    directories: [],
    totalSize: 0,
    success: 0,
    failed: 0
  };
  
  // 清理目录
  if (!SILENT_MODE) {
    console.log('正在清理重复的构建目录...\n');
  }
  
  for (const dir of DIRS_TO_DELETE) {
    const dirPath = path.join(projectRoot, dir);
    
    if (fs.existsSync(dirPath)) {
      if (!SILENT_MODE) {
        console.log(`检查目录: ${dir}`);
      }
      const size = getDirectorySize(dirPath);
      const result = deleteDirectory(dirPath);
      
      results.directories.push({
        path: dir,
        size,
        ...result
      });
      
      if (result.deleted) {
        results.totalSize += size;
        results.success++;
        if (!SILENT_MODE) {
          console.log(`  ✓ 已删除 (${formatFileSize(size)})\n`);
        }
      } else {
        results.failed++;
        if (!SILENT_MODE) {
          console.log(`  ✗ ${result.reason}\n`);
        }
      }
    } else {
      if (!SILENT_MODE) {
        console.log(`  - 目录不存在，跳过\n`);
      }
    }
  }
  
  // 清理packages/main/dist下的其他目录（除了main）
  if (!SILENT_MODE) {
    console.log('正在清理 packages/main/dist 下的重复目录...\n');
  }
  
  const mainDistPath = path.join(projectRoot, 'packages/main/dist');
  if (fs.existsSync(mainDistPath)) {
    try {
      const entries = fs.readdirSync(mainDistPath);
      
      for (const entry of entries) {
        if (entry === 'main') {
          continue; // 保留main目录
        }
        
        const entryPath = path.join(mainDistPath, entry);
        const stat = fs.statSync(entryPath);
        
        if (stat.isDirectory()) {
          if (!SILENT_MODE) {
            console.log(`检查目录: packages/main/dist/${entry}`);
          }
          const size = getDirectorySize(entryPath);
          const result = deleteDirectory(entryPath);
          
          results.directories.push({
            path: `packages/main/dist/${entry}`,
            size,
            ...result
          });
          
          if (result.deleted) {
            results.totalSize += size;
            results.success++;
            if (!SILENT_MODE) {
              console.log(`  ✓ 已删除 (${formatFileSize(size)})\n`);
            }
          } else {
            results.failed++;
            if (!SILENT_MODE) {
              console.log(`  ✗ ${result.reason}\n`);
            }
          }
        }
      }
    } catch (error) {
      if (!SILENT_MODE) {
        console.error(`  ✗ 读取目录失败: ${error.message}\n`);
      }
    }
  }
  
  // 输出总结
  if (!SILENT_MODE) {
    console.log('='.repeat(80));
    console.log('清理完成');
    console.log('='.repeat(80));
    console.log(`成功删除: ${results.success} 个目录`);
    console.log(`失败: ${results.failed} 个目录`);
    console.log(`释放空间: ${formatFileSize(results.totalSize)}`);
    console.log('\n');
    
    if (results.success > 0) {
      console.log('已删除的目录:');
      results.directories
        .filter(d => d.deleted)
        .forEach(d => {
          console.log(`  - ${d.path} (${formatFileSize(d.size)})`);
        });
    }
    
    console.log('\n✅ 清理完成！');
    console.log('\n注意: 这些是构建产物，可以通过运行构建命令重新生成。');
    console.log('建议运行: pnpm run build');
  } else {
    // 静默模式：只在有删除操作时输出简要信息
    if (results.success > 0) {
      console.log(`[Clean] 清理了 ${results.success} 个目录，释放 ${formatFileSize(results.totalSize)}`);
    }
  }
}

// 运行主函数
main();

