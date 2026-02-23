/**
 * 表单查询工具
 * 功能：按条件查询表单数据，支持关键词过滤和分页，避免全量数据注入
 * 描述：根据表单 ID 和可选的过滤条件查询表单行数据，返回匹配的行
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';

/** 表单列定义 */
interface FormColumn {
  id: string;
  name: string;
}

/** 表单行数据 */
interface FormRow {
  id: string;
  cells: Record<string, unknown>;
}

/** form:getFormById 返回的原始数据 */
interface RawFormData {
  id: string;
  name: string;
  data?: string;
}

export class QueryFormTool extends BaseTool<BaseToolConfig> {
  readonly name = 'query_form';

  readonly description = '查询表单数据。根据表单 ID 和可选的关键词过滤条件，返回匹配的行数据。适用于查询封禁账号、订单记录等结构化数据。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      formId: {
        type: 'string',
        description: '表单 ID',
      },
      keyword: {
        type: 'string',
        description: '过滤关键词，匹配任意列的值（可选）',
      },
      column: {
        type: 'string',
        description: '指定要过滤的列名（可选，不填则搜索所有列）',
      },
      limit: {
        type: 'number',
        description: '最多返回的行数，默认 50',
      },
    },
    required: ['formId'],
  };

  readonly metadata: ToolMetadata = {
    category: 'interaction',
    requiresConfirmation: false,
    readOnly: true,
    priority: 85,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { formId, keyword, column, limit = 50 } = params as {
      formId: string;
      keyword?: string;
      column?: string;
      limit?: number;
    };

    const result = await this.invokeIPC<RawFormData>('form:getFormById', formId);

    if (!result.success || !result.data) {
      return this.failure(result.error ?? `表单 ${formId} 不存在`);
    }

    let parsed: { columns?: FormColumn[]; rows?: FormRow[] } = {};
    try {
      parsed = result.data.data ? JSON.parse(result.data.data) : {};
    } catch {
      return this.failure('表单数据解析失败');
    }

    const columns: FormColumn[] = parsed.columns ?? [];
    let rows: FormRow[] = parsed.rows ?? [];

    // 按关键词过滤
    if (keyword) {
      const lowerKw = keyword.toLowerCase();
      const targetCols = column
        ? columns.filter(c => c.name.toLowerCase() === column.toLowerCase())
        : columns;

      rows = rows.filter(row =>
        targetCols.some(col => {
          const val = String(row.cells?.[col.id] ?? '').toLowerCase();
          return val.includes(lowerKw);
        })
      );
    }

    // 限制返回行数
    const totalMatched = rows.length;
    rows = rows.slice(0, limit as number);

    // 格式化为可读表格
    const colNames = columns.map(c => c.name);
    const rowsData = rows.map(row =>
      columns.reduce<Record<string, unknown>>((acc, col) => {
        acc[col.name] = row.cells?.[col.id] ?? '';
        return acc;
      }, {})
    );

    return this.success({
      formName: result.data.name,
      formId,
      columns: colNames,
      rows: rowsData,
      totalMatched,
      returned: rows.length,
      hasMore: totalMatched > rows.length,
    });
  }
}
