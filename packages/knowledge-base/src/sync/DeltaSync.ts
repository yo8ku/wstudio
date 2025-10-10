/**
 * 增量同步
 */

import { FileScanner } from '../import/FileScanner';
import { MetadataExtractor } from '../metadata/MetadataExtractor';

export interface SyncState {
  lastSyncTime: Date;
  syncedFiles: Map<string, { hash: string; modifiedAt: Date }>;
}

export class DeltaSync {
  private state: SyncState = {
    lastSyncTime: new Date(0),
    syncedFiles: new Map(),
  };

  /**
   * 执行同步
   */
  async sync(directoryPath: string, options?: any): Promise<void> {
    const scanner = new FileScanner();
    const extractor = new MetadataExtractor();
    
    const files = await scanner.scan(directoryPath, { recursive: true });
    const changes: { added: string[]; modified: string[]; deleted: string[] } = {
      added: [],
      modified: [],
      deleted: [],
    };

    // 检测新增和修改的文件
    for (const filePath of files) {
      const metadata = await extractor.extractFromFile(filePath);
      const existing = this.state.syncedFiles.get(filePath);

      if (!existing) {
        changes.added.push(filePath);
        this.state.syncedFiles.set(filePath, {
          hash: metadata.hash,
          modifiedAt: metadata.modifiedAt,
        });
      } else if (existing.hash !== metadata.hash) {
        changes.modified.push(filePath);
        this.state.syncedFiles.set(filePath, {
          hash: metadata.hash,
          modifiedAt: metadata.modifiedAt,
        });
      }
    }

    // 检测删除的文件
    for (const [filePath] of this.state.syncedFiles) {
      if (!files.includes(filePath)) {
        changes.deleted.push(filePath);
        if (options?.deleteRemoved) {
          this.state.syncedFiles.delete(filePath);
        }
      }
    }

    this.state.lastSyncTime = new Date();

    return;
  }

  /**
   * 获取同步状态
   */
  getState(): SyncState {
    return this.state;
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = {
      lastSyncTime: new Date(0),
      syncedFiles: new Map(),
    };
  }
}




























































