/**
 * Agent RAG IPC 处理器
 * 功能：为 Agent 提供 RAG 查询接口
 * 描述：支持向量搜索、语义查询、上下文构建等功能
 */

import { ipcMain } from 'electron';
import { workspaceIndexDatabase, SearchResult } from '../services/WorkspaceIndexDatabase';
import { cloudEmbeddingService } from '../services/CloudEmbeddingService';

/** RAG 查询结果 */
interface RAGQueryResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 知识查询选项 */
interface KnowledgeQueryOptions {
  /** 查询文本 */
  query: string;
  /** 返回结果数量 */
  topK?: number;
  /** 限制搜索的文件名 */
  fileName?: string;
  /** 最小相似度阈值 (0-1) */
  minScore?: number;
}

/** 上下文构建选项 */
interface ContextBuildOptions {
  /** 查询文本 */
  query: string;
  /** 最大上下文长度（字符数） */
  maxLength?: number;
  /** 返回结果数量 */
  topK?: number;
  /** 是否包含文件路径 */
  includeFilePath?: boolean;
}

/** 格式化的上下文结果 */
interface FormattedContext {
  /** 格式化后的上下文文本 */
  context: string;
  /** 来源文件列表 */
  sources: Array<{
    filePath: string;
    score: number;
  }>;
  /** 原始搜索结果 */
  rawResults: SearchResult[];
}

/**
 * 注册 Agent RAG IPC 处理器
 */
export function registerAgentRAGHandlers(): void {
  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'agent:rag:query',
    'agent:rag:search',
    'agent:rag:searchByFile',
    'agent:rag:buildContext',
    'agent:rag:getEmbedding'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  /**
   * 知识库查询
   * 根据查询文本搜索相关知识
   * @param options - 查询选项
   */
  ipcMain.handle(
    'agent:rag:query',
    async (event, options: KnowledgeQueryOptions): Promise<RAGQueryResult> => {
      try {
        const { query, topK = 5, fileName, minScore = 0 } = options;

        if (!query || query.trim().length === 0) {
          return {
            success: false,
            error: '查询文本不能为空'
          };
        }

        // 生成查询向量
        const embeddingResult = await cloudEmbeddingService.generateEmbedding(query);
        if (!embeddingResult.success || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
          return {
            success: false,
            error: `生成查询向量失败: ${embeddingResult.error || '未知错误'}`
          };
        }

        const queryVector = embeddingResult.vectors[0];

        // 执行向量搜索
        let results: SearchResult[];
        if (fileName) {
          results = await workspaceIndexDatabase.searchByFileName(fileName, queryVector, topK);
        } else {
          results = await workspaceIndexDatabase.search(queryVector, topK);
        }

        // 过滤低分结果
        if (minScore > 0) {
          results = results.filter(r => r.score >= minScore);
        }

        return {
          success: true,
          data: {
            results: results.map(r => ({
              content: r.parentContent,
              childContent: r.childContent,
              filePath: r.filePath,
              score: r.score
            })),
            query,
            totalResults: results.length
          }
        };
      } catch (error) {
        console.error('[AgentRAG] 知识库查询失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 向量搜索
   * 直接使用向量进行搜索
   * @param queryVector - 查询向量
   * @param topK - 返回结果数量
   */
  ipcMain.handle(
    'agent:rag:search',
    async (event, queryVector: number[], topK: number = 10): Promise<RAGQueryResult> => {
      try {
        if (!queryVector || queryVector.length === 0) {
          return {
            success: false,
            error: '查询向量不能为空'
          };
        }

        const results = await workspaceIndexDatabase.search(queryVector, topK);

        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error('[AgentRAG] 向量搜索失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 按文件搜索
   * 在指定文件中进行向量搜索
   * @param fileName - 文件名
   * @param query - 查询文本
   * @param topK - 返回结果数量
   */
  ipcMain.handle(
    'agent:rag:searchByFile',
    async (
      event,
      fileName: string,
      query: string,
      topK: number = 5
    ): Promise<RAGQueryResult> => {
      try {
        if (!fileName) {
          return {
            success: false,
            error: '文件名不能为空'
          };
        }

        if (!query || query.trim().length === 0) {
          return {
            success: false,
            error: '查询文本不能为空'
          };
        }

        // 生成查询向量
        const embeddingResult = await cloudEmbeddingService.generateEmbedding(query);
        if (!embeddingResult.success || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
          return {
            success: false,
            error: `生成查询向量失败: ${embeddingResult.error || '未知错误'}`
          };
        }

        const queryVector = embeddingResult.vectors[0];
        const results = await workspaceIndexDatabase.searchByFileName(fileName, queryVector, topK);

        return {
          success: true,
          data: {
            results: results.map(r => ({
              content: r.parentContent,
              childContent: r.childContent,
              filePath: r.filePath,
              score: r.score
            })),
            fileName,
            query,
            totalResults: results.length
          }
        };
      } catch (error) {
        console.error('[AgentRAG] 按文件搜索失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 构建上下文
   * 根据查询构建格式化的上下文文本
   * @param options - 上下文构建选项
   */
  ipcMain.handle(
    'agent:rag:buildContext',
    async (event, options: ContextBuildOptions): Promise<RAGQueryResult> => {
      try {
        const { query, maxLength = 4000, topK = 5, includeFilePath = true } = options;

        if (!query || query.trim().length === 0) {
          return {
            success: false,
            error: '查询文本不能为空'
          };
        }

        // 生成查询向量
        const embeddingResult = await cloudEmbeddingService.generateEmbedding(query);
        if (!embeddingResult.success || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
          return {
            success: false,
            error: `生成查询向量失败: ${embeddingResult.error || '未知错误'}`
          };
        }

        const queryVector = embeddingResult.vectors[0];
        const results = await workspaceIndexDatabase.search(queryVector, topK);

        // 构建格式化上下文
        const contextParts: string[] = [];
        const sources: Array<{ filePath: string; score: number }> = [];
        let currentLength = 0;

        for (const result of results) {
          const content = result.parentContent;
          const header = includeFilePath ? `[来源: ${result.filePath}]\n` : '';
          const part = `${header}${content}\n\n---\n\n`;

          // 检查是否超出最大长度
          if (currentLength + part.length > maxLength) {
            // 尝试截断内容
            const remainingLength = maxLength - currentLength - header.length - 10;
            if (remainingLength > 100) {
              const truncatedContent = content.substring(0, remainingLength) + '...';
              contextParts.push(`${header}${truncatedContent}\n\n---\n\n`);
              sources.push({ filePath: result.filePath, score: result.score });
            }
            break;
          }

          contextParts.push(part);
          sources.push({ filePath: result.filePath, score: result.score });
          currentLength += part.length;
        }

        const formattedContext: FormattedContext = {
          context: contextParts.join(''),
          sources,
          rawResults: results
        };

        return {
          success: true,
          data: formattedContext
        };
      } catch (error) {
        console.error('[AgentRAG] 构建上下文失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 获取文本向量
   * 将文本转换为向量表示
   * @param text - 输入文本
   */
  ipcMain.handle(
    'agent:rag:getEmbedding',
    async (event, text: string): Promise<RAGQueryResult> => {
      try {
        if (!text || text.trim().length === 0) {
          return {
            success: false,
            error: '输入文本不能为空'
          };
        }

        const embeddingResult = await cloudEmbeddingService.generateEmbedding(text);

        if (!embeddingResult.success) {
          return {
            success: false,
            error: embeddingResult.error || '生成向量失败'
          };
        }

        return {
          success: true,
          data: {
            vector: embeddingResult.vectors?.[0] || [],
            dimensions: embeddingResult.vectors?.[0]?.length || 0,
            model: embeddingResult.model,
            tokensUsed: embeddingResult.tokensUsed
          }
        };
      } catch (error) {
        console.error('[AgentRAG] 获取向量失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  console.log('[AgentRAG] Agent RAG IPC 处理器已注册');
}
