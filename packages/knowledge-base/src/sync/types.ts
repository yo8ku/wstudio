/**
 * 同步类型定义
 */

export interface SyncConfig {
  enabled: boolean;
  watchPaths: string[];
  ignorePatterns?: string[];
  syncInterval?: number;
  deleteOnRemove?: boolean;
}

export interface SyncEvent {
  type: 'added' | 'modified' | 'deleted';
  filePath: string;
  timestamp: Date;
}

export interface SyncStatus {
  isActive: boolean;
  lastSyncTime?: Date;
  filesWatched: number;
  pendingChanges: number;
}




























































