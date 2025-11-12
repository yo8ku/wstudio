/**
 * 文件引用服务
 * 处理@引用的文件，支持持久化和临时存储
 */

// 使用动态导入来导入 ES 模块
type VectorStoreManagerType = typeof import('@note-studio/knowledge-base')['VectorStoreManager'];
type AddDocumentsOptionsType = import('@note-studio/knowledge-base').AddDocumentsOptions;

export interface FileReference {
  filePath: string;
  fileName: string;
  content: string;
  storeType: 'persistent' | 'temporary';
  sessionId?: string;
}

export class FileReferenceService {
  private vectorStoreManager: InstanceType<VectorStoreManagerType> | null = null;
  private VectorStoreManagerClass: VectorStoreManagerType | null = null;
  private sessionId: string;
  private initialized: boolean = false;
  private moduleLoaded: boolean = false;

  constructor(sessionId: string = 'default') {
    this.sessionId = sessionId;
  }

  /**
   * 动态加载 ES 模块
   */
  private async loadModule(): Promise<void> {
    if (this.moduleLoaded && this.VectorStoreManagerClass) {
      return;
    }

    const module = await import('@note-studio/knowledge-base');
    this.VectorStoreManagerClass = module.VectorStoreManager;
    this.moduleLoaded = true;
  }

  /**
   * 获取或创建 VectorStoreManager 实例
   */
  private async getVectorStoreManager(): Promise<InstanceType<VectorStoreManagerType>> {
    if (!this.vectorStoreManager) {
      await this.loadModule();
      if (!this.VectorStoreManagerClass) {
        throw new Error('Failed to load VectorStoreManager');
      }
      this.vectorStoreManager = new this.VectorStoreManagerClass();
      this.vectorStoreManager.setDefaultSessionId(this.sessionId);
    }
    return this.vectorStoreManager;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const manager = await this.getVectorStoreManager();
    await manager.initialize();
    this.initialized = true;
  }

  /**
   * 添加文件引用到向量存储
   */
  async addFileReference(
    filePath: string,
    content: string,
    storeType: 'persistent' | 'temporary' = 'temporary',
    options?: {
      modelName?: string;
      chunkSize?: number;
      chunkOverlap?: number;
      chunkStrategy?: string;
    }
  ): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const fileType = fileName.split('.').pop() || '';

    const manager = await this.getVectorStoreManager();
    const addOptions: AddDocumentsOptionsType = {
      storeType,
      sessionId: this.sessionId,
      modelName: options?.modelName,
      chunkSize: options?.chunkSize,
      chunkOverlap: options?.chunkOverlap,
      chunkStrategy: options?.chunkStrategy,
    };

    return manager.addFile(filePath, content, addOptions);
  }

  /**
   * 搜索文件引用
   */
  async searchFileReferences(
    query: string,
    options?: {
      topK?: number;
      storeTypes?: ('persistent' | 'temporary')[];
      modelName?: string;
      filterMetadata?: Record<string, unknown>;
    }
  ) {
    if (!this.initialized) {
      await this.initialize();
    }

    const manager = await this.getVectorStoreManager();
    return manager.search(query, {
      topK: options?.topK,
      storeTypes: options?.storeTypes,
      sessionId: this.sessionId,
      modelName: options?.modelName,
      filterMetadata: options?.filterMetadata,
    });
  }

  /**
   * 联合搜索（同时搜索持久化和临时存储）
   */
  async searchBoth(
    query: string,
    options?: {
      topK?: number;
      modelName?: string;
      filterMetadata?: Record<string, unknown>;
    }
  ) {
    if (!this.initialized) {
      await this.initialize();
    }

    const manager = await this.getVectorStoreManager();
    return manager.searchBoth(query, {
      topK: options?.topK,
      sessionId: this.sessionId,
      modelName: options?.modelName,
      filterMetadata: options?.filterMetadata,
    });
  }

  /**
   * 设置会话ID
   */
  async setSessionId(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    if (this.vectorStoreManager) {
      this.vectorStoreManager.setDefaultSessionId(sessionId);
    }
  }

  /**
   * 清空当前会话的临时存储
   */
  async clearTemporaryStore(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const manager = await this.getVectorStoreManager();
    await manager.clearTemporaryStore(this.sessionId);
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    if (this.vectorStoreManager) {
      await this.vectorStoreManager.close();
    }
    this.initialized = false;
  }
}






