import React, { useState } from 'react';
import { OpenEditorsSection } from './OpenEditors/OpenEditorsSection';
import { FileTreeSection } from './FileTree/FileTreeSection';
import { OutlineSection } from './Outline/OutlineSection';
import { TimelineSection } from './Timeline/TimelineSection';
import { FileTreeNode, EditorInfo } from './FileTree/types';
import { OutlineNode } from './Outline/types';
import { TimelineItem } from './Timeline/types';
import './ExplorerView.scss';

export interface ExplorerViewProps {
  // 打开的编辑器
  openEditors?: EditorInfo[];
  
  // 文件树
  rootName?: string;
  rootPath?: string;
  fileTreeNodes?: FileTreeNode[];
  selectedFilePath?: string;
  
  // 大纲
  outlineNodes?: OutlineNode[];
  
  // 时间线
  timelineItems?: TimelineItem[];
  
  // 回调函数
  onEditorClick?: (editor: EditorInfo) => void;
  onEditorClose?: (editor: EditorInfo) => void;
  onFileClick?: (node: FileTreeNode) => void;
  onFileDoubleClick?: (node: FileTreeNode) => void;
  onFolderToggle?: (node: FileTreeNode) => void;
  onOutlineNodeSelect?: (node: OutlineNode) => void;
  onTimelineItemClick?: (item: TimelineItem) => void;
  
  // 文件树操作
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void;
  onCreateCancel?: (node: FileTreeNode) => void;
  onBlankAreaClick?: () => void;
}

/**
 * 资源管理器主容器
 * 整合所有资源管理器功能模块
 */
export const ExplorerView: React.FC<ExplorerViewProps> = ({
  openEditors = [],
  rootName = 'MY-PROJECT',
  rootPath = '',
  fileTreeNodes = [],
  selectedFilePath = '',
  outlineNodes = [],
  timelineItems = [],
  onEditorClick,
  onEditorClose,
  onFileClick,
  onFileDoubleClick,
  onFolderToggle,
  onOutlineNodeSelect,
  onTimelineItemClick,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onCreateConfirm,
  onCreateCancel,
  onBlankAreaClick,
}) => {
  
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const [selectedOutlineNode, setSelectedOutlineNode] = useState<OutlineNode | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
  
  // 追踪展开/折叠状态
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(true);
  const [isOutlineExpanded, setIsOutlineExpanded] = useState(false);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);

  // 处理文件点击
  const handleFileClick = (node: FileTreeNode) => {
    setSelectedFile(node);
    onFileClick?.(node);
  };

  // 处理文件双击
  const handleFileDoubleClick = (node: FileTreeNode) => {
    onFileDoubleClick?.(node);
  };

  // 处理文件夹折叠/展开
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

  // 处理时间线项点击
  const handleTimelineItemClick = (item: TimelineItem) => {
    setSelectedTimelineItem(item);
    onTimelineItemClick?.(item);
  };

  // 大纲和时间线始终显示拖动手柄（只要自己是展开状态）
  // 因为它们使用 flexGrow + resizable 模式，应该始终可以调整高度
  const canOutlineResize = true;
  const canTimelineResize = true;

  return (
    <div className="explorer-view">
      {/* 打开的编辑器 */}
      {openEditors.length > 0 && (
        <OpenEditorsSection
          editors={openEditors.map(editor => ({
            ...editor,
            name: editor.title, // 映射 title 到 name
          }))}
          onEditorClick={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClick?.(editor);
          }}
          onEditorClose={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClose?.(editor);
          }}
          onCloseAll={() => {
            openEditors.forEach(editor => onEditorClose?.(editor));
          }}
          onSaveAll={() => {
            console.log('Save all editors');
          }}
        />
      )}

      {/* 文件树 */}
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
        }}
        onNewFile={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFile}
        onNewFolder={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFolder}
        onRefresh={onRefresh}
        onCollapseAll={onCollapseAll}
        onExpandedChange={setIsFileTreeExpanded}
        onBlankAreaClick={onBlankAreaClick}
      />

      {/* 大纲 */}
      {outlineNodes.length > 0 && (
        <OutlineSection
          nodes={outlineNodes}
          selectedNode={selectedOutlineNode}
          onNodeSelect={handleOutlineNodeSelect}
          onCollapse={() => console.log('Collapse outline')}
          onFilter={() => console.log('Filter outline')}
          showResizeHandle={canOutlineResize}
          onExpandedChange={setIsOutlineExpanded}
        />
      )}

      {/* 时间线 */}
      {timelineItems.length > 0 && (
        <TimelineSection
          items={timelineItems}
          selectedItem={selectedTimelineItem}
          onItemClick={handleTimelineItemClick}
          onPin={() => console.log('Pin timeline')}
          onRefresh={() => console.log('Refresh timeline')}
          onSearch={() => console.log('Search timeline')}
          onFilter={() => console.log('Filter timeline')}
          showResizeHandle={canTimelineResize}
          onExpandedChange={setIsTimelineExpanded}
        />
      )}
    </div>
  );
};

export default ExplorerView;

