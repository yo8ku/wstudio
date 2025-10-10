/**
 * 知识库类型定义模块
 * 功能：定义知识库相关的类型和接口
 * 描述：包含知识库项、分组、文件类型等核心类型定义
 */

/**
 * 支持的文件类型
 */
export type KnowledgeFileType = 'txt' | 'markdown';

/**
 * 知识库项类型
 */
export type KnowledgeItemType = 'file' | 'folder';

/**
 * 知识库分组类型
 */
export type KnowledgeGroupType = 'created' | 'joined';

/**
 * 知识库项元数据
 */
export interface KnowledgeItemMetadata {
  /** 字数统计 */
  wordCount?: number;
  /** 最后修改时间 */
  lastModified?: Date;
  /** 标签 */
  tags?: string[];
  /** 文件大小（字节） */
  fileSize?: number;
  /** 文件类型 */
  fileType?: KnowledgeFileType;
  /** 封面图片（文件夹） */
  cover?: string;
  /** 描述（知识库） */
  description?: string;
}

/**
 * 知识库项接口
 */
export interface KnowledgeItem {
  /** 唯一标识符 */
  id: string;
  /** 标题 */
  title: string;
  /** 项目类型 */
  type: KnowledgeItemType;
  /** 所属分组 */
  group: KnowledgeGroupType;
  /** 文件路径（仅文件类型） */
  path?: string;
  /** 子项（仅文件夹类型） */
  children?: KnowledgeItem[];
  /** 元数据 */
  metadata?: KnowledgeItemMetadata;
}

/**
 * 知识库分组接口
 */
export interface KnowledgeGroup {
  /** 分组类型 */
  type: KnowledgeGroupType;
  /** 分组标题 */
  title: string;
  /** 是否展开 */
  expanded: boolean;
  /** 分组项 */
  items: KnowledgeItem[];
}

/**
 * 文件导入选项
 */
export interface FileImportOptions {
  /** 允许的文件类型 */
  allowedTypes: KnowledgeFileType[];
  /** 是否允许多选 */
  multiple: boolean;
  /** 目标分组 */
  targetGroup: KnowledgeGroupType;
}

/**
 * 知识库状态接口
 */
export interface KnowledgeBaseState {
  /** 所有分组 */
  groups: KnowledgeGroup[];
  /** 展开的项ID集合 */
  expandedItems: Set<string>;
  /** 当前选中的项 */
  selectedItem?: KnowledgeItem;
  /** 搜索关键词 */
  searchQuery: string;
}

/**
 * 知识库操作接口
 */
export interface KnowledgeBaseActions {
  /** 添加文件 */
  addFile: (file: File, group: KnowledgeGroupType) => Promise<void>;
  /** 删除项 */
  removeItem: (itemId: string) => void;
  /** 切换展开状态 */
  toggleExpanded: (itemId: string) => void;
  /** 切换分组展开状态 */
  toggleGroupExpanded: (groupType: KnowledgeGroupType) => void;
  /** 选择项 */
  selectItem: (item: KnowledgeItem) => void;
  /** 搜索 */
  search: (query: string) => void;
  /** 刷新知识库 */
  refresh: () => Promise<void>;
}

