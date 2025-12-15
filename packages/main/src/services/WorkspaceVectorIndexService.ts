/**
 * 工作区向量索引服务（主进程）
 * 使用 Worker Thread 进行文件扫描和切分
 * 使用 child_process.fork() 子进程进行 Embedding（完全不阻塞主进程）
 */

import { Worker } from 'worker_threads';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BrowserWindow, app } from 'electron';
import { workspaceIndexDatabase } from './WorkspaceIndexDatabase';

/**
 * 生成 UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface IndexingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
  status: 'idle' | 'scanning' | 'indexing' | 'completed' | 'error';
  errorMessage?: string;
}

interface ChunkData {
  parentContent: string;
  childContents: string[];
  metadata: Record<string, unknown>;
}

interface IndexResult {
  type: 'ready' | 'file-indexed' | 'file-skipped' | 'file-error' | 'scan-complete' | 'chunk-ready';
  filePath?: string;
  fileSize?: number;
  error?: string;
  files?: string[];
  chunks?: ChunkData[];
}

interface EmbeddingMessage {
  type: string;
  id?: number;
  success?: boolean;
  error?: string;
  vector?: number[];
}

export class WorkspaceVectorIndexService {
  private static instance: WorkspaceVectorIndexService;
  private indexingWorker: Worker | null = null;
  private embeddingChild: ChildProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private pendingFiles: string[] = [];
  private progress: IndexingProgress = {
    totalFiles: 0,
    processedFiles: 0,
    currentFile: null,
    status: 'idle',
  };

  // Embedding 请求管理
  private embeddingRequestId: number = 0;
  private embeddingCallbacks: Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }> = new Map();
  private embeddingInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): WorkspaceVectorIndexService {
    if (!WorkspaceVectorIndexService.instance) {
      WorkspaceVectorIndexService.instance = new WorkspaceVectorIndexService();
    }
    return WorkspaceVectorIndexService.instance;
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 创建 Embedding 子进程（使用 child_process.fork）
   */
  private async createEmbeddingChild(): Promise<void> {
    const appPath = app.getAppPath();
    const childPath = path.join(appPath, 'packages/main/src/workers/embeddingChild.js');

    console.log('[WorkspaceVectorIndexService] 创建 Embedding 子进程:', childPath);

    if (!fs.existsSync(childPath)) {
      throw new Error(`Embedding 子进程文件不存在: ${childPath}`);
    }

    // 使用 fork 创建子进程
    this.embeddingChild = fork(childPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        DISABLE_SHARP: '1', // 禁用 sharp
      },
    });

    // 转发子进程的 stdout/stderr
    this.embeddingChild.stdout?.on('data', (data) => {
      console.log('[EmbeddingChild]', data.toString().trim());
    });
    this.embeddingChild.stderr?.on('data', (data) => {
      console.error('[EmbeddingChild Error]', data.toString().trim());
    });

    // 监听子进程消息
    this.embeddingChild.on('message', (message: EmbeddingMessage) => {
      this.handleEmbeddingMessage(message);
    });

    this.embeddingChild.on('exit', (code) => {
      console.log('[WorkspaceVectorIndexService] Embedding 子进程退出，代码:', code);
      this.embeddingChild = null;
      this.embeddingInitialized = false;
    });

    this.embeddingChild.on('error', (error) => {
      console.error('[WorkspaceVectorIndexService] Embedding 子进程错误:', error);
    });

    // 等待子进程就绪
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('子进程启动超时')), 30000);

      const handler = (msg: EmbeddingMessage) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          this.embeddingChild?.removeListener('message', handler);
          resolve();
        }
      };

      this.embeddingChild!.on('message', handler);
    });

    // 初始化 Pipeline
    await this.initializeEmbeddingChild();
  }

  private async initializeEmbeddingChild(): Promise<void> {
    const appPath = app.getAppPath();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('初始化超时')), 120000);

      const handler = (msg: EmbeddingMessage) => {
        if (msg.type === 'initialized') {
          clearTimeout(timeout);
          this.embeddingChild?.removeListener('message', handler);
          if (msg.success) {
            this.embeddingInitialized = true;
            console.log('[WorkspaceVectorIndexService] ✓ Embedding 子进程初始化完成');
            resolve();
          } else {
            reject(new Error(msg.error || '初始化失败'));
          }
        }
      };

      this.embeddingChild!.on('message', handler);
      this.embeddingChild!.send({
        type: 'initialize',
        data: { appPath },
      });
    });
  }

  private handleEmbeddingMessage(message: EmbeddingMessage): void {
    if (message.type === 'embedding-result' && message.id !== undefined) {
      const callback = this.embeddingCallbacks.get(message.id);
      if (callback) {
        this.embeddingCallbacks.delete(message.id);
        if (message.success && message.vector) {
          callback.resolve(message.vector);
        } else {
          callback.reject(new Error(message.error || '向量生成失败'));
        }
      }
    }
  }

  /**
   * 生成向量（通过子进程，不阻塞主进程）
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingChild || !this.embeddingInitialized) {
      throw new Error('Embedding 子进程未初始化');
    }

    const id = ++this.embeddingRequestId;

    return new Promise((resolve, reject) => {
      this.embeddingCallbacks.set(id, { resolve, reject });
      this.embeddingChild!.send({
        type: 'generate',
        id,
        data: { text },
      });
    });
  }

  /**
   * 创建 Indexing Worker
   */
  private createIndexingWorker(): Worker {
    const workerPath = path.join(__dirname, '../workers/indexingWorker.js');

    console.log('[WorkspaceVectorIndexService] 创建 Indexing Worker:', workerPath);

    if (!fs.existsSync(workerPath)) {
      throw new Error(`Worker 文件不存在: ${workerPath}`);
    }

    const worker = new Worker(workerPath);

    worker.on('error', (error) => {
      console.error('[WorkspaceVectorIndexService] Worker 错误:', error);
      this.updateProgress({ status: 'error', errorMessage: error.message });
    });

    worker.on('exit', (code) => {
      console.log('[WorkspaceVectorIndexService] Worker 退出:', code);
      this.indexingWorker = null;
    });

    return worker;
  }

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.md': 'markdown', '.txt': 'plaintext', '.json': 'json',
      '.js': 'javascript', '.ts': 'typescript', '.py': 'python',
    };
    return map[ext] || 'plaintext';
  }

  /**
   * 开始索引
   */
  async startIndexing(workspacePath: string): Promise<void> {
    if (this.isRunning) {
      console.log('[WorkspaceVectorIndexService] 索引已在运行中');
      return;
    }

    console.log(`[WorkspaceVectorIndexService] ========== 开始索引 ==========`);
    console.log(`[WorkspaceVectorIndexService] 工作区: ${workspacePath}`);

    this.isRunning = true;
    this.shouldStop = false;
    this.pendingFiles = [];
    this.updateProgress({ status: 'scanning', totalFiles: 0, processedFiles: 0, currentFile: null });

    // 初始化数据库
    try {
      await workspaceIndexDatabase.initialize();
      console.log('[WorkspaceVectorIndexService] ✓ 数据库就绪');
    } catch (error) {
      this.handleError('数据库初始化失败', error);
      return;
    }

    // 创建 Embedding 子进程
    try {
      await this.createEmbeddingChild();
    } catch (error) {
      this.handleError('Embedding 子进程创建失败', error);
      return;
    }

    // 创建 Indexing Worker
    try {
      this.indexingWorker = this.createIndexingWorker();
    } catch (error) {
      this.handleError('Worker 创建失败', error);
      return;
    }

    this.indexingWorker.on('message', async (result: IndexResult) => {
      await this.handleWorkerMessage(result);
    });

    this.indexingWorker.postMessage({ type: 'scan-directory', dirPath: workspacePath });
  }

  private handleError(msg: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WorkspaceVectorIndexService] ${msg}:`, errorMsg);
    this.updateProgress({ status: 'error', errorMessage: `${msg}: ${errorMsg}` });
    this.isRunning = false;
    this.cleanup();
  }

  private async handleWorkerMessage(result: IndexResult): Promise<void> {
    if (this.shouldStop) return;

    switch (result.type) {
      case 'ready':
        console.log('[WorkspaceVectorIndexService] Worker 就绪');
        break;

      case 'scan-complete':
        console.log(`[WorkspaceVectorIndexService] 扫描完成: ${result.files?.length || 0} 个文件`);
        // 增量索引：过滤掉已索引且未修改的文件
        const allFiles = result.files || [];
        this.pendingFiles = await this.filterFilesForIndexing(allFiles);
        console.log(`[WorkspaceVectorIndexService] 需要索引: ${this.pendingFiles.length} 个文件（跳过 ${allFiles.length - this.pendingFiles.length} 个已索引文件）`);
        
        if (this.pendingFiles.length === 0) {
          console.log('[WorkspaceVectorIndexService] ✓ 所有文件已是最新，无需索引');
          this.updateProgress({ status: 'completed', totalFiles: 0, processedFiles: 0, currentFile: null });
          this.cleanup();
          return;
        }
        
        this.updateProgress({ status: 'indexing', totalFiles: this.pendingFiles.length, processedFiles: 0 });
        this.processNextFile();
        break;

      case 'chunk-ready':
        if (result.chunks?.length) {
          await this.processChunks(result.filePath!, result.chunks, result.fileSize || 0);
        }
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        this.processNextFile();
        break;

      case 'file-skipped':
      case 'file-error':
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        this.processNextFile();
        break;
    }
  }

  /**
   * 过滤需要索引的文件（增量索引）
   * 只返回新文件或已修改的文件
   */
  private async filterFilesForIndexing(allFiles: string[]): Promise<string[]> {
    const indexedFilesMap = workspaceIndexDatabase.getIndexedFilesMap();
    const filesToIndex: string[] = [];
    
    for (const filePath of allFiles) {
      const indexedAt = indexedFilesMap.get(filePath);
      
      if (indexedAt === undefined) {
        // 新文件，需要索引
        filesToIndex.push(filePath);
      } else {
        // 已索引，检查是否修改过
        try {
          const stats = fs.statSync(filePath);
          const mtime = stats.mtimeMs;
          
          if (mtime > indexedAt) {
            // 文件已修改，删除旧数据后重新索引
            console.log(`[WorkspaceVectorIndexService] 文件已修改，重新索引: ${path.basename(filePath)}`);
            await workspaceIndexDatabase.deleteFileData(filePath);
            filesToIndex.push(filePath);
          }
          // 否则跳过（文件未修改）
        } catch (e) {
          // 无法获取文件信息，跳过
        }
      }
    }
    
    return filesToIndex;
  }

  private processNextFile(): void {
    if (this.shouldStop || !this.pendingFiles.length) {
      if (!this.shouldStop) {
        this.updateProgress({ status: 'completed', currentFile: null });
        console.log('[WorkspaceVectorIndexService] ✓ 索引完成');
      }
      this.cleanup();
      return;
    }

    const filePath = this.pendingFiles.shift()!;
    this.updateProgress({ currentFile: filePath });
    this.indexingWorker?.postMessage({ type: 'index-file', filePath });
  }

  private async processChunks(filePath: string, chunks: ChunkData[], fileSize: number): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();

      const parentRecords: Array<{ parentId: string; filePath: string; content: string; chunkIndex: number; createdAt: number }> = [];
      const childRecords: Array<{ childId: string; parentId: string; content: string; vector: number[]; chunkIndex: number }> = [];

      for (let pIdx = 0; pIdx < chunks.length && !this.shouldStop; pIdx++) {
        const chunk = chunks[pIdx];
        const parentId = generateUUID();

        parentRecords.push({ parentId, filePath, content: chunk.parentContent, chunkIndex: pIdx, createdAt: Date.now() });

        for (let cIdx = 0; cIdx < chunk.childContents.length && !this.shouldStop; cIdx++) {
          try {
            const vector = await this.generateEmbedding(chunk.childContents[cIdx]);
            childRecords.push({ childId: generateUUID(), parentId, content: chunk.childContents[cIdx], vector, chunkIndex: cIdx });
          } catch (e) {
            console.warn('[WorkspaceVectorIndexService] 向量生成失败');
          }
        }
      }

      if (parentRecords.length) workspaceIndexDatabase.addParentsBatch(parentRecords);
      if (childRecords.length) await workspaceIndexDatabase.addChildren(childRecords);

      workspaceIndexDatabase.addFileIndex({
        filePath, fileName, fileExtension: fileExt, fileSize,
        language: this.getLanguage(fileExt), indexedAt: Date.now(),
      });

      console.log(`[WorkspaceVectorIndexService] ✓ ${fileName}: ${childRecords.length} 向量`);
    } catch (error) {
      console.error(`[WorkspaceVectorIndexService] 处理失败: ${filePath}`);
    }
  }

  private cleanup(): void {
    this.isRunning = false;
    this.indexingWorker?.terminate();
    this.indexingWorker = null;

    if (this.embeddingChild) {
      this.embeddingChild.send({ type: 'shutdown' });
      this.embeddingChild.kill();
      this.embeddingChild = null;
      this.embeddingInitialized = false;
    }

    this.embeddingCallbacks.clear();
  }

  stop(): void {
    this.shouldStop = true;
    this.cleanup();
    this.updateProgress({ status: 'idle', currentFile: null });
    console.log('[WorkspaceVectorIndexService] 已停止');
  }

  getProgress(): IndexingProgress {
    return { ...this.progress };
  }

  /**
   * 删除文件的索引数据（当文件被删除时调用）
   */
  async deleteFileIndex(filePath: string): Promise<void> {
    try {
      await workspaceIndexDatabase.initialize();
      await workspaceIndexDatabase.deleteFileData(filePath);
      console.log(`[WorkspaceVectorIndexService] ✓ 已删除文件索引: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`[WorkspaceVectorIndexService] 删除文件索引失败: ${filePath}`, error);
    }
  }

  /**
   * 索引单个文件（右键菜单"立即索引"）
   */
  async indexSingleFile(filePath: string): Promise<void> {
    if (this.isRunning) {
      console.log('[WorkspaceVectorIndexService] 索引已在运行中，请稍后再试');
      return;
    }

    console.log(`[WorkspaceVectorIndexService] ========== 索引单个文件 ==========`);
    console.log(`[WorkspaceVectorIndexService] 文件: ${filePath}`);

    this.isRunning = true;
    this.shouldStop = false;
    this.updateProgress({ status: 'indexing', totalFiles: 1, processedFiles: 0, currentFile: filePath });

    try {
      // 初始化数据库
      await workspaceIndexDatabase.initialize();

      // 删除旧的索引数据（如果存在）
      await workspaceIndexDatabase.deleteFileData(filePath);

      // 创建 Embedding 子进程
      await this.createEmbeddingChild();

      // 创建 Worker 处理单个文件
      this.indexingWorker = this.createIndexingWorker();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('索引超时'));
        }, 120000);

        this.indexingWorker!.on('message', async (result: IndexResult) => {
          if (result.type === 'ready') {
            // Worker 就绪，发送索引请求
            this.indexingWorker!.postMessage({ type: 'index-file', filePath });
          } else if (result.type === 'chunk-ready' && result.chunks?.length) {
            // 处理 chunks
            await this.processChunks(result.filePath!, result.chunks, result.fileSize || 0);
            clearTimeout(timeout);
            resolve();
          } else if (result.type === 'file-skipped' || result.type === 'file-error') {
            clearTimeout(timeout);
            if (result.type === 'file-error') {
              console.warn(`[WorkspaceVectorIndexService] 文件处理失败: ${result.error}`);
            }
            resolve();
          }
        });
      });

      this.updateProgress({ status: 'completed', processedFiles: 1, currentFile: null });
      console.log(`[WorkspaceVectorIndexService] ✓ 单文件索引完成: ${path.basename(filePath)}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 单文件索引失败:`, errorMsg);
      this.updateProgress({ status: 'error', errorMessage: errorMsg });
    } finally {
      this.cleanup();
    }
  }

  /**
   * 删除目录下所有文件的索引数据（当目录被删除时调用）
   */
  async deleteDirectoryIndex(dirPath: string): Promise<void> {
    try {
      await workspaceIndexDatabase.initialize();
      const indexedFiles = workspaceIndexDatabase.getAllIndexedFiles();
      
      // 找出该目录下的所有已索引文件
      const filesToDelete = indexedFiles.filter(file => 
        file.filePath.startsWith(dirPath + path.sep) || file.filePath === dirPath
      );
      
      for (const file of filesToDelete) {
        await workspaceIndexDatabase.deleteFileData(file.filePath);
      }
      
      console.log(`[WorkspaceVectorIndexService] ✓ 已删除目录索引: ${path.basename(dirPath)} (${filesToDelete.length} 个文件)`);
    } catch (error) {
      console.error(`[WorkspaceVectorIndexService] 删除目录索引失败: ${dirPath}`, error);
    }
  }

  private updateProgress(update: Partial<IndexingProgress>): void {
    this.progress = { ...this.progress, ...update };
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workspace-vector-index:progress', this.progress);
    }
  }
}

export const workspaceVectorIndexService = WorkspaceVectorIndexService.getInstance();
