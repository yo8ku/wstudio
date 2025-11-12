/**
 * 文件树相关类型定
 */

// 文件树节点类型
export interface FileTreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  depth?: number;
  children?: FileTreeNode[];
  isCreating?: boolean;
  creatingType?: 'file' | 'folder';
}

// 编辑器信息类型
export interface EditorInfo {
  path: string;
  title: string;
  isDirty?: boolean;
  isActive?: boolean;
}

// 文件树回调函数
export interface FileTreeCallbacks {
  onFileClick?: (node: FileTreeNode) => void;
  onFileDoubleClick?: (node: FileTreeNode) => void;
  onFolderToggle?: (node: FileTreeNode) => void;
  onContextMenu?: (node: FileTreeNode, event: React.MouseEvent) => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void;
  onCreateCancel?: (node: FileTreeNode) => void;
}

