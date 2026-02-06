// 似乎没用到


import React, { useEffect } from 'react';
import { OpenEditorsSection } from '../OpenEditors/OpenEditorsSection';
import { FileTreeSection } from '../FileTree/FileTreeSection';
import { OutlineSection } from '../Outline/OutlineSection';
import { FileTreeNode, EditorInfo } from '../FileTree/types';
import { OutlineNode } from '../Outline/types';
import { useExplorerStore } from '../../../stores/explorerStore';
import './ExplorerView.scss';

export interface ExplorerViewProps {
  // 打开的编辑器
  openEditors?: EditorInfo[];
  showOpenEditors?: boolean; // 控制是否显示打开的编辑器区域
  
  // 文件树
  rootName?: string;
  rootPath?: string;
  fileTreeNodes?: FileTreeNode[];
  selectedFilePath?: string;
  
  // 大纲
  outlineNodes?: OutlineNode[];
  
  // 回调函数
  onEditorClick?: (editor: EditorInfo) => void;
  onEditorClose?: (editor: EditorInfo) => void;
  onCloseAll?: () => void;
  onFileClick?: (node: FileTreeNode) => void;
  onFileDoubleClick?: (node: FileTreeNode) => void;
  onFolderToggle?: (node: FileTreeNode) => void;
  onOutlineNodeSelect?: (node: OutlineNode) => void;
  onOutlineNodeToggle?: (node: OutlineNode) => void;
  onOutlineCollapseAll?: () => void;
  
  // 文件树操作
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void;
  onCreateCancel?: (node: FileTreeNode) => void;
  onRename?: (node: FileTreeNode, newName: string) => void;
  onBlankAreaClick?: () => void;
}

/**
 * 资源管理器主容器
 * 整合所有资源管理器功能模块
 */
export const ExplorerView: React.FC<ExplorerViewProps> = ({
  openEditors = [],
  showOpenEditors = true, // 默认显示打开的编辑器
  rootName = 'MY-PROJECT',
  rootPath = '',
  fileTreeNodes = [],
  selectedFilePath = '',
  outlineNodes = [],
  onEditorClick,
  onEditorClose,
  onCloseAll,
  onFileClick,
  onFileDoubleClick,
  onFolderToggle,
  onOutlineNodeSelect,
  onOutlineNodeToggle,
  onOutlineCollapseAll,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onCreateConfirm,
  onCreateCancel,
  onRename,
  onBlankAreaClick,
}) => {
  
  // 使用 Zustand store 管理 UI 状态
  const {
    selectedFile,
    selectedOutlineNode,
    isOpenEditorsExpanded,
    isFileTreeExpanded,
    isOutlineExpanded,
    setSelectedFile,
    setSelectedOutlineNode,
    setOpenEditorsExpanded,
    setFileTreeExpanded,
    setOutlineExpanded,
  } = useExplorerStore();

  // 监听 openEditors 变化，如果有文件打开且当前是折叠状态，则自动展开
  useEffect(() => {
    if (openEditors.length > 0 && !isOpenEditorsExpanded) {
      setOpenEditorsExpanded(true);
      console.log('[ExplorerView] 检测到文件打开，自动展开"打开的编辑器"区域');
    }
  }, [openEditors.length, isOpenEditorsExpanded, setOpenEditorsExpanded]);

  // 处理文件点击
  const handleFileClick = (node: FileTreeNode) => {
    setSelectedFile(node);
    onFileClick?.(node);
  };

  // 处理文件双击
  const handleFileDoubleClick = (node: FileTreeNode) => {
    onFileDoubleClick?.(node);
  };

  // 处理文件夹折叠展开
  const handleFolderToggle = (node: FileTreeNode) => {
    onFolderToggle?.(node);
  };

  // 处理文件右键菜单
  const handleFileContextMenu = (node: FileTreeNode, event: React.MouseEvent) => {
    event.preventDefault();
    // TODO: 显示右键菜单
    console.log('Context menu for:', node.name);
  };

  // 处理大纲节点选择
  const handleOutlineNodeSelect = (node: OutlineNode) => {
    setSelectedOutlineNode(node);
    onOutlineNodeSelect?.(node);
  };

  // 大纲始终显示拖动手柄（只要大纲自己是展开状态）
  const canOutlineResize = true;

  return (
    <div className={`explorer-view ${isFileTreeExpanded ? 'file-tree-expanded' : ''}`}>
      {/* 打开的编辑器 */}
      {showOpenEditors && (
        <OpenEditorsSection
          editors={openEditors.map(editor => ({
            ...editor,
            name: editor.title, // 映射 title name
          }))}
          expanded={isOpenEditorsExpanded}
          onExpandChange={setOpenEditorsExpanded}
          onEditorClick={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClick?.(editor);
          }}
          onEditorClose={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClose?.(editor);
          }}
          onCloseAll={onCloseAll}
          onSaveAll={() => {
            console.log('Save all editors');
          }}
        />
      )}

      {/* 文件树 - 根据展开/折叠状态调整布局 */}
      <div className={`file-tree-wrapper ${isFileTreeExpanded ? 'expanded' : 'collapsed'}`}>
        <FileTreeSection
          rootName={rootName}
          rootPath={rootPath}
          nodes={fileTreeNodes}
          selectedFilePath={selectedFilePath}
          callbacks={{
            onFileClick: handleFileClick,
            onFileDoubleClick: handleFileDoubleClick,
            onFolderToggle: handleFolderToggle,
            onContextMenu: handleFileContextMenu,
            onCreateConfirm: onCreateConfirm,
            onCreateCancel: onCreateCancel,
            onRename: onRename,
          }}
          onNewFile={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFile}
          onNewFolder={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFolder}
          onRefresh={onRefresh}
          onCollapseAll={onCollapseAll}
          onExpandedChange={setFileTreeExpanded}
          onBlankAreaClick={onBlankAreaClick}
        />
      </div>

      {/* 大纲 - 根据文件树状态调整位置 */}
      <div className="outline-wrapper">
        <OutlineSection
          nodes={outlineNodes}
          selectedNode={selectedOutlineNode}
          onNodeSelect={handleOutlineNodeSelect}
          onNodeToggle={onOutlineNodeToggle}
          onCollapse={onOutlineCollapseAll}
          onFilter={() => console.log('Filter outline')}
          showResizeHandle={canOutlineResize}
          onExpandedChange={setOutlineExpanded}
        />
      </div>
    </div>
  );
};

export default ExplorerView;

