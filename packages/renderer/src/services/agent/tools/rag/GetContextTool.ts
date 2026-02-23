/**
 * 上下文获取工具
 * 功能：获取与当前任务相关的上下文信息
 * 描述：自动从知识库中检索相关内容，支持通过附加关键词增强查询，帮助理解任务背景
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, RAGToolConfig } from '../base/types';

/** 默认最大返回结果数 */
const DEFAULT_MAX_RESULTS = 5;
/** 默认最小相关性分数 */
const DEFAULT_MIN_SCORE = 0.7;

/** 上下文构建返回的数据结构 */
interface RAGBuildContextResult {
  context: string;
  sources: Array<{ filePath: string; score: number }>;
  rawResults: Array<{
    parentId: string;
    parentContent: string;
    childContent: string;
    filePath: string;
    score: number;
  }>;
}

/** 上下文最大长度 */
const DEFAULT_MAX_CONTEXT_LENGTH = 4000;

export class GetContextTool extends BaseTool<RAGToolConfig> {
  readonly name = 'get_context';

  readonly description = '获取与当前任务相关的上下文信息。自动从知识库中检索相关内容，帮助理解任务背景。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: '主题或任务描述',
      },
      additionalKeywords: {
        type: 'array',
        description: '附加关键词列表，用于增强查询精度',
        items: { type: 'string' },
      },
    },
    required: ['topic'],
  };

  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresConfirmation: false,
    readOnly: true,
    priority: 75,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      topic,
      additionalKeywords = [],
    } = params as {
      topic: string;
      additionalKeywords?: string[];
    };

    const topK = this.config.maxResults ?? DEFAULT_MAX_RESULTS;
    const keywords = additionalKeywords.length > 0
      ? additionalKeywords.join(' ')
      : '';
    const enhancedQuery = keywords ? `${topic} ${keywords}` : topic;

    const result = await this.invokeIPC<RAGBuildContextResult>(
      'agent:rag:buildContext',
      {
        query: enhancedQuery,
        maxLength: DEFAULT_MAX_CONTEXT_LENGTH,
        topK,
        includeFilePath: true,
      }
    );

    if (!result.success) {
      return this.failure(result.error ?? '获取上下文失败');
    }

    const data = result.data;
    const minScore = this.config.minRelevanceScore ?? DEFAULT_MIN_SCORE;
    const contextItems = (data?.rawResults ?? [])
      .filter((item) => item.score >= minScore)
      .map((item) => ({
        content: item.childContent || item.parentContent,
        relevance: item.score,
        source: item.filePath,
      }));

    return this.success({
      topic,
      contextItems,
      contextSummary: data?.context ?? '',
      totalSources: data?.sources?.length ?? 0,
    });
  }
}
