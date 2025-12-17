/**
 * 工作区索引 Worker
 * 在独立线程中执行文件读取、切分和向量化
 */

import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { parentChildChunk } from './textChunker';

// 支持索引的文件扩展名
const SUPPORTED_EXTENSIONS = [
  '.md', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx',
  '.css', '.scss', '.less', '.html', '.xml', '.yaml', '.yml',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
  '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.vue',
  '.svelte', '.astro'
];

// 忽略的目录
const IGNORED_DIRECTORIES = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build',
  'out', 'target', '.next', '.nuxt', '.output', '__pycache__',
  '.cache', '.temp', '.tmp', 'coverage', '.nyc_output'
];

// 最小文档长度（字符数）
const MIN_DOCUMENT_LENGTH = 100;

// 最小文件大小（字节），小于此大小的文件不索引
const MIN_FILE_SIZE = 2 * 1024; // 2KB

interface IndexTask {
  type: 'index-file' | 'scan-directory';
  filePath?: string;
  dirPath?: string;
}

interface ChunkMetadata {
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  chunkIndex: number;
  workspaceIndex: boolean;
}

interface IndexResult {
  type: 'file-indexed' | 'file-skipped' | 'file-error' | 'scan-complete' | 'chunk-ready';
  filePath?: string;
  fileSize?: number;
  error?: string;
  files?: string[];
  chunks?: {
    parentContent: string;
    childContents: string[];
    metadata: ChunkMetadata;
  }[];
}

/**
 * 获取文件扩展名
 */
function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

/**
 * 检查是否应该忽略该目录/文件
 * 与软件文件树显示逻辑保持一致
 */
function shouldIgnore(name: string): boolean {
  // 忽略隐藏文件/目录（以 . 开头）
  if (name.startsWith('.')) return true;
  // 忽略特定目录
  if (IGNORED_DIRECTORIES.includes(name.toLowerCase())) return true;
  return false;
}

/**
 * 递归扫描目录
 * 只扫描软件中实际显示的文件（与文件树保持一致）
 */
function scanDirectory(dirPath: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      // 忽略隐藏文件/目录和特殊目录
      if (shouldIgnore(item.name)) continue;
      
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        // 递归扫描
        files.push(...scanDirectory(fullPath));
      } else if (item.isFile()) {
        // 检查文件扩展名
        const ext = getFileExtension(item.name);
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`[IndexingWorker] 扫描目录失败: ${dirPath}`, error);
  }
  
  return files;
}

/**
 * 处理单个文件
 */
function processFile(filePath: string): IndexResult {
  try {
    // 获取文件信息
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // 检查文件大小，小于 2KB 不索引
    if (fileSize < MIN_FILE_SIZE) {
      return {
        type: 'file-skipped',
        filePath,
        error: '文件小于2KB'
      };
    }
    
    // 读取文件
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    
    // 检查文档长度
    const contentWithoutSpaces = content.replace(/\s/g, '');
    if (contentWithoutSpaces.length < MIN_DOCUMENT_LENGTH) {
      return {
        type: 'file-skipped',
        filePath,
        error: '文件过短'
      };
    }
    
    // 父子切分
    const chunkResults = parentChildChunk(content);
    
    // 准备返回数据
    const chunks = chunkResults.map((chunk, index) => ({
      parentContent: chunk.parentContent,
      childContents: chunk.childContents,
      metadata: {
        filePath,
        fileName,
        fileType: getFileExtension(fileName),
        fileSize,
        chunkIndex: index,
        workspaceIndex: true
      }
    }));
    
    return {
      type: 'chunk-ready',
      filePath,
      fileSize,
      chunks
    };
  } catch (error) {
    return {
      type: 'file-error',
      filePath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 监听主线程消息
if (parentPort) {
  parentPort.on('message', (task: IndexTask) => {
    if (task.type === 'scan-directory' && task.dirPath) {
      const files = scanDirectory(task.dirPath);
      parentPort!.postMessage({
        type: 'scan-complete',
        files
      } as IndexResult);
    } else if (task.type === 'index-file' && task.filePath) {
      const result = processFile(task.filePath);
      parentPort!.postMessage(result);
    }
  });
  
  // 通知主线程 Worker 已就绪
  parentPort.postMessage({ type: 'ready' });
}
