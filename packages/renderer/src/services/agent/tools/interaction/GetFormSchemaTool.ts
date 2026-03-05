/**
 * Form schema inspection tool.
 * Reads one form and returns normalized columns with simple inferred types.
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';

interface FormTableData {
  id: string;
  name: string;
  groupId: string | null;
  data: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface FormColumn {
  id: string;
  name: string;
}

interface FormRow {
  id: string;
  cells: Record<string, unknown>;
}

interface ParsedFormPayload {
  columns: FormColumn[];
  rows: FormRow[];
}

type InferredColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'mixed'
  | 'unknown';

const DEFAULT_SAMPLE_SIZE = 3;
const MAX_SAMPLE_SIZE = 20;
const MAX_SAMPLE_VALUES = 5;

export class GetFormSchemaTool extends BaseTool<BaseToolConfig> {
  readonly name = 'get_form_schema';

  readonly description = 'Get one form schema by formId, including columns, inferred types, and optional sample rows.';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      formId: {
        type: 'string',
        description: 'Target form id.',
      },
      sampleSize: {
        type: 'number',
        description: `Sample row count to return (default ${DEFAULT_SAMPLE_SIZE}, max ${MAX_SAMPLE_SIZE}).`,
      },
      includeSampleRows: {
        type: 'boolean',
        description: 'Whether to include sample rows in the result.',
      },
    },
    required: ['formId'],
  };

  readonly metadata: ToolMetadata = {
    category: 'interaction',
    requiresConfirmation: false,
    readOnly: true,
    priority: 87,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      formId,
      sampleSize = DEFAULT_SAMPLE_SIZE,
      includeSampleRows = true,
    } = params as {
      formId: string;
      sampleSize?: number;
      includeSampleRows?: boolean;
    };

    const formResult = await this.invokeIPC<FormTableData | null>('form:getFormById', formId);
    if (!formResult.success) {
      return this.failure(formResult.error ?? `Failed to fetch form: ${formId}`);
    }

    const form = formResult.data;
    if (!form) {
      return this.failure(`Form not found: ${formId}`);
    }

    const payload = this.parsePayload(form.data);
    const columns = payload.columns.map((column) => this.buildColumnSummary(column, payload.rows));
    const boundedSampleSize = this.clampSampleSize(sampleSize);
    const sampleRows = includeSampleRows
      ? this.buildSampleRows(payload.rows, payload.columns, boundedSampleSize)
      : undefined;

    return this.success({
      formId: form.id,
      formName: form.name,
      groupId: form.groupId,
      updatedAt: form.updatedAt,
      columnCount: payload.columns.length,
      rowCount: payload.rows.length,
      columns,
      sampleRows,
    });
  }

  private clampSampleSize(sampleSize: number): number {
    if (!Number.isFinite(sampleSize)) {
      return DEFAULT_SAMPLE_SIZE;
    }
    return Math.max(0, Math.min(MAX_SAMPLE_SIZE, Math.floor(sampleSize)));
  }

  private buildColumnSummary(column: FormColumn, rows: FormRow[]): {
    id: string;
    name: string;
    type: InferredColumnType;
    nonEmptyCount: number;
    sampleValues: unknown[];
  } {
    let inferredType: InferredColumnType = 'unknown';
    let nonEmptyCount = 0;
    const sampleValues: unknown[] = [];
    const sampleValueKeys = new Set<string>();

    for (const row of rows) {
      const value = row.cells[column.id];
      if (this.isEmpty(value)) {
        continue;
      }

      nonEmptyCount += 1;
      inferredType = this.mergeTypes(inferredType, this.getValueType(value));

      if (sampleValues.length < MAX_SAMPLE_VALUES) {
        const valueKey = this.serializeValue(value);
        if (!sampleValueKeys.has(valueKey)) {
          sampleValueKeys.add(valueKey);
          sampleValues.push(value);
        }
      }
    }

    return {
      id: column.id,
      name: column.name,
      type: inferredType,
      nonEmptyCount,
      sampleValues,
    };
  }

  private buildSampleRows(
    rows: FormRow[],
    columns: FormColumn[],
    sampleSize: number
  ): Array<{ rowId: string; cells: Record<string, unknown> }> {
    if (sampleSize <= 0) {
      return [];
    }

    return rows.slice(0, sampleSize).map((row) => {
      const namedCells: Record<string, unknown> = {};
      for (const column of columns) {
        namedCells[column.name] = row.cells[column.id];
      }
      return {
        rowId: row.id,
        cells: namedCells,
      };
    });
  }

  private getValueType(value: unknown): InferredColumnType {
    if (value == null) {
      return 'unknown';
    }
    if (Array.isArray(value)) {
      return 'array';
    }

    const valueType = typeof value;
    if (valueType === 'string') {
      return 'string';
    }
    if (valueType === 'number') {
      return 'number';
    }
    if (valueType === 'boolean') {
      return 'boolean';
    }
    if (valueType === 'object') {
      return 'object';
    }

    return 'unknown';
  }

  private mergeTypes(
    current: InferredColumnType,
    next: InferredColumnType
  ): InferredColumnType {
    if (next === 'unknown') {
      return current;
    }
    if (current === 'unknown') {
      return next;
    }
    if (current === next) {
      return current;
    }
    return 'mixed';
  }

  private isEmpty(value: unknown): boolean {
    if (value == null) {
      return true;
    }
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    return false;
  }

  private serializeValue(value: unknown): string {
    if (typeof value === 'string') {
      return `str:${value}`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return `${typeof value}:${String(value)}`;
    }
    try {
      return `json:${JSON.stringify(value)}`;
    } catch {
      return `raw:${String(value)}`;
    }
  }

  private parsePayload(rawData: string | null | undefined): ParsedFormPayload {
    if (!rawData) {
      return { columns: [], rows: [] };
    }

    let parsed: { columns?: unknown; rows?: unknown } = {};
    try {
      parsed = JSON.parse(rawData) as { columns?: unknown; rows?: unknown };
    } catch {
      return { columns: [], rows: [] };
    }

    const rawColumns = Array.isArray(parsed.columns) ? parsed.columns : [];
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

    const columns: FormColumn[] = rawColumns.map((item, index) => {
      const input = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
      const idRaw = input.id;
      const nameRaw = input.name;
      const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw : `col-${index + 1}`;
      const name = typeof nameRaw === 'string' && nameRaw.trim().length > 0 ? nameRaw : id;
      return { id, name };
    });

    const rows: FormRow[] = rawRows.map((item, index) => {
      const input = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
      const idRaw = input.id;
      const cellsRaw = input.cells;
      const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw : `row-${index + 1}`;
      const cells = (cellsRaw && typeof cellsRaw === 'object' && !Array.isArray(cellsRaw))
        ? cellsRaw as Record<string, unknown>
        : {};
      return { id, cells };
    });

    return { columns, rows };
  }
}
