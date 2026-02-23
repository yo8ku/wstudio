/**
 * 相似内容查找工具
 * 功能：查找与给定文本相似的内容
 * 描述：基于语义相似度匹配，可用于查找相关笔记、避免重复内容等场景
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

/** 内容预览最大长度 */
const PREVIEW_MAX_LENGTH = 200;

export class FindSimilarTool extends BaseTool<RAGToolConfig> {
  readonly name = 'find_similar';

  readonly description = '查找与给定文本相似的内容。可用于查找相关笔记、避免重复内容等。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '参考文本，用于查找相似内容',
      },
      maxResults: {
        type: 'number',
        description: `最大返回结果数，默认 ${DEFAULT_MAX_RESULTS}`,
        default: DEFAULT_MAX_RESULTS,
      },
      minSimilarity: {
        type: 'number',
        description: `最小相似度分数（0-1），默认 ${DEFAULT_MIN_SCORE}`,
        default: DEFAULT_MIN_SCORE,
      },
    },
    required: ['text'],
  };

  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresConfirmation: false,
    readOnly: true,
    priority: 80,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      text,
      maxResults = this.config.maxResults ?? DEFAULT_MAX_RESULTS,
      minSimilarity = this.config.minRelevanceScore ?? DEFAULT_MIN_SCORE,
    } = params as {
      text: string;
      maxResults?: number;
      minSimilarity?: number;
    };

    const result = await this.invokeIPC<RAGQueryResult>(
      'agent:rag:query',
      { query: text, topK: maxResults, minScore: minSimilarity }
    );

    if (!result.success) {
      return this.failure(result.error ?? '查找相似内容失败');
    }

    const items = result.data?.results ?? [];
    const similarItems = items.map((item) => {
      const fullContent = item.childContent || item.content;
      return {
        content: fullContent,
        similarity: item.score,
        source: item.filePath,
        preview: fullContent.length > PREVIEW_MAX_LENGTH
          ? fullContent.slice(0, PREVIEW_MAX_LENGTH) + '...'
          : fullContent,
      };
    });

    return this.success({
      referenceText: text.length > PREVIEW_MAX_LENGTH
        ? text.slice(0, PREVIEW_MAX_LENGTH) + '...'
        : text,
      similarItems,
      totalFound: result.data?.totalResults ?? similarItems.length,
    });
  }
}
