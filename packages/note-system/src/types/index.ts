/**
 * 笔记系统类型定义
 * 功能：定义笔记系统所有数据类型
 */

/**
 * 笔记类型
 */
export type NoteType = 'daily' | 'quick' | 'normal';

/**
 * 笔记数据接口
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
 * 标签数据接口
 */
export interface TagItem {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  createdAt: number;
}

/**
 * 链接数据接口
 */
export type LinkTargetKind = 'note' | 'heading' | 'block';

export interface LinkItem {
  id: string;
  sourceId: string;
  targetId?: string;
  targetTitle: string;
  context: string;
  displayText?: string;
  targetKind?: LinkTargetKind;
  targetAnchor?: string;
  sourceStart?: number;
  sourceEnd?: number;
  sourceNoteTitle?: string;
  sourceLine?: number;
  isResolved?: boolean;
  createdAt: number;
}

/**
 * 模板数据接口
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
 * 知识图谱节点
 */
export interface GraphNode {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  linkCount: number;
}

/**
 * 知识图谱边
 */
export interface GraphEdge {
  source: string;
  target: string;
}

/**
 * 笔记数据库行类型（内部使用）
 */
export interface NoteRow {
  id: string;
  title: string;
  content: string;
  path: string;
  type: NoteType;
  is_favorite: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

/**
 * 标签数据库行类型（内部使用）
 */
export interface TagRow {
  id: string;
  name: string;
  parent_id: string | null;
  note_count: number;
  created_at: number;
}

/**
 * 链接数据库行类型（内部使用）
 */
export interface LinkRow {
  id: string;
  source_id: string;
  target_id: string | null;
  target_title: string;
  context: string;
  display_text?: string | null;
  target_kind?: LinkTargetKind | null;
  target_anchor?: string | null;
  source_start?: number | null;
  source_end?: number | null;
  source_title?: string | null;
  source_line?: number | null;
  is_resolved?: number | null;
  created_at: number;
}

/**
 * 模板数据库行类型（内部使用）
 */
export interface TemplateRow {
  id: string;
  name: string;
  content: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}
