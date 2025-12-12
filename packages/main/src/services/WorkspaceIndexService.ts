/**
 * 工作区索引服务
 * 扫描、解析和索引整个工作区/项目，建立可供快速搜索的数据库
 */

import initSqlJs, { Database } from 'sql.js';
import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

export interface IndexedFile {
  id?: number;
  filePath: string;
  fileName: string;
  fileExtension: string;
  fileSize: number;
  content: string;
  contentPreview: string; // 前500字符的预览
  language: string;
  createdAt: number;
  updatedAt: number;
  indexedAt: number;
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  fileExtension: string;
  contentPreview: string;
  language: string;
  score?: number; // 搜索相关性分数
  matches?: string[]; // 匹配的文本片段
}

export interface SearchOptions {
  query: string;
  fileExtension?: string;
  language?: string;
  limit?: number;
}

/**
 * 工作区索引服务
 */
export class WorkspaceIndexService {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private isIndexing: boolean = false;
  private indexingProgress: {
    totalFiles: number;
    processedFiles: number;
    currentFile?: string;
  } | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    // 数据库文件路径：用户数据目录/workspace-index.db
    this.dbPath = path.join(app.getPath('userData'), 'workspace-index.db');
  }

  /**
   * 设置主窗口（用于发送进度事件）
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 发送进度事件到渲染进程
   */
  private sendProgressEvent(progress: { totalFiles: number; processedFiles: number; currentFile?: string } | null): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log('[WorkspaceIndexService] 发送进度事件:', progress);
      this.mainWindow.webContents.send('workspace-index:progress', progress);
    } else {
      console.warn('[WorkspaceIndexService] 无法发送进度事件: 主窗口不可用', {
        hasWindow: !!this.mainWindow,
        isDestroyed: this.mainWindow?.isDestroyed()
      });
    }
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    try {
      // 初始化 sql.js
      this.SQL = await initSqlJs();

      // 检查数据库文件是否存在
      const dbExists = fs.existsSync(this.dbPath);

      if (dbExists) {
        // 加载现有数据库
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        // 创建新数据库
        this.db = new this.SQL.Database();
        await this.createTables();
        this.save();
      }

      // 创建索引提高查询性能
      await this.createIndexes();
      
      console.log('[WorkspaceIndexService] 数据库初始化成功');
    } catch (error) {
      console.error('[WorkspaceIndexService] 数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS indexed_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filePath TEXT NOT NULL UNIQUE,
        fileName TEXT NOT NULL,
        fileExtension TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        content TEXT NOT NULL,
        contentPreview TEXT NOT NULL,
        language TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        indexedAt INTEGER NOT NULL
      );
    `;

    this.db.run(createTableSQL);
  }

  /**
   * 创建索引提高查询性能
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 为文件路径创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_filePath ON indexed_files(filePath);`);
      
      // 为文件扩展名创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_fileExtension ON indexed_files(fileExtension);`);
      
      // 为语言类型创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_language ON indexed_files(language);`);
      
      this.save();
    } catch (error) {
      console.error('[WorkspaceIndexService] 创建索引失败:', error);
    }
  }

  /**
   * 保存数据库到文件
   */
  private save(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('[WorkspaceIndexService] 保存数据库失败:', error);
    }
  }

  /**
   * 检查文件是否应该被索引
   */
  private shouldIndexFile(filePath: string): boolean {
    // 忽略隐藏文件和特殊目录
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.')) {
      return false;
    }

    // 忽略 node_modules 目录
    if (filePath.includes('node_modules')) {
      return false;
    }

    // 只索引支持的文件类型
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = ['.md', '.markdown', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.scss', '.html', '.xml', '.yaml', '.yml'];
    return supportedExtensions.includes(ext);
  }

  /**
   * 获取文件语言类型
   */
  private getFileLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    switch (ext) {
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.json':
        if (fileName === 'settings.json') {
          return 'jsonc';
        }
        if (filePath.includes('/themes/') || filePath.includes('\\themes\\')) {
          return 'jsonc';
        }
        return 'json';
      case '.txt':
        return 'plaintext';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.cpp':
      case '.c':
      case '.h':
      case '.hpp':
        return 'cpp';
      case '.css':
      case '.scss':
      case '.sass':
        return 'css';
      case '.html':
      case '.xml':
        return 'html';
      case '.yaml':
      case '.yml':
        return 'yaml';
      default:
        return 'plaintext';
    }
  }

  /**
   * 读取并解析文件内容
   */
  private async readAndParseFile(filePath: string): Promise<{ content: string; preview: string }> {
    try {
      const content = await fsPromises.readFile(filePath, 'utf-8');
      // 生成预览（前500字符）
      const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
      return { content, preview };
    } catch (error) {
      console.error(`[WorkspaceIndexService] 读取文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 索引单个文件
   */
  private async indexFile(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stats = await fsPromises.stat(filePath);
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      const language = this.getFileLanguage(filePath);
      const { content, preview } = await this.readAndParseFile(filePath);

      // 检查文件是否已存在
      const existing = this.db.exec(
        'SELECT id, updatedAt FROM indexed_files WHERE filePath = ?',
        [filePath]
      );

      const now = Date.now();

      if (existing.length > 0 && existing[0].values.length > 0) {
        // 更新现有记录（如果文件已修改）
        const existingUpdatedAt = existing[0].values[0][1] as number;
        if (stats.mtimeMs > existingUpdatedAt) {
          this.db.run(
            `UPDATE indexed_files SET 
              fileName = ?, 
              fileExtension = ?, 
              fileSize = ?, 
              content = ?, 
              contentPreview = ?, 
              language = ?, 
              updatedAt = ?, 
              indexedAt = ? 
            WHERE filePath = ?`,
            [fileName, fileExtension, stats.size, content, preview, language, stats.mtimeMs, now, filePath]
          );
        }
      } else {
        // 插入新记录
        this.db.run(
          `INSERT INTO indexed_files 
            (filePath, fileName, fileExtension, fileSize, content, contentPreview, language, createdAt, updatedAt, indexedAt) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [filePath, fileName, fileExtension, stats.size, content, preview, language, stats.birthtimeMs, stats.mtimeMs, now]
        );
      }

      this.save();
    } catch (error) {
      console.error(`[WorkspaceIndexService] 索引文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 递归扫描目录中的所有文件
   */
  private async scanDirectory(dirPath: string, files: string[] = []): Promise<string[]> {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 跳过隐藏目录和 node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await this.scanDirectory(fullPath, files);
          }
        } else if (entry.isFile()) {
          if (this.shouldIndexFile(fullPath)) {
            files.push(fullPath);
          }
        }
      }

      return files;
    } catch (error) {
      console.error(`[WorkspaceIndexService] 扫描目录失败: ${dirPath}`, error);
      return files;
    }
  }

  /**
   * 索引整个工作区
   */
  async indexWorkspace(workspacePath: string): Promise<{ totalFiles: number; indexedFiles: number; errors: string[] }> {
    if (this.isIndexing) {
      throw new Error('索引正在进行中，请等待完成');
    }

    if (!this.db) {
      await this.initialize();
    }

    this.isIndexing = true;
    const errors: string[] = [];
    let indexedFiles = 0;

    try {
      console.log(`[WorkspaceIndexService] 开始索引工作区: ${workspacePath}`);

      // 扫描所有文件
      const allFiles = await this.scanDirectory(workspacePath);
      const totalFiles = allFiles.length;

      this.indexingProgress = {
        totalFiles,
        processedFiles: 0
      };
      
      // 发送开始索引事件
      this.sendProgressEvent(this.indexingProgress);

      console.log(`[WorkspaceIndexService] 找到 ${totalFiles} 个文件需要索引`);

      // 依次索引每个文件
      for (const filePath of allFiles) {
        try {
          this.indexingProgress.currentFile = filePath;
          await this.indexFile(filePath);
          indexedFiles++;
          this.indexingProgress.processedFiles = indexedFiles;
          
          // 发送进度更新事件（每处理一个文件或每10个文件发送一次，避免过于频繁）
          if (indexedFiles % 10 === 0 || indexedFiles === totalFiles) {
            this.sendProgressEvent(this.indexingProgress);
          }

          // 每处理100个文件保存一次
          if (indexedFiles % 100 === 0) {
            console.log(`[WorkspaceIndexService] 已索引 ${indexedFiles}/${totalFiles} 个文件`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`${filePath}: ${errorMessage}`);
          console.error(`[WorkspaceIndexService] 索引文件失败: ${filePath}`, error);
        }
      }

      console.log(`[WorkspaceIndexService] 索引完成: 成功 ${indexedFiles} 个文件，失败 ${errors.length} 个文件`);

      return {
        totalFiles,
        indexedFiles,
        errors
      };
    } finally {
      this.isIndexing = false;
      this.indexingProgress = null;
      // 发送完成事件（null 表示索引完成）
      this.sendProgressEvent(null);
    }
  }

  /**
   * 获取索引进度
   */
  getIndexingProgress(): { totalFiles: number; processedFiles: number; currentFile?: string } | null {
    return this.indexingProgress;
  }

  /**
   * 检查是否正在索引
   */
  isIndexingInProgress(): boolean {
    return this.isIndexing;
  }

  /**
   * 搜索文件
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.db) throw new Error('Database not initialized');

    try {
      const { query, fileExtension, language, limit = 50 } = options;
      const searchQuery = `%${query}%`;

      let sql = `
        SELECT 
          filePath, 
          fileName, 
          fileExtension, 
          contentPreview, 
          language
        FROM indexed_files
        WHERE 
          (fileName LIKE ? OR content LIKE ? OR contentPreview LIKE ?)
      `;

      const params: any[] = [searchQuery, searchQuery, searchQuery];

      if (fileExtension) {
        sql += ' AND fileExtension = ?';
        params.push(fileExtension);
      }

      if (language) {
        sql += ' AND language = ?';
        params.push(language);
      }

      sql += ' ORDER BY updatedAt DESC LIMIT ?';
      params.push(limit);

      const result = this.db.exec(sql, params);

      if (result.length === 0) {
        return [];
      }

      const rows = result[0].values;
      const results: SearchResult[] = [];

      for (const row of rows) {
        const filePath = row[0] as string;
        const fileName = row[1] as string;
        const fileExtension = row[2] as string;
        const contentPreview = row[3] as string;
        const language = row[4] as string;

        // 查找匹配的文本片段
        const matches: string[] = [];
        const queryLower = query.toLowerCase();
        const previewLower = contentPreview.toLowerCase();
        
        if (previewLower.includes(queryLower)) {
          const index = previewLower.indexOf(queryLower);
          const start = Math.max(0, index - 50);
          const end = Math.min(contentPreview.length, index + query.length + 50);
          matches.push(contentPreview.substring(start, end));
        }

        results.push({
          filePath,
          fileName,
          fileExtension,
          contentPreview,
          language,
          matches: matches.length > 0 ? matches : undefined
        });
      }

      return results;
    } catch (error) {
      console.error('[WorkspaceIndexService] 搜索失败:', error);
      throw error;
    }
  }

  /**
   * 更新单个文件的索引
   */
  async updateFileIndex(filePath: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    if (this.shouldIndexFile(filePath)) {
      await this.indexFile(filePath);
    }
  }

  /**
   * 删除文件索引
   */
  async deleteFileIndex(filePath: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('DELETE FROM indexed_files WHERE filePath = ?', [filePath]);
      this.save();
    } catch (error) {
      console.error(`[WorkspaceIndexService] 删除文件索引失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 获取索引统计信息
   */
  async getIndexStats(): Promise<{ totalFiles: number; totalSize: number; languages: Record<string, number> }> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.db) throw new Error('Database not initialized');

    try {
      const totalResult = this.db.exec('SELECT COUNT(*) as count, SUM(fileSize) as totalSize FROM indexed_files');
      const totalFiles = totalResult[0]?.values[0]?.[0] as number || 0;
      const totalSize = totalResult[0]?.values[0]?.[1] as number || 0;

      const langResult = this.db.exec('SELECT language, COUNT(*) as count FROM indexed_files GROUP BY language');
      const languages: Record<string, number> = {};

      if (langResult.length > 0) {
        for (const row of langResult[0].values) {
          const lang = row[0] as string;
          const count = row[1] as number;
          languages[lang] = count;
        }
      }

      return {
        totalFiles,
        totalSize,
        languages
      };
    } catch (error) {
      console.error('[WorkspaceIndexService] 获取统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 清空索引
   */
  async clearIndex(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('DELETE FROM indexed_files');
      this.save();
      console.log('[WorkspaceIndexService] 索引已清空');
    } catch (error) {
      console.error('[WorkspaceIndexService] 清空索引失败:', error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

