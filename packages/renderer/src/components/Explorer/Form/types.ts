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
  /** 表单路径 */
  path: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}
