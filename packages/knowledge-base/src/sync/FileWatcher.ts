/**
 * 文件监听器
 */

import { EventEmitter } from '@note-studio/core';

// 检测运行环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// 缓存动态导入的模块
let chokidarModule: typeof import('chokidar') | null = null;

// Chokidar 类型定义
interface ChokidarFSWatcher {
  on(event: 'add', listener: (path: string) => void): ChokidarFSWatcher;
  on(event: 'change', listener: (path: string) => void): ChokidarFSWatcher;
  on(event: 'unlink', listener: (path: string) => void): ChokidarFSWatcher;
  on(event: 'error', listener: (error: Error) => void): ChokidarFSWatcher;
  close(): Promise<void>;
}

interface ChokidarModule {
  watch(
    paths: string,
    options?: {
      persistent?: boolean;
      ignoreInitial?: boolean;
      ignored?: RegExp | string | ((path: string) => boolean);
    }
  ): ChokidarFSWatcher;
}

// 获取 chokidar 模块
async function getChokidarModule(): Promise<ChokidarModule> {
  if (isBrowser) {
    throw new Error('chokidar module is not available in browser environment.');
  }
  if (!chokidarModule) {
    try {
      // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      chokidarModule = await dynamicImport('chokidar');
    } catch (error) {
      throw new Error('chokidar module is not available. Please ensure you are running in Node.js environment.');
    }
  }
  return chokidarModule as unknown as ChokidarModule;
}

export class FileWatcher extends EventEmitter {
  private watcher?: ChokidarFSWatcher;
  private directoryPath: string;

  constructor(directoryPath: string) {
    super();
    this.directoryPath = directoryPath;
  }

  /**
   * 开始监听
   */
  async start(): Promise<void> {
    const chokidar = await getChokidarModule();
    this.watcher = chokidar.watch(this.directoryPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
    });

    this.watcher
      .on('add', (path) => this.emit('file-added', path))
      .on('change', (path) => this.emit('file-changed', path))
      .on('unlink', (path) => this.emit('file-deleted', path))
      .on('error', (error) => this.emit('error', error));
  }

  /**
   * 停止监听
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }
}




































































