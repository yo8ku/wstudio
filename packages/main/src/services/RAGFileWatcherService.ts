/**
 * RAG 文件监听服务
 * 监听工作区文件变化，自动触发 RAG 处理
 * 主进程只负责：文件事件（新增/修改），主进程将文件路径列表传递给Python后台脚本
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// 获取当前文件的目录（CommonJS 环境）
const getCurrentDir = (): string => {
  // 在主进程的 CommonJS 环境中，__dirname 应该始终可用
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // 如果 __dirname 不可用，使用 process.cwd() 作为后备
  return process.cwd();
};

export interface FileChangeEvent {
  type: 'add' | 'change' | 'delete';
  filePath: string;
  fileName: string;
}

// PythonBridge 类型定义
type PythonBridgeType = typeof import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } })['PythonBridge'];
type PythonServiceRequestType = import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } }).PythonServiceRequest;

export class RAGFileWatcherService extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private watchedPaths: Set<string> = new Set();
  private workspacePath: string | null = null;
  private isWatching: boolean = false;
  private pendingFilePaths: Set<string> = new Set(); // 待处理的文件路径
  private processTimer: NodeJS.Timeout | null = null; // 批量处理定时器
  private pythonBridge: InstanceType<PythonBridgeType> | null = null;
  private PythonBridgeClass: PythonBridgeType | null = null;

  // 文件监听现在完全由 Python 端处理，不再需要主窗口

  /**
   * 初始化 PythonBridge（延迟加载）
   */
  private async initializePythonBridge(): Promise<void> {
    if (this.pythonBridge) {
      return;
    }

    try {
      // 动态导入 PythonBridge
      // 尝试多种导入方式以确保兼容性
      let module: any;
      try {
        // 方法1: 直接使用包名导入（适用于已正确链接的 workspace 包）
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        module = await dynamicImport('@note-studio/global-rag');
      } catch (firstError) {
        // 方法2: 如果包名导入失败，尝试使用相对路径
        try {
          // 从 packages/main/dist 到 packages/global-rag/dist
          const currentDir = getCurrentDir();
          const globalRagPath = path.resolve(currentDir, '../../global-rag/dist/index.js');
          const dynamicImport = new Function('specifier', 'return import(specifier)');
          module = await dynamicImport(globalRagPath);
        } catch (secondError) {
          // 方法3: 尝试从项目根目录解析
          try {
            const currentDir = getCurrentDir();
            const projectRoot = path.resolve(currentDir, '../../../');
            const globalRagPath = path.join(projectRoot, 'packages/global-rag/dist/index.js');
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            module = await dynamicImport(`file://${globalRagPath}`);
          } catch (thirdError) {
            // 所有方法都失败，抛出第一个错误
            throw firstError;
          }
        }
      }
      
      if (!module || !module.PythonBridge) {
        throw new Error('PythonBridge not found in @note-studio/global-rag module');
      }
      
      this.PythonBridgeClass = module.PythonBridge;
      if (!this.PythonBridgeClass) {
        throw new Error('PythonBridge class is null');
      }
      this.pythonBridge = new this.PythonBridgeClass();
      
      // 启动 Python 服务
      if (!this.pythonBridge.isServiceReady()) {
        await this.pythonBridge.start();
      }
      
      console.log('[RAGFileWatcherService] PythonBridge 初始化成功');
    } catch (error) {
      console.error('[RAGFileWatcherService] PythonBridge 初始化失败:', error);
      // 不抛出错误，允许服务继续运行（只是无法自动处理文件）
    }
  }

  /**
   * 设置工作区路径
   */
  setWorkspacePath(workspacePath: string | null): void {
    if (this.workspacePath === workspacePath) {
      return;
    }

    // 停止旧的监听
    this.stopWatching();

    this.workspacePath = workspacePath;

    // 如果提供了新的工作区路径，开始监听
    if (workspacePath) {
      this.startWatching(workspacePath);
      // 异步初始化 PythonBridge（不阻塞）
      this.initializePythonBridge().catch((error) => {
        console.error('[RAGFileWatcherService] PythonBridge 初始化失败:', error);
      });
    }
  }

  /**
   * 开始监听工作区文件变化
   */
  private startWatching(workspacePath: string): void {
    if (this.isWatching) {
      console.log('[RAGFileWatcherService] 已经在监听中，跳过重复启动');
      return;
    }

    try {
      // 检查目录是否存在
      if (!fs.existsSync(workspacePath)) {
        console.warn(`[RAGFileWatcherService] 工作区路径不存在: ${workspacePath}`);
        return;
      }

      console.log(`[RAGFileWatcherService] 开始监听工作区: ${workspacePath}`);

      this.watcher = fs.watch(
        workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType, filename, workspacePath);
          }
        }
      );

      this.watcher.on('error', (error) => {
        console.error('[RAGFileWatcherService] 文件监听错误:', error);
      });

      this.isWatching = true;
    } catch (error) {
      console.error('[RAGFileWatcherService] 启动文件监听失败:', error);
      this.isWatching = false;
    }
  }

  /**
   * 停止监听
   */
  stopWatching(): void {
    if (this.watcher) {
      console.log('[RAGFileWatcherService] 停止监听工作区');
      this.watcher.close();
      this.watcher = null;
    }

    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }

    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }

    this.watchedPaths.clear();
    this.pendingFilePaths.clear();
    this.isWatching = false;
  }

  /**
   * 检查文件是否应该被处理
   */
  private shouldProcessFile(filePath: string): boolean {
    // 忽略隐藏文件和特殊目录
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.')) {
      return false;
    }

    // 忽略 node_modules 目录
    if (filePath.includes('node_modules')) {
      return false;
    }

    // 忽略常见的构建和缓存目录
    const ignoredDirs = ['node_modules', '.git', '.vscode', '.idea', 'dist', 'build', '.next', '.cache'];
    for (const dir of ignoredDirs) {
      if (filePath.includes(path.sep + dir + path.sep) || filePath.includes(path.sep + dir)) {
        return false;
      }
    }

    // 只处理支持的文件类型
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = [
      '.md', '.markdown', '.txt', '.json',
      '.js', '.ts', '.jsx', '.tsx',
      '.py', '.java', '.cpp', '.c', '.h',
      '.css', '.scss', '.html', '.xml',
      '.yaml', '.yml'
    ];
    return supportedExtensions.includes(ext);
  }

  /**
   * 处理文件变化（带防抖）
   */
  private handleFileChange(eventType: string, filename: string, workspacePath: string): void {
    // 构建完整文件路径
    const filePath = path.join(workspacePath, filename);

    // 检查文件是否应该被处理
    if (!this.shouldProcessFile(filePath)) {
      return;
    }

    // 检查文件是否存在（删除事件时文件已不存在）
    let fileExists = false;
    try {
      fileExists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch {
      // 文件不存在或无法访问
      fileExists = false;
    }

    // 确定事件类型
    let changeType: 'add' | 'change' | 'delete';
    if (!fileExists) {
      changeType = 'delete';
    } else if (this.watchedPaths.has(filePath)) {
      changeType = 'change';
    } else {
      changeType = 'add';
      this.watchedPaths.add(filePath);
    }

    // 如果是删除事件，从已监听路径中移除
    if (changeType === 'delete') {
      this.watchedPaths.delete(filePath);
    }

    // 防抖：避免短时间内多次触发
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }

    this.watchDebounceTimer = setTimeout(() => {
      const fileName = path.basename(filePath);
      const event: FileChangeEvent = {
        type: changeType,
        filePath,
        fileName
      };

      // 降低日志级别，避免过多输出
      // console.log(`[RAGFileWatcherService] 文件变化: ${changeType} - ${filePath}`);

      // 文件监听现在完全由 Python 端处理，不再发送事件到前端
      // 触发本地事件（供主进程其他部分使用，如果有需要）
      this.emit('file-change', event);

      // 如果是新增或修改事件，将文件路径添加到待处理列表
      if (changeType === 'add' || changeType === 'change') {
        this.pendingFilePaths.add(filePath);
        // 触发批量处理（延迟处理，避免频繁调用）
        this.scheduleBatchProcess();
      }
    }, 1000); // 1秒防抖
  }

  // 文件监听现在完全由 Python 端处理，不再需要发送事件到前端

  /**
   * 安排批量处理文件
   */
  private scheduleBatchProcess(): void {
    // 如果已有定时器，清除它
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }

    // 延迟 2 秒处理，收集更多文件变化
    this.processTimer = setTimeout(() => {
      this.processPendingFiles();
    }, 2000);
  }

  /**
   * 处理待处理的文件列表
   */
  private async processPendingFiles(): Promise<void> {
    if (this.pendingFilePaths.size === 0) {
      return;
    }

    // 确保 PythonBridge 已初始化
    if (!this.pythonBridge) {
      try {
        await this.initializePythonBridge();
      } catch (error) {
        console.error('[RAGFileWatcherService] 无法初始化 PythonBridge，跳过文件处理:', error);
        this.pendingFilePaths.clear();
        return;
      }
    }

    if (!this.pythonBridge || !this.pythonBridge.isServiceReady()) {
      console.warn('[RAGFileWatcherService] PythonBridge 未就绪，跳过文件处理');
      this.pendingFilePaths.clear();
      return;
    }

    // 获取待处理的文件路径列表
    const filePaths = Array.from(this.pendingFilePaths);
    this.pendingFilePaths.clear();

    // 过滤出存在的文件
    const existingFilePaths = filePaths.filter((filePath) => {
      try {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      } catch {
        return false;
      }
    });

    if (existingFilePaths.length === 0) {
      // 降低日志级别，避免过多输出
      // console.log('[RAGFileWatcherService] 没有需要处理的文件');
      return;
    }

    // 降低日志级别，避免过多输出
    // console.log(`[RAGFileWatcherService] 开始处理 ${existingFilePaths.length} 个文件`);

    try {
      // 构建请求
      const request: PythonServiceRequestType = {
        method: 'process_file_paths',
        params: {
          file_paths: existingFilePaths,
          knowledge_base_id: this.workspacePath || 'default',
          chunk_size: 1000,
          chunk_overlap: 200,
          strategy: 'recursive'
        }
      };

      // 发送请求到 Python 服务
      const response = await this.pythonBridge.request(request);

      if (response.success) {
        const result = response.result as {
          ids?: number[];
          processed_count?: number;
          file_count?: number;
          errors?: string[];
        };
        
        // 只有当结果存在且有数据时才输出日志
        if (result && (result.processed_count !== undefined || result.file_count !== undefined)) {
          const processedCount = result.processed_count ?? 0;
          const fileCount = result.file_count ?? 0;
          console.log(
            `[RAGFileWatcherService] 文件处理完成: 处理了 ${processedCount} 个文档块，来自 ${fileCount} 个文件`
          );
        }
        
        if (result?.errors && result.errors.length > 0) {
          console.warn('[RAGFileWatcherService] 处理过程中的错误:', result.errors);
        }
      } else {
        console.error('[RAGFileWatcherService] 文件处理失败:', response.error);
      }
    } catch (error) {
      console.error('[RAGFileWatcherService] 处理文件时发生错误:', error);
    }
  }

  /**
   * 获取当前监听状态
   */
  getWatchingStatus(): { isWatching: boolean; workspacePath: string | null } {
    return {
      isWatching: this.isWatching,
      workspacePath: this.workspacePath
    };
  }
}



