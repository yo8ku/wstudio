/**
 * RAG 查询工具
 * 功能：提供知识库检索和查询功能
 * 描述：Agent 可用的 RAG 查询工具，用于从知识库中检索相关信息
 */

import {
  AgentTool,
  ToolResult
} from '../types';

/**
 * RAG 工具配置
 */
export interface RAGToolConfig {
  /** 最大返回结果数 */
  maxResults?: number;
  /** 最小相关性分数 */
  minRelevanceScore?: number;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 知识库 ID（可选，不指定则使用当前工作区） */
  knowledgeBaseId?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<Omit<RAGToolConfig, 'knowledgeBaseId'>> = {
  maxResults: 5,
  minRelevanceScore: 0.7,
  includeMetadata: true
};

/**
 * 创建知识库查询工具
 */
export function createKnowledgeQueryTool(config?: RAGToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'query_knowledge',
    description: '从知识库中检索与查询相关的信息。可用于查找笔记、文档中的相关内容。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '查询文本，描述你想要查找的信息'
        },
        maxResults: {
          type: 'number',
          description: `最大返回结果数，默认为 ${mergedConfig.maxResults}`,
          default: mergedConfig.maxResults
        },
        minScore: {
          type: 'number',
          description: `最小相关性分数 (0-1)，默认为 ${mergedConfig.minRelevanceScore}`,
          default: mergedConfig.minRelevanceScore
        }
      },
      required: ['query']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        query,
        maxResults = mergedConfig.maxResults,
        minScore = mergedConfig.minRelevanceScore
      } = params as {
        query: string;
        maxResults?: number;
        minScore?: number;
      };

      try {
        // 通过 IPC 调用 RAG 查询（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke('agent:rag:query', {
          query,
          topK: maxResults,
          minScore
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || '知识库查询失败'
          };
        }

        const queryResult = result.data as {
          results: Array<{
            content: string;
            childContent: string;
            filePath: string;
            score: number;
          }>;
          query: string;
          totalResults: number;
        };

        // 格式化结果
        const formattedResults = queryResult.results.map((item) => ({
          content: item.content,
          score: item.score,
          source: item.filePath,
          metadata: mergedConfig.includeMetadata ? { filePath: item.filePath } : undefined
        }));

        return {
          success: true,
          data: {
            query,
            results: formattedResults,
            totalResults: formattedResults.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建语义搜索工具
 */
export function createSemanticSearchTool(config?: RAGToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'semantic_search',
    description: '使用语义搜索在工作区中查找相关内容。比关键词搜索更智能，能理解查询的含义。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询，可以是自然语言描述'
        },
        fileName: {
          type: 'string',
          description: '限制搜索的文件名（可选）'
        },
        maxResults: {
          type: 'number',
          description: '最大返回结果数',
          default: mergedConfig.maxResults
        }
      },
      required: ['query']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        query,
        fileName,
        maxResults = mergedConfig.maxResults
      } = params as {
        query: string;
        fileName?: string;
        maxResults?: number;
      };

      try {
        // 根据是否有文件名选择不同的 IPC 通道
        let result;
        if (fileName) {
          result = await window.electron?.ipcRenderer.invoke(
            'agent:rag:searchByFile',
            fileName,
            query,
            maxResults
          );
        } else {
          result = await window.electron?.ipcRenderer.invoke('agent:rag:query', {
            query,
            topK: maxResults,
            minScore: mergedConfig.minRelevanceScore
          });
        }

        if (!result.success) {
          return {
            success: false,
            error: result.error || '语义搜索失败'
          };
        }

        const searchResult = result.data as {
          results: Array<{
            content: string;
            childContent: string;
            filePath: string;
            score: number;
          }>;
          query: string;
          totalResults: number;
        };

        // 格式化结果
        const formattedResults = searchResult.results.map((item) => ({
          content: item.content,
          score: item.score,
          filePath: item.filePath
        }));

        return {
          success: true,
          data: {
            query,
            results: formattedResults,
            totalResults: formattedResults.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建相似内容查找工具
 */
export function createFindSimilarTool(config?: RAGToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'find_similar',
    description: '查找与给定文本相似的内容。可用于查找相关笔记、避免重复内容等。',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '参考文本，将查找与此文本相似的内容'
        },
        maxResults: {
          type: 'number',
          description: '最大返回结果数',
          default: mergedConfig.maxResults
        },
        minSimilarity: {
          type: 'number',
          description: '最小相似度 (0-1)',
          default: mergedConfig.minRelevanceScore
        }
      },
      required: ['text']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        text,
        maxResults = mergedConfig.maxResults,
        minSimilarity = mergedConfig.minRelevanceScore
      } = params as {
        text: string;
        maxResults?: number;
        minSimilarity?: number;
      };

      try {
        // 通过 IPC 调用 RAG 查询（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke('agent:rag:query', {
          query: text,
          topK: maxResults,
          minScore: minSimilarity
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || '查找相似内容失败'
          };
        }

        const queryResult = result.data as {
          results: Array<{
            content: string;
            childContent: string;
            filePath: string;
            score: number;
          }>;
          query: string;
          totalResults: number;
        };

        // 格式化结果
        const formattedResults = queryResult.results.map((item) => ({
          content: item.content,
          similarity: item.score,
          source: item.filePath,
          preview: item.content.substring(0, 200) + (item.content.length > 200 ? '...' : '')
        }));

        return {
          success: true,
          data: {
            referenceText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            similarItems: formattedResults,
            totalFound: formattedResults.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建上下文获取工具
 */
export function createGetContextTool(config?: RAGToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'get_context',
    description: '获取与当前任务相关的上下文信息。自动从知识库中检索相关内容，帮助理解任务背景。',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '主题或任务描述'
        },
        additionalKeywords: {
          type: 'array',
          description: '额外的关键词，用于扩展搜索',
          items: { type: 'string' }
        }
      },
      required: ['topic']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        topic,
        additionalKeywords = []
      } = params as {
        topic: string;
        additionalKeywords?: string[];
      };

      try {
        // 构建增强查询
        let enhancedQuery = topic;
        if (additionalKeywords.length > 0) {
          enhancedQuery += ' ' + additionalKeywords.join(' ');
        }

        // 通过 IPC 构建上下文（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke('agent:rag:buildContext', {
          query: enhancedQuery,
          maxLength: 4000,
          topK: mergedConfig.maxResults,
          includeFilePath: true
        });

        if (!result.success) {
          return {
            success: false,
            error: result.error || '获取上下文失败'
          };
        }

        const contextResult = result.data as {
          context: string;
          sources: Array<{ filePath: string; score: number }>;
          rawResults: Array<{
            parentId: string;
            parentContent: string;
            childContent: string;
            filePath: string;
            score: number;
          }>;
        };

        // 构建上下文项
        const contextItems = contextResult.rawResults.map((item) => ({
          content: item.parentContent,
          relevance: item.score,
          source: item.filePath
        }));

        return {
          success: true,
          data: {
            topic,
            contextItems,
            contextSummary: contextResult.context,
            totalSources: contextResult.sources.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建所有 RAG 工具
 */
export function createRAGTools(config?: RAGToolConfig): AgentTool[] {
  return [
    createKnowledgeQueryTool(config),
    createSemanticSearchTool(config),
    createFindSimilarTool(config),
    createGetContextTool(config)
  ];
}
