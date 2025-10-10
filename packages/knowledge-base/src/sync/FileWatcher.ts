/**
 * 文件监听器
 */

import { EventEmitter } from 'events';
import chokidar from 'chokidar';

export class FileWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private directoryPath: string;

  constructor(directoryPath: string) {
    super();
    this.directoryPath = directoryPath;
  }

  /**
   * 开始监听
   */
  async start(): Promise<void> {
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




























































