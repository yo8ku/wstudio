/**
 * 知识库服务模块
 * 功能：提供知识库数据管理和文件操作服务
 * 描述：负责文件读取、解析、存储等核心业务逻辑
 */

import { KnowledgeItem, KnowledgeGroupType, KnowledgeFileType } from './types';

/**
 * 知识库服务类
 */
class KnowledgeBaseService {
  private storageKey = 'note-studio-knowledge-base';

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
   * 解析文件并创建知识库项
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
  loadFromStorage(): { created: KnowledgeItem[] } {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load knowledge base from storage:', error);
    }
    return { created: [] };
  }

  /**
   * 保存知识库数据到本地存储
   */
  saveToStorage(data: { created: KnowledgeItem[] }): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save knowledge base to storage:', error);
    }
  }

  /**
   * 添加知识库项
   */
  addItem(item: KnowledgeItem): void {
    const data = this.loadFromStorage();
    data.created.push(item);
    this.saveToStorage(data);
  }

  /**
   * 删除知识库项
   */
  removeItem(itemId: string): void {
    const data = this.loadFromStorage();
    data.created = this.removeItemRecursive(data.created, itemId);
    this.saveToStorage(data);
  }

  /**
   * 删除知识库（removeItem 的别名，更语义化）
   */
  deleteKnowledgeBase(itemId: string): void {
    this.removeItem(itemId);
  }

  /**
   * 更新知识库项
   */
  updateKnowledgeBase(itemId: string, updates: Partial<KnowledgeItem>): void {
    const data = this.loadFromStorage();
    data.created = this.updateItemRecursive(data.created, itemId, updates);
    this.saveToStorage(data);
  }

  /**
   * 递归更新项
   */
  private updateItemRecursive(
    items: KnowledgeItem[],
    itemId: string,
    updates: Partial<KnowledgeItem>
  ): KnowledgeItem[] {
    return items.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          ...updates,
          metadata: {
            ...item.metadata,
            ...updates.metadata,
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
   * 递归删除项
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
  findItem(itemId: string): KnowledgeItem | null {
    const data = this.loadFromStorage();
    return this.findItemRecursive(data.created, itemId);
  }

  /**
   * 递归查找项
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
  getExistingFileNames(knowledgeBaseId: string): Set<string> {
    const knowledgeBase = this.findItem(knowledgeBaseId);
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
   * @param filePath 文件的完整路径
   * @param fileName 文件名
   * @param folderPath 可选：文件夹路径（相对于知识库根目录）
   */
  addFileToKnowledgeBase(knowledgeBaseId: string, filePath: string, fileName: string, folderPath?: string): void {
    const data = this.loadFromStorage();
    
    // 根据文件扩展名确定文件类型
    const ext = fileName.split('.').pop()?.toLowerCase();
    const fileType: KnowledgeFileType = (ext === 'md' || ext === 'markdown') ? 'markdown' : 'txt';
    
    // 创建新的知识库项
    const newItem: KnowledgeItem = {
      id: this.generateId(),
      title: fileName,
      type: 'file',
      group: 'created',
      path: filePath,
      metadata: {
        fileType,
        lastModified: new Date(),
      },
    };
    
    // 递归查找知识库并添加文件（如果有文件夹路径，则创建文件夹层级）
    if (folderPath) {
      data.created = this.addFileWithFolderRecursive(data.created, knowledgeBaseId, newItem, folderPath);
    } else {
      data.created = this.addFileRecursive(data.created, knowledgeBaseId, newItem);
    }
    this.saveToStorage(data);
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
  searchItems(query: string): KnowledgeItem[] {
    if (!query.trim()) {
      return [];
    }

    const data = this.loadFromStorage();
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
  clear(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalItems: number; totalWordCount: number; totalSize: number } {
    const data = this.loadFromStorage();
    
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
}

// 导出单例
export const knowledgeBaseService = new KnowledgeBaseService();

