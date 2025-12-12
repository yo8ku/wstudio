/**
 * 文件引用服务
 * 处理@引用的文件，使用持久化存储
 */

// 使用动态导入来导入 ES 模块
type VectorStoreManagerType = typeof import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } })['VectorStoreManager'];
type AddDocumentsOptionsType = import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } }).AddDocumentsOptions;

export interface FileReference {
  filePath: string;
  fileName: string;
  content: string;
}

export class FileReferenceService {
  private vectorStoreManager: InstanceType<VectorStoreManagerType> | null = null;
  private VectorStoreManagerClass: VectorStoreManagerType | null = null;
  private initialized: boolean = false;
  private moduleLoaded: boolean = false;

  constructor() {}

  /**
   * 动态加载 ES 模块
   * 使用 Function 构造函数确保动态导入不被 TypeScript 转换为 require()
   */
  private async loadModule(): Promise<void> {
    if (this.moduleLoaded && this.VectorStoreManagerClass) {
      return;
    }

    try {
      // 使用 Function 构造函数创建动态导入，避免被 TypeScript 转换为 require()
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const module = await dynamicImport('@note-studio/global-rag');
      this.VectorStoreManagerClass = module.VectorStoreManager;
      this.moduleLoaded = true;
    } catch (error) {
      console.error('[FileReferenceService] 加载模块失败:', error);
      // 重新抛出错误，让调用者处理
      throw new Error(`Failed to load @note-studio/global-rag: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    options?: {
      modelName?: string;
    }
  ): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const manager = await this.getVectorStoreManager();
    
    // VectorStore 现在需要外部提供向量
    // 这里需要使用 EmbeddingService 生成向量
    const { EmbeddingService } = await import('@note-studio/shared');
    const embeddingService = new EmbeddingService();
    const embeddingResult = await embeddingService.generateEmbedding(content);
    
    const ids = await manager.addDocuments(
      [content],
      [{ filePath, fileName: filePath.split(/[/\\]/).pop() || filePath }],
      [embeddingResult.vectors]
    );
    
    return ids;
  }

  /**
   * 搜索文件引用
   */
  async searchFileReferences(
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
    
    // VectorStore 现在需要查询向量
    const { EmbeddingService } = await import('@note-studio/shared');
    const embeddingService = new EmbeddingService();
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    
    return manager.search(query, queryEmbedding.vectors, {
      topK: options?.topK,
      filterMetadata: options?.filterMetadata,
    });
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






