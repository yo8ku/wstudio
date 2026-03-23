/**
 * 分批表格数据生成器
 * 功能：当用户请求生成大量数据时，自动分批调用 AI 生成
 * 描述：解析用户输入中的数量需求，超过阈值时分批生成并合并结果
 */

import { aiService } from '../../../../services/ai/AIService';
import { getModelConfig } from '../../../../services/ModelCacheService';
import { getTableDesignerSystemPromptAsync } from '../../../../services/ai/SystemPrompt';
import type { AIRequestParams, StreamCallback, AIResponse } from '../../../../types/aiProvider';
import type { CellValue } from './types';

/** 表格数据结构 */
interface TableData {
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, CellValue>>;
}

/** 分批生成回调 */
interface BatchGenerateCallbacks {
  /** 单批完成回调 */
  onBatchComplete?: (batchIndex: number, totalBatches: number, data: TableData) => void;
  /** 全部完成回调 */
  onComplete: (data: TableData) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 进度回调 */
  onProgress?: (message: string) => void;
  /** 流式数据回调（实时更新） */
  onStreamData?: (data: TableData) => void;
}

/** 每批生成的最大行数 */
const BATCH_SIZE = 30;

/** 触发分批的阈值 */
const BATCH_THRESHOLD = 30;

/**
 * 分批表格数据生成器类
 */
export class BatchTableGenerator {
  private modelId: string;
  private abortController: AbortController | null = null;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  /**
   * 从用户输入中提取请求的数据行数
   */
  private extractRowCount(input: string): number | null {
    // 匹配各种数量表达方式
    const patterns = [
      /生成\s*(\d+)\s*条/,
      /(\d+)\s*条数据/,
      /(\d+)\s*条记录/,
      /(\d+)\s*行数据/,
      /(\d+)\s*行记录/,
      /(\d+)\s*个数据/,
      /(\d+)\s*条/,
      /(\d+)\s*行/,
      /(\d+)\s*个/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  private inferColumnsFromRows(rows: Array<Record<string, CellValue>>): Array<{ name: string; type: string }> {
    if (rows.length === 0) return [];

    const columnOrder: string[] = [];
    const columnSamples = new Map<string, CellValue[]>();

    rows.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (!columnOrder.includes(key)) {
          columnOrder.push(key);
        }
        const samples = columnSamples.get(key) || [];
        samples.push(value);
        columnSamples.set(key, samples);
      });
    });

    return columnOrder.map((name) => ({
      name,
      type: this.inferColumnType(columnSamples.get(name) || []),
    }));
  }

  private inferColumnType(values: CellValue[]): string {
    const nonEmptyValues = values.filter((value) => value !== null && value !== undefined && value !== '');
    if (nonEmptyValues.length === 0) return 'text';

    const allBoolean = nonEmptyValues.every((value) => typeof value === 'boolean');
    if (allBoolean) return 'checkbox';

    const allNumber = nonEmptyValues.every((value) => {
      if (typeof value === 'number') return true;
      if (typeof value === 'string' && value.trim() !== '') {
        return !Number.isNaN(Number(value));
      }
      return false;
    });
    if (allNumber) return 'number';

    const allDate = nonEmptyValues.every((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
    if (allDate) return 'date';

    return 'text';
  }

  private normalizeRows(rows: unknown): Array<Record<string, CellValue>> {
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is Record<string, CellValue> => (
      typeof row === 'object' && row !== null && !Array.isArray(row)
    ));
  }

  private normalizeColumns(columns: unknown): Array<{ name: string; type: string }> {
    if (!Array.isArray(columns)) return [];
    return columns
      .map((column) => {
        if (typeof column !== 'object' || column === null) return null;
        const col = column as { name?: unknown; type?: unknown };
        const name = String(col.name ?? '').trim();
        if (!name) return null;
        const type = String(col.type ?? 'text').trim() || 'text';
        return { name, type };
      })
      .filter((column): column is { name: string; type: string } => column !== null);
  }

  private normalizeTableData(data: unknown): TableData | null {
    if (Array.isArray(data)) {
      const rows = this.normalizeRows(data);
      if (rows.length === 0) return null;
      const columns = this.inferColumnsFromRows(rows);
      return columns.length > 0 ? { columns, rows } : null;
    }

    if (typeof data !== 'object' || data === null) return null;

    const root = data as Record<string, unknown>;
    const nested = (typeof root.data === 'object' && root.data !== null)
      ? root.data as Record<string, unknown>
      : root;

    const rows = this.normalizeRows(nested.rows ?? root.rows);
    let columns = this.normalizeColumns(nested.columns ?? root.columns);

    if (columns.length === 0 && rows.length > 0) {
      columns = this.inferColumnsFromRows(rows);
    }

    if (columns.length === 0 || rows.length === 0) {
      return null;
    }

    return { columns, rows };
  }

  /**
   * 解析 AI 返回的 JSON 内容
   */
  private parseAIResponse(content: string): TableData | null {
    try {
      let jsonContent = content.trim();
      
      // 移除 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      // 提取 JSON 对象
      const objectStartIndex = jsonContent.indexOf('{');
      const arrayStartIndex = jsonContent.indexOf('[');
      const useArray = arrayStartIndex !== -1 && (objectStartIndex === -1 || arrayStartIndex < objectStartIndex);
      const jsonStartIndex = useArray ? arrayStartIndex : objectStartIndex;
      const jsonEndIndex = useArray ? jsonContent.lastIndexOf(']') : jsonContent.lastIndexOf('}');
      
      if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonEndIndex <= jsonStartIndex) {
        return null;
      }
      
      jsonContent = jsonContent.slice(jsonStartIndex, jsonEndIndex + 1);

      // 尝试解析
      let rawData: unknown = null;
      try {
        rawData = JSON.parse(jsonContent);
      } catch {
        // 尝试修复截断的 JSON
        rawData = this.tryFixTruncatedJson(jsonContent);
      }

      return this.normalizeTableData(rawData);
    } catch {
      return null;
    }
  }

  /**
   * 尝试修复截断的 JSON
   */
  private tryFixTruncatedJson(jsonContent: string): unknown | null {
    const rowsMatch = jsonContent.match(/"rows"\s*:\s*\[/);
    if (!rowsMatch) return null;

    const rowsStartIndex = jsonContent.indexOf(rowsMatch[0]);
    const afterRows = jsonContent.slice(rowsStartIndex);
    
    let lastValidIndex = -1;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < afterRows.length; i++) {
      const char = afterRows[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{' || char === '[') depth++;
      if (char === '}' || char === ']') {
        depth--;
        if (depth === 1) {
          lastValidIndex = rowsStartIndex + i;
        }
      }
    }
    
    if (lastValidIndex > 0) {
      const fixedJson = jsonContent.slice(0, lastValidIndex + 1) + ']}';
      try {
        return JSON.parse(fixedJson);
      } catch {
        return null;
      }
    }
    
    return null;
  }

  /**
   * 调用 AI 生成单批数据（支持流式回调）
   */
  private async generateBatchWithStream(
    prompt: string,
    onStreamContent?: (content: string, partialData: TableData | null) => void
  ): Promise<string> {
    const modelConfig = await getModelConfig(this.modelId);
    if (!modelConfig) {
      throw new Error(`未找到模型配置：${this.modelId}`);
    }

      const actualModelName = modelConfig.actualModelId;

    await aiService.setProvider(modelConfig.providerId, {
      name: modelConfig.configName,
      apiKey: modelConfig.apiKey,
      apiEndpoint: modelConfig.apiEndpoint,
      modelId: actualModelName,
    });

    const systemPrompt = await getTableDesignerSystemPromptAsync();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    this.abortController = new AbortController();

    const requestParams: AIRequestParams = {
      model: actualModelName,
      messages,
      signal: this.abortController.signal,
    };

    return new Promise((resolve, reject) => {
      let fullResponse = '';
      let lastParsedRowCount = 0;

      const streamCallback: StreamCallback = {
        onContent: (content: string) => {
          fullResponse += content;
          
          // 尝试实时解析已收到的内容
          if (onStreamContent) {
            const partialData = this.tryParsePartialJson(fullResponse);
            // 只有当解析出新的行时才回调
            if (partialData && partialData.rows.length > lastParsedRowCount) {
              lastParsedRowCount = partialData.rows.length;
              onStreamContent(fullResponse, partialData);
            }
          }
        },
        onComplete: (_response: AIResponse) => {
          resolve(fullResponse);
        },
        onError: (error: Error) => {
          reject(error);
        },
      };

      aiService.generateTextStream(requestParams, streamCallback).catch(reject);
    });
  }

  /**
   * 尝试解析部分 JSON（流式解析）
   */
  private tryParsePartialJson(content: string): TableData | null {
    try {
      let jsonContent = content.trim();
      
      // 移除 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      // 不移除结尾的 ```，因为可能还没收到
      jsonContent = jsonContent.trim();

      // 查找 JSON 开始位置
      const jsonStartIndex = jsonContent.indexOf('{');
      if (jsonStartIndex === -1) return null;
      
      jsonContent = jsonContent.slice(jsonStartIndex);

      // 尝试提取 columns
      let columns: Array<{ name: string; type: string }> | null = null;
      const columnsMatch = jsonContent.match(/"columns"\s*:\s*(\[[\s\S]*?\])/);
      if (columnsMatch) {
        try {
          columns = JSON.parse(columnsMatch[1]);
        } catch {
          // 列解析失败，继续尝试
        }
      }

      // 尝试提取已完成的 rows
      const rowsMatch = jsonContent.match(/"rows"\s*:\s*\[/);
      if (!rowsMatch) return null;

      const rowsStartIndex = jsonContent.indexOf(rowsMatch[0]) + rowsMatch[0].length;
      const afterRowsStart = jsonContent.slice(rowsStartIndex);

      // 逐个提取完整的行对象
      const rows: Array<Record<string, CellValue>> = [];
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let rowStart = -1;

      for (let i = 0; i < afterRowsStart.length; i++) {
        const char = afterRowsStart[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (inString) continue;
        
        if (char === '{') {
          if (depth === 0) {
            rowStart = i;
          }
          depth++;
        }
        
        if (char === '}') {
          depth--;
          if (depth === 0 && rowStart !== -1) {
            // 找到一个完整的行对象
            const rowJson = afterRowsStart.slice(rowStart, i + 1);
            try {
              const row = JSON.parse(rowJson);
              rows.push(row);
            } catch {
              // 解析失败，跳过这一行
            }
            rowStart = -1;
          }
        }
      }

      if (rows.length > 0) {
        return { columns: columns || [], rows };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 调用 AI 生成单批数据
   */
  private async generateBatch(prompt: string): Promise<string> {
    return this.generateBatchWithStream(prompt);
  }

  /**
   * 生成表格数据（自动判断是否需要分批，支持流式更新）
   */
  async generate(userInput: string, callbacks: BatchGenerateCallbacks): Promise<void> {
    const requestedCount = this.extractRowCount(userInput);
    
    // 如果没有指定数量或数量小于阈值，直接生成（支持流式）
    if (!requestedCount || requestedCount <= BATCH_THRESHOLD) {
      try {
        callbacks.onProgress?.('正在生成数据...');
        
        const response = await this.generateBatchWithStream(userInput, (_content, partialData) => {
          // 流式更新
          if (partialData && partialData.columns.length > 0 && callbacks.onStreamData) {
            callbacks.onStreamData(partialData);
          }
        });
        
        const data = this.parseAIResponse(response);
        
        if (data) {
          callbacks.onComplete(data);
        } else {
          const rowsData = this.parseRowsOnly(response);
          if (rowsData && rowsData.length > 0) {
            const inferredColumns = this.inferColumnsFromRows(rowsData);
            if (inferredColumns.length > 0) {
              callbacks.onComplete({
                columns: inferredColumns,
                rows: rowsData,
              });
            } else {
              callbacks.onError?.(new Error('解析 AI 响应失败'));
            }
          } else {
            callbacks.onError?.(new Error('解析 AI 响应失败'));
          }
        }
      } catch (error) {
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    // 需要分批生成
    const totalBatches = Math.ceil(requestedCount / BATCH_SIZE);
    let columns: Array<{ name: string; type: string }> | null = null;
    const allRows: Array<Record<string, CellValue>> = [];

    // 提取用户输入中的表格描述（去掉数量部分）
    const tableDescription = userInput
      .replace(/生成\s*\d+\s*条/, '生成')
      .replace(/\d+\s*条数据/, '数据')
      .replace(/\d+\s*条记录/, '记录')
      .replace(/\d+\s*行数据/, '数据')
      .replace(/\d+\s*行记录/, '记录');

    for (let batch = 0; batch < totalBatches; batch++) {
      const remaining = requestedCount - allRows.length;
      const batchCount = Math.min(BATCH_SIZE, remaining);
      
      callbacks.onProgress?.(`正在生成第 ${batch + 1}/${totalBatches} 批数据 (${batchCount} 条)...`);

      let batchPrompt: string;
      if (batch === 0) {
        // 第一批：生成表结构和数据
        batchPrompt = `${tableDescription}，生成 ${batchCount} 条示例数据`;
      } else {
        // 后续批次：只生成数据，使用相同的列结构
        const columnNames = columns?.map(c => c.name).join('、') || '';
        batchPrompt = `继续生成 ${batchCount} 条数据，列名为：${columnNames}。只返回 rows 数组中的数据，不需要 columns。数据要与之前不重复。`;
      }

      try {
        const response = await this.generateBatchWithStream(batchPrompt, (_content, partialData) => {
          // 流式更新：合并已有数据和新的部分数据
          if (partialData && callbacks.onStreamData) {
            const streamColumns = columns && columns.length > 0 ? columns : partialData.columns;
            if (streamColumns && streamColumns.length > 0) {
              const streamRows = [...allRows, ...partialData.rows];
              callbacks.onStreamData({
                columns: streamColumns,
                rows: streamRows,
              });
            }
          }
        });
        
        const batchData = this.parseAIResponse(response);
        
        if (!batchData) {
          // 如果解析失败，尝试只解析 rows 数组
          const rowsData = this.parseRowsOnly(response);
          if (rowsData && rowsData.length > 0) {
            if (!columns || columns.length === 0) {
              columns = this.inferColumnsFromRows(rowsData);
            }
            allRows.push(...rowsData);
            if (columns && columns.length > 0) {
              callbacks.onBatchComplete?.(batch + 1, totalBatches, {
                columns,
                rows: allRows,
              });
            }
          }
          continue;
        }

        // 保存列结构（只在第一批）
        if ((!columns || columns.length === 0) && batchData.columns && batchData.columns.length > 0) {
          columns = batchData.columns;
        } else if ((!columns || columns.length === 0) && batchData.rows && batchData.rows.length > 0) {
          columns = this.inferColumnsFromRows(batchData.rows);
        }

        // 合并行数据
        if (batchData.rows && batchData.rows.length > 0) {
          allRows.push(...batchData.rows);
        }

        if (columns && columns.length > 0) {
          callbacks.onBatchComplete?.(batch + 1, totalBatches, {
            columns,
            rows: allRows,
          });
        }

      } catch (error) {
        console.error(`[BatchTableGenerator] 第 ${batch + 1} 批生成失败:`, error);
        // 继续尝试下一批
      }
    }

    // 返回最终结果
    if ((!columns || columns.length === 0) && allRows.length > 0) {
      columns = this.inferColumnsFromRows(allRows);
    }

    if (columns && columns.length > 0 && allRows.length > 0) {
      callbacks.onComplete({
        columns,
        rows: allRows.slice(0, requestedCount), // 确保不超过请求数量
      });
    } else {
      callbacks.onError?.(new Error('生成数据失败'));
    }
  }

  /**
   * 尝试只解析 rows 数组
   */
  private parseRowsOnly(content: string): Array<Record<string, CellValue>> | null {
    try {
      let jsonContent = content.trim();
      
      // 移除 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      // 尝试解析为数组
      if (jsonContent.startsWith('[')) {
        const arrayEnd = jsonContent.lastIndexOf(']');
        if (arrayEnd > 0) {
          jsonContent = jsonContent.slice(0, arrayEnd + 1);
          const parsed = JSON.parse(jsonContent);
          return this.normalizeRows(parsed);
        }
      }

      // 尝试从对象中提取 rows
      const rowsMatch = jsonContent.match(/"rows"\s*:\s*(\[[\s\S]*?\])/);
      if (rowsMatch) {
        const parsed = JSON.parse(rowsMatch[1]);
        return this.normalizeRows(parsed);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 停止生成
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
