/**
 * EditorArea 模块导出
 * 功能：统一管理编辑器相关组件的导出
 * 描述：提供模块化的导出接口，便于其他模块引用
 */

export { MonacoEditor } from './MonacoEditor';
export { MonacoContextMenu, useMonacoContextMenu } from './MonacoContextMenu';
export type { MonacoContextMenuProps } from './MonacoContextMenu';
export { GhostTextWidget } from './GhostTextWidget';
export { AIZoneWidget } from './AIZoneWidget';
export { CodeDecorationManager } from './CodeDecorationManager';
export { getSendIconSvg, getCloseIconSvg } from './iconHelpers';
export { TabBar } from './TabBar';
export type { TabBarProps } from './TabBar';
export { ImportNoteDialog } from './ImportNoteDialog';
export type { ImportNoteDialogProps } from './ImportNoteDialog';
export { KnowledgeBaseView } from './KnowledgeBaseView';
export type { KnowledgeBaseViewProps } from './KnowledgeBaseView';
export { AddFileMenu } from './AddFileMenu';
export { Breadcrumb } from './Breadcrumb';
export { AIAgentView } from './AIAgentView';

// 主编辑器区域组件
export { EditorArea } from './EditorArea';
export type { EditorTab } from './EditorArea';
export { EditorGroup } from './EditorGroup';
