/**
 * 笔记系统类型定义
 * 功能：定义笔记系统的核心类型
 */

/**
 * 笔记类型
 */
export type NoteType = 'daily' | 'quick' | 'normal';

/**
 * 笔记项
 */
export interface NoteItem {
  id: string;
  title: string;
  content: string;
  path: string;
  type: NoteType;
  isFavorite: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: string;
}

/**
 * 标签项
 */
export interface TagItem {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  createdAt: number;
}

/**
 * 链接项
 */
export interface LinkItem {
  id: string;
  sourceId: string;
  targetId?: string;
  targetTitle: string;
  context: string;
  createdAt: number;
}

/**
 * 模板项
 */
export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 图谱节点
 */
export interface GraphNode {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  linkCount: number;
}

/**
 * 图谱边
 */
export interface GraphEdge {
  source: string;
  target: string;
}
