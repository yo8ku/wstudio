/**
 * 资源管理器模块导入 */

// 主容器
export { ExplorerView } from './ExplorerView';
export type { ExplorerViewProps, ResourceFolderExplorerItem } from './ExplorerView';

// 文件树
export { FileTreeSection } from './FileTree/FileTreeSection';
export type { FileTreeSectionProps } from './FileTree/FileTreeSection';
export type {
  FileTreeNode,
  EditorInfo,
  FileTreeCallbacks,
} from './FileTree/types';

// 打开的编辑器
export { OpenEditorsSection } from './OpenEditors/OpenEditorsSection';
export { EditorGroup } from './OpenEditors/EditorGroup';
export { EditorItem } from './OpenEditors/EditorItem';
export type { OpenEditorsSectionProps } from './OpenEditors/OpenEditorsSection';
export type { EditorGroupProps } from './OpenEditors/EditorGroup';
export type { EditorItemProps } from './OpenEditors/EditorItem';

// 大纲
export { OutlineSection } from './Outline/OutlineSection';
export { OutlineNode as OutlineNodeComponent } from './Outline/OutlineNode';
export { OutlineActions } from './Outline/OutlineActions';
export type { OutlineSectionProps } from './Outline/OutlineSection';
export type { OutlineNodeProps } from './Outline/OutlineNode';
export type { OutlineActionsProps } from './Outline/OutlineActions';
export type {
  OutlineNode,
  OutlineNode as OutlineNodeType,
  OutlineAction,
  OutlineSymbolKind,
} from './Outline/types';

// ExplorerSection (基于 shadcn accordion)
export { default as ExplorerSection } from './ExplorerSection';
export type { ExplorerSectionProps, ActionButton } from './ExplorerSection';

// 通用组件
export { TreeView } from './Common/TreeView';
export { TreeChildren, TreeNodeRow } from './Common/TreeNode';
export { ContextMenu } from './Common/ContextMenu';
export { InlineInput } from './Common/InlineInput';
export type { TreeViewProps } from './Common/TreeView';
export type { TreeChildrenProps, TreeNodeRowProps } from './Common/TreeNode';
export type { ContextMenuProps, ContextMenuItem } from './Common/ContextMenu';
export type { InlineInputProps } from './Common/InlineInput';
