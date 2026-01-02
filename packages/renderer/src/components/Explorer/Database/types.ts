/**
 * 数据库Section类型定义
 * 定义数据库列表项的数据结构
 */

/** 数据库项类型 */
export interface DatabaseItem {
  /** 唯一标识 */
  id: string;
  /** 数据库名称 */
  name: string;
  /** 数据库路径 */
  path: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}
