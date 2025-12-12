/**
 * 知识库类型定义模块 * 功能：定义知识库相关的类型和接口
 * 描述：包含知识库项、分组、文件类型等核心类型定义
 */

/**
 * 支持的文件类型 */
export type KnowledgeFileType = 'txt' | 'markdown';

/**
 * 知识库项类型
 */
export type KnowledgeItemType = 'file' | 'folder';

/**
 * 知识库分组类型 */
export type KnowledgeGroupType = 'created' | 'joined';

/**
 * 分块设置接口
 */
export interface ChunkSettings {
  /** 切分策略 */
  strategy?: 'recursive' | 'token' | 'markdown' | 'parent-child';
  /** 分块大小 */
  chunkSize: number;
  /** 分块重叠大小 */
  chunkOverlap: number;
  /** 自定义分块符 */
  separators: string[];
  /** 父块大小（仅 parent-child 策略） */
  parentChunkSize?: number;
  /** 子块大小（仅 parent-child 策略） */
  childChunkSize?: number;
  /** 子块重叠（仅 parent-child 策略） */
  childChunkOverlap?: number;
}

/**
 * 知识库项元数据 */
export interface KnowledgeItemMetadata {
  /** 创建时间 */
  createdAt?: Date | number;
  /** 字数统计 */
  wordCount?: number;
  /** 最后修改时*/
  lastModified?: Date;
  /** 标签 */
  tags?: string[];
  /** 文件大小（字节） */
  fileSize?: number;
  /** 文件类型 */
  fileType?: KnowledgeFileType;
  /** 封面图片（文件夹*/
  cover?: string;
  /** 描述（知识库*/
  description?: string;
  /** 文件处理状态 */
  processingStatus?: 'pending' | 'processing' | 'completed' | 'error';
  /** 文件处理进度（0-100） */
  processingProgress?: number;
  /** 嵌入模型名称 */
  embeddingModel?: string;
  /** 分块设置 */
  chunkSettings?: ChunkSettings;
  /** 文件内容（用于知识库独立存储，不依赖文件系统） */
  content?: string;
  /** 配置是否已变更（需要更新知识库） */
  configChanged?: boolean;
}

/**
 * 知识库项接口
 */
export interface KnowledgeItem {
  /** 唯一标识*/
  id: string;
  /** 标题 */
  title: string;
  /** 项目类型 */
  type: KnowledgeItemType;
  /** 所属分析*/
  group: KnowledgeGroupType;
  /** 文件路径（仅文件类型*/
  path?: string;
  /** 子项（仅文件夹类型） */
  children?: KnowledgeItem[];
  /** 元数据*/
  metadata?: KnowledgeItemMetadata;
}

/**
 * 知识库分组接口 */
export interface KnowledgeGroup {
  /** 分组类型 */
  type: KnowledgeGroupType;
  /** 分组标题 */
  title: string;
  /** 是否展开 */
  expanded: boolean;
  /** 分组件*/
  items: KnowledgeItem[];
}

/**
 * 文件导入选项
 */
export interface FileImportOptions {
  /** 允许的文件类型*/
  allowedTypes: KnowledgeFileType[];
  /** 是否允许多*/
  multiple: boolean;
  /** 目标分组 */
  targetGroup: KnowledgeGroupType;
}

/**
 * 知识库状态接口 */
export interface KnowledgeBaseState {
  /** 所有分析*/
  groups: KnowledgeGroup[];
  /** 展开的项ID集合 */
  expandedItems: Set<string>;
  /** 当前选中的项 */
  selectedItem?: KnowledgeItem;
  /** 搜索关键*/
  searchQuery: string;
}

/**
 * 知识库操作接口 */
export interface KnowledgeBaseActions {
  /** 添加文件 */
  addFile: (file: File, group: KnowledgeGroupType) => Promise<void>;
  /** 删除*/
  removeItem: (itemId: string) => void;
  /** 切换展开状态*/
  toggleExpanded: (itemId: string) => void;
  /** 切换分组展开状态*/
  toggleGroupExpanded: (groupType: KnowledgeGroupType) => void;
  /** 选择*/
  selectItem: (item: KnowledgeItem) => void;
  /** 搜索 */
  search: (query: string) => void;
  /** 刷新知识*/
  refresh: () => Promise<void>;
}

