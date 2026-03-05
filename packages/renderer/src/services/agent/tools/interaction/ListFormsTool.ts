/**
 * Form discovery tool.
 * Lists available forms so the planner can pick a form id before querying rows.
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

interface FormGroupData {
  id: string;
  name: string;
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

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_COLUMNS_PREVIEW = 20;

export class ListFormsTool extends BaseTool<BaseToolConfig> {
  readonly name = 'list_forms';

  readonly description = 'List available forms with ids, row count, and column count so you can choose a form before querying.';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'Optional keyword to filter by form name or id.',
      },
      groupId: {
        type: 'string',
        description: 'Optional group id to filter forms.',
      },
      limit: {
        type: 'number',
        description: `Maximum number of forms to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
      },
      includeColumns: {
        type: 'boolean',
        description: 'Whether to include a short preview of column names.',
      },
    },
    required: [],
  };

  readonly metadata: ToolMetadata = {
    category: 'interaction',
    requiresConfirmation: false,
    readOnly: true,
    priority: 86,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      keyword = '',
      groupId,
      limit = DEFAULT_LIMIT,
      includeColumns = false,
    } = params as {
      keyword?: string;
      groupId?: string;
      limit?: number;
      includeColumns?: boolean;
    };

    const formsResult = await this.invokeIPC<FormTableData[]>('form:getAllForms');
    if (!formsResult.success) {
      return this.failure(formsResult.error ?? 'Failed to list forms');
    }

    const groupsResult = await this.invokeIPC<FormGroupData[]>('form:getAllGroups');
    const groups = groupsResult.success && groupsResult.data ? groupsResult.data : [];
    const groupNameById = new Map<string, string>();
    for (const group of groups) {
      groupNameById.set(group.id, group.name);
    }

    let forms = formsResult.data ?? [];
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (normalizedKeyword) {
      forms = forms.filter((form) => {
        const name = form.name?.toLowerCase() ?? '';
        const id = form.id?.toLowerCase() ?? '';
        return name.includes(normalizedKeyword) || id.includes(normalizedKeyword);
      });
    }

    if (groupId?.trim()) {
      forms = forms.filter((form) => form.groupId === groupId.trim());
    }

    forms.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const boundedLimit = this.clampLimit(limit);
    const slicedForms = forms.slice(0, boundedLimit);

    const items = slicedForms.map((form) => {
      const payload = this.parsePayload(form.data);
      const columnsPreview = includeColumns
        ? payload.columns.slice(0, MAX_COLUMNS_PREVIEW).map((column) => column.name)
        : undefined;

      return {
        formId: form.id,
        formName: form.name,
        groupId: form.groupId,
        groupName: form.groupId ? groupNameById.get(form.groupId) ?? null : null,
        columnCount: payload.columns.length,
        rowCount: payload.rows.length,
        updatedAt: form.updatedAt,
        columns: columnsPreview,
      };
    });

    return this.success({
      total: items.length,
      hasMore: forms.length > items.length,
      forms: items,
    });
  }

  private clampLimit(limit: number): number {
    if (!Number.isFinite(limit)) {
      return DEFAULT_LIMIT;
    }
    return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
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
