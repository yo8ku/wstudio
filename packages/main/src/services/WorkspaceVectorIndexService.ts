/**
 * 工作区向量索引服务（主进程）
 * 功能：管理工作区文件的向量索引
 * 描述：
 * 两阶段架构：
 * 阶段 1（快速索引）：文件扫描 + 切分 + 存储切分结果，UI 显示进度，几分钟完成
 * 阶段 2（后台向量化）：读取切分结果 + 云端 API 向量化 + 入库，静默运行
 * 
 * 技术实现：
 * 1. 使用 Electron utilityProcess 进行文件扫描和切分（不占用主进程 CPU）
 * 2. 使用 CloudEmbeddingService 调用云端 API 进行 Embedding（零 CPU 占用）
 * 3. 使用 os.setPriority() 降低子进程优先级
 * 4. 分批处理和入库，控制内存占用
 */

import { utilityProcess, UtilityProcess } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import { BrowserWindow, app } from 'electron';
import { workspaceIndexDatabase } from './WorkspaceIndexDatabase';
import { cloudEmbeddingService, EmbeddingResult } from './CloudEmbeddingService';
import { getElectronStore } from './ElectronStoreService';

/**
 * 异步计算文件内容的 MD5 hash（不阻塞主进程）
 */
async function calculateFileHashAsync(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
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
  /** 向量化进度 */
  vectorization?: {
    status: 'idle' | 'running' | 'completed';
    totalFiles: number;
    processedFiles: number;
    currentFile: string | null;
  };
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

/** 批量向量化结果类型 */
interface BatchEmbeddingResult {
  index: number;
  vector: number[] | null;
  success: boolean;
  error?: string;
}

export class WorkspaceVectorIndexService {
  private static instance: WorkspaceVectorIndexService;
  private indexingChild: UtilityProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private pendingFiles: string[] = [];
  private workspaceTotalFiles: number = 0;
  private progress: IndexingProgress = {
    totalFiles: 0,
    processedFiles: 0,
    currentFile: null,
    status: 'idle',
  };

  // 优先索引相关
  private isPaused: boolean = false;
  private priorityIndexingInProgress: boolean = false;
  
  // 优先级队列配置
  private static readonly SMALL_FILE_THRESHOLD = 50 * 1024; // 50KB 以下为小文件
  private static readonly LARGE_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB 以上为大文件
  private currentOpenFolder: string | null = null; // 当前打开的文件夹路径
  
  // 批量入库缓冲区
  private parentBuffer: Array<{ parentId: string; filePath: string; content: string; chunkIndex: number; createdAt: number }> = [];
  private childBuffer: Array<{ childId: string; parentId: string; content: string; vector: number[]; chunkIndex: number; tags: string; source: string }> = [];
  private static readonly BUFFER_FLUSH_SIZE = 50; // 每 50 条记录批量入库

  // ========== 两阶段架构相关 ==========
  // 阶段 1：快速索引（UI 显示进度）
  // 阶段 2：后台向量化（显示进度）
  private isVectorizingInBackground: boolean = false;
  private pendingVectorizationFiles: string[] = []; // 待向量化的文件队列
  private vectorizationShouldStop: boolean = false;
  private vectorizationTotalFiles: number = 0; // 向量化总文件数
  private vectorizationProcessedFiles: number = 0; // 已向量化文件数
  private vectorizationCurrentFile: string | null = null; // 当前向量化文件
  
  // 后台向量化配置（自适应速度控制）
  private static readonly BG_BATCH_SIZE = 50; // 每批处理 50 个文本
  
  // 自适应延迟配置（初始最快，遇到限流自动降速）
  private currentBatchDelay: number = 0; // 当前批次间延迟（初始 0ms，最快速度）
  private currentFileDelay: number = 0; // 当前文件间延迟（初始 0ms）
  private consecutiveErrors: number = 0; // 连续错误计数
  private static readonly MAX_BATCH_DELAY = 200; // 最大批次延迟 200ms
  private static readonly MAX_FILE_DELAY = 100; // 最大文件延迟 100ms
  private static readonly DELAY_INCREMENT = 20; // 每次限流增加的延迟 20ms
  private static readonly SUCCESS_THRESHOLD = 10; // 连续成功 10 次后尝试降速

  private constructor() {}

  public static getInstance(): WorkspaceVectorIndexService {
    if (!WorkspaceVectorIndexService.instance) {
      WorkspaceVectorIndexService.instance = new WorkspaceVectorIndexService();
    }
    return WorkspaceVectorIndexService.instance;
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
    console.log(`[WorkspaceVectorIndexService] setMainWindow 被调用, window=${window ? '有效' : 'null'}`);
  }

  /**
   * 初始化 Embedding 服务（检查云端 API 配置并验证连接）
   */
  private async initializeEmbedding(): Promise<void> {
    // 验证当前配置是否有效
    const validation = await cloudEmbeddingService.validateCurrentConfig();
    if (!validation.success) {
      throw new Error(validation.message);
    }
    
    const model = cloudEmbeddingService.getCurrentModel();
    console.log(`[WorkspaceVectorIndexService] 使用云端 Embedding: ${model?.displayName}`);
  }

  // 限流重试配置
  private static readonly MAX_RETRY_COUNT = 5; // 最大重试次数
  private static readonly RATE_LIMIT_BASE_DELAY = 3000; // 限流基础等待时间 3 秒
  private static readonly RATE_LIMIT_MAX_DELAY = 30000; // 限流最大等待时间 30 秒

  /**
   * 批量生成向量（通过云端 API，带自适应速度控制和限流重试）
   * @param texts 文本数组
   * @returns 向量结果数组，如果全部失败则抛出错误
   */
  private async generateEmbeddingBatch(texts: string[]): Promise<BatchEmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    let retryCount = 0;
    
    while (retryCount <= WorkspaceVectorIndexService.MAX_RETRY_COUNT) {
      const result: EmbeddingResult = await cloudEmbeddingService.generateBatchEmbeddings(texts);
      
      if (result.success && result.vectors) {
        // 成功：尝试降低延迟
        this.consecutiveErrors = 0;
        if (this.currentBatchDelay > 0 || this.currentFileDelay > 0) {
          // 每次成功后逐步降低延迟
          this.currentBatchDelay = Math.max(0, this.currentBatchDelay - 5);
          this.currentFileDelay = Math.max(0, this.currentFileDelay - 2);
        }
        
        // 转换为统一格式
        return result.vectors.map((vector: number[], index: number) => ({
          index,
          vector: vector || null,
          success: vector && vector.length > 0,
        }));
      }
      
      // 检测是否为限流错误
      const errorMsg = result.error || '云端向量化失败';
      const isRateLimitError = errorMsg.includes('429') || 
                               errorMsg.includes('rate') || 
                               errorMsg.includes('limit') ||
                               errorMsg.includes('too many');
      
      if (isRateLimitError && retryCount < WorkspaceVectorIndexService.MAX_RETRY_COUNT) {
        // 限流错误：增加延迟并重试
        this.consecutiveErrors++;
        this.currentBatchDelay = Math.min(
          this.currentBatchDelay + WorkspaceVectorIndexService.DELAY_INCREMENT,
          WorkspaceVectorIndexService.MAX_BATCH_DELAY
        );
        this.currentFileDelay = Math.min(
          this.currentFileDelay + WorkspaceVectorIndexService.DELAY_INCREMENT,
          WorkspaceVectorIndexService.MAX_FILE_DELAY
        );
        
        // 计算等待时间（指数退避）
        const waitTime = Math.min(
          WorkspaceVectorIndexService.RATE_LIMIT_BASE_DELAY * Math.pow(2, retryCount),
          WorkspaceVectorIndexService.RATE_LIMIT_MAX_DELAY
        );
        
        console.log(`[WorkspaceVectorIndexService] 检测到限流，等待 ${waitTime / 1000} 秒后重试 (${retryCount + 1}/${WorkspaceVectorIndexService.MAX_RETRY_COUNT})`);
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }
      
      // 非限流错误或重试次数用尽，抛出错误
      console.error(`[WorkspaceVectorIndexService] 云端向量化失败: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // 不应该到达这里，但为了类型安全
    throw new Error('向量化重试次数用尽');
  }
  
  /**
   * 获取当前自适应批次延迟
   */
  private getAdaptiveBatchDelay(): number {
    return this.currentBatchDelay;
  }
  
  /**
   * 获取当前自适应文件延迟
   */
  private getAdaptiveFileDelay(): number {
    return this.currentFileDelay;
  }

  /**
   * 创建 Indexing 子进程（使用 utilityProcess，不占用主进程 CPU）
   */
  private async createIndexingChild(): Promise<UtilityProcess> {
    const appPath = app.getAppPath();
    const childPath = path.join(appPath, 'packages/main/src/workers/indexingChild.js');

    if (!fs.existsSync(childPath)) {
      throw new Error(`索引子进程文件不存在: ${childPath}`);
    }

    const child = utilityProcess.fork(childPath, [], {
      stdio: 'pipe',
    });

    // 转发子进程的 stdout/stderr
    child.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log('[IndexingChild]', msg);
    });

    child.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error('[IndexingChild Error]', msg);
    });

    // 等待子进程启动并降低优先级
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('索引子进程启动超时')), 30000);
      
      child.on('spawn', () => {
        // 降低子进程优先级到最低（PRIORITY_IDLE = 19）
        try {
          if (child.pid) {
            os.setPriority(child.pid, 19);
          }
        } catch {
          // 忽略优先级设置失败
        }
      });

      const handler = (msg: { type: string }) => {
        if (msg.type === 'started') {
          clearTimeout(timeout);
          child.removeListener('message', handler);
          resolve();
        }
      };
      
      child.on('message', handler);
      child.on('exit', (code) => {
        if (!this.isRunning) {
          clearTimeout(timeout);
          reject(new Error(`子进程退出: ${code}`));
        }
      });
    });

    // 初始化子进程
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('索引子进程初始化超时')), 60000);
      
      const handler = (msg: { type: string }) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          child.removeListener('message', handler);
          resolve();
        }
      };
      
      child.on('message', handler);
      child.postMessage({ type: 'initialize', data: { appPath } });
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.log('[WorkspaceVectorIndexService] 索引子进程退出:', code);
      }
      this.indexingChild = null;
    });

    return child;
  }

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.md': 'markdown', '.txt': 'plaintext', '.json': 'json',
      '.js': 'javascript', '.ts': 'typescript', '.py': 'python',
    };
    return map[ext] || 'plaintext';
  }

  // 强制重新索引标志
  private forceReindex: boolean = false;

  /**
   * 开始索引
   * @param workspacePath 工作区路径
   * @param forceReindex 是否强制重新索引（忽略已索引的文件）
   */
  async startIndexing(workspacePath: string, forceReindex: boolean = false): Promise<void> {
    if (this.isRunning) {
      console.log('[WorkspaceVectorIndexService] 索引已在运行中');
      return;
    }

    this.forceReindex = forceReindex;
    console.log(`[WorkspaceVectorIndexService] ========== 开始索引 ==========`);
    console.log(`[WorkspaceVectorIndexService] 工作区: ${workspacePath}`);
    console.log(`[WorkspaceVectorIndexService] 强制重新索引: ${forceReindex}`);

    // 如果强制重新索引，先清空数据库
    if (forceReindex) {
      console.log('[WorkspaceVectorIndexService] 清空现有索引数据...');
      try {
        await workspaceIndexDatabase.initialize();
        await workspaceIndexDatabase.clearAll();
        console.log('[WorkspaceVectorIndexService] ✓ 已清空索引数据');
      } catch (error) {
        console.error('[WorkspaceVectorIndexService] 清空索引数据失败:', error);
      }
    }

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
      throw error;
    }

    // 初始化 Embedding 服务（验证配置并测试连接）
    try {
      await this.initializeEmbedding();
    } catch (error) {
      this.handleError('Embedding 配置验证失败', error);
      throw error;
    }

    // 创建 Indexing 子进程（不占用主进程 CPU）
    try {
      this.indexingChild = await this.createIndexingChild();
    } catch (error) {
      this.handleError('索引子进程创建失败', error);
      throw error;
    }

    this.indexingChild.on('message', async (result: IndexResult) => {
      await this.handleChildMessage(result);
    });

    this.indexingChild.postMessage({ type: 'scan-directory', data: { dirPath: workspacePath } });
  }

  private handleError(msg: string, error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WorkspaceVectorIndexService] ${msg}:`, errorMsg);
    this.updateProgress({ status: 'error', errorMessage: `${msg}: ${errorMsg}` });
    this.isRunning = false;
    this.cleanup();
  }

  private async handleChildMessage(result: IndexResult): Promise<void> {
    if (this.shouldStop) return;

    switch (result.type) {
      case 'ready':
        // Worker 就绪
        break;

      case 'scan-complete':
        console.log(`[WorkspaceVectorIndexService] 扫描完成: ${result.files?.length || 0} 个文件`);
        // 保存工作区总文件数
        const allFiles = result.files || [];
        this.workspaceTotalFiles = allFiles.length;
        
        // 强制重新索引时，索引所有文件；否则增量索引
        if (this.forceReindex) {
          this.pendingFiles = allFiles;
          console.log(`[WorkspaceVectorIndexService] 强制重新索引: ${this.pendingFiles.length} 个文件`);
        } else {
          // 增量索引：过滤掉已索引且未修改的文件
          this.pendingFiles = await this.filterFilesForIndexing(allFiles);
          console.log(`[WorkspaceVectorIndexService] 需要索引: ${this.pendingFiles.length} 个文件（跳过 ${allFiles.length - this.pendingFiles.length} 个已索引文件）`);
        }
        
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
          
          // 检查是否有已索引但未向量化的文件，启动后台向量化
          this.checkAndStartBackgroundVectorization(allFiles).catch(console.error);
          this.cleanupIndexingChild();
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
          // 阶段 1：只切分存储，不向量化（快速完成，UI 显示进度）
          await this.processChunksPhase1(result.filePath!, result.chunks, result.fileSize || 0);
        }
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        // 如果暂停中，不继续处理下一个文件（等待恢复时再处理）
        if (!this.isPaused) {
          // 使用 setImmediate 立即处理下一个文件（最快速度）
          setImmediate(() => this.processNextFile());
        }
        break;

      case 'file-skipped':
      case 'file-error':
        this.updateProgress({ processedFiles: this.progress.processedFiles + 1 });
        // 如果暂停中，不继续处理下一个文件（等待恢复时再处理）
        if (!this.isPaused) {
          // 使用 setImmediate 立即处理下一个文件（最快速度）
          setImmediate(() => this.processNextFile());
        }
        break;
    }
  }

  /**
   * 设置当前打开的文件夹（用于优先级队列）
   * @param folderPath 当前打开的文件夹路径
   */
  setCurrentOpenFolder(folderPath: string | null): void {
    this.currentOpenFolder = folderPath;
    console.log(`[WorkspaceVectorIndexService] 当前打开文件夹: ${folderPath || '无'}`);
  }

  /**
   * 按优先级排序文件列表
   * 优先级：1. 当前打开的文件夹 > 2. 小文件 (< 50KB) > 3. 中等文件 > 4. 大文件 (> 1MB)
   * @param files 文件路径列表
   * @param fileSizeMap 文件大小映射
   * @returns 排序后的文件列表
   */
  private sortFilesByPriority(files: string[], fileSizeMap: Map<string, number>): string[] {
    const currentFolder = this.currentOpenFolder;
    
    return files.sort((a, b) => {
      const sizeA = fileSizeMap.get(a) || 0;
      const sizeB = fileSizeMap.get(b) || 0;
      
      // 优先级 1：当前打开的文件夹中的文件
      const inCurrentFolderA = currentFolder && a.startsWith(currentFolder);
      const inCurrentFolderB = currentFolder && b.startsWith(currentFolder);
      
      if (inCurrentFolderA && !inCurrentFolderB) return -1;
      if (!inCurrentFolderA && inCurrentFolderB) return 1;
      
      // 优先级 2：小文件优先 (< 50KB)
      const isSmallA = sizeA < WorkspaceVectorIndexService.SMALL_FILE_THRESHOLD;
      const isSmallB = sizeB < WorkspaceVectorIndexService.SMALL_FILE_THRESHOLD;
      
      if (isSmallA && !isSmallB) return -1;
      if (!isSmallA && isSmallB) return 1;
      
      // 优先级 3：大文件最后 (> 1MB)
      const isLargeA = sizeA > WorkspaceVectorIndexService.LARGE_FILE_THRESHOLD;
      const isLargeB = sizeB > WorkspaceVectorIndexService.LARGE_FILE_THRESHOLD;
      
      if (isLargeA && !isLargeB) return 1;
      if (!isLargeA && isLargeB) return -1;
      
      // 同优先级内按大小升序（小文件先处理）
      return sizeA - sizeB;
    });
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
    const fileSizeMap = new Map<string, number>(); // 记录文件大小，用于优先级排序
    
    console.log(`[WorkspaceVectorIndexService] 增量索引检查: 数据库中有 ${indexedFilesHashMap.size} 个文件有 hash 记录，${indexedFilesTimeMap.size} 个文件有时间记录`);
    
    for (const filePath of allFiles) {
      // 检查文件大小，小于 2KB 的文件跳过（使用异步方式）
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.size < WorkspaceVectorIndexService.MIN_FILE_SIZE) {
          continue; // 跳过小文件
        }
        fileSizeMap.set(filePath, stats.size); // 记录文件大小
      } catch {
        continue; // 无法读取文件信息，跳过
      }

      // 规范化路径（统一使用正斜杠），与数据库存储格式一致
      const normalizedPath = filePath.replace(/\\/g, '/');
      const storedHash = indexedFilesHashMap.get(normalizedPath);
      const indexedAt = indexedFilesTimeMap.get(normalizedPath);
      
      // 文件从未被索引过
      if (indexedAt === undefined) {
        filesToIndex.push(filePath);
        continue;
      }
      
      // 有 hash 记录，使用 hash 判断
      if (storedHash !== undefined) {
        try {
          const currentHash = await calculateFileHashAsync(filePath);
          if (currentHash !== storedHash) {
            await workspaceIndexDatabase.deleteFileData(normalizedPath);
            filesToIndex.push(filePath);
          }
        } catch {
          // 无法读取文件，跳过
        }
      } else {
        // 旧数据没有 hash，回退到 mtime 判断
        try {
          const currentHash = await calculateFileHashAsync(filePath);
          const fileRecord = workspaceIndexDatabase.getFileIndex(normalizedPath);
          if (fileRecord) {
            workspaceIndexDatabase.addFileIndex({
              ...fileRecord,
              contentHash: currentHash,
            });
          }
        } catch {
          // 无法获取文件信息，跳过
        }
      }
    }
    
    // 按优先级排序文件列表
    const sortedFiles = this.sortFilesByPriority(filesToIndex, fileSizeMap);
    
    // 输出优先级队列信息
    if (sortedFiles.length > 0) {
      const smallCount = sortedFiles.filter(f => (fileSizeMap.get(f) || 0) < WorkspaceVectorIndexService.SMALL_FILE_THRESHOLD).length;
      const largeCount = sortedFiles.filter(f => (fileSizeMap.get(f) || 0) > WorkspaceVectorIndexService.LARGE_FILE_THRESHOLD).length;
      const currentFolderCount = this.currentOpenFolder 
        ? sortedFiles.filter(f => f.startsWith(this.currentOpenFolder!)).length 
        : 0;
      console.log(`[WorkspaceVectorIndexService] 优先级队列: 当前文件夹=${currentFolderCount}, 小文件=${smallCount}, 大文件=${largeCount}`);
    }
    
    return sortedFiles;
  }

  private processNextFile(): void {
    // 检查是否暂停
    if (this.isPaused) {
      return;
    }

    if (this.shouldStop || !this.pendingFiles.length) {
      if (!this.shouldStop) {
        // 阶段 1 完成：UI 显示"索引完成"
        this.updateProgress({ status: 'completed', currentFile: null });
        console.log('[WorkspaceVectorIndexService] ✓ 阶段1索引完成（切分存储）');
        
        // 刷新剩余的父块缓冲区
        this.flushParentBuffer().then(() => {
          // 阶段 2：启动后台向量化（静默运行）
          if (this.pendingVectorizationFiles.length > 0) {
            console.log(`[WorkspaceVectorIndexService] 启动阶段2后台向量化: ${this.pendingVectorizationFiles.length} 个文件`);
            this.startBackgroundVectorization();
          }
        });
      }
      this.cleanupIndexingChild();
      return;
    }

    const filePath = this.pendingFiles.shift()!;
    this.updateProgress({ currentFile: filePath });
    this.indexingChild?.postMessage({ type: 'index-file', data: { filePath } });
  }

  /**
   * 只清理索引子进程（不停止后台向量化）
   */
  private cleanupIndexingChild(): void {
    this.isRunning = false;
    if (this.indexingChild) {
      this.indexingChild.postMessage({ type: 'shutdown' });
      this.indexingChild.kill();
      this.indexingChild = null;
    }
  }

  /**
   * 检查已索引但未向量化的文件，启动后台向量化
   * @param allFiles 工作区所有文件列表（用于限制检查范围）
   */
  private async checkAndStartBackgroundVectorization(allFiles: string[]): Promise<void> {
    // 只检查当前工作区的文件（规范化路径）
    const workspaceFilesSet = new Set(allFiles.map(f => f.replace(/\\/g, '/')));
    
    // 获取所有已索引的文件
    const indexedFiles = workspaceIndexDatabase.getAllIndexedFiles();
    
    // 检查哪些文件已索引但未向量化（且在当前工作区中）
    const unvectorizedFiles: string[] = [];
    
    for (const file of indexedFiles) {
      // 只检查当前工作区的文件
      if (!workspaceFilesSet.has(file.filePath)) {
        continue;
      }
      
      // 检查是否有子块向量数据
      const children = await workspaceIndexDatabase.getChildrenByFilePath(file.filePath);
      if (children.length === 0) {
        // 检查是否有父块数据（已切分）
        const parents = workspaceIndexDatabase.getParentsByFilePath(file.filePath);
        if (parents.length > 0) {
          unvectorizedFiles.push(file.filePath);
        }
      }
    }
    
    if (unvectorizedFiles.length > 0) {
      console.log(`[WorkspaceVectorIndexService] 发现 ${unvectorizedFiles.length} 个已索引但未向量化的文件`);
      this.pendingVectorizationFiles = unvectorizedFiles;
      this.startBackgroundVectorization();
    }
  }

  /**
   * 阶段 1：快速处理切分结果（只存储，不向量化）
   * UI 显示进度，快速完成
   */
  private async processChunksPhase1(filePath: string, chunks: ChunkData[], fileSize: number): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();

      // 只存储父块，不进行向量化
      for (let pIdx = 0; pIdx < chunks.length && !this.shouldStop; pIdx++) {
        const chunk = chunks[pIdx];
        const parentId = generateUUID();

        // 添加到父块缓冲区
        this.parentBuffer.push({ parentId, filePath, content: chunk.parentContent, chunkIndex: pIdx, createdAt: Date.now() });
      }

      // 刷新父块缓冲区
      if (this.parentBuffer.length >= WorkspaceVectorIndexService.BUFFER_FLUSH_SIZE) {
        await this.flushParentBuffer();
      }

      // 计算文件内容 hash 用于增量索引
      let contentHash: string | undefined;
      try {
        contentHash = await calculateFileHashAsync(filePath);
      } catch {
        // 无法计算 hash，忽略
      }

      // 记录文件索引（标记为已切分，但未向量化）
      workspaceIndexDatabase.addFileIndex({
        filePath, fileName, fileExtension: fileExt, fileSize,
        language: this.getLanguage(fileExt), indexedAt: Date.now(),
        contentHash,
      });

      // 将文件加入待向量化队列
      this.pendingVectorizationFiles.push(filePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 阶段1处理失败: ${filePath}, 错误: ${errorMsg}`);
    }
  }

  /**
   * 阶段 2：后台向量化单个文件（静默运行，低 CPU）
   */
  private async vectorizeFileInBackground(filePath: string): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      
      // 获取该文件的所有父块
      const parents = workspaceIndexDatabase.getParentsByFilePath(filePath);
      if (parents.length === 0) return;

      // 收集所有子块文本
      const allChildTexts: string[] = [];
      const childMetaList: Array<{ parentId: string; chunkIndex: number; content: string }> = [];

      for (const parent of parents) {
        // 父块内容作为子块（简化处理）
        allChildTexts.push(parent.content);
        childMetaList.push({ parentId: parent.parentId, chunkIndex: 0, content: parent.content });
      }

      // 使用小批次 + 长延迟进行向量化（CPU ~10%）
      const BATCH_SIZE = WorkspaceVectorIndexService.BG_BATCH_SIZE;
      
      for (let i = 0; i < allChildTexts.length && !this.vectorizationShouldStop; i += BATCH_SIZE) {
        // 检查是否被优先索引打断
        if (this.priorityIndexingInProgress) {
          // 等待优先索引完成
          while (this.priorityIndexingInProgress) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        const batchTexts = allChildTexts.slice(i, i + BATCH_SIZE);
        const batchMeta = childMetaList.slice(i, i + BATCH_SIZE);
        
        const batchResults = await this.generateEmbeddingBatch(batchTexts);

        for (const result of batchResults) {
          if (result.success && result.vector && result.vector.length > 0) {
            const meta = batchMeta[result.index];
            this.childBuffer.push({
              childId: generateUUID(),
              parentId: meta.parentId,
              content: meta.content,
              vector: result.vector,
              chunkIndex: meta.chunkIndex,
              tags: '[]',
              source: fileName,
            });
          }
        }
        
        // 检查是否需要刷新缓冲区
        if (this.childBuffer.length >= WorkspaceVectorIndexService.BUFFER_FLUSH_SIZE) {
          await this.flushChildBuffer();
        }
        
        // 自适应批次延迟（初始 0ms，遇到限流自动增加）
        const batchDelay = this.getAdaptiveBatchDelay();
        if (batchDelay > 0 && i + BATCH_SIZE < allChildTexts.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      // 刷新剩余的子块
      await this.flushChildBuffer();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 后台向量化失败: ${filePath}, 错误: ${errorMsg}`);
    }
  }

  /**
   * 批量向量化多个文件（合并处理，减少 IPC 通信）
   * @param files 文件路径列表
   */
  private async vectorizeFilesInBatch(files: string[]): Promise<void> {
    // 收集所有文件的文本和元信息
    const allTexts: string[] = [];
    const allMeta: Array<{ filePath: string; fileName: string; parentId: string; chunkIndex: number; content: string }> = [];

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const parents = workspaceIndexDatabase.getParentsByFilePath(filePath);
      
      for (const parent of parents) {
        allTexts.push(parent.content);
        allMeta.push({
          filePath,
          fileName,
          parentId: parent.parentId,
          chunkIndex: 0,
          content: parent.content,
        });
      }
    }

    if (allTexts.length === 0) return;

    // 使用大批次一次性处理（云端 API 支持，减少请求次数）
    const BATCH_SIZE = 50; // 大批量请求，提升速度
    
    for (let i = 0; i < allTexts.length && !this.vectorizationShouldStop; i += BATCH_SIZE) {
      if (this.priorityIndexingInProgress) {
        while (this.priorityIndexingInProgress) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const batchTexts = allTexts.slice(i, i + BATCH_SIZE);
      const batchMeta = allMeta.slice(i, i + BATCH_SIZE);
      
      // 调用云端 API，失败时抛出错误
      const batchResults = await this.generateEmbeddingBatch(batchTexts);

      for (const result of batchResults) {
        if (result.success && result.vector && result.vector.length > 0) {
          const meta = batchMeta[result.index];
          this.childBuffer.push({
            childId: generateUUID(),
            parentId: meta.parentId,
            content: meta.content,
            vector: result.vector,
            chunkIndex: meta.chunkIndex,
            tags: '[]',
            source: meta.fileName,
          });
        }
      }
      
      if (this.childBuffer.length >= WorkspaceVectorIndexService.BUFFER_FLUSH_SIZE) {
        await this.flushChildBuffer();
      }
      
      // 自适应批次延迟
      const batchDelay = this.getAdaptiveBatchDelay();
      if (batchDelay > 0 && i + BATCH_SIZE < allTexts.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    await this.flushChildBuffer();
  }

  /**
   * 向量化单个文件（实时更新进度）
   * @param filePath 文件路径
   */
  private async vectorizeSingleFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const parents = workspaceIndexDatabase.getParentsByFilePath(filePath);
    
    if (parents.length === 0) return;

    // 收集该文件的所有文本
    const allTexts: string[] = [];
    const allMeta: Array<{ parentId: string; chunkIndex: number; content: string }> = [];

    for (const parent of parents) {
      allTexts.push(parent.content);
      allMeta.push({
        parentId: parent.parentId,
        chunkIndex: 0,
        content: parent.content,
      });
    }

    // 使用大批次处理（云端 API 支持）
    const BATCH_SIZE = 50;
    
    for (let i = 0; i < allTexts.length && !this.vectorizationShouldStop; i += BATCH_SIZE) {
      if (this.priorityIndexingInProgress) {
        while (this.priorityIndexingInProgress) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const batchTexts = allTexts.slice(i, i + BATCH_SIZE);
      const batchMeta = allMeta.slice(i, i + BATCH_SIZE);
      
      // 调用云端 API
      const batchResults = await this.generateEmbeddingBatch(batchTexts);

      for (const result of batchResults) {
        if (result.success && result.vector && result.vector.length > 0) {
          const meta = batchMeta[result.index];
          this.childBuffer.push({
            childId: generateUUID(),
            parentId: meta.parentId,
            content: meta.content,
            vector: result.vector,
            chunkIndex: meta.chunkIndex,
            tags: '[]',
            source: fileName,
          });
        }
      }
      
      // 检查是否需要刷新缓冲区
      if (this.childBuffer.length >= WorkspaceVectorIndexService.BUFFER_FLUSH_SIZE) {
        await this.flushChildBuffer();
      }
      
      // 自适应批次延迟
      const batchDelay = this.getAdaptiveBatchDelay();
      if (batchDelay > 0 && i + BATCH_SIZE < allTexts.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    // 刷新该文件的剩余数据
    await this.flushChildBuffer();
  }

  /**
   * 启动后台向量化任务（使用云端 API，零 CPU 占用）
   */
  private async startBackgroundVectorization(): Promise<void> {
    if (this.isVectorizingInBackground) return;
    if (this.pendingVectorizationFiles.length === 0) return;

    this.isVectorizingInBackground = true;
    this.vectorizationShouldStop = false;
    this.vectorizationTotalFiles = this.pendingVectorizationFiles.length;
    this.vectorizationProcessedFiles = 0;
    this.vectorizationCurrentFile = null;
    console.log(`[WorkspaceVectorIndexService] 启动后台向量化（云端 API）: ${this.pendingVectorizationFiles.length} 个文件`);
    this.updateVectorizationProgress();

    try {
      // 检查云端 API 配置
      await this.initializeEmbedding();

      // 逐个文件处理，实时更新进度
      while (this.pendingVectorizationFiles.length > 0 && !this.vectorizationShouldStop) {
        // 检查是否被优先索引打断
        if (this.priorityIndexingInProgress) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        // 取出单个文件
        const filePath = this.pendingVectorizationFiles.shift()!;
        
        // 更新当前处理的文件
        this.vectorizationCurrentFile = path.basename(filePath);
        this.updateVectorizationProgress();
        
        // 处理单个文件
        await this.vectorizeSingleFile(filePath);
        
        // 更新已处理文件数
        this.vectorizationProcessedFiles += 1;
        this.updateVectorizationProgress();

        // 自适应文件延迟（初始 0ms，遇到限流自动增加）
        const fileDelay = this.getAdaptiveFileDelay();
        if (fileDelay > 0 && this.pendingVectorizationFiles.length > 0) {
          await new Promise(resolve => setTimeout(resolve, fileDelay));
        }
      }

      console.log('[WorkspaceVectorIndexService] 后台向量化完成');
      this.vectorizationCurrentFile = null;
      this.updateVectorizationProgress();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[WorkspaceVectorIndexService] 后台向量化错误:', errorMsg);
      
      // 暂停向量化并发送错误通知
      this.vectorizationShouldStop = true;
      this.isVectorizingInBackground = false;
      this.vectorizationCurrentFile = null;
      
      // 发送错误状态到渲染进程
      this.updateProgress({ 
        status: 'error', 
        errorMessage: `索引失败: ${errorMsg}` 
      });
    } finally {
      this.isVectorizingInBackground = false;
      this.vectorizationCurrentFile = null;
      this.updateVectorizationProgress();
    }
  }

  /**
   * 刷新父块缓冲区
   */
  private async flushParentBuffer(): Promise<void> {
    if (this.parentBuffer.length > 0) {
      workspaceIndexDatabase.addParentsBatch(this.parentBuffer);
      this.parentBuffer = [];
    }
  }

  /**
   * 刷新子块缓冲区
   */
  private async flushChildBuffer(): Promise<void> {
    if (this.childBuffer.length > 0) {
      try {
        await workspaceIndexDatabase.addChildren(this.childBuffer);
      } catch (dbError) {
        const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error(`[WorkspaceVectorIndexService] 子块入库失败: ${dbErrorMsg}`);
      }
      this.childBuffer = [];
    }
    
    // 入库后添加延迟，让出 CPU
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  /**
   * 完整处理切分结果（用于优先索引，立即向量化）
   */
  private async processChunks(filePath: string, chunks: ChunkData[], fileSize: number): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();

      // 收集所有子块文本和元信息，用于批量向量化
      const allChildTexts: string[] = [];
      const childMetaList: Array<{ parentId: string; chunkIndex: number; content: string }> = [];

      for (let pIdx = 0; pIdx < chunks.length && !this.shouldStop; pIdx++) {
        const chunk = chunks[pIdx];
        const parentId = generateUUID();

        // 添加到父块缓冲区
        this.parentBuffer.push({ parentId, filePath, content: chunk.parentContent, chunkIndex: pIdx, createdAt: Date.now() });

        // 收集子块
        for (let cIdx = 0; cIdx < chunk.childContents.length; cIdx++) {
          allChildTexts.push(chunk.childContents[cIdx]);
          childMetaList.push({ parentId, chunkIndex: cIdx, content: chunk.childContents[cIdx] });
        }
      }

      // 批量生成向量（优先索引使用较大批次，快速完成）
      const BATCH_SIZE = 20;
      if (allChildTexts.length > 0 && !this.shouldStop) {
        try {
          for (let i = 0; i < allChildTexts.length && !this.shouldStop; i += BATCH_SIZE) {
            const batchTexts = allChildTexts.slice(i, i + BATCH_SIZE);
            const batchMeta = childMetaList.slice(i, i + BATCH_SIZE);
            
            const batchResults = await this.generateEmbeddingBatch(batchTexts);

            for (const result of batchResults) {
              if (result.success && result.vector && result.vector.length > 0) {
                const meta = batchMeta[result.index];
                this.childBuffer.push({
                  childId: generateUUID(),
                  parentId: meta.parentId,
                  content: meta.content,
                  vector: result.vector,
                  chunkIndex: meta.chunkIndex,
                  tags: '[]',
                  source: fileName,
                });
              }
            }
            
            // 检查是否需要刷新缓冲区
            if (this.childBuffer.length >= WorkspaceVectorIndexService.BUFFER_FLUSH_SIZE) {
              await this.flushBuffers();
            }
            
            // 批次之间添加短延迟
            if (i + BATCH_SIZE < allChildTexts.length) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[WorkspaceVectorIndexService] 批量向量生成失败: ${errorMsg}`);
        }
      }

      // 计算文件内容 hash 用于增量索引
      let contentHash: string | undefined;
      try {
        contentHash = await calculateFileHashAsync(filePath);
      } catch {
        // 无法计算 hash，忽略
      }

      workspaceIndexDatabase.addFileIndex({
        filePath, fileName, fileExtension: fileExt, fileSize,
        language: this.getLanguage(fileExt), indexedAt: Date.now(),
        contentHash,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 处理失败: ${filePath}, 错误: ${errorMsg}`);
    }
  }

  /**
   * 刷新缓冲区，批量入库
   */
  private async flushBuffers(): Promise<void> {
    if (this.parentBuffer.length > 0) {
      workspaceIndexDatabase.addParentsBatch(this.parentBuffer);
      this.parentBuffer = [];
    }
    
    if (this.childBuffer.length > 0) {
      try {
        await workspaceIndexDatabase.addChildren(this.childBuffer);
      } catch (dbError) {
        const dbErrorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error(`[WorkspaceVectorIndexService] 子块入库失败: ${dbErrorMsg}`);
      }
      this.childBuffer = [];
    }
    
    // 入库后添加延迟，让出 CPU
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  private async cleanupAsync(): Promise<void> {
    // 刷新剩余的缓冲区数据
    await this.flushBuffers();
    
    this.isRunning = false;
    if (this.indexingChild) {
      this.indexingChild.postMessage({ type: 'shutdown' });
      this.indexingChild.kill();
      this.indexingChild = null;
    }
  }

  private cleanup(): void {
    this.cleanupAsync().catch(console.error);
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
   * 检查文件是否已向量化（有子块向量数据）
   */
  async isFileVectorized(filePath: string): Promise<boolean> {
    const children = await workspaceIndexDatabase.getChildrenByFilePath(filePath);
    return children.length > 0;
  }

  /**
   * 优先索引文件（用于 @文件 场景）
   * 会暂停批量索引和后台向量化，优先处理指定文件，完成后恢复
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

    // 检查文件是否已向量化
    const isVectorized = await this.isFileVectorized(filePath);
    if (isVectorized) {
      console.log(`[WorkspaceVectorIndexService] 文件已向量化，跳过: ${filePath}`);
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

    // 标记优先索引进行中（后台向量化会检查此标志并暂停）
    this.priorityIndexingInProgress = true;
    onProgress?.('正在优先解析文档结构...');

    try {
      // 初始化数据库
      await workspaceIndexDatabase.initialize();

      // 删除旧的索引数据（如果存在）
      await workspaceIndexDatabase.deleteFileData(filePath);

      // 从待向量化队列中移除该文件（如果存在）
      const pendingIndex = this.pendingVectorizationFiles.indexOf(filePath);
      if (pendingIndex !== -1) {
        this.pendingVectorizationFiles.splice(pendingIndex, 1);
      }

      // 初始化 Embedding 服务
      onProgress?.('正在初始化向量引擎...');
      await this.initializeEmbedding();

      // 创建临时子进程处理单个文件
      const tempChild = await this.createIndexingChild();

      onProgress?.('正在切分文档...');

      const result = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[WorkspaceVectorIndexService] 优先索引超时');
          resolve(false);
        }, 60000); // 60秒超时

        tempChild.on('message', async (msg: IndexResult) => {
          if (msg.type === 'ready') {
            tempChild.postMessage({ type: 'index-file', data: { filePath } });
          } else if (msg.type === 'chunk-ready' && msg.chunks?.length) {
            onProgress?.('正在生成向量...');
            try {
              // 优先索引使用完整处理（立即向量化）
              await this.processChunks(msg.filePath!, msg.chunks, msg.fileSize || 0);
              // 刷新缓冲区
              await this.flushBuffers();
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

        tempChild.on('exit', (code: number) => {
          if (code !== 0) {
            console.error('[WorkspaceVectorIndexService] 子进程异常退出:', code);
            clearTimeout(timeout);
            resolve(false);
          }
        });
      });

      // 清理临时子进程
      tempChild.postMessage({ type: 'shutdown' });
      tempChild.kill();

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

      // 初始化 Embedding 服务
      await this.initializeEmbedding();

      // 创建子进程处理单个文件
      this.indexingChild = await this.createIndexingChild();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('索引超时'));
        }, 120000);

        this.indexingChild!.on('message', async (result: IndexResult) => {
          if (result.type === 'ready') {
            // 子进程就绪，发送索引请求
            this.indexingChild!.postMessage({ type: 'index-file', data: { filePath } });
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
    
    // 添加向量化进度
    this.progress.vectorization = {
      status: this.isVectorizingInBackground ? 'running' : (this.vectorizationProcessedFiles > 0 && this.vectorizationProcessedFiles >= this.vectorizationTotalFiles ? 'completed' : 'idle'),
      totalFiles: this.vectorizationTotalFiles,
      processedFiles: this.vectorizationProcessedFiles,
      currentFile: this.vectorizationCurrentFile,
    };
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('workspace-vector-index:progress', this.progress);
    } else {
      console.warn(`[WorkspaceVectorIndexService] 无法发送进度: mainWindow=${this.mainWindow ? '存在但已销毁' : 'null'}`);
    }
  }

  /**
   * 更新向量化进度
   */
  private updateVectorizationProgress(): void {
    this.updateProgress({});
  }

  /**
   * 检查自动索引配置并启动索引（应用启动时调用）
   * @param workspacePath 工作区路径
   * @returns 检查结果
   */
  async checkAndStartAutoIndex(workspacePath: string): Promise<{ success: boolean; message: string }> {
    console.log('[WorkspaceVectorIndexService] ========== 检查自动索引配置 ==========');

    // 1. 检查是否开启了自索引
    const autoIndexEnabled = getElectronStore().get('embedding-auto-index') ?? true;
    if (!autoIndexEnabled) {
      console.log('[WorkspaceVectorIndexService] 自动索引已关闭，跳过');
      return { success: true, message: '自动索引已关闭' };
    }

    // 2. 检查是否配置了服务商和模型
    const currentModel = cloudEmbeddingService.getCurrentModel();
    if (!currentModel) {
      const errorMsg = '索引失败: 未选择 Embedding 模型，请先在设置中选择服务商和模型';
      console.warn(`[WorkspaceVectorIndexService] ${errorMsg}`);
      this.updateProgress({ status: 'error', errorMessage: errorMsg });
      return { success: false, message: errorMsg };
    }

    // 3. 检查是否配置了 API Key
    const hasApiKey = cloudEmbeddingService.hasValidApiKey();
    if (!hasApiKey) {
      const errorMsg = `索引失败: 未配置 ${currentModel.providerId} 的 API Key，请先在设置中配置`;
      console.warn(`[WorkspaceVectorIndexService] ${errorMsg}`);
      this.updateProgress({ status: 'error', errorMessage: errorMsg });
      return { success: false, message: errorMsg };
    }

    // 4. 检查工作区路径
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      console.log('[WorkspaceVectorIndexService] 工作区路径无效，跳过自动索引');
      return { success: true, message: '工作区路径无效' };
    }

    console.log(`[WorkspaceVectorIndexService] 自动索引配置检查通过，开始索引: ${workspacePath}`);
    
    // 5. 启动索引（会自动检查 hash 判断是否有新文件）
    try {
      await this.startIndexing(workspacePath);
      return { success: true, message: '自动索引已启动' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WorkspaceVectorIndexService] 自动索引启动失败: ${errorMsg}`);
      return { success: false, message: `索引失败: ${errorMsg}` };
    }
  }
}

export const workspaceVectorIndexService = WorkspaceVectorIndexService.getInstance();
