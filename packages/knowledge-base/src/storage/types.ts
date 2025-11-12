/**
 * 存储类型定义
 */

export interface StorageConfig {
  type: 'memory' | 'file' | 'sqlite' | 'mongodb';
  path?: string;
  connectionString?: string;
}

export interface StorageStats {
  totalDocuments: number;
  totalChunks: number;
  totalSize: number;
  lastUpdated: Date;
}




































































