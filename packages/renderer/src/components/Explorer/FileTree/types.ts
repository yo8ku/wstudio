export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  isExpanded?: boolean;
  isEditing?: boolean;
  isCreating?: boolean; // 标记是否是正在创建的临时节点
  language?: string;
  icon?: string;
}

export interface EditorInfo {
  id: string;
  title: string;
  path: string;
  isDirty?: boolean;
  isActive?: boolean;
  isPinned?: boolean;
  icon?: string;
}

export interface FileTreeAction {
  id: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
}

export interface FileTreeCallbacks {
  onFileClick: (node: FileTreeNode) => void;
  onFileDoubleClick: (node: FileTreeNode) => void;
  onFolderToggle: (node: FileTreeNode) => void;
  onContextMenu: (node: FileTreeNode, event: React.MouseEvent) => void;
  onRename?: (node: FileTreeNode, newName: string) => void;
  onDelete?: (node: FileTreeNode) => void;
  onDragStart?: (node: FileTreeNode, event: React.DragEvent) => void;
  onDragOver?: (node: FileTreeNode, event: React.DragEvent) => void;
  onDrop?: (targetNode: FileTreeNode, sourceNode: FileTreeNode) => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void; // 确认创建
  onCreateCancel?: (node: FileTreeNode) => void; // 取消创建
}

