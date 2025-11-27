/**
 * 知识库服务模块
 * 功能：提供知识库数据管理和文件操作服务
 * 描述：负责文件读取、解析、存储等核心业务逻辑
 */

import { KnowledgeItem, KnowledgeGroupType, KnowledgeFileType, KnowledgeItemType, KnowledgeItemMetadata } from './types';

import { electronStore } from '../../../../services/ElectronStoreService';

/**
 * 知识库服务类
 */
class KnowledgeBaseService {
  private storageKey = 'knowledge-base';

  /**
   * 读取文件内容
   */
  async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = (e) => {
        reject(new Error('文件读取失败'));
      };
      reader.readAsText(file);
    });
  }

  /**
   * 将图片文件转换为 Base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(result);
      };
      reader.onerror = () => {
        reject(new Error('图片读取失败'));
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 检查文件是否为支持的类型
   */
  isAllowedFileType(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext === 'txt' || ext === 'md' || ext === 'markdown';
  }

  /**
   * 获取文件类型
   */
  getFileType(filename: string): KnowledgeFileType {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') {
      return 'markdown';
    }
    return 'txt';
  }

  /**
   * 计算字数（简单实现，可扩展）
   */
  countWords(content: string): number {
    // 移除空白字符后计算长度
    return content.replace(/\s+/g, '').length;
  }

  /**
   * 解析文件并创建知识库
   */
  async parseFile(file: File, group: KnowledgeGroupType): Promise<KnowledgeItem> {
    // 验证文件类型
    if (!this.isAllowedFileType(file.name)) {
      throw new Error(`不支持的文件类型: ${file.name}`);
    }
    
    const content = await this.readFile(file);
    const fileType = this.getFileType(file.name);
    const wordCount = this.countWords(content);

    const item: KnowledgeItem = {
      id: this.generateId(),
      title: file.name,
      type: 'file',
      group,
      path: file.name, // 在实际应用中，这里应该是完整的文件路径
      metadata: {
        wordCount,
        fileSize: file.size,
        fileType,
        lastModified: new Date(file.lastModified),
      },
    };

    return item;
  }

  /**
   * 生成唯一ID
   */
  generateId(): string {
    return `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 从本地存储加载知识库数据
   */
  async loadFromStorage(): Promise<{ created: KnowledgeItem[] }> {
    try {
      const data = await electronStore.get('knowledge-base');
      if (data && 'spaces' in data && data.spaces) {
        // 转换 electron-store 格式到内部格式
        // 需要将 name 字段转换回 title 字段，并恢复所有元数据
        const spaces = data.spaces as Array<{
          id: string;
          name: string;
          type: string;
          createdAt: number;
          updatedAt: number;
          cover?: string;
          description?: string;
          metadata?: unknown;
          children?: unknown[];
          documents?: unknown[];
        }>;
        
        const created: KnowledgeItem[] = spaces.map(space => ({
          id: space.id,
          title: space.name, // 将 name 转换为 title
          type: 'folder' as const,
          group: 'created' as const,
          children: this.deserializeChildren(space.children || []), // 递归反序列化子项
          metadata: this.deserializeMetadata(space.metadata, {
            cover: space.cover,
            description: space.description,
            createdAt: new Date(space.createdAt),
          }),
        }));
        
        return { created };
      }
    } catch (error) {
      console.error('Failed to load knowledge base from storage:', error);
    }
    return { created: [] };
  }

  /**
   * 递归反序列化子项（包括 metadata）
   */
  private deserializeChildren(children: unknown[]): KnowledgeItem[] {
    return (children as Array<{
      id: string;
      title: string;
      type: string;
      group: string;
      path?: string;
      metadata?: unknown;
      children?: unknown[];
    }>).map(child => ({
      id: child.id,
      title: child.title,
      type: child.type as KnowledgeItemType,
      group: child.group as KnowledgeGroupType,
      path: child.path,
      metadata: this.deserializeMetadata(child.metadata),
      children: child.children ? this.deserializeChildren(child.children) : undefined,
    }));
  }

  /**
   * 反序列化 metadata（将时间戳转换为 Date 对象）
   */
  private deserializeMetadata(
    storedMetadata: unknown,
    fallbackMetadata?: Partial<KnowledgeItemMetadata>
  ): KnowledgeItemMetadata | undefined {
    if (!storedMetadata && !fallbackMetadata) {
      return undefined;
    }

    const metadata = (storedMetadata as Record<string, unknown>) || {};
    const result: KnowledgeItemMetadata = {
      ...fallbackMetadata,
      ...metadata,
    };

    // 将时间戳转换为 Date 对象
    if (result.createdAt && typeof result.createdAt === 'number') {
      result.createdAt = new Date(result.createdAt);
    }
    if (result.lastModified && typeof result.lastModified === 'number') {
      result.lastModified = new Date(result.lastModified);
    }

    return result;
  }

  /**
   * 保存知识库数据到本地存储
   */
  async saveToStorage(data: { created: KnowledgeItem[] }): Promise<void> {
    try {
      // 转换内部格式为 electron-store 格式
      // 注意：这里的 type 应该是知识库类型（'local' | 'cloud'），不是 item 类型（'file' | 'folder'）
      const storeData = {
        spaces: data.created.map(item => ({
          id: item.id,
          name: item.title, // title 转换为 name
          type: 'local' as const, // 默认所有知识库都是本地
          createdAt: item.metadata?.createdAt ? new Date(item.metadata.createdAt).getTime() : Date.now(),
          updatedAt: Date.now(),
          cover: item.metadata?.cover, // 保存封面
          description: item.metadata?.description, // 保存描述
          // 保存完整的 metadata（包括 chunkSettings、embeddingModel 等）
          metadata: item.metadata ? {
            ...item.metadata,
            // 将 Date 对象转换为时间戳
            createdAt: item.metadata.createdAt ? (item.metadata.createdAt instanceof Date ? item.metadata.createdAt.getTime() : item.metadata.createdAt) : undefined,
            lastModified: item.metadata.lastModified ? (item.metadata.lastModified instanceof Date ? item.metadata.lastModified.getTime() : item.metadata.lastModified) : undefined,
          } : undefined,
          children: this.serializeChildren(item.children || []), // 递归序列化子项
          documents: [] // 可以根据需要添加文档数据
        })),
        settings: {
          autoSync: false
        }
      };
      await electronStore.set('knowledge-base', storeData);
    } catch (error) {
      console.error('Failed to save knowledge base to storage:', error);
    }
  }

  /**
   * 递归序列化子项（包括 metadata）
   */
  private serializeChildren(children: KnowledgeItem[]): unknown[] {
    return children.map(child => ({
      id: child.id,
      title: child.title,
      type: child.type,
      group: child.group,
      path: child.path,
      metadata: child.metadata ? {
        ...child.metadata,
        // 将 Date 对象转换为时间戳
        createdAt: child.metadata.createdAt ? (child.metadata.createdAt instanceof Date ? child.metadata.createdAt.getTime() : child.metadata.createdAt) : undefined,
        lastModified: child.metadata.lastModified ? (child.metadata.lastModified instanceof Date ? child.metadata.lastModified.getTime() : child.metadata.lastModified) : undefined,
      } : undefined,
      children: child.children ? this.serializeChildren(child.children) : undefined,
    }));
  }

  /**
   * 添加知识库项
   */
  async addItem(item: KnowledgeItem): Promise<void> {
    const data = await this.loadFromStorage();
    data.created.push(item);
    await this.saveToStorage(data);
  }

  /**
   * 删除知识库项
   */
  async removeItem(itemId: string): Promise<void> {
    const data = await this.loadFromStorage();
    data.created = this.removeItemRecursive(data.created, itemId);
    await this.saveToStorage(data);
  }

  /**
   * 删除知识库（removeItem 的别名，更语义化）
   */
  async deleteKnowledgeBase(itemId: string): Promise<void> {
    await this.removeItem(itemId);
  }

  /**
   * 更新知识库项
   */
  async updateKnowledgeBase(itemId: string, updates: Partial<KnowledgeItem>): Promise<void> {
    const data = await this.loadFromStorage();
    data.created = this.updateItemRecursive(data.created, itemId, updates);
    await this.saveToStorage(data);
  }

  /**
   * 递归更新
   */
  private updateItemRecursive(
    items: KnowledgeItem[],
    itemId: string,
    updates: Partial<KnowledgeItem>
  ): KnowledgeItem[] {
    return items.map((item) => {
      if (item.id === itemId) {
        // 过滤掉 undefined 值，避免覆盖现有值
        const filteredUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, value]) => value !== undefined)
        ) as Partial<KnowledgeItem>;
        
        // 过滤 metadata 中的 undefined 值
        const filteredMetadata = updates.metadata
          ? Object.fromEntries(
              Object.entries(updates.metadata).filter(([_, value]) => value !== undefined)
            )
          : {};
        
        return {
          ...item,
          ...filteredUpdates,
          metadata: {
            ...item.metadata,
            ...filteredMetadata,
          },
        };
      }
      if (item.children) {
        return {
          ...item,
          children: this.updateItemRecursive(item.children, itemId, updates),
        };
      }
      return item;
    });
  }

  /**
   * 递归删除
   */
  private removeItemRecursive(items: KnowledgeItem[], itemId: string): KnowledgeItem[] {
    return items.filter((item) => {
      if (item.id === itemId) {
        return false;
      }
      if (item.children) {
        item.children = this.removeItemRecursive(item.children, itemId);
      }
      return true;
    });
  }

  /**
   * 查找知识库项
   */
  async findItem(itemId: string): Promise<KnowledgeItem | null> {
    const data = await this.loadFromStorage();
    return this.findItemRecursive(data.created, itemId);
  }

  /**
   * 递归查找
   */
  private findItemRecursive(items: KnowledgeItem[], itemId: string): KnowledgeItem | null {
    for (const item of items) {
      if (item.id === itemId) {
        return item;
      }
      if (item.children) {
        const found = this.findItemRecursive(item.children, itemId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * 获取指定知识库中所有文件的文件名（用于检查重复）
   */
  async getExistingFileNames(knowledgeBaseId: string): Promise<Set<string>> {
    const knowledgeBase = await this.findItem(knowledgeBaseId);
    if (!knowledgeBase || !knowledgeBase.children) {
      return new Set();
    }
    
    const fileNames = new Set<string>();
    const collectFileNames = (items: KnowledgeItem[]) => {
      items.forEach(item => {
        if (item.type === 'file') {
          fileNames.add(item.title);
        }
        if (item.children) {
          collectFileNames(item.children);
        }
      });
    };
    
    collectFileNames(knowledgeBase.children);
    return fileNames;
  }

  /**
   * 添加文件到指定知识库
   * @param knowledgeBaseId 知识库ID
   * @param filePath 文件的完整路径（如果提供 content，则此路径仅用于标识，不会读取文件系统）
   * @param fileName 文件名
   * @param folderPath 可选：文件夹路径（相对于知识库根目录）
   * @param content 可选：文件内容（如果提供，则不会从文件系统读取，实现知识库与资源管理器隔离）
   * @returns 返回添加的文件项
   */
  async addFileToKnowledgeBase(
    knowledgeBaseId: string, 
    filePath: string, 
    fileName: string, 
    folderPath?: string,
    content?: string
  ): Promise<KnowledgeItem> {
    const data = await this.loadFromStorage();
    
    // 根据文件扩展名确定文件类型
    const ext = fileName.split('.').pop()?.toLowerCase();
    const fileType: KnowledgeFileType = (ext === 'md' || ext === 'markdown') ? 'markdown' : 'txt';
    
    // 创建新的知识库项
    const newItem: KnowledgeItem = {
      id: this.generateId(),
      title: fileName,
      type: 'file',
      group: 'created',
      path: filePath, // 如果提供 content，此路径仅用于标识
      metadata: {
        fileType,
        lastModified: new Date(),
        fileSize: content ? new Blob([content]).size : undefined,
        wordCount: content ? this.countWords(content) : undefined,
        content: content, // 存储文件内容，实现知识库与资源管理器隔离
      },
    };
    
    // 递归查找知识库并添加文件（如果有文件夹路径，则创建文件夹层级）
    if (folderPath) {
      data.created = this.addFileWithFolderRecursive(data.created, knowledgeBaseId, newItem, folderPath);
    } else {
      data.created = this.addFileRecursive(data.created, knowledgeBaseId, newItem);
    }
    await this.saveToStorage(data);
    
    return newItem;
  }

  /**
   * 递归添加文件到知识库
   */
  private addFileRecursive(items: KnowledgeItem[], knowledgeBaseId: string, newItem: KnowledgeItem): KnowledgeItem[] {
    return items.map((item) => {
      if (item.id === knowledgeBaseId) {
        // 找到目标知识库，添加文件到 children
        return {
          ...item,
          children: [...(item.children || []), newItem],
        };
      }
      if (item.children) {
        return {
          ...item,
          children: this.addFileRecursive(item.children, knowledgeBaseId, newItem),
        };
      }
      return item;
    });
  }

  /**
   * 递归添加文件到知识库（支持文件夹层级）
   */
  private addFileWithFolderRecursive(
    items: KnowledgeItem[],
    knowledgeBaseId: string,
    newItem: KnowledgeItem,
    folderPath: string
  ): KnowledgeItem[] {
    return items.map((item) => {
      if (item.id === knowledgeBaseId) {
        // 找到目标知识库，创建或查找文件夹层级
        const updatedChildren = this.ensureFolderPath(item.children || [], folderPath, newItem);
        return {
          ...item,
          children: updatedChildren,
        };
      }
      if (item.children) {
        return {
          ...item,
          children: this.addFileWithFolderRecursive(item.children, knowledgeBaseId, newItem, folderPath),
        };
      }
      return item;
    });
  }

  /**
   * 确保文件夹路径存在，并将文件添加到正确的位置
   * @param children 当前层级的子项
   * @param folderPath 文件夹路径（如 "folder1/folder2"）
   * @param fileItem 要添加的文件项
   */
  private ensureFolderPath(children: KnowledgeItem[], folderPath: string, fileItem: KnowledgeItem): KnowledgeItem[] {
    const parts = folderPath.split('/').filter(p => p);
    
    if (parts.length === 0) {
      // 没有文件夹路径，直接添加到当前层级
      return [...children, fileItem];
    }
    
    const [firstPart, ...restParts] = parts;
    const restPath = restParts.join('/');
    
    // 查找或创建第一层文件夹
    const existingFolderIndex = children.findIndex(
      child => child.type === 'folder' && child.title === firstPart
    );
    
    if (existingFolderIndex >= 0) {
      // 文件夹已存在，递归处理子层级
      const updatedChildren = [...children];
      const existingFolder = updatedChildren[existingFolderIndex];
      
      if (restPath) {
        // 还有更深的层级
        updatedChildren[existingFolderIndex] = {
          ...existingFolder,
          children: this.ensureFolderPath(existingFolder.children || [], restPath, fileItem),
        };
      } else {
        // 这是最后一层，添加文件
        updatedChildren[existingFolderIndex] = {
          ...existingFolder,
          children: [...(existingFolder.children || []), fileItem],
        };
      }
      
      return updatedChildren;
    } else {
      // 文件夹不存在，创建新文件夹
      const newFolder: KnowledgeItem = {
        id: this.generateId(),
        title: firstPart,
        type: 'folder',
        group: 'created',
        children: restPath
          ? this.ensureFolderPath([], restPath, fileItem)
          : [fileItem],
      };
      
      return [...children, newFolder];
    }
  }

  /**
   * 搜索知识库项
   */
  async searchItems(query: string): Promise<KnowledgeItem[]> {
    if (!query.trim()) {
      return [];
    }

    const data = await this.loadFromStorage();
    const results: KnowledgeItem[] = [];

    this.searchRecursive(data.created, query.toLowerCase(), results);
    
    return results;
  }

  /**
   * 递归搜索
   */
  private searchRecursive(items: KnowledgeItem[], query: string, results: KnowledgeItem[]): void {
    items.forEach((item) => {
      if (item.title.toLowerCase().includes(query)) {
        results.push(item);
      }
      if (item.children) {
        this.searchRecursive(item.children, query, results);
      }
    });
  }

  /**
   * 清空知识库
   */
  async clear(): Promise<void> {
    await electronStore.delete('knowledge-base');
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ totalItems: number; totalWordCount: number; totalSize: number }> {
    const data = await this.loadFromStorage();
    
    let totalItems = 0;
    let totalWordCount = 0;
    let totalSize = 0;

    const countRecursive = (items: KnowledgeItem[]) => {
      items.forEach((item) => {
        totalItems++;
        if (item.metadata) {
          totalWordCount += item.metadata.wordCount || 0;
          totalSize += item.metadata.fileSize || 0;
        }
        if (item.children) {
          countRecursive(item.children);
        }
      });
    };

    countRecursive(data.created);

    return { totalItems, totalWordCount, totalSize };
  }

  /**
   * 更新文件处理状态
   * @param filePath 文件的完整路径
   * @param status 处理状态
   * @param progress 处理进度（0-100）
   */
  async updateFileProcessingStatus(
    filePathOrId: string,
    status: 'pending' | 'processing' | 'completed' | 'error',
    progress: number
  ): Promise<void> {
    const data = await this.loadFromStorage();
    
    // 递归查找并更新文件（支持通过路径或ID查找）
    const updateFileRecursive = (items: KnowledgeItem[]): KnowledgeItem[] => {
      return items.map((item) => {
        // 支持通过路径或ID查找
        const isMatch = item.type === 'file' && (
          item.path === filePathOrId || item.id === filePathOrId
        );
        
        if (isMatch) {
          // 找到目标文件，更新处理状态
          return {
            ...item,
            metadata: {
              ...item.metadata,
              processingStatus: status,
              processingProgress: progress,
            },
          };
        }
        if (item.children) {
          return {
            ...item,
            children: updateFileRecursive(item.children),
          };
        }
        return item;
      });
    };

    data.created = updateFileRecursive(data.created);
    await this.saveToStorage(data);
  }
}

// 导出单例
export const knowledgeBaseService = new KnowledgeBaseService();

