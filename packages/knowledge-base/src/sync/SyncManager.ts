/**
 * 同步管理器
 */

import { EventEmitter } from 'events';
import { FileWatcher } from './FileWatcher';
import { DeltaSync } from './DeltaSync';

export interface SyncOptions {
  watch?: boolean;
  interval?: number;
  deleteRemoved?: boolean;
}

export class SyncManager extends EventEmitter {
  private fileWatcher?: FileWatcher;
  private deltaSync: DeltaSync;
  private isWatching = false;

  constructor() {
    super();
    this.deltaSync = new DeltaSync();
  }

  /**
   * 开始同步
   */
  async start(directoryPath: string, options?: SyncOptions): Promise<void> {
    if (options?.watch) {
      this.fileWatcher = new FileWatcher(directoryPath);
      
      this.fileWatcher.on('file-added', (filePath) => {
        this.emit('file-added', filePath);
      });

      this.fileWatcher.on('file-changed', (filePath) => {
        this.emit('file-changed', filePath);
      });

      this.fileWatcher.on('file-deleted', (filePath) => {
        this.emit('file-deleted', filePath);
      });

      await this.fileWatcher.start();
      this.isWatching = true;
    }

    // 执行增量同步
    await this.deltaSync.sync(directoryPath, options);
  }

  /**
   * 停止同步
   */
  async stop(): Promise<void> {
    if (this.fileWatcher && this.isWatching) {
      await this.fileWatcher.stop();
      this.isWatching = false;
    }
  }

  /**
   * 手动触发同步
   */
  async triggerSync(directoryPath: string, options?: SyncOptions): Promise<void> {
    await this.deltaSync.sync(directoryPath, options);
  }

  /**
   * 获取同步状态
   */
  getStatus(): { isWatching: boolean } {
    return {
      isWatching: this.isWatching,
    };
  }
}




























































