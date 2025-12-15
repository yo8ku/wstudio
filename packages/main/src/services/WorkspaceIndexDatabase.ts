/**
 * 工作区索引数据库服务
 * 
 * 使用 SQLite 存储：
 * 1. 文件索引信息（files 表）
 * 2. 父块内容（parents 表）
 * 
 * 使用 LanceDB 存储：
 * 1. 子块向量（children 表）
 */

import initSqlJs, { Database } from 'sql.js';
import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// 最小文件大小（2KB）
const MIN_FILE_SIZE = 2 * 1024;

// 向量维度（all-MiniLM-L6-v2 模型）
const VECTOR_DIMENSION = 384;

/**
 * 文件索引记录
 */
export interface FileIndexRecord {
  filePath: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  language: string;
  indexedAt: number;
}

/**
 * 父块记录
 */
export interface ParentRecord {
  parentId: string;
  filePath: string;
  content: string;
  chunkIndex: number;
  createdAt: number;
}

/**
 * 子块记录（用于 LanceDB）
 */
export interface ChildRecord {
  childId: string;
  parentId: string;
  content: string;
  vector: number[];
  chunkIndex: number;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  parentId: string;
  parentContent: string;
  childContent: string;
  filePath: string;
  score: number;
}

export class WorkspaceIndexDatabase {
  private static instance: WorkspaceIndexDatabase;
  
  private db: Database | null = null;
  private lanceDb: lancedb.Connection | null = null;
  private childrenTable: lancedb.Table | null = null;
  
  private dbPath: string;
  private lanceDbPath: string;
  private isInitialized: boolean = false;

  private constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'workspace-index.db');
    this.lanceDbPath = path.join(userDataPath, 'workspace-vectors');
  }

  public static getInstance(): WorkspaceIndexDatabase {
    if (!WorkspaceIndexDatabase.instance) {
      WorkspaceIndexDatabase.instance = new WorkspaceIndexDatabase();
    }
    return WorkspaceIndexDatabase.instance;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[WorkspaceIndexDatabase] 初始化数据库...');
      
      // 初始化 SQLite
      const SQL = await initSqlJs();
      
      // 如果数据库文件存在，加载它
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
      } else {
        this.db = new SQL.Database();
      }
      
      // 创建表
      this.createTables();
      
      // 初始化 LanceDB
      // 确保目录存在
      if (!fs.existsSync(this.lanceDbPath)) {
        fs.mkdirSync(this.lanceDbPath, { recursive: true });
      }
      
      this.lanceDb = await lancedb.connect(this.lanceDbPath);
      
      // 获取或创建 children 表
      const tableNames = await this.lanceDb.tableNames();
      if (tableNames.includes('children')) {
        this.childrenTable = await this.lanceDb.openTable('children');
      }
      
      this.isInitialized = true;
      console.log('[WorkspaceIndexDatabase] 数据库初始化完成');
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 初始化失败:', error);
      throw error;
    }
  }


  /**
   * 创建 SQLite 表
   */
  private createTables(): void {
    if (!this.db) return;

    // 文件索引表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        filePath TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        fileExtension TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        language TEXT NOT NULL,
        indexedAt INTEGER NOT NULL
      )
    `);

    // 父块表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS parents (
        parentId TEXT PRIMARY KEY,
        filePath TEXT NOT NULL,
        content TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      )
    `);

    // 创建索引
    this.db.run('CREATE INDEX IF NOT EXISTS idx_parents_filePath ON parents(filePath)');
    
    this.saveDatabase();
  }

  /**
   * 保存 SQLite 数据库到文件
   */
  private saveDatabase(): void {
    if (!this.db) return;
    
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 保存数据库失败:', error);
    }
  }

  /**
   * 检查文件是否应该被索引
   */
  shouldIndexFile(fileSize: number): boolean {
    return fileSize >= MIN_FILE_SIZE;
  }

  /**
   * 检查文件是否已索引
   */
  isFileIndexed(filePath: string): boolean {
    if (!this.db) return false;
    
    const result = this.db.exec(
      'SELECT 1 FROM files WHERE filePath = ?',
      [filePath]
    );
    
    return result.length > 0 && result[0].values.length > 0;
  }

  /**
   * 获取文件索引信息
   */
  getFileIndex(filePath: string): FileIndexRecord | null {
    if (!this.db) return null;
    
    const result = this.db.exec(
      'SELECT * FROM files WHERE filePath = ?',
      [filePath]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    return {
      filePath: row[0] as string,
      fileName: row[1] as string,
      fileExtension: row[2] as string,
      fileSize: row[3] as number,
      language: row[4] as string,
      indexedAt: row[5] as number,
    };
  }

  /**
   * 添加文件索引
   */
  addFileIndex(record: FileIndexRecord): void {
    if (!this.db) return;
    
    this.db.run(
      `INSERT OR REPLACE INTO files (filePath, fileName, fileExtension, fileSize, language, indexedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.filePath, record.fileName, record.fileExtension, record.fileSize, record.language, record.indexedAt]
    );
    
    this.saveDatabase();
  }

  /**
   * 删除文件索引
   */
  deleteFileIndex(filePath: string): void {
    if (!this.db) return;
    
    // 删除文件记录
    this.db.run('DELETE FROM files WHERE filePath = ?', [filePath]);
    
    // 删除相关的父块
    this.db.run('DELETE FROM parents WHERE filePath = ?', [filePath]);
    
    this.saveDatabase();
    
    // 删除相关的子块向量（需要先获取 parentIds）
    this.deleteChildrenByFilePath(filePath);
  }

  /**
   * 添加父块
   */
  addParent(record: ParentRecord): void {
    if (!this.db) return;
    
    this.db.run(
      `INSERT OR REPLACE INTO parents (parentId, filePath, content, chunkIndex, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [record.parentId, record.filePath, record.content, record.chunkIndex, record.createdAt]
    );
    
    this.saveDatabase();
  }

  /**
   * 批量添加父块
   */
  addParentsBatch(records: ParentRecord[]): void {
    if (!this.db || records.length === 0) return;
    
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO parents (parentId, filePath, content, chunkIndex, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    );
    
    for (const record of records) {
      stmt.run([record.parentId, record.filePath, record.content, record.chunkIndex, record.createdAt]);
    }
    
    stmt.free();
    this.saveDatabase();
  }

  /**
   * 获取父块
   */
  getParent(parentId: string): ParentRecord | null {
    if (!this.db) return null;
    
    const result = this.db.exec(
      'SELECT * FROM parents WHERE parentId = ?',
      [parentId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    return {
      parentId: row[0] as string,
      filePath: row[1] as string,
      content: row[2] as string,
      chunkIndex: row[3] as number,
      createdAt: row[4] as number,
    };
  }


  /**
   * 添加子块向量到 LanceDB
   */
  async addChildren(records: ChildRecord[]): Promise<void> {
    if (!this.lanceDb || records.length === 0) return;
    
    try {
      // 转换为 LanceDB 格式
      const data = records.map(r => ({
        childId: r.childId,
        parentId: r.parentId,
        content: r.content,
        vector: r.vector,
        chunkIndex: r.chunkIndex,
      }));
      
      if (!this.childrenTable) {
        // 创建表
        this.childrenTable = await this.lanceDb.createTable('children', data);
      } else {
        // 添加数据
        await this.childrenTable.add(data);
      }
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 添加子块失败:', error);
      throw error;
    }
  }

  /**
   * 删除文件相关的子块
   */
  private async deleteChildrenByFilePath(filePath: string): Promise<void> {
    if (!this.db || !this.childrenTable) return;
    
    try {
      // 获取该文件的所有 parentIds
      const result = this.db.exec(
        'SELECT parentId FROM parents WHERE filePath = ?',
        [filePath]
      );
      
      if (result.length === 0 || result[0].values.length === 0) return;
      
      const parentIds = result[0].values.map(row => row[0] as string);
      
      // 从 LanceDB 删除
      for (const parentId of parentIds) {
        await this.childrenTable.delete(`parentId = '${parentId}'`);
      }
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 删除子块失败:', error);
    }
  }

  /**
   * 向量搜索
   */
  async search(queryVector: number[], topK: number = 10): Promise<SearchResult[]> {
    if (!this.childrenTable || !this.db) return [];
    
    try {
      // 在 LanceDB 中搜索
      const results = await this.childrenTable
        .vectorSearch(queryVector)
        .limit(topK)
        .toArray();
      
      // 获取父块内容
      const searchResults: SearchResult[] = [];
      
      for (const result of results) {
        const parent = this.getParent(result.parentId);
        if (parent) {
          searchResults.push({
            parentId: result.parentId,
            parentContent: parent.content,
            childContent: result.content,
            filePath: parent.filePath,
            score: result._distance ?? 0,
          });
        }
      }
      
      return searchResults;
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 搜索失败:', error);
      return [];
    }
  }

  /**
   * 获取索引统计信息
   */
  getStats(): { totalFiles: number; totalParents: number; totalChildren: number } {
    if (!this.db) {
      return { totalFiles: 0, totalParents: 0, totalChildren: 0 };
    }
    
    const filesResult = this.db.exec('SELECT COUNT(*) FROM files');
    const parentsResult = this.db.exec('SELECT COUNT(*) FROM parents');
    
    return {
      totalFiles: filesResult[0]?.values[0]?.[0] as number ?? 0,
      totalParents: parentsResult[0]?.values[0]?.[0] as number ?? 0,
      totalChildren: 0, // LanceDB 统计需要异步
    };
  }

  /**
   * 获取所有已索引文件
   */
  getAllIndexedFiles(): FileIndexRecord[] {
    if (!this.db) return [];
    
    const result = this.db.exec('SELECT * FROM files');
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      filePath: row[0] as string,
      fileName: row[1] as string,
      fileExtension: row[2] as string,
      fileSize: row[3] as number,
      language: row[4] as string,
      indexedAt: row[5] as number,
    }));
  }

  /**
   * 获取已索引文件的路径和时间戳映射
   * 用于增量索引时快速查找
   */
  getIndexedFilesMap(): Map<string, number> {
    if (!this.db) return new Map();
    
    const result = this.db.exec('SELECT filePath, indexedAt FROM files');
    
    if (result.length === 0) return new Map();
    
    const map = new Map<string, number>();
    for (const row of result[0].values) {
      map.set(row[0] as string, row[1] as number);
    }
    return map;
  }

  /**
   * 删除文件的所有索引数据（用于重新索引）
   */
  async deleteFileData(filePath: string): Promise<void> {
    if (!this.db) return;
    
    try {
      // 先获取该文件的所有 parentIds（用于删除 LanceDB 中的子块）
      const result = this.db.exec(
        'SELECT parentId FROM parents WHERE filePath = ?',
        [filePath]
      );
      
      const parentIds = result.length > 0 ? result[0].values.map(row => row[0] as string) : [];
      
      // 删除 SQLite 中的记录
      this.db.run('DELETE FROM files WHERE filePath = ?', [filePath]);
      this.db.run('DELETE FROM parents WHERE filePath = ?', [filePath]);
      this.saveDatabase();
      
      // 删除 LanceDB 中的子块
      if (this.childrenTable && parentIds.length > 0) {
        for (const parentId of parentIds) {
          try {
            await this.childrenTable.delete(`parentId = '${parentId}'`);
          } catch (e) {
            // 忽略删除错误
          }
        }
      }
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 删除文件数据失败:', error);
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM files');
      this.db.run('DELETE FROM parents');
      this.saveDatabase();
    }
    
    if (this.lanceDb && this.childrenTable) {
      try {
        await this.lanceDb.dropTable('children');
        this.childrenTable = null;
      } catch (error) {
        console.warn('[WorkspaceIndexDatabase] 清空 LanceDB 表失败:', error);
      }
    }
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.db) {
      this.saveDatabase();
      this.db.close();
      this.db = null;
    }
    
    this.lanceDb = null;
    this.childrenTable = null;
    this.isInitialized = false;
    
    console.log('[WorkspaceIndexDatabase] 数据库已关闭');
  }
}

export const workspaceIndexDatabase = WorkspaceIndexDatabase.getInstance();
