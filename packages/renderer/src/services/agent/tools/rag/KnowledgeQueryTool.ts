/**
 * 知识库查询工具
 * 功能：从知识库中检索与查询相关的信息
 * 描述：支持按关键词或语义查询知识库内容，返回相关度排序的结果列表
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

export class KnowledgeQueryTool extends BaseTool<RAGToolConfig> {
  readonly name = 'query_knowledge';

  readonly description = '从知识库中检索与查询相关的信息。可用于查找笔记、文档中的相关内容。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '查询关键词或自然语言问题',
      },
      maxResults: {
        type: 'number',
        description: `最大返回结果数，默认 ${DEFAULT_MAX_RESULTS}`,
        default: DEFAULT_MAX_RESULTS,
      },
      minScore: {
        type: 'number',
        description: `最小相关性分数（0-1），默认 ${DEFAULT_MIN_SCORE}`,
        default: DEFAULT_MIN_SCORE,
      },
    },
    required: ['query'],
  };

  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresConfirmation: false,
    readOnly: true,
    priority: 90,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      query,
      maxResults = this.config.maxResults ?? DEFAULT_MAX_RESULTS,
      minScore = this.config.minRelevanceScore ?? DEFAULT_MIN_SCORE,
    } = params as {
      query: string;
      maxResults?: number;
      minScore?: number;
    };

    const result = await this.invokeIPC<RAGQueryResult>(
      'agent:rag:query',
      { query, topK: maxResults, minScore }
    );

    if (!result.success) {
      return this.failure(result.error ?? '知识库查询失败');
    }

    const data = result.data;
    const formattedResults = (data?.results ?? []).map((item) => ({
      content: item.childContent || item.content,
      score: item.score,
      source: item.filePath,
      metadata: item.content !== item.childContent ? { parentContent: item.content } : undefined,
    }));

    return this.success({
      query,
      results: formattedResults,
      totalResults: data?.totalResults ?? formattedResults.length,
    });
  }
}
