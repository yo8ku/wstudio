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
  /** 标签JSON字符串，例如：'["#口播", "#美食", "#同城"]'，空时为 '[]' */
  tags: string;
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
    console.log(`[WorkspaceIndexDatabase] addChildren: lanceDb=${!!this.lanceDb}, records=${records.length}`);
    
    if (!this.lanceDb || records.length === 0) return;
    
    try {
      // 转换为 LanceDB 格式（tags 存储为 JSON 字符串）
      const data = records.map(r => ({
        childId: r.childId,
        parentId: r.parentId,
        content: r.content,
        vector: r.vector,
        chunkIndex: r.chunkIndex,
        tags: r.tags || '[]',
      }));
      
      if (!this.childrenTable) {
        // 创建表
        console.log('[WorkspaceIndexDatabase] 创建 children 表...');
        this.childrenTable = await this.lanceDb.createTable('children', data);
        console.log('[WorkspaceIndexDatabase] children 表创建成功');
      } else {
        // 添加数据
        console.log('[WorkspaceIndexDatabase] 向 children 表添加数据...');
        await this.childrenTable.add(data);
        console.log('[WorkspaceIndexDatabase] 数据添加成功');
      }
      
      // 验证数据是否添加成功
      const count = await this.childrenTable.countRows();
      console.log(`[WorkspaceIndexDatabase] children 表当前行数: ${count}`);
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
        await this.childrenTable.delete(`"parentId" = '${parentId}'`);
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
   * 获取所有子块数据（用于数据查看）
   */
  async getAllChildren(limit: number = 100): Promise<Array<{
    childId: string;
    parentId: string;
    content: string;
    chunkIndex: number;
    vectorDim: number;
    tags: string[];
  }>> {
    if (!this.childrenTable) return [];
    
    try {
      const results = await this.childrenTable
        .query()
        .limit(limit)
        .toArray();
      
      return results.map((r: Record<string, unknown>) => {
        let parsedTags: string[] = [];
        try {
          if (typeof r.tags === 'string') {
            parsedTags = JSON.parse(r.tags);
          }
        } catch {
          parsedTags = [];
        }
        return {
          childId: r.childId as string,
          parentId: r.parentId as string,
          content: r.content as string,
          chunkIndex: r.chunkIndex as number,
          vectorDim: Array.isArray(r.vector) ? r.vector.length : 0,
          tags: parsedTags,
        };
      });
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 获取子块数据失败:', error);
      return [];
    }
  }

  /**
   * 获取所有父块数据（用于数据查看）
   */
  getAllParents(): ParentRecord[] {
    if (!this.db) return [];
    
    const result = this.db.exec('SELECT * FROM parents ORDER BY createdAt DESC LIMIT 100');
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      parentId: row[0] as string,
      filePath: row[1] as string,
      content: row[2] as string,
      chunkIndex: row[3] as number,
      createdAt: row[4] as number,
    }));
  }

  /**
   * 获取指定文件的父块数据
   */
  getParentsByFilePath(filePath: string): ParentRecord[] {
    if (!this.db) return [];
    
    const result = this.db.exec(
      'SELECT * FROM parents WHERE filePath = ? ORDER BY chunkIndex ASC',
      [filePath]
    );
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      parentId: row[0] as string,
      filePath: row[1] as string,
      content: row[2] as string,
      chunkIndex: row[3] as number,
      createdAt: row[4] as number,
    }));
  }

  /**
   * 获取指定文件的子块数据
   */
  async getChildrenByFilePath(filePath: string): Promise<Array<{
    childId: string;
    parentId: string;
    content: string;
    chunkIndex: number;
    vectorDim: number;
    parentChunkIndex: number;
    tags: string[];
  }>> {
    console.log(`[WorkspaceIndexDatabase] getChildrenByFilePath: db=${!!this.db}, childrenTable=${!!this.childrenTable}`);
    
    if (!this.db) {
      console.log('[WorkspaceIndexDatabase] getChildrenByFilePath: db 为空');
      return [];
    }
    
    // 如果 childrenTable 为空，尝试重新打开
    if (!this.childrenTable && this.lanceDb) {
      try {
        const tableNames = await this.lanceDb.tableNames();
        console.log(`[WorkspaceIndexDatabase] LanceDB 表列表: ${tableNames.join(', ')}`);
        if (tableNames.includes('children')) {
          this.childrenTable = await this.lanceDb.openTable('children');
          console.log('[WorkspaceIndexDatabase] 成功打开 children 表');
        } else {
          console.log('[WorkspaceIndexDatabase] children 表不存在');
          return [];
        }
      } catch (e) {
        console.error('[WorkspaceIndexDatabase] 打开 children 表失败:', e);
        return [];
      }
    }
    
    if (!this.childrenTable) {
      console.log('[WorkspaceIndexDatabase] childrenTable 仍为空');
      return [];
    }
    
    try {
      // 先获取该文件的所有 parentIds
      const parentResult = this.db.exec(
        'SELECT parentId, chunkIndex FROM parents WHERE filePath = ? ORDER BY chunkIndex ASC',
        [filePath]
      );
      
      console.log(`[WorkspaceIndexDatabase] getChildrenByFilePath: 找到 ${parentResult[0]?.values?.length || 0} 个父块`);
      
      if (parentResult.length === 0 || parentResult[0].values.length === 0) return [];
      
      const parentMap = new Map<string, number>();
      for (const row of parentResult[0].values) {
        parentMap.set(row[0] as string, row[1] as number);
      }
      
      const parentIds = Array.from(parentMap.keys());
      
      // 从 LanceDB 获取子块
      const allChildren: Array<{
        childId: string;
        parentId: string;
        content: string;
        chunkIndex: number;
        vectorDim: number;
        parentChunkIndex: number;
        tags: string[];
      }> = [];
      
      // 先查询 LanceDB 中所有子块的 parentId，用于调试
      const allChildrenSample = await this.childrenTable.query().limit(5).toArray();
      console.log(`[WorkspaceIndexDatabase] LanceDB 子块样本 parentIds:`, allChildrenSample.map(c => c.parentId));
      console.log(`[WorkspaceIndexDatabase] SQLite 父块 parentIds:`, parentIds.slice(0, 5));
      
      for (const parentId of parentIds) {
        console.log(`[WorkspaceIndexDatabase] 查询子块: parentId=${parentId}`);
        
        // 尝试使用 filter 方式查询
        const allResults = await this.childrenTable.query().toArray();
        const results = allResults.filter(r => r.parentId === parentId);
        
        console.log(`[WorkspaceIndexDatabase] 查询结果: ${results.length} 个子块 (总数: ${allResults.length})`);
        
        for (const r of results) {
          let parsedTags: string[] = [];
          try {
            if (typeof r.tags === 'string') {
              parsedTags = JSON.parse(r.tags);
            }
          } catch {
            parsedTags = [];
          }
          allChildren.push({
            childId: r.childId as string,
            parentId: r.parentId as string,
            content: r.content as string,
            chunkIndex: r.chunkIndex as number,
            vectorDim: Array.isArray(r.vector) ? r.vector.length : 0,
            parentChunkIndex: parentMap.get(r.parentId as string) ?? 0,
            tags: parsedTags,
          });
        }
      }
      
      // 按父块索引和子块索引排序
      allChildren.sort((a, b) => {
        if (a.parentChunkIndex !== b.parentChunkIndex) {
          return a.parentChunkIndex - b.parentChunkIndex;
        }
        return a.chunkIndex - b.chunkIndex;
      });
      
      return allChildren;
    } catch (error) {
      console.error('[WorkspaceIndexDatabase] 获取文件子块数据失败:', error);
      return [];
    }
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
            await this.childrenTable.delete(`"parentId" = '${parentId}'`);
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
