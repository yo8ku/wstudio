/**
 * Form query tool.
 * Supports querying rows by form id or form name with keyword/column filters.
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, BaseToolConfig } from '../base/types';

interface FormColumn {
  id: string;
  name: string;
}

interface FormTableData {
  id: string;
  name: string;
}

interface QueryRowsResult {
  formId: string;
  formName: string;
  selectedColumns: Array<{ id: string; name: string }>;
  rows: Array<{ id: string; cells: Record<string, unknown> }>;
  matchedTotal: number;
  returnedCount: number;
  hasMore: boolean;
}

export class QueryFormTool extends BaseTool<BaseToolConfig> {
  readonly name = 'query_form';

  readonly description = 'Query form rows. Accepts formId (preferred) or formName, with optional keyword and column filter.';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      formId: {
        type: 'string',
        description: 'Form id (recommended).',
      },
      formName: {
        type: 'string',
        description: 'Form name (optional when formId is unknown).',
      },
      keyword: {
        type: 'string',
        description: 'Optional keyword filter. Matches any selected column.',
      },
      column: {
        type: 'string',
        description: 'Optional target column name. If omitted, search all columns.',
      },
      limit: {
        type: 'number',
        description: 'Max rows to return. Default 50.',
      },
    },
    required: [],
  };

  readonly metadata: ToolMetadata = {
    category: 'interaction',
    requiresConfirmation: false,
    readOnly: true,
    priority: 85,
    version: '1.1.0',
  };

  validateParams(params: Record<string, unknown>): boolean {
    const formId = typeof params.formId === 'string' ? params.formId.trim() : '';
    const formName = typeof params.formName === 'string' ? params.formName.trim() : '';
    return formId.length > 0 || formName.length > 0;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { formId, formName, keyword, column, limit = 50 } = params as {
      formId?: string;
      formName?: string;
      keyword?: string;
      column?: string;
      limit?: number;
    };

    const resolvedFormIdResult = await this.resolveFormId(formId, formName);
    if (!resolvedFormIdResult.success) {
      return this.failure(resolvedFormIdResult.error);
    }
    const resolvedFormId = resolvedFormIdResult.formId;

    const queryResult = await this.invokeIPC<QueryRowsResult>('form:queryRows', {
      formId: resolvedFormId,
      query: keyword ?? '',
      columns: column ? [column] : undefined,
      limit,
      offset: 0,
    });

    if (!queryResult.success || !queryResult.data) {
      return this.failure(queryResult.error ?? `Form ${resolvedFormId} does not exist`);
    }

    const data = queryResult.data;
    const columns: FormColumn[] = data.selectedColumns;
    const colNames = columns.map(c => c.name);
    const rowsData = data.rows.map(row =>
      columns.reduce<Record<string, unknown>>((acc, col) => {
        acc[col.name] = row.cells?.[col.id] ?? '';
        return acc;
      }, {})
    );

    return this.success({
      formName: data.formName,
      formId: data.formId,
      columns: colNames,
      rows: rowsData,
      totalMatched: data.matchedTotal,
      returned: data.returnedCount,
      hasMore: data.hasMore,
    });
  }

  private async resolveFormId(
    formId?: string,
    formName?: string
  ): Promise<{ success: true; formId: string } | { success: false; error: string }> {
    const trimmedFormId = typeof formId === 'string' ? formId.trim() : '';
    if (trimmedFormId) {
      return { success: true, formId: trimmedFormId };
    }

    const trimmedFormName = typeof formName === 'string' ? formName.trim() : '';
    if (!trimmedFormName) {
      return { success: false, error: 'Missing formId/formName. Please provide at least one.' };
    }

    const formsResult = await this.invokeIPC<FormTableData[]>('form:getAllForms');
    if (!formsResult.success || !formsResult.data) {
      return { success: false, error: formsResult.error ?? 'Unable to list forms. Try list_forms first.' };
    }

    const forms = formsResult.data;
    const normalized = trimmedFormName.toLowerCase();

    const exactNameMatches = forms.filter(form => (form.name ?? '').trim().toLowerCase() === normalized);
    if (exactNameMatches.length === 1) {
      return { success: true, formId: exactNameMatches[0].id };
    }
    if (exactNameMatches.length > 1) {
      const candidates = exactNameMatches.slice(0, 5).map(form => `${form.name}(${form.id})`).join(', ');
      return { success: false, error: `Multiple forms matched by name. Use formId: ${candidates}` };
    }

    const exactIdMatches = forms.filter(form => (form.id ?? '').trim().toLowerCase() === normalized);
    if (exactIdMatches.length === 1) {
      return { success: true, formId: exactIdMatches[0].id };
    }

    const fuzzyMatches = forms.filter(form => (form.name ?? '').toLowerCase().includes(normalized));
    if (fuzzyMatches.length === 1) {
      return { success: true, formId: fuzzyMatches[0].id };
    }
    if (fuzzyMatches.length > 1) {
      const candidates = fuzzyMatches.slice(0, 5).map(form => `${form.name}(${form.id})`).join(', ');
      return { success: false, error: `Multiple fuzzy matches found. Use formId: ${candidates}` };
    }

    return { success: false, error: `Form "${trimmedFormName}" not found. Try list_forms first.` };
  }
}
