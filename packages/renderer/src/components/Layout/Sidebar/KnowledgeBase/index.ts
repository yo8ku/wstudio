/**
 * 知识库模块导出索引
 * 功能：统一导出知识库相关组件和类型
 * 描述：提供模块化的导出接口，便于外部使用
 */

// 主组件
export { KnowledgeBase } from './KnowledgeBase';

// 子组件
export { KnowledgeBaseItem } from './KnowledgeBaseItem';
export { KnowledgeBaseGroup } from './KnowledgeBaseGroup';

// 图标组件
export * from './KnowledgeBaseIcons';

// 类型定义
export type {
  KnowledgeFileType,
  KnowledgeItemType,
  KnowledgeGroupType,
  KnowledgeItemMetadata,
  KnowledgeItem,
  KnowledgeGroup,
  FileImportOptions,
  KnowledgeBaseState,
  KnowledgeBaseActions,
} from './types';

// 服务
export { knowledgeBaseService } from './knowledgeBaseService';

