/**
 * FormDatabase.ts
 * 表单数据库服务
 * 功能：管理表单和分组的 SQLite 数据存储
 */

import { SQLiteDatabase } from './SQLiteDatabase';

/**
 * 分组数据接口
 */
export interface FormGroup {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  [key: string]: unknown;
}

/**
 * 表单数据接口
 */
export interface FormData {
  id: string;
  name: string;
  groupId: string | null;
  data: string; // JSON 字符串，包含 columns 和 rows
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export type FormQueryWhereOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

export interface FormQueryWhere {
  column: string;
  op: FormQueryWhereOperator;
  value: unknown;
}

export interface FormQueryParams {
  formId: string;
  query?: string;
  where?: FormQueryWhere | null;
  columns?: string[];
  limit?: number;
  offset?: number;
  rowIds?: string[];
}

export interface FormQueryColumn {
  id: string;
  name: string;
}

export interface FormQueryRow {
  id: string;
  cells: Record<string, unknown>;
}

export interface FormQueryResult {
  formId: string;
  formName: string;
  allColumns: FormQueryColumn[];
  selectedColumns: FormQueryColumn[];
  rows: FormQueryRow[];
  matchedTotal: number;
  returnedCount: number;
  totalRows: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number;
  appliedWhere: FormQueryWhere | null;
  whereInferred: boolean;
}

interface ParsedFormPayload {
  columns: FormQueryColumn[];
  rows: FormQueryRow[];
}

const PARSED_FORM_CACHE_LIMIT = 2;
const PREPARED_FORM_QUERY_CACHE_LIMIT = 1;

interface PreparedColumnIndex {
  eqMap: Map<string, string[]>;
  maleRowIds: Set<string>;
  femaleRowIds: Set<string>;
  numericValues: Array<{ rowId: string; value: number }>;
}

interface PreparedFormQueryIndex {
  updatedAt: number;
  columns: FormQueryColumn[];
  rowsById: Map<string, FormQueryRow>;
  rowOrder: string[];
  columnIndexes: Map<string, PreparedColumnIndex>;
}

/**
 * 表单数据库管理类
 */
export class FormDatabase {
  private db: SQLiteDatabase;
  private initialized: boolean = false;
  private parsedFormCache: Map<string, { updatedAt: number; payload: ParsedFormPayload }> = new Map();
  private preparedQueryCache: Map<string, PreparedFormQueryIndex> = new Map();

  constructor() {
    this.db = new SQLiteDatabase('forms.db');
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      await this.createTables();
      this.initialized = true;
      console.log('[FormDatabase] 数据库初始化成功');
    } catch (error) {
      console.error('[FormDatabase] 数据库初始化失败:', error);
      throw error;
    }
  }

  private normalizeFormCellValue(value: unknown): string {
    if (value == null) return '';
    if (Array.isArray(value)) {
      return value.map(item => String(item ?? '')).join(', ');
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private normalizeComparableText(value: unknown): string {
    return this.normalizeFormCellValue(value).trim().toLowerCase();
  }

  private buildSearchTerms(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const asciiTerms = trimmed.match(/[a-zA-Z0-9_#.-]+/g) ?? [];
    const cjkTerms = trimmed.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
    const splitTerms = trimmed
      .split(/[\s,，。.;；:：!?！？|/\\()[\]{}"'`]+/)
      .map(term => term.trim())
      .filter(Boolean);

    const merged = [trimmed, ...asciiTerms, ...cjkTerms, ...splitTerms]
      .filter(term => term.length >= 2 || /[a-zA-Z0-9]/.test(term));

    const dedup = new Map<string, string>();
    for (const term of merged) {
      const key = term.toLowerCase();
      if (!dedup.has(key)) {
        dedup.set(key, term);
      }
    }
    return Array.from(dedup.values()).slice(0, 16);
  }

  private buildFormSearchTerms(query: string): string[] {
    const base = this.buildSearchTerms(query);
    if (base.length > 0) return base;
    const trimmed = query.trim();
    if (!trimmed) return [];
    return [trimmed];
  }

  private normalizeGenderToken(value: unknown): 'male' | 'female' | null {
    const text = this.normalizeFormCellValue(value).trim().toLowerCase();
    if (!text) return null;
    if (
      text === '男' || text === '男性' || text === 'male' || text === 'm'
      || text === 'man' || text === 'boy'
    ) return 'male';
    if (
      text === '女' || text === '女性' || text === 'female' || text === 'f'
      || text === 'woman' || text === 'girl'
    ) return 'female';
    return null;
  }

  private toComparableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const match = value.match(/-?\d+(\.\d+)?/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private resolveColumnByToken(columns: FormQueryColumn[], token: string): FormQueryColumn | null {
    const normalized = token.trim().toLowerCase();
    if (!normalized) return null;

    const aliasMap: Record<string, string[]> = {
      '性别': ['gender', 'sex'],
      'gender': ['性别', 'sex'],
      'sex': ['性别', 'gender'],
      '姓名': ['name'],
      'name': ['姓名'],
      '邮箱': ['email', 'mail'],
      'email': ['邮箱', 'mail'],
    };
    const candidates = new Set<string>([normalized]);
    for (const alias of aliasMap[normalized] ?? []) {
      candidates.add(alias.toLowerCase());
    }

    return columns.find(column => {
      const id = String(column.id ?? '').trim().toLowerCase();
      const name = String(column.name ?? '').trim().toLowerCase();
      return candidates.has(id) || candidates.has(name);
    }) ?? null;
  }

  private resolveSelectedColumns(columns: FormQueryColumn[], tokens: string[] | undefined): FormQueryColumn[] {
    if (!tokens || tokens.length === 0) return columns;
    const lowered = new Set(tokens.map(token => token.trim().toLowerCase()).filter(Boolean));
    const selected = columns.filter(column => {
      const id = String(column.id ?? '').trim().toLowerCase();
      const name = String(column.name ?? '').trim().toLowerCase();
      return lowered.has(id) || lowered.has(name);
    });
    return selected.length > 0 ? selected : columns;
  }

  private inferWhereFromQuery(columns: FormQueryColumn[], query: string): FormQueryWhere | null {
    const gender = this.normalizeGenderToken(query);
    if (!gender) return null;
    const target = columns.find(column => {
      const name = String(column.name ?? '').trim().toLowerCase();
      return name.includes('性别') || name.includes('gender') || name.includes('sex');
    }) ?? null;
    if (!target) return null;
    return {
      column: target.id,
      op: 'eq',
      value: query,
    };
  }

  private rowMatchesWhere(
    row: FormQueryRow,
    columns: FormQueryColumn[],
    where: FormQueryWhere
  ): boolean {
    const targetColumn = this.resolveColumnByToken(columns, where.column);
    if (!targetColumn) return false;

    const cellValueRaw = (row.cells ?? {})[targetColumn.id];
    const cellText = this.normalizeFormCellValue(cellValueRaw);
    const whereText = this.normalizeFormCellValue(where.value);

    switch (where.op) {
      case 'contains':
        return cellText.toLowerCase().includes(whereText.toLowerCase());
      case 'starts_with':
        return cellText.toLowerCase().startsWith(whereText.toLowerCase());
      case 'ends_with':
        return cellText.toLowerCase().endsWith(whereText.toLowerCase());
      case 'eq': {
        const leftGender = this.normalizeGenderToken(cellValueRaw);
        const rightGender = this.normalizeGenderToken(where.value);
        if (leftGender && rightGender) return leftGender === rightGender;
        return cellText.trim().toLowerCase() === whereText.trim().toLowerCase();
      }
      case 'ne': {
        const leftGender = this.normalizeGenderToken(cellValueRaw);
        const rightGender = this.normalizeGenderToken(where.value);
        if (leftGender && rightGender) return leftGender !== rightGender;
        return cellText.trim().toLowerCase() !== whereText.trim().toLowerCase();
      }
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const left = this.toComparableNumber(cellValueRaw);
        const right = this.toComparableNumber(where.value);
        if (left == null || right == null) return false;
        if (where.op === 'gt') return left > right;
        if (where.op === 'gte') return left >= right;
        if (where.op === 'lt') return left < right;
        return left <= right;
      }
      default:
        return true;
    }
  }

  private rowMatchesQuery(
    row: FormQueryRow,
    selectedColumns: FormQueryColumn[],
    queryTerms: string[]
  ): boolean {
    if (queryTerms.length === 0) return true;
    const values: string[] = [String(row.id ?? '')];
    const cells = row.cells ?? {};
    for (const column of selectedColumns) {
      values.push(this.normalizeFormCellValue(cells[column.id]));
    }
    const haystack = values.join(' ').toLowerCase();
    return queryTerms.every(term => haystack.includes(term.toLowerCase()));
  }

  private parseFormPayload(form: FormData): ParsedFormPayload {
    const cached = this.parsedFormCache.get(form.id);
    if (cached && cached.updatedAt === form.updatedAt) {
      this.parsedFormCache.delete(form.id);
      this.parsedFormCache.set(form.id, cached);
      return cached.payload;
    }

    let parsed: { columns?: unknown; rows?: unknown } = {};
    try {
      parsed = form.data ? JSON.parse(form.data) : {};
    } catch {
      parsed = {};
    }

    const rawColumns = Array.isArray(parsed.columns) ? parsed.columns : [];
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

    const columns: FormQueryColumn[] = rawColumns.map((column, index) => {
      const input = (column ?? {}) as Record<string, unknown>;
      const idRaw = input.id;
      const nameRaw = input.name;
      return {
        id: typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw : `col-${index}`,
        name: typeof nameRaw === 'string' && nameRaw.trim().length > 0
          ? nameRaw
          : String(idRaw ?? `column-${index + 1}`),
      };
    });

    const rows: FormQueryRow[] = rawRows.map((row, index) => {
      const input = (row ?? {}) as Record<string, unknown>;
      const cellsRaw = input.cells;
      const cells = (cellsRaw && typeof cellsRaw === 'object' && !Array.isArray(cellsRaw))
        ? (cellsRaw as Record<string, unknown>)
        : {};
      const idRaw = input.id;
      return {
        id: typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw : String(idRaw ?? `row-${index + 1}`),
        cells,
      };
    });

    const payload: ParsedFormPayload = { columns, rows };
    this.parsedFormCache.set(form.id, { updatedAt: form.updatedAt, payload });
    if (this.parsedFormCache.size > PARSED_FORM_CACHE_LIMIT) {
      const firstKey = this.parsedFormCache.keys().next().value;
      if (firstKey) this.parsedFormCache.delete(firstKey);
    }
    return payload;
  }

  private getPreparedFormQueryIndex(form: FormData, payload: ParsedFormPayload): PreparedFormQueryIndex {
    const cached = this.preparedQueryCache.get(form.id);
    if (cached && cached.updatedAt === form.updatedAt) {
      this.preparedQueryCache.delete(form.id);
      this.preparedQueryCache.set(form.id, cached);
      return cached;
    }

    const rowsById = new Map<string, FormQueryRow>();
    const rowOrder: string[] = [];
    for (const row of payload.rows) {
      const rowId = String(row.id);
      rowsById.set(rowId, row);
      rowOrder.push(rowId);
    }

    const prepared: PreparedFormQueryIndex = {
      updatedAt: form.updatedAt,
      columns: payload.columns,
      rowsById,
      rowOrder,
      columnIndexes: new Map<string, PreparedColumnIndex>(),
    };

    this.preparedQueryCache.set(form.id, prepared);
    if (this.preparedQueryCache.size > PREPARED_FORM_QUERY_CACHE_LIMIT) {
      const firstKey = this.preparedQueryCache.keys().next().value;
      if (firstKey) this.preparedQueryCache.delete(firstKey);
    }
    return prepared;
  }

  private getOrBuildColumnIndex(
    prepared: PreparedFormQueryIndex,
    columnId: string
  ): PreparedColumnIndex {
    const cached = prepared.columnIndexes.get(columnId);
    if (cached) return cached;

    const eqMap = new Map<string, string[]>();
    const maleRowIds = new Set<string>();
    const femaleRowIds = new Set<string>();
    const numericValues: Array<{ rowId: string; value: number }> = [];

    for (const rowId of prepared.rowOrder) {
      const row = prepared.rowsById.get(rowId);
      if (!row) continue;
      const rawValue = (row.cells ?? {})[columnId];
      const textKey = this.normalizeComparableText(rawValue);
      if (!eqMap.has(textKey)) {
        eqMap.set(textKey, []);
      }
      eqMap.get(textKey)!.push(rowId);

      const gender = this.normalizeGenderToken(rawValue);
      if (gender === 'male') maleRowIds.add(rowId);
      if (gender === 'female') femaleRowIds.add(rowId);

      const num = this.toComparableNumber(rawValue);
      if (num != null) {
        numericValues.push({ rowId, value: num });
      }
    }

    const built: PreparedColumnIndex = {
      eqMap,
      maleRowIds,
      femaleRowIds,
      numericValues,
    };
    prepared.columnIndexes.set(columnId, built);
    return built;
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    // 创建分组表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS form_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        sortOrder INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      )
    `);

    // 创建表单表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS forms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        groupId TEXT,
        data TEXT,
        sortOrder INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // 创建索引
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_form_groups_parentId ON form_groups(parentId)
    `);
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_forms_groupId ON forms(groupId)
    `);
  }

  // ==================== 分组操作 ====================

  /**
   * 创建分组
   */
  async createGroup(name: string, parentId: string | null = null): Promise<FormGroup> {
    await this.ensureInitialized();

    const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // 获取当前最大排序号
    const maxOrder = await this.db.queryOne<{ maxOrder: number }>(
      'SELECT MAX(sortOrder) as maxOrder FROM form_groups WHERE parentId IS ?',
      [parentId]
    );
    const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;

    const group: FormGroup = {
      id,
      name,
      parentId,
      sortOrder,
      createdAt: now,
    };

    await this.db.insert('form_groups', {
      id: group.id,
      name: group.name,
      parentId: group.parentId,
      sortOrder: group.sortOrder,
      createdAt: group.createdAt,
    });

    return group;
  }

  /**
   * 获取所有分组
   */
  async getAllGroups(): Promise<FormGroup[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormGroup>(
      'SELECT * FROM form_groups ORDER BY sortOrder ASC'
    );

    return rows;
  }

  /**
   * 获取指定父级下的分组
   */
  async getGroupsByParent(parentId: string | null): Promise<FormGroup[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormGroup>(
      'SELECT * FROM form_groups WHERE parentId IS ? ORDER BY sortOrder ASC',
      [parentId]
    );

    return rows;
  }

  /**
   * 更新分组
   */
  async updateGroup(id: string, updates: Partial<Pick<FormGroup, 'name' | 'parentId' | 'sortOrder'>>): Promise<boolean> {
    await this.ensureInitialized();

    // 构建 SET 子句
    const fields = Object.keys(updates);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    // 使用 execute 直接执行 SQL
    await this.db.execute(
      `UPDATE form_groups SET ${setClause} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * 删除分组
   * 同时删除分组中的所有表单和子分组
   */
  async deleteGroup(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // 递归删除子分组
    const childGroups = await this.getGroupsByParent(id);
    for (const child of childGroups) {
      await this.deleteGroup(child.id);
    }

    // 删除该分组下的所有表单（使用原始SQL确保正确执行）
    await this.db.execute('DELETE FROM forms WHERE groupId = ?', [id]);
    this.parsedFormCache.clear();
    this.preparedQueryCache.clear();

    // 删除分组（使用原始SQL确保正确执行）
    await this.db.execute('DELETE FROM form_groups WHERE id = ?', [id]);

    return true;
  }

  // ==================== 表单操作 ====================

  /**
   * 创建表单
   */
  async createForm(name: string, groupId: string | null = null, data: string = '{}'): Promise<FormData> {
    await this.ensureInitialized();

    const id = `form-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // 获取当前最大排序号
    const maxOrder = await this.db.queryOne<{ maxOrder: number }>(
      'SELECT MAX(sortOrder) as maxOrder FROM forms WHERE groupId IS ?',
      [groupId]
    );
    const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;

    const form: FormData = {
      id,
      name,
      groupId,
      data,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert('forms', {
      id: form.id,
      name: form.name,
      groupId: form.groupId,
      data: form.data,
      sortOrder: form.sortOrder,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    });

    return form;
  }

  /**
   * 获取所有表单
   */
  async getAllForms(): Promise<FormData[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormData>(
      'SELECT * FROM forms ORDER BY sortOrder ASC'
    );

    return rows;
  }

  /**
   * 获取指定分组下的表单
   */
  async getFormsByGroup(groupId: string | null): Promise<FormData[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormData>(
      'SELECT * FROM forms WHERE groupId IS ? ORDER BY sortOrder ASC',
      [groupId]
    );

    return rows;
  }

  /**
   * 根据ID获取表单
   */
  async getFormById(id: string): Promise<FormData | null> {
    await this.ensureInitialized();

    const row = await this.db.queryOne<FormData>(
      'SELECT * FROM forms WHERE id = ?',
      [id]
    );

    return row;
  }

  async queryFormRows(params: FormQueryParams): Promise<FormQueryResult | null> {
    await this.ensureInitialized();

    const formId = params.formId?.trim();
    if (!formId) {
      throw new Error('Missing formId');
    }

    const form = await this.getFormById(formId);
    if (!form) return null;

    const payload = this.parseFormPayload(form);
    const { columns } = payload;
    const prepared = this.getPreparedFormQueryIndex(form, payload);
    const limitArg = typeof params.limit === 'number' && Number.isFinite(params.limit)
      ? Math.floor(params.limit)
      : 80;
    const offsetArg = typeof params.offset === 'number' && Number.isFinite(params.offset)
      ? Math.floor(params.offset)
      : 0;
    const limit = Math.max(1, Math.min(200, limitArg));
    const offset = Math.max(0, offsetArg);
    const selectedColumns = this.resolveSelectedColumns(columns, params.columns);
    const rowIdFilter = Array.isArray(params.rowIds) && params.rowIds.length > 0
      ? new Set(params.rowIds.map(item => String(item)))
      : null;
    const query = typeof params.query === 'string' ? params.query.trim() : '';
    const queryTerms = this.buildFormSearchTerms(query);

    const explicitWhere = params.where ?? null;
    const inferredWhere = !explicitWhere ? this.inferWhereFromQuery(columns, query) : null;
    const effectiveWhere = explicitWhere ?? inferredWhere;
    const effectiveQueryTerms = inferredWhere ? [] : queryTerms;
    let whereCandidateSet: Set<string> | null = null;
    if (effectiveWhere) {
      const whereColumn = this.resolveColumnByToken(columns, effectiveWhere.column);
      if (!whereColumn) {
        return {
          formId: form.id,
          formName: form.name,
          allColumns: columns,
          selectedColumns,
          rows: [],
          matchedTotal: 0,
          returnedCount: 0,
          totalRows: prepared.rowOrder.length,
          offset,
          limit,
          hasMore: false,
          nextOffset: 0,
          appliedWhere: effectiveWhere,
          whereInferred: !!inferredWhere,
        };
      }
      const columnIndex = this.getOrBuildColumnIndex(prepared, whereColumn.id);
      const whereText = this.normalizeComparableText(effectiveWhere.value);
      const rightNum = this.toComparableNumber(effectiveWhere.value);

      if (effectiveWhere.op === 'eq' || effectiveWhere.op === 'ne') {
        let matched = new Set<string>();
        const rightGender = this.normalizeGenderToken(effectiveWhere.value);
        if (rightGender === 'male') {
          matched = new Set(columnIndex.maleRowIds);
        } else if (rightGender === 'female') {
          matched = new Set(columnIndex.femaleRowIds);
        } else {
          matched = new Set(columnIndex.eqMap.get(whereText) ?? []);
        }

        if (effectiveWhere.op === 'eq') {
          whereCandidateSet = matched;
        } else {
          const excluded = matched;
          whereCandidateSet = new Set<string>();
          for (const rowId of prepared.rowOrder) {
            if (!excluded.has(rowId)) whereCandidateSet.add(rowId);
          }
        }
      } else if (effectiveWhere.op === 'gt' || effectiveWhere.op === 'gte' || effectiveWhere.op === 'lt' || effectiveWhere.op === 'lte') {
        if (rightNum == null) {
          whereCandidateSet = new Set<string>();
        } else {
          whereCandidateSet = new Set<string>();
          for (const entry of columnIndex.numericValues) {
            if (effectiveWhere.op === 'gt' && entry.value > rightNum) whereCandidateSet.add(entry.rowId);
            if (effectiveWhere.op === 'gte' && entry.value >= rightNum) whereCandidateSet.add(entry.rowId);
            if (effectiveWhere.op === 'lt' && entry.value < rightNum) whereCandidateSet.add(entry.rowId);
            if (effectiveWhere.op === 'lte' && entry.value <= rightNum) whereCandidateSet.add(entry.rowId);
          }
        }
      }
    }

    const pagedRows: FormQueryRow[] = [];
    let matchedTotal = 0;

    for (const rowId of prepared.rowOrder) {
      if (rowIdFilter && !rowIdFilter.has(rowId)) {
        continue;
      }
      if (whereCandidateSet && !whereCandidateSet.has(rowId)) {
        continue;
      }
      const row = prepared.rowsById.get(rowId);
      if (!row) continue;
      if (effectiveWhere && !this.rowMatchesWhere(row, columns, effectiveWhere)) {
        continue;
      }
      if (!this.rowMatchesQuery(row, selectedColumns, effectiveQueryTerms)) {
        continue;
      }

      const matchIndex = matchedTotal;
      matchedTotal += 1;

      if (matchIndex < offset) {
        continue;
      }
      if (pagedRows.length >= limit) {
        continue;
      }

      const projectedCells: Record<string, unknown> = {};
      for (const column of selectedColumns) {
        projectedCells[column.id] = (row.cells ?? {})[column.id];
      }
      pagedRows.push({
        id: rowId,
        cells: projectedCells,
      });
    }

    const returnedCount = pagedRows.length;
    const nextOffset = offset + returnedCount;
    const hasMore = nextOffset < matchedTotal;

    return {
      formId: form.id,
      formName: form.name,
      allColumns: columns,
      selectedColumns,
      rows: pagedRows,
      matchedTotal,
      returnedCount,
      totalRows: prepared.rowOrder.length,
      offset,
      limit,
      hasMore,
      nextOffset,
      appliedWhere: effectiveWhere,
      whereInferred: !!inferredWhere,
    };
  }

  /**
   * 更新表单
   */
  async updateForm(id: string, updates: Partial<Pick<FormData, 'name' | 'groupId' | 'data' | 'sortOrder'>>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData = {
      ...updates,
      updatedAt: Date.now(),
    };

    // 构建 SET 子句
    const fields = Object.keys(updateData);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(updateData), id];

    // 使用 execute 直接执行 SQL
    await this.db.execute(
      `UPDATE forms SET ${setClause} WHERE id = ?`,
      values
    );
    this.parsedFormCache.delete(id);
    this.preparedQueryCache.delete(id);

    return true;
  }

  /**
   * 删除表单
   */
  async deleteForm(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // 使用原始SQL确保正确执行删除
    await this.db.execute('DELETE FROM forms WHERE id = ?', [id]);
    this.parsedFormCache.delete(id);
    this.preparedQueryCache.delete(id);

    return true;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    this.initialized = false;
    this.parsedFormCache.clear();
    this.preparedQueryCache.clear();
  }
}

// 单例实例
let formDatabase: FormDatabase | null = null;

/**
 * 获取表单数据库实例
 */
export function getFormDatabase(): FormDatabase {
  if (!formDatabase) {
    formDatabase = new FormDatabase();
  }
  return formDatabase;
}
