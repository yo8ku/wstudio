/**
 * 表格引用服务
 * 功能：提供表格和表单引用解析、格式化与查询能力
 * 描述：服务于 CodeMirror 编辑器中的 @ 引用和列级补全
 */
import type { TableColumn, TableRow } from '../../components/Layout/EditorArea/TableDesigner/types';

/** 表单基础信息 */
export interface FormInfo {
  id: string;
  name: string;
  groupId: string | null;
  groupName?: string;
}

/** 表单详细信息（包含列和行数据） */
export interface FormDetail extends FormInfo {
  columns: TableColumn[];
  rows: TableRow[];
}

/** 列引用信息 */
export interface ColumnReference {
  formId: string;
  formName: string;
  columnId: string;
  columnName: string;
  columnType: string;
}

/** 引用类型 */
export type ReferenceType = 'form' | 'column' | 'cell';

/** 引用项（用于自动补全列表） */
export interface ReferenceItem {
  type: ReferenceType;
  id: string;
  label: string;
  description?: string;
  icon?: string;
  /** 表单ID（列引用时使用） */
  formId?: string;
  /** 列ID（单元格引用时使用） */
  columnId?: string;
}

/** 解析后的引用 */
export interface ParsedReference {
  type: ReferenceType;
  formId: string;
  formName?: string;
  columnId?: string;
  columnName?: string;
  rowId?: string;
  raw: string;
}

/**
 * 表格引用服务类
 */
class TableReferenceServiceClass {
  /** 表单缓存 */
  private formsCache: FormInfo[] = [];
  /** 表单详情缓存 */
  private formDetailsCache: Map<string, FormDetail> = new Map();
  /** 缓存过期时间（毫秒） */
  private cacheExpiry = 30000;
  /** 上次刷新时间 */
  private lastRefreshTime = 0;

  /**
   * 获取所有表单列表
   */
  async getAllForms(): Promise<FormInfo[]> {
    // 检查缓存是否有效
    if (this.formsCache.length > 0 && Date.now() - this.lastRefreshTime < this.cacheExpiry) {
      return this.formsCache;
    }

    try {
      const result = await window.electron?.form?.getAllForms();
      if (result?.success && result.data) {
        this.formsCache = result.data.map(form => ({
          id: form.id,
          name: form.name,
          groupId: form.groupId,
        }));
        this.lastRefreshTime = Date.now();
        return this.formsCache;
      }
      return [];
    } catch (error) {
      console.error('[TableReferenceService] 获取表单列表失败:', error);
      return [];
    }
  }

  /**
   * 获取表单详情（包含列信息）
   */
  async getFormDetail(formId: string): Promise<FormDetail | null> {
    // 检查缓存
    const cached = this.formDetailsCache.get(formId);
    if (cached) {
      return cached;
    }

    try {
      const result = await window.electron?.form?.getFormById(formId);
      if (result?.success && result.data) {
        const formData = result.data;
        let parsedData: { columns?: TableColumn[]; rows?: TableRow[] } = {};
        
        try {
          parsedData = formData.data ? JSON.parse(formData.data) : {};
        } catch {
          parsedData = {};
        }

        const detail: FormDetail = {
          id: formData.id,
          name: formData.name,
          groupId: formData.groupId,
          columns: parsedData.columns || [],
          rows: parsedData.rows || [],
        };

        this.formDetailsCache.set(formId, detail);
        return detail;
      }
      return null;
    } catch (error) {
      console.error('[TableReferenceService] 获取表单详情失败:', error);
      return null;
    }
  }

  /**
   * 获取表单的所有列
   */
  async getFormColumns(formId: string): Promise<TableColumn[]> {
    const detail = await this.getFormDetail(formId);
    return detail?.columns || [];
  }

  /**
   * 获取引用建议列表（用于自动补全）
   * @param query 搜索关键词
   * @param parentFormId 父表单ID（用于获取列列表）
   */
  async getSuggestions(query: string, parentFormId?: string): Promise<ReferenceItem[]> {
    const suggestions: ReferenceItem[] = [];
    const lowerQuery = query.toLowerCase();

    if (parentFormId) {
      // 获取指定表单的列列表
      const columns = await this.getFormColumns(parentFormId);
      const formDetail = await this.getFormDetail(parentFormId);
      
      for (const column of columns) {
        if (!lowerQuery || column.name.toLowerCase().includes(lowerQuery)) {
          suggestions.push({
            type: 'column',
            id: column.id,
            label: column.name,
            description: `${formDetail?.name || ''} - ${this.getColumnTypeLabel(column.type)}`,
            icon: this.getColumnTypeIcon(column.type),
            formId: parentFormId,
          });
        }
      }
    } else {
      // 获取表单列表
      const forms = await this.getAllForms();
      
      for (const form of forms) {
        if (!lowerQuery || form.name.toLowerCase().includes(lowerQuery)) {
          suggestions.push({
            type: 'form',
            id: form.id,
            label: form.name,
            description: '表单',
            icon: 'table-properties',
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 格式化引用文本
   * @param type 引用类型
   * @param formId 表单ID
   * @param formName 表单名称
   * @param columnId 列ID（可选）
   * @param columnName 列名称（可选）
   */
  formatReference(
    type: ReferenceType,
    formId: string,
    formName: string,
    columnId?: string,
    columnName?: string
  ): string {
    if (type === 'column' && columnId && columnName) {
      // 列引用格式: [[form:formId:column:columnId|表单名/列名]]
      return `[[form:${formId}:column:${columnId}|${formName}/${columnName}]]`;
    }
    // 表单引用格式: [[form:formId|表单名]]
    return `[[form:${formId}|${formName}]]`;
  }

  /**
   * 解析引用文本
   * @param text 引用文本
   */
  parseReference(text: string): ParsedReference | null {
    // 匹配列引用: [[form:formId:column:columnId|表单名/列名]]
    const columnMatch = text.match(/\[\[form:([^:]+):column:([^|]+)\|([^/]+)\/([^\]]+)\]\]/);
    if (columnMatch) {
      return {
        type: 'column',
        formId: columnMatch[1],
        columnId: columnMatch[2],
        formName: columnMatch[3],
        columnName: columnMatch[4],
        raw: text,
      };
    }

    // 匹配表单引用: [[form:formId|表单名]]
    const formMatch = text.match(/\[\[form:([^|]+)\|([^\]]+)\]\]/);
    if (formMatch) {
      return {
        type: 'form',
        formId: formMatch[1],
        formName: formMatch[2],
        raw: text,
      };
    }

    return null;
  }

  /**
   * 查找文本中的所有引用
   * @param text 文本内容
   */
  findAllReferences(text: string): ParsedReference[] {
    const references: ParsedReference[] = [];
    const regex = /\[\[form:[^\]]+\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const parsed = this.parseReference(match[0]);
      if (parsed) {
        references.push(parsed);
      }
    }

    return references;
  }

  /**
   * 获取列类型标签
   */
  private getColumnTypeLabel(type: string): string {
    const typeLabels: Record<string, string> = {
      text: '文本',
      number: '数字',
      date: '日期',
      time: '时间',
      checkbox: '复选框',
      select: '单选',
      multiselect: '多选',
      tag: '标签',
      url: '链接',
      email: '邮箱',
      password: '密码',
    };
    return typeLabels[type] || type;
  }

  /**
   * 获取列类型图标
   */
  private getColumnTypeIcon(type: string): string {
    const typeIcons: Record<string, string> = {
      text: 'type-icon',
      number: 'number-hash',
      date: 'calendar-date',
      time: 'clock',
      checkbox: 'checkbox-select',
      select: 'radio-select',
      multiselect: 'list-checks',
      tag: 'tag',
      url: 'link-2',
      email: 'at-sign',
      password: 'eye-off',
    };
    return typeIcons[type] || 'type-icon';
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.formsCache = [];
    this.formDetailsCache.clear();
    this.lastRefreshTime = 0;
  }

  /**
   * 刷新表单缓存
   */
  async refreshFormsCache(): Promise<void> {
    this.lastRefreshTime = 0;
    await this.getAllForms();
  }

  /**
   * 刷新指定表单的详情缓存
   */
  async refreshFormDetailCache(formId: string): Promise<void> {
    this.formDetailsCache.delete(formId);
    await this.getFormDetail(formId);
  }
}

// 导出单例实例
export const tableReferenceService = new TableReferenceServiceClass();

export default tableReferenceService;
