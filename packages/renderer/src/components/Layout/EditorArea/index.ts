/**
 * EditorArea 组件导出
 * 功能：统一导出编辑区复用组件和视图入口
 */

export { GroupedContextMenu } from './GroupedContextMenu';
export type { GroupedContextMenuProps, MenuGroup, MenuItem } from './GroupedContextMenu';
export { getSendIconSvg, getCloseIconSvg } from './iconHelpers';
export { TabBar } from './TabBar';
export type { TabBarProps } from './TabBar';
export { ImportNoteDialog } from './ImportNoteDialog';
export type { ImportNoteDialogProps } from './ImportNoteDialog';
export { KnowledgeBaseView } from './KnowledgeBaseView';
export type { KnowledgeBaseViewProps } from './KnowledgeBaseView';
export { DecompositionRulesView } from './DecompositionRulesView';
export { PromptManagementView } from './PromptManagementView';
export { AddFileMenu } from './AddFileMenu';
export { Breadcrumb } from './Breadcrumb';
export { EditorArea } from './EditorArea/EditorArea';
export type { EditorTab } from './EditorArea/EditorArea';