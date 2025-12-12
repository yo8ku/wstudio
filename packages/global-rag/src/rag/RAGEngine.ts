/**
 * RAG 引擎
 * 支持普通向量存储和父子索引向量存储
 */

import { VectorStore } from '../vector-store/VectorStore.js';
import { ParentChildVectorStore } from '../vector-store/ParentChildVectorStore.js';
import { ContextBuilder } from './ContextBuilder.js';
import { PromptTemplate } from './PromptTemplate.js';
import { RAGConfig, RAGContext, RAGResponse } from './types.js';
import { SearchResult } from '../types.js';

export class RAGEngine {
  private vectorStore: VectorStore | null = null;
  private parentChildVectorStore: ParentChildVectorStore | null = null;
  private contextBuilder: ContextBuilder;
  private promptTemplate: PromptTemplate;
  private config: RAGConfig;
  private embeddingService: any; // EmbeddingService 实例
  private useParentChild: boolean;

  constructor(
    vectorStore: VectorStore | ParentChildVectorStore,
    embeddingService: any, // 传入 EmbeddingService 实例
    config?: RAGConfig
  ) {
    // 判断是否使用父子索引
    this.useParentChild = vectorStore instanceof ParentChildVectorStore;
    
    if (this.useParentChild) {
      this.parentChildVectorStore = vectorStore as ParentChildVectorStore;
    } else {
      this.vectorStore = vectorStore as VectorStore;
    }
    
    this.embeddingService = embeddingService;
    this.contextBuilder = new ContextBuilder();
    this.promptTemplate = new PromptTemplate();
    this.config = {
      maxContextLength: 4000,
      maxSourceDocuments: 5,
      minRelevanceScore: 0.7,
      includeMetadata: true,
      deduplicateParents: true, // 父子索引专用：是否去重父块
      ...config,
    };
  }

  /**
   * 执行 RAG 查询
   */
  async query(query: string, options?: Partial<RAGConfig>): Promise<RAGResponse> {
    const mergedConfig = { ...this.config, ...options };

    // 1. 生成查询向量
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // 2. 根据存储类型选择搜索方法
    let contextSources: Array<{ content: string; metadata?: any; score: number }>;
    
    if (this.useParentChild && this.parentChildVectorStore) {
      // 使用父子索引搜索
      contextSources = await this.queryWithParentChild(
        queryEmbedding.vectors,
        mergedConfig
      );
    } else if (this.vectorStore) {
      // 使用普通向量存储搜索
      contextSources = await this.queryWithVectorStore(
        query,
        queryEmbedding.vectors,
        mergedConfig
      );
    } else {
      throw new Error('向量存储未初始化');
    }

    // 3. 构建上下文
    const context = this.contextBuilder.build(
      contextSources,
      mergedConfig.maxContextLength
    );

    // 4. 生成提示词
    const ragContext: RAGContext = {
      query,
      sources: context.sources,
      systemPrompt: this.promptTemplate.getSystemPrompt(),
      userPrompt: this.promptTemplate.getUserPrompt(query, context.context),
    };

    // 5. 生成回答（这里需要集成 LLM）
    const answer = await this.generateAnswer(ragContext);

    return {
      answer,
      sources: context.sources,
      context: context.context,
      metadata: {
        model: mergedConfig.model,
        searchResults: contextSources.length,
        useParentChild: this.useParentChild,
      },
    };
  }

  /**
   * 使用父子索引搜索
   */
  private async queryWithParentChild(
    queryVector: number[],
    config: RAGConfig
  ): Promise<Array<{ content: string; metadata?: any; score: number }>> {
    if (!this.parentChildVectorStore) {
      throw new Error('父子索引向量存储未初始化');
    }

    // 搜索子块，返回父块内容
    const searchResults = await this.parentChildVectorStore.search(queryVector, {
      topK: config.maxSourceDocuments,
      deduplicateParents: config.deduplicateParents,
    });

    // 过滤低相关性结果
    const filteredResults = searchResults.filter(
      result => result.score >= (config.minRelevanceScore || 0.7)
    );

    // 使用父块内容（完整上下文）
    return filteredResults.map(result => ({
      content: result.parentContent, // ⭐ 使用父块内容
      metadata: config.includeMetadata ? {
        ...result.metadata,
        childContent: result.childContent, // 保留子块内容用于调试
        parentId: result.parentId,
        childId: result.childId,
        chunkIndex: result.chunkIndex,
      } : undefined,
      score: result.score,
    }));
  }

  /**
   * 使用普通向量存储搜索
   */
  private async queryWithVectorStore(
    query: string,
    queryVector: number[],
    config: RAGConfig
  ): Promise<Array<{ content: string; metadata?: any; score: number }>> {
    if (!this.vectorStore) {
      throw new Error('向量存储未初始化');
    }

    // 搜索文档
    const searchResults = await this.vectorStore.search(query, queryVector, {
      topK: config.maxSourceDocuments,
    });

    // 过滤低相关性结果
    const filteredResults = searchResults.filter(
      result => result.score >= (config.minRelevanceScore || 0.7)
    );

    return filteredResults.map((result: SearchResult) => ({
      content: result.text,
      metadata: config.includeMetadata ? result.metadata : undefined,
      score: result.score,
    }));
  }

  /**
   * 生成回答（需要集成 LLM）
   */
  private async generateAnswer(context: RAGContext): Promise<string> {
    // 这里应该调用 LLM API
    // 示例：OpenAI、Claude、本地模型等
    return `基于提供的上下文回答：${context.query}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
  }
}


