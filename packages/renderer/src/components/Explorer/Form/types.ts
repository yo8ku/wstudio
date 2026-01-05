/**
 * 表单Section类型定义
 * 定义表单列表项的数据结构
 */

/** 表单项类型 */
export interface FormItem {
  /** 唯一标识 */
  id: string;
  /** 表单名称 */
  name: string;
  /** 所属分组ID */
  groupId: string | null;
  /** 表格数据(JSON) */
  data: string;
  /** 排序顺序 */
  sortOrder: number;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 分组项类型 */
export interface FormGroupItem {
  /** 唯一标识 */
  id: string;
  /** 分组名称 */
  name: string;
  /** 父分组ID */
  parentId: string | null;
  /** 排序顺序 */
  sortOrder: number;
  /** 创建时间 */
  createdAt: number;
  /** 是否展开 */
  isExpanded?: boolean;
  /** 子分组 */
  children?: FormGroupItem[];
  /** 分组下的表单 */
  forms?: FormItem[];
}
