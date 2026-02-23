/**
 * 语义搜索工具
 * 功能：使用语义搜索在工作区中查找相关内容
 * 描述：比关键词搜索更智能，能理解查询的含义，支持按文件名过滤搜索范围
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, RAGToolConfig } from '../base/types';

/** 默认最大返回结果数 */
const DEFAULT_MAX_RESULTS = 5;
/** 默认最小相关性分数 */
const DEFAULT_MIN_SCORE = 0.7;

/** RAG 查询返回的数据结构 */
interface RAGQueryResult {
  results: Array<{
    content: string;
    childContent: string;
    filePath: string;
    score: number;
  }>;
  query: string;
  totalResults: number;
}

/** 按文件搜索返回的数据结构 */
interface RAGFileSearchResult {
  results: Array<{
    content: string;
    childContent: string;
    filePath: string;
    score: number;
  }>;
}

export class SemanticSearchTool extends BaseTool<RAGToolConfig> {
  readonly name = 'semantic_search';

  readonly description = '使用语义搜索在工作区中查找相关内容。比关键词搜索更智能，能理解查询的含义。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询（自然语言描述）',
      },
      fileName: {
        type: 'string',
        description: '限定搜索的文件名（可选，用于缩小搜索范围）',
      },
      maxResults: {
        type: 'number',
        description: `最大返回结果数，默认 ${DEFAULT_MAX_RESULTS}`,
        default: DEFAULT_MAX_RESULTS,
      },
    },
    required: ['query'],
  };

  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresConfirmation: false,
    readOnly: true,
    priority: 85,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      query,
      fileName,
      maxResults = this.config.maxResults ?? DEFAULT_MAX_RESULTS,
    } = params as {
      query: string;
      fileName?: string;
      maxResults?: number;
    };

    const minScore = this.config.minRelevanceScore ?? DEFAULT_MIN_SCORE;

    if (fileName) {
      const result = await this.invokeIPC<RAGFileSearchResult>(
        'agent:rag:searchByFile',
        fileName,
        query,
        maxResults
      );

      if (!result.success) {
        return this.failure(result.error ?? '语义搜索失败');
      }

      const items = result.data?.results ?? [];
      return this.success({
        query,
        results: items.map((item) => ({
          content: item.childContent || item.content,
          score: item.score,
          filePath: item.filePath,
        })),
        totalResults: items.length,
      });
    }

    const result = await this.invokeIPC<RAGQueryResult>(
      'agent:rag:query',
      { query, topK: maxResults, minScore }
    );

    if (!result.success) {
      return this.failure(result.error ?? '语义搜索失败');
    }

    const items = result.data?.results ?? [];
    return this.success({
      query,
      results: items.map((item) => ({
        content: item.childContent || item.content,
        score: item.score,
        filePath: item.filePath,
      })),
      totalResults: result.data?.totalResults ?? items.length,
    });
  }
}
