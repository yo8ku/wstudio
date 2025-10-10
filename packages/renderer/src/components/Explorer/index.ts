// 主容器
export { ExplorerView } from './ExplorerView';
export type { ExplorerViewProps } from './ExplorerView';

// 打开的编辑器
export { OpenEditorsSection } from './OpenEditors/OpenEditorsSection';
export { EditorGroup } from './OpenEditors/EditorGroup';
export { EditorItem } from './OpenEditors/EditorItem';
export type { OpenEditorsSectionProps } from './OpenEditors/OpenEditorsSection';
export type { EditorGroupProps } from './OpenEditors/EditorGroup';
export type { EditorItemProps } from './OpenEditors/EditorItem';

// 文件树
export { FileTreeSection } from './FileTree/FileTreeSection';
export { FileTreeNode as FileTreeNodeComponent } from './FileTree/FileTreeNode';
export { FileTreeActions } from './FileTree/FileTreeActions';
export { DragDropHandler } from './FileTree/DragDropHandler';
export { KeyboardHandler } from './FileTree/KeyboardHandler';
export type { FileTreeSectionProps } from './FileTree/FileTreeSection';
export type { FileTreeNodeProps } from './FileTree/FileTreeNode';
export type { FileTreeActionsProps } from './FileTree/FileTreeActions';
export type {
  FileTreeNode,
  FileTreeNode as FileTreeNodeType,
  EditorInfo,
  FileTreeAction,
  FileTreeCallbacks,
} from './FileTree/types';

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

// 时间线
export { TimelineSection } from './Timeline/TimelineSection';
export { TimelineItem as TimelineItemComponent } from './Timeline/TimelineItem';
export { TimelineActions } from './Timeline/TimelineActions';
export type { TimelineSectionProps } from './Timeline/TimelineSection';
export type { TimelineItemProps } from './Timeline/TimelineItem';
export type { TimelineActionsProps } from './Timeline/TimelineActions';
export type {
  TimelineItem,
  TimelineItem as TimelineItemType,
  TimelineAction,
  TimelineFilter,
} from './Timeline/types';

// 手风琴
export { AccordionSection } from './Accordion/AccordionSection';
export type { AccordionSectionProps, AccordionAction } from './Accordion/types';

// 通用组件
export { TreeView } from './Common/TreeView';
export { ContextMenu } from './Common/ContextMenu';
export { InlineInput } from './Common/InlineInput';
export type { TreeViewProps } from './Common/TreeView';
export type { ContextMenuProps, ContextMenuItem } from './Common/ContextMenu';
export type { InlineInputProps } from './Common/InlineInput';

