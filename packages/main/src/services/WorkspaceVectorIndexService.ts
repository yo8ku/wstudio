/**
 * 工作区向量索引服务（主进程）
 * 使用 Worker Thread 进行文件扫描和切分
 * 使用 child_process.fork() 子进程进行 Embedding（完全不阻塞主进程）
 */

import { Worker } from 'worker_threads';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { BrowserWindow, app } from 'electron';
import { workspaceIndexDatabase } from './WorkspaceIndexDatabase';

/**
 * 计算文件内容的 MD5 hash
 */
function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

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
  /** 本次需要索引的文件数 */
  totalFiles: number;
  /** 本次已处理的文件数 */
  processedFiles: number;
  /** 当前正在处理的文件 */
  currentFile: string | null;
  /** 索引状态 */
  status: 'idle' | 'scanning' | 'indexing' | 'completed' | 'error';
  /** 错误信息 */
  errorMessage?: string;
  /** 工作区总文件数（用于显示整体进度） */
  workspaceTotalFiles?: number;
  /** 已索引完成的文件总数（用于显示整体进度） */
  indexedTotalFiles?: number;
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
  // 批量向量化结果
  vectors?: Array<{
    index: number;
    vector: number[] | null;
    success: boolean;
    error?: string;
  }>;
  totalCount?: number;
  successCount?: number;
}

/** 批量向量化回调类型 */
interface BatchEmbeddingCallback {
  resolve: (vectors: Array<{ index: number; vector: number[] | null; success: boolean; error?: string }>) => void;
  reject: (e: Error) => void;
}

export class WorkspaceVectorIndexService {
  private static instance: WorkspaceVectorIndexService;
  private indexingWorker: Worker | null = null;
  private embeddingChild: ChildProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private pendingFiles: string[] = [];
  private workspaceTotalFiles: number = 0; // 工作区总文件数
  private progress: IndexingProgress = {
    totalFiles: 0,
    processedFiles: 0,
    currentFile: null,
    status: 'idle',
  };

  // Embedding 请求管理
  private embeddingRequestId: number = 0;
  private embeddingCallbacks: Map<number, { resolve: (v: number[]) => void; reject: (e: Error) => void }> = new Map();
  private batchEmbeddingCallbacks: Map<number, BatchEmbeddingCallback> = new Map();
  private embeddingInitialized: boolean = false;

  // 优先索引相关
  private isPaused: boolean = false;
  private priorityIndexingInProgress: boolean = false;

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
    // 处理单个向量结果
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
    // 处理批量向量结果
    if (message.type === 'embedding-batch-result' && message.id !== undefined) {
      const callback = this.batchEmbeddingCallbacks.get(message.id);
      if (callback) {
        this.batchEmbeddingCallbacks.delete(message.id);
        if (message.success && message.vectors) {
          callback.resolve(message.vectors);
        } else {
          callback.reject(new Error(message.error || '批量向量生成失败'));
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
   * 批量生成向量（通过子进程，一次请求处理多个文本）
   * @param texts 文本数组
   * @returns 向量结果数组，每个元素包含 index、vector、success 等信息
   */
  private async generateEmbeddingBatch(texts: string[]): Promise<Array<{ index: number; vector: number[] | null; success: boolean; error?: string }>> {
    if (!this.embeddingChild || !this.embeddingInitialized) {
      throw new Error('Embedding 子进程未初始化');
    }

    if (texts.length === 0) {
      return [];
    }

    const id = ++this.embeddingRequestId;

    return new Promise((resolve, reject) => {
      this.batchEmbeddingCallbacks.set(id, { resolve, reject });
      this.embeddingChild!.send({
        type: 'generate-batch',
        id,
        data: { texts },
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
        // 保存工作区总文件数
        const allFiles = result.files || [];
        this.workspaceTotalFiles = allFiles.length;
        
        // 增量索引：过滤掉已索引且未修改的文件
        this.pendingFiles = await this.filterFilesForIndexing(allFiles);
        console.log(`[WorkspaceVectorIndexService] 需要索引: ${this.pendingFiles.length} 个文件（跳过 ${allFiles.length - this.pendingFiles.length} 个已索引文件）`);
        
        // 获取当前已索引文件数
        const currentIndexedCount = workspaceIndexDatabase.getStats().totalFiles;
        
        if (this.pendingFiles.length === 0) {
          console.log('[WorkspaceVectorIndexService] ✓ 所有文件已是最新，无需索引');
          this.updateProgress({ 
            status: 'completed', 
            totalFiles: 0, 
            processedFiles: 0, 
            currentFile: null,
            workspaceTotalFiles: this.workspaceTotalFiles,
            indexedTotalFiles: currentIndexedCount,
          });
          this.cleanup();
          return;
        }
        
        this.updateProgress({ 
          status: 'indexing', 
          totalFiles: this.pendingFiles.length, 
          processedFiles: 0,
          workspaceTotalFiles: this.workspaceTotalFiles,
          indexedTotalFiles: currentIndexedCount,
        });
        this.processNextFile();
        break;

      case 'chunk-ready':
        if (result.chunks?.length) {
          await this.processChunks(result.filePath!, result.chunks, result.fileSize || 0);
        }
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        // 如果暂停中，不继续处理下一个文件（等待恢复时再处理）
        if (!this.isPaused) {
          this.processNextFile();
        } else {
          console.log('[WorkspaceVectorIndexService] 批量索引已暂停，等待恢复后继续处理');
        }
        break;

      case 'file-skipped':
      case 'file-error':
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        // 如果暂停中，不继续处理下一个文件（等待恢复时再处理）
        if (!this.isPaused) {
          this.processNextFile();
        } else {
          console.log('[WorkspaceVectorIndexService] 批量索引已暂停，等待恢复后继续处理');
        }
        break;
    }
  }

  /**
   * 过滤需要索引的文件（增量索引）
   * 优先使用 hash 判断，旧数据回退到 mtime 判断
   */
  // 最小文件大小（字节），与 indexingWorker 保持一致
  private static readonly MIN_FILE_SIZE = 2 * 1024; // 2KB

  private async filterFilesForIndexing(allFiles: string[]): Promise<string[]> {
    const indexedFilesHashMap = workspaceIndexDatabase.getIndexedFilesHashMap();
    const indexedFilesTimeMap = workspaceIndexDatabase.getIndexedFilesMap();
    const filesToIndex: string[] = [];
    
    console.log(`[WorkspaceVectorIndexService] 扫描到文件数: ${allFiles.length}`);
    console.log(`[WorkspaceVectorIndexService] 已索引文件数(hash): ${indexedFilesHashMap.size}, (time): ${indexedFilesTimeMap.size}`);
    
    // 调试：输出前5个已索引文件路径
    if (indexedFilesTimeMap.size > 0) {
      const samplePaths = Array.from(indexedFilesTimeMap.keys()).slice(0, 3);
      console.log(`[WorkspaceVectorIndexService] 已索引文件示例: ${samplePaths.join(', ')}`);
    }
    // 调试：输出前3个扫描到的文件路径
    if (allFiles.length > 0) {
      const sampleScanned = allFiles.slice(0, 3).map(p => p.replace(/\\/g, '/'));
      console.log(`[WorkspaceVectorIndexService] 扫描文件示例: ${sampleScanned.join(', ')}`);
    }
    
    for (const filePath of allFiles) {
      // 检查文件大小，小于 2KB 的文件跳过
      try {
        const stats = fs.statSync(filePath);
        if (stats.size < WorkspaceVectorIndexService.MIN_FILE_SIZE) {
          continue; // 跳过小文件
        }
      } catch {
        continue; // 无法读取文件信息，跳过
      }

      // 规范化路径（统一使用正斜杠），与数据库存储格式一致
      const normalizedPath = filePath.replace(/\\/g, '/');
      const storedHash = indexedFilesHashMap.get(normalizedPath);
      const indexedAt = indexedFilesTimeMap.get(normalizedPath);
      
      // 文件从未被索引过
      if (indexedAt === undefined) {
        console.log(`[WorkspaceVectorIndexService] 文件从未索引，需要索引: ${path.basename(filePath)}`);
        filesToIndex.push(filePath);
        continue;
      }
      
      // 有 hash 记录，使用 hash 判断
      if (storedHash !== undefined) {
        try {
          const currentHash = calculateFileHash(filePath);
          if (currentHash !== storedHash) {
            console.log(`[WorkspaceVectorIndexService] 文件内容已变化(hash)，重新索引: ${path.basename(filePath)}`);
            console.log(`[WorkspaceVectorIndexService]   存储hash: ${storedHash}`);
            console.log(`[WorkspaceVectorIndexService]   当前hash: ${currentHash}`);
            await workspaceIndexDatabase.deleteFileData(normalizedPath);
            filesToIndex.push(filePath);
          } else {
            console.log(`[WorkspaceVectorIndexService] 文件hash相同，跳过: ${path.basename(filePath)}`);
          }
        } catch (e) {
          console.warn(`[WorkspaceVectorIndexService] 无法读取文件: ${filePath}`);
        }
      } else {
        // 旧数据没有 hash，回退到 mtime 判断
        // 注意：mtime 判断不可靠，因为文件系统可能更新 mtime
        // 为旧数据补充 hash，下次就能用 hash 判断了
        try {
          const currentHash = calculateFileHash(filePath);
          // 更新旧记录，添加 hash（不重新索引，只补充 hash）
          const fileRecord = workspaceIndexDatabase.getFileIndex(normalizedPath);
          if (fileRecord) {
            workspaceIndexDatabase.addFileIndex({
              ...fileRecord,
              contentHash: currentHash,
            });
            console.log(`[WorkspaceVectorIndexService] 为旧数据补充 hash: ${path.basename(filePath)}`);
          }
          // 跳过，不重新索引
        } catch (e) {
          console.warn(`[WorkspaceVectorIndexService] 无法获取文件信息: ${filePath}`);
        }
      }
    }
    
    return filesToIndex;
  }

  private processNextFile(): void {
    // 检查是否暂停
    if (this.isPaused) {
      console.log('[WorkspaceVectorIndexService] 批量索引已暂停，等待恢复...');
      return;
    }

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
      const childRecords: Array<{ childId: string; parentId: string; content: string; vector: number[]; chunkIndex: number; tags: string; source: string }> = [];

      console.log(`[WorkspaceVectorIndexService] 处理文件: ${fileName}, 父块数量: ${chunks.length}`);
      
      // 收集所有子块文本和元信息，用于批量向量化
      const allChildTexts: string[] = [];
      const childMetaList: Array<{ parentId: string; chunkIndex: number; content: string }> = [];

      for (let pIdx = 0; pIdx < chunks.length && !this.shouldStop; pIdx++) {
        const chunk = chunks[pIdx];
        const parentId = generateUUID();

        console.log(`[WorkspaceVectorIndexService] 父块${pIdx}: 内容长度=${chunk.parentContent.length}, 子块数量=${chunk.childContents.length}`);

        parentRecords.push({ parentId, filePath, content: chunk.parentContent, chunkIndex: pIdx, createdAt: Date.now() });

        // 收集子块
        for (let cIdx = 0; cIdx < chunk.childContents.length; cIdx++) {
          allChildTexts.push(chunk.childContents[cIdx]);
          childMetaList.push({
            parentId,
            chunkIndex: cIdx,
            content: chunk.childContents[cIdx],
          });
        }
      }

      // 批量生成向量
      if (allChildTexts.length > 0 && !this.shouldStop) {
        console.log(`[WorkspaceVectorIndexService] 批量生成向量: ${allChildTexts.length} 个子块`);
        
        try {
          const batchResults = await this.generateEmbeddingBatch(allChildTexts);
          console.log(`[WorkspaceVectorIndexService] 批量向量生成完成: 成功 ${batchResults.filter(r => r.success).length}/${batchResults.length}`);

          // 处理批量结果
          for (const result of batchResults) {
            if (result.success && result.vector && result.vector.length > 0) {
              const meta = childMetaList[result.index];
              childRecords.push({
                childId: generateUUID(),
                parentId: meta.parentId,
                content: meta.content,
                vector: result.vector,
                chunkIndex: meta.chunkIndex,
                tags: '[]',
                source: fileName,
              });
            } else if (!result.success) {
              console.warn(`[WorkspaceVectorIndexService] 子块${result.index}向量生成失败: ${result.error || '未知错误'}`);
            }
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[WorkspaceVectorIndexService] 批量向量生成失败: ${errorMsg}`);
        }
      }

      console.log(`[WorkspaceVectorIndexService] 准备入库: 父块=${parentRecords.length}, 子块=${childRecords.length}`);
      
      if (parentRecords.length) {
        workspaceIndexDatabase.addParentsBatch(parentRecords);
        console.log(`[WorkspaceVectorIndexService] 父块入库完成`);
      }
      
      if (childRecords.length) {
        try {
          await workspaceIndexDatabase.addChildren(childRecords);
          console.log(`[WorkspaceVectorIndexService] 子块入库完成`);
        } catch (dbError) {
          const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
          console.error(`[WorkspaceVectorIndexService] 子块入库失败: ${dbErrorMsg}`);
        }
      }

      // 计算文件内容 hash 用于增量索引
      let contentHash: string | undefined;
      try {
        contentHash = calculateFileHash(filePath);
      } catch {
        // 无法计算 hash，忽略
      }

      workspaceIndexDatabase.addFileIndex({
        filePath, fileName, fileExtension: fileExt, fileSize,
        language: this.getLanguage(fileExt), indexedAt: Date.now(),
        contentHash,
      });

      console.log(`[WorkspaceVectorIndexService] ✓ ${fileName}: ${childRecords.length} 向量`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 处理失败: ${filePath}, 错误: ${errorMsg}`);
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
    this.batchEmbeddingCallbacks.clear();
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
   * 检查文件是否已被索引
   */
  isFileIndexed(filePath: string): boolean {
    return workspaceIndexDatabase.isFileIndexed(filePath);
  }

  /**
   * 暂停批量索引任务
   */
  pauseBatchIndexing(): void {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      console.log('[WorkspaceVectorIndexService] 批量索引已暂停');
    }
  }

  /**
   * 恢复批量索引任务
   */
  resumeBatchIndexing(): void {
    if (this.isPaused) {
      this.isPaused = false;
      console.log('[WorkspaceVectorIndexService] 批量索引已恢复');
      // 如果有待处理的文件，继续处理
      if (this.pendingFiles.length > 0 && !this.priorityIndexingInProgress) {
        this.processNextFile();
      }
    }
  }

  /**
   * 优先索引文件（用于 @文件 场景）
   * 会暂停批量索引，优先处理指定文件，完成后恢复批量索引
   * @param filePath 文件路径
   * @param onProgress 进度回调
   * @returns 索引是否成功
   */
  async priorityIndexFile(
    filePath: string, 
    onProgress?: (stage: string) => void
  ): Promise<boolean> {
    console.log(`[WorkspaceVectorIndexService] ========== 优先索引文件 ==========`);
    console.log(`[WorkspaceVectorIndexService] 文件: ${filePath}`);

    // 检查文件是否已索引
    const isIndexed = workspaceIndexDatabase.isFileIndexed(filePath);
    if (isIndexed) {
      console.log(`[WorkspaceVectorIndexService] 文件已索引，跳过: ${filePath}`);
      return true;
    }

    // 检查文件大小
    try {
      const stats = fs.statSync(filePath);
      if (stats.size < 2 * 1024) {
        console.log(`[WorkspaceVectorIndexService] 文件小于2KB，跳过索引: ${filePath}`);
        return false; // 小文件不需要索引
      }
    } catch (e) {
      console.error(`[WorkspaceVectorIndexService] 无法获取文件信息: ${filePath}`, e);
      return false;
    }

    // 暂停批量索引
    const wasBatchRunning = this.isRunning && !this.isPaused;
    if (wasBatchRunning) {
      this.pauseBatchIndexing();
    }

    this.priorityIndexingInProgress = true;
    onProgress?.('正在优先解析文档结构...');

    try {
      // 初始化数据库
      await workspaceIndexDatabase.initialize();

      // 删除旧的索引数据（如果存在）
      await workspaceIndexDatabase.deleteFileData(filePath);

      // 确保 Embedding 子进程存在
      if (!this.embeddingChild || !this.embeddingInitialized) {
        onProgress?.('正在初始化向量引擎...');
        await this.createEmbeddingChild();
      }

      // 创建临时 Worker 处理单个文件
      const tempWorker = this.createIndexingWorker();

      onProgress?.('正在切分文档...');

      const result = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[WorkspaceVectorIndexService] 优先索引超时');
          resolve(false);
        }, 60000); // 60秒超时

        tempWorker.on('message', async (msg: IndexResult) => {
          if (msg.type === 'ready') {
            tempWorker.postMessage({ type: 'index-file', filePath });
          } else if (msg.type === 'chunk-ready' && msg.chunks?.length) {
            onProgress?.('正在生成向量...');
            try {
              await this.processChunks(msg.filePath!, msg.chunks, msg.fileSize || 0);
              clearTimeout(timeout);
              resolve(true);
            } catch (e) {
              console.error('[WorkspaceVectorIndexService] 处理 chunks 失败:', e);
              clearTimeout(timeout);
              resolve(false);
            }
          } else if (msg.type === 'file-skipped' || msg.type === 'file-error') {
            clearTimeout(timeout);
            resolve(false);
          }
        });

        tempWorker.on('error', (err) => {
          console.error('[WorkspaceVectorIndexService] Worker 错误:', err);
          clearTimeout(timeout);
          resolve(false);
        });
      });

      // 清理临时 Worker
      tempWorker.terminate();

      if (result) {
        console.log(`[WorkspaceVectorIndexService] ✓ 优先索引完成: ${path.basename(filePath)}`);
      }

      return result;
    } catch (error) {
      console.error(`[WorkspaceVectorIndexService] 优先索引失败:`, error);
      return false;
    } finally {
      this.priorityIndexingInProgress = false;
      
      // 恢复批量索引
      if (wasBatchRunning) {
        this.resumeBatchIndexing();
      }
    }
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
    // 合并更新
    this.progress = { ...this.progress, ...update };
    
    // 每次更新时重新获取已索引总数（确保实时准确）
    const stats = workspaceIndexDatabase.getStats();
    this.progress.indexedTotalFiles = stats.totalFiles;
    this.progress.workspaceTotalFiles = this.workspaceTotalFiles || stats.totalFiles;
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workspace-vector-index:progress', this.progress);
    }
  }
}

export const workspaceVectorIndexService = WorkspaceVectorIndexService.getInstance();
