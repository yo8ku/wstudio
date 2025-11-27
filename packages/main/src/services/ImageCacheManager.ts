/**
 * ImageCacheManager - 图片缓存管理器
 * 负责背景图片的缓存管理，包括 MD5 哈希计算、缓存文件操作、缓存失效检查等
 */

import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * 缓存元数据接口
 */
interface CacheMetadata {
  originalPath: string;
  md5: string;
  mtime: number; // 原文件修改时间（毫秒时间戳）
  cachedAt: number; // 缓存时间（毫秒时间戳）
}

/**
 * 缓存索引接口
 */
interface CacheIndex {
  [originalPath: string]: CacheMetadata;
}

/**
 * 图片缓存管理器
 */
export class ImageCacheManager {
  private static instance: ImageCacheManager;
  private cacheDir: string;
  private indexFile: string;
  private cacheIndex: CacheIndex = {};
  private indexLoaded: boolean = false;
  private saveIndexChain: Promise<void> = Promise.resolve();

  private constructor() {
    const userDataPath = app.getPath('userData');
    this.cacheDir = path.join(userDataPath, 'cache', 'background');
    this.indexFile = path.join(this.cacheDir, 'cache-index.json');
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ImageCacheManager {
    if (!ImageCacheManager.instance) {
      ImageCacheManager.instance = new ImageCacheManager();
    }
    return ImageCacheManager.instance;
  }

  /**
   * 初始化缓存目录和索引
   */
  public async initialize(): Promise<void> {
    try {
      // 确保缓存目录存在
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // 加载缓存索引
      await this.loadIndex();
      
      // 验证并清理无效缓存（异步执行，不阻塞启动）
      this.validateAndCleanCache().catch((error) => {
        console.error('[ImageCacheManager] 验证缓存失败:', error);
      });
      
      console.log('[ImageCacheManager] 初始化完成，缓存目录:', this.cacheDir);
    } catch (error) {
      console.error('[ImageCacheManager] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 验证并清理无效缓存
   * 只删除索引中记录但原文件不存在或已修改的缓存
   * 保留所有有效的缓存文件
   */
  private async validateAndCleanCache(): Promise<void> {
    try {
      const entries = Object.entries(this.cacheIndex);
      if (entries.length === 0) {
        console.log('[ImageCacheManager] 缓存索引为空，跳过验证');
        return;
      }

      console.log(`[ImageCacheManager] 开始验证 ${entries.length} 个缓存条目...`);
      let validCount = 0;
      let invalidCount = 0;
      const invalidPaths: string[] = [];

      // 验证每个缓存条目
      for (const [originalPath, metadata] of entries) {
        const isValid = await this.isCacheValid(originalPath, metadata);
        if (isValid) {
          validCount++;
        } else {
          invalidCount++;
          invalidPaths.push(originalPath);
          
          // 删除无效的缓存记录
          delete this.cacheIndex[originalPath];
          
          // 尝试删除无效的缓存文件（不阻塞）
          const oldCacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
          fs.unlink(oldCacheFilePath).catch(() => {
            // 忽略删除失败的错误（文件可能已被删除）
          });
        }
      }

      // 如果有无效缓存，保存更新后的索引
      if (invalidCount > 0) {
        await this.saveIndex();
        console.log(`[ImageCacheManager] 清理了 ${invalidCount} 个无效缓存，保留了 ${validCount} 个有效缓存`);
      } else {
        console.log(`[ImageCacheManager] 所有 ${validCount} 个缓存都是有效的`);
      }
    } catch (error) {
      console.error('[ImageCacheManager] 验证缓存时发生错误:', error);
      // 不抛出错误，避免影响应用启动
    }
  }

  /**
   * 加载缓存索引
   */
  private async loadIndex(): Promise<void> {
    try {
      // 检查索引文件是否存在
      try {
        await fs.access(this.indexFile);
      } catch {
        // 索引文件不存在，使用空索引
        this.cacheIndex = {};
        this.indexLoaded = true;
        console.log('[ImageCacheManager] 缓存索引文件不存在，使用空索引');
        console.log('[ImageCacheManager] 缓存目录路径:', this.cacheDir);
        console.log('[ImageCacheManager] 索引文件路径:', this.indexFile);
        return;
      }

      // 读取索引文件
      const indexContent = await fs.readFile(this.indexFile, 'utf-8');
      
      // 检查文件是否为空
      if (!indexContent || indexContent.trim() === '') {
        console.warn('[ImageCacheManager] 缓存索引文件为空，使用空索引');
        this.cacheIndex = {};
        this.indexLoaded = true;
        return;
      }

      // 解析 JSON
      this.cacheIndex = JSON.parse(indexContent);
      this.indexLoaded = true;
      const entryCount = Object.keys(this.cacheIndex).length;
      console.log('[ImageCacheManager] 缓存索引加载成功，条目数:', entryCount);
      console.log('[ImageCacheManager] 缓存目录路径:', this.cacheDir);
      console.log('[ImageCacheManager] 索引文件路径:', this.indexFile);
      
      // 检查缓存目录中实际存在的文件数量
      try {
        const files = await fs.readdir(this.cacheDir);
        const cacheFiles = files.filter(f => f !== 'cache-index.json');
        console.log('[ImageCacheManager] 缓存目录中实际文件数:', cacheFiles.length);
        if (cacheFiles.length > 0 && entryCount === 0) {
          console.warn('[ImageCacheManager] 警告：缓存目录中有文件但索引为空，可能存在"孤儿"缓存文件');
        }
      } catch (error) {
        console.error('[ImageCacheManager] 读取缓存目录失败:', error);
      }
    } catch (error) {
      console.error('[ImageCacheManager] 加载缓存索引失败:', error);
      console.error('[ImageCacheManager] 错误详情:', error instanceof Error ? error.message : String(error));
      // 即使加载失败，也继续使用空索引，避免应用无法启动
      this.cacheIndex = {};
      this.indexLoaded = true;
    }
  }

  /**
   * 保存缓存索引
   */
  private async saveIndex(): Promise<void> {
    this.saveIndexChain = this.saveIndexChain.then(async () => {
      try {
        // 确保缓存目录存在
        await fs.mkdir(this.cacheDir, { recursive: true });
        
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const tempIndexFile = path.join(this.cacheDir, `cache-index-${uniqueSuffix}.json.tmp`);
        const indexContent = JSON.stringify(this.cacheIndex, null, 2);
        
        await fs.writeFile(tempIndexFile, indexContent, 'utf-8');
        // 删除旧索引，避免 Windows 重命名冲突
        await fs.rm(this.indexFile, { force: true });
        await fs.rename(tempIndexFile, this.indexFile);
        
        console.log('[ImageCacheManager] 缓存索引已保存，条目数:', Object.keys(this.cacheIndex).length);
      } catch (error) {
        console.error('[ImageCacheManager] 保存缓存索引失败:', error);
        console.error('[ImageCacheManager] 错误详情:', error instanceof Error ? error.message : String(error));
        console.error('[ImageCacheManager] 缓存目录路径:', this.cacheDir);
        console.error('[ImageCacheManager] 索引文件路径:', this.indexFile);
        // 不抛出错误，避免影响正常使用
      }
    });
    
    return this.saveIndexChain;
  }

  /**
   * 计算文件的 MD5 哈希值
   */
  private async calculateMD5(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = createHash('md5');
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      console.error('[ImageCacheManager] 计算 MD5 失败:', filePath, error);
      throw error;
    }
  }

  /**
   * 获取文件的修改时间（毫秒时间戳）
   */
  private async getFileMtime(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtimeMs;
    } catch (error) {
      console.error('[ImageCacheManager] 获取文件修改时间失败:', filePath, error);
      throw error;
    }
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(md5: string, originalPath: string): string {
    const ext = path.extname(originalPath).toLowerCase();
    return path.join(this.cacheDir, `${md5}${ext}`);
  }

  /**
   * 检查缓存是否有效
   */
  private async isCacheValid(originalPath: string, metadata: CacheMetadata): Promise<boolean> {
    try {
      // 检查缓存文件是否存在
      const cacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
      await fs.access(cacheFilePath);
      
      // 尝试检查原文件是否存在
      let sourceExists = true;
      try {
        await fs.access(originalPath);
      } catch {
        sourceExists = false;
      }
      
      if (sourceExists) {
        // 检查原文件修改时间是否变化
        const currentMtime = await this.getFileMtime(originalPath);
        if (currentMtime !== metadata.mtime) {
          console.log('[ImageCacheManager] 原文件已修改，缓存失效:', originalPath);
          return false;
        }
      } else {
        console.log('[ImageCacheManager] 原文件不存在，继续使用缓存:', originalPath);
      }
      
      return true;
    } catch (error) {
      console.log('[ImageCacheManager] 缓存无效:', originalPath, error);
      return false;
    }
  }

  /**
   * 将文件复制到缓存目录
   */
  private async copyToCache(originalPath: string, cacheFilePath: string): Promise<void> {
    try {
      await fs.copyFile(originalPath, cacheFilePath);
      console.log('[ImageCacheManager] 文件已缓存:', originalPath, '->', cacheFilePath);
    } catch (error) {
      console.error('[ImageCacheManager] 复制文件到缓存失败:', originalPath, error);
      throw error;
    }
  }

  /**
   * 获取图片的缓存路径（如果缓存存在且有效）
   * 如果缓存不存在或无效，则异步创建缓存并返回原始路径
   * 
   * @param originalPath 原始文件路径
   * @returns 缓存文件路径（如果缓存有效）或原始路径（如果缓存无效或不存在）
   */
  public async getCachedPath(originalPath: string): Promise<string> {
    // 确保索引已加载
    if (!this.indexLoaded) {
      await this.loadIndex();
    }

    try {
      // 检查索引中是否有该文件的缓存记录
      const metadata = this.cacheIndex[originalPath];
      
      if (metadata) {
        // 检查缓存是否有效
        const isValid = await this.isCacheValid(originalPath, metadata);
        
        if (isValid) {
          // 缓存有效，返回缓存路径
          const cacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
          return cacheFilePath;
        } else {
          // 缓存无效，删除旧缓存记录
          delete this.cacheIndex[originalPath];
          await this.saveIndex();
          
          // 尝试删除旧的缓存文件（不阻塞）
          const oldCacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
          fs.unlink(oldCacheFilePath).catch(() => {
            // 忽略删除失败的错误
          });
        }
      }
      
      // 缓存不存在或无效，异步创建缓存
      this.createCacheAsync(originalPath).catch((error) => {
        console.error('[ImageCacheManager] 异步创建缓存失败:', originalPath, error);
        // 不抛出错误，不影响正常使用
      });
      
      // 返回原始路径（首次加载时先使用原始路径）
      return originalPath;
    } catch (error) {
      console.error('[ImageCacheManager] 获取缓存路径失败:', originalPath, error);
      // 出错时返回原始路径
      return originalPath;
    }
  }

  /**
   * 异步创建缓存（不阻塞）
   */
  private async createCacheAsync(originalPath: string): Promise<void> {
    try {
      // 检查原文件是否存在
      await fs.access(originalPath);
      
      // 计算 MD5
      const md5 = await this.calculateMD5(originalPath);
      
      // 获取文件修改时间
      const mtime = await this.getFileMtime(originalPath);
      
      // 获取缓存文件路径
      const cacheFilePath = this.getCacheFilePath(md5, originalPath);
      
      // 检查缓存文件是否已存在（可能由其他进程创建）
      try {
        await fs.access(cacheFilePath);
        // 缓存文件已存在，直接更新索引
        console.log('[ImageCacheManager] 缓存文件已存在，更新索引:', originalPath);
      } catch {
        // 缓存文件不存在，复制文件
        await this.copyToCache(originalPath, cacheFilePath);
      }
      
      // 更新索引
      this.cacheIndex[originalPath] = {
        originalPath,
        md5,
        mtime,
        cachedAt: Date.now()
      };
      
      await this.saveIndex();
      
      console.log('[ImageCacheManager] 缓存创建成功:', originalPath);
    } catch (error) {
      console.error('[ImageCacheManager] 创建缓存失败:', originalPath, error);
      // 不抛出错误，避免影响正常使用
    }
  }

  /**
   * 强制缓存单个图片（同步方法，用于图片加载成功后触发）
   * 
   * @param originalPath 原始文件路径
   * @returns 缓存文件路径（如果缓存成功）或原始路径（如果缓存失败）
   */
  public async cacheImage(originalPath: string): Promise<string> {
    // 确保索引已加载
    if (!this.indexLoaded) {
      await this.loadIndex();
    }

    try {
      // 检查原文件是否存在
      await fs.access(originalPath);

      // 检查是否已有有效缓存
      const metadata = this.cacheIndex[originalPath];
      if (metadata) {
        const isValid = await this.isCacheValid(originalPath, metadata);
        if (isValid) {
          // 缓存有效，直接返回缓存路径
          const cacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
          console.log('[ImageCacheManager] 使用现有缓存:', originalPath);
          return cacheFilePath;
        } else {
          // 缓存无效，删除旧缓存记录
          delete this.cacheIndex[originalPath];
          const oldCacheFilePath = this.getCacheFilePath(metadata.md5, originalPath);
          try {
            await fs.unlink(oldCacheFilePath);
          } catch {
            // 忽略删除失败的错误
          }
        }
      }

      // 创建新缓存
      const md5 = await this.calculateMD5(originalPath);
      const mtime = await this.getFileMtime(originalPath);
      const cacheFilePath = this.getCacheFilePath(md5, originalPath);

      // 检查缓存文件是否已存在
      try {
        await fs.access(cacheFilePath);
        console.log('[ImageCacheManager] 缓存文件已存在，更新索引:', originalPath);
      } catch {
        // 缓存文件不存在，复制文件
        await this.copyToCache(originalPath, cacheFilePath);
      }

      // 更新索引
      this.cacheIndex[originalPath] = {
        originalPath,
        md5,
        mtime,
        cachedAt: Date.now()
      };
      await this.saveIndex();

      console.log('[ImageCacheManager] 图片缓存成功:', originalPath, '->', cacheFilePath);
      return cacheFilePath;
    } catch (error) {
      console.error('[ImageCacheManager] 缓存图片失败:', originalPath, error);
      // 出错时返回原始路径
      return originalPath;
    }
  }

  /**
   * 清理缓存（已禁用，背景图片缓存不应被清理）
   * 背景图片缓存应该永久保留，确保加载的图片始终只需要缓存一次
   */
  public async clearCache(): Promise<void> {
    console.warn('[ImageCacheManager] clearCache 方法已被禁用，背景图片缓存不应被清理');
    // 不执行任何清理操作，确保缓存文件永久保留
    return;
  }
}

