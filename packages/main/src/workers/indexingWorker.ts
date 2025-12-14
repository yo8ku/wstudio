/**
 * 工作区索引 Worker
 * 在独立线程中执行文件读取、切分和向量化
 */

import { parentPort } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

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

// 父块大小
const PARENT_CHUNK_SIZE = 2000;
// 子块大小
const CHILD_CHUNK_SIZE = 400;
// 子块重叠
const CHILD_CHUNK_OVERLAP = 50;

interface IndexTask {
  type: 'index-file' | 'scan-directory';
  filePath?: string;
  dirPath?: string;
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
    metadata: Record<string, any>;
  }[];
}

/**
 * 简单的文本切分器
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length - overlap) break;
  }
  
  return chunks;
}

/**
 * 父子切分
 */
function parentChildChunk(content: string): { parentContent: string; childContents: string[] }[] {
  const results: { parentContent: string; childContents: string[] }[] = [];
  
  // 先切分成父块
  const parentChunks = chunkText(content, PARENT_CHUNK_SIZE, 0);
  
  for (const parentContent of parentChunks) {
    // 每个父块再切分成子块
    const childContents = chunkText(parentContent, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP);
    results.push({ parentContent, childContents });
  }
  
  return results;
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
