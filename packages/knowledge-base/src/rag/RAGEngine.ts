/**
 * RAG 引擎
 */

import { SearchEngine } from '../search/SearchEngine';
import { ContextBuilder } from './ContextBuilder';
import { PromptTemplate } from './PromptTemplate';
import { RAGConfig, RAGContext, RAGResponse } from './types';

export class RAGEngine {
  private searchEngine: SearchEngine;
  private contextBuilder: ContextBuilder;
  private promptTemplate: PromptTemplate;
  private config: RAGConfig;

  constructor(
    searchEngine: SearchEngine,
    config?: RAGConfig
  ) {
    this.searchEngine = searchEngine;
    this.contextBuilder = new ContextBuilder();
    this.promptTemplate = new PromptTemplate();
    this.config = {
      maxContextLength: 4000,
      maxSourceDocuments: 5,
      minRelevanceScore: 0.7,
      includeMetadata: true,
      ...config,
    };
  }

  /**
   * 执行 RAG 查询
   */
  async query(query: string, options?: Partial<RAGConfig>): Promise<RAGResponse> {
    const mergedConfig = { ...this.config, ...options };

    // 1. 搜索相关文档
    const searchResults = await this.searchEngine.search({
      query,
      topK: mergedConfig.maxSourceDocuments,
      scoreThreshold: mergedConfig.minRelevanceScore,
      searchType: 'hybrid',
    });

    // 2. 构建上下文
    const context = this.contextBuilder.build(
      searchResults.hits.map((hit) => ({
        content: hit.content,
        metadata: hit.metadata,
        score: hit.score,
      })),
      mergedConfig.maxContextLength
    );

    // 3. 生成提示词
    const ragContext: RAGContext = {
      query,
      sources: context.sources,
      systemPrompt: this.promptTemplate.getSystemPrompt(),
      userPrompt: this.promptTemplate.getUserPrompt(query, context.context),
    };

    // 4. 生成回答（这里需要集成 LLM）
    const answer = await this.generateAnswer(ragContext);

    return {
      answer,
      sources: context.sources,
      context: context.context,
      metadata: {
        model: mergedConfig.model,
        searchResults: searchResults.hits.length,
      },
    };
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




































































