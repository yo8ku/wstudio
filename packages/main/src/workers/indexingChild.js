/**
 * 索引子进程 - 支持 Electron utilityProcess
 * 功能：在独立进程中执行文件扫描和切分，不占用主进程 CPU
 */

const fs = require('fs');
const path = require('path');

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
// 最小文件大小（字节）
const MIN_FILE_SIZE = 2 * 1024;

// 检测运行环境
const isUtilityProcess = typeof process.parentPort !== 'undefined';

/**
 * 发送消息到主进程
 */
function sendMessage(msg) {
  if (isUtilityProcess) {
    process.parentPort.postMessage(msg);
  } else {
    process.send(msg);
  }
}

/**
 * 获取文件扩展名
 */
function getFileExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

/**
 * 检查是否应该忽略该目录/文件
 */
function shouldIgnore(name) {
  if (name.startsWith('.')) return true;
  if (IGNORED_DIRECTORIES.includes(name.toLowerCase())) return true;
  return false;
}

/**
 * 递归扫描目录
 */
function scanDirectory(dirPath) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      if (shouldIgnore(item.name)) continue;
      
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        files.push(...scanDirectory(fullPath));
      } else if (item.isFile()) {
        const ext = getFileExtension(item.name);
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // 忽略扫描错误
  }
  
  return files;
}

// 延迟加载 textChunker
let parentChildChunk = null;

/**
 * 加载切分器
 */
async function loadChunker(appPath) {
  if (parentChildChunk) return;
  
  try {
    const chunkerPath = path.join(appPath, 'packages/main/dist/main/src/workers/textChunker.js');
    if (fs.existsSync(chunkerPath)) {
      const chunker = require(chunkerPath);
      parentChildChunk = chunker.parentChildChunk;
    }
  } catch (error) {
    console.error('[IndexingChild] 加载切分器失败:', error.message);
  }
}

/**
 * 简单的文本切分（回退方案）
 */
function simpleChunk(content) {
  const results = [];
  const paragraphs = content.split(/\n\n+/);
  
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length >= MIN_DOCUMENT_LENGTH) {
      results.push({
        parentContent: trimmed,
        childContents: [trimmed]
      });
    }
  }
  
  return results;
}

/**
 * 流式读取文件内容（避免一次性加载大文件）
 */
function readFileContent(filePath, maxSize = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
    
    stream.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize <= maxSize) {
        chunks.push(chunk);
      } else {
        stream.destroy();
        resolve(chunks.join(''));
      }
    });
    
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}

/**
 * 处理单个文件
 */
async function processFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    if (fileSize < MIN_FILE_SIZE) {
      return { type: 'file-skipped', filePath, error: '文件小于2KB' };
    }
    
    // 使用流式读取
    const content = await readFileContent(filePath);
    const fileName = path.basename(filePath);
    
    const contentWithoutSpaces = content.replace(/\s/g, '');
    if (contentWithoutSpaces.length < MIN_DOCUMENT_LENGTH) {
      return { type: 'file-skipped', filePath, error: '文件过短' };
    }
    
    // 使用切分器或回退到简单切分
    let chunkResults;
    if (parentChildChunk) {
      chunkResults = parentChildChunk(content);
    } else {
      chunkResults = simpleChunk(content);
    }
    
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
    
    return { type: 'chunk-ready', filePath, fileSize, chunks };
  } catch (error) {
    return { type: 'file-error', filePath, error: error.message };
  }
}

/**
 * 处理消息
 */
async function handleMessage(msg) {
  const { type, data } = msg;
  
  switch (type) {
    case 'initialize':
      await loadChunker(data.appPath);
      sendMessage({ type: 'ready' });
      break;
      
    case 'scan-directory':
      const files = scanDirectory(data.dirPath);
      sendMessage({ type: 'scan-complete', files });
      break;
      
    case 'index-file':
      const result = await processFile(data.filePath);
      sendMessage(result);
      break;
      
    case 'shutdown':
      process.exit(0);
  }
}

// 根据运行环境设置消息监听
if (isUtilityProcess) {
  process.parentPort.on('message', (event) => {
    handleMessage(event.data);
  });
  process.parentPort.postMessage({ type: 'started' });
} else {
  process.on('message', handleMessage);
  process.send({ type: 'started' });
}
