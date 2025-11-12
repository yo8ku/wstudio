/**
 * 资源管理器状态管理
 * 使用 Zustand 管理资源管理器的全局 UI 状态
 */

import { create } from 'zustand';
import { FileTreeNode } from '../components/Explorer/FileTree/types';
import { OutlineNode } from '../components/Explorer/Outline/types';

interface ExplorerStore {
  /** 当前选中的文件节点 */
  selectedFile: FileTreeNode | null;
  /** 当前选中的大纲节点 */
  selectedOutlineNode: OutlineNode | null;
  /** 打开的编辑器区域是否展开 */
  isOpenEditorsExpanded: boolean;
  /** 文件树区域是否展开 */
  isFileTreeExpanded: boolean;
  /** 大纲区域是否展开 */
  isOutlineExpanded: boolean;
  
  /** 设置选中的文件节点 */
  setSelectedFile: (file: FileTreeNode | null) => void;
  /** 设置选中的大纲节点 */
  setSelectedOutlineNode: (node: OutlineNode | null) => void;
  /** 设置打开的编辑器区域展开状态 */
  setOpenEditorsExpanded: (expanded: boolean) => void;
  /** 设置文件树区域展开状态 */
  setFileTreeExpanded: (expanded: boolean) => void;
  /** 设置大纲区域展开状态 */
  setOutlineExpanded: (expanded: boolean) => void;
  /** 切换打开的编辑器区域展开状态 */
  toggleOpenEditors: () => void;
  /** 切换文件树区域展开状态 */
  toggleFileTree: () => void;
  /** 切换大纲区域展开状态 */
  toggleOutline: () => void;
}

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
  selectedFile: null,
  selectedOutlineNode: null,
  isOpenEditorsExpanded: true,
  isFileTreeExpanded: true,
  isOutlineExpanded: false,
  
  setSelectedFile: (file) => set({ selectedFile: file }),
  
  setSelectedOutlineNode: (node) => set({ selectedOutlineNode: node }),
  
  setOpenEditorsExpanded: (expanded) => set({ isOpenEditorsExpanded: expanded }),
  
  setFileTreeExpanded: (expanded) => set({ isFileTreeExpanded: expanded }),
  
  setOutlineExpanded: (expanded) => set({ isOutlineExpanded: expanded }),
  
  toggleOpenEditors: () => {
    const { isOpenEditorsExpanded } = get();
    set({ isOpenEditorsExpanded: !isOpenEditorsExpanded });
  },
  
  toggleFileTree: () => {
    const { isFileTreeExpanded } = get();
    set({ isFileTreeExpanded: !isFileTreeExpanded });
  },
  
  toggleOutline: () => {
    const { isOutlineExpanded } = get();
    set({ isOutlineExpanded: !isOutlineExpanded });
  },
}));

