import React, { useCallback, useState } from 'react';
import { OpenEditorsSection } from './OpenEditors/OpenEditorsSection';
import { FileTreeSection } from './FileTree/FileTreeSection';
import { OutlineSection } from './Outline/OutlineSection';
import { TimelineSection } from './Timeline/TimelineSection';
import { FileTreeNode, EditorInfo } from './FileTree/types';
import { OutlineNode } from './Outline/types';
import { TimelineItem } from './Timeline/types';
import { ContextMenu, ContextMenuItem } from './Common/ContextMenu';
import './ExplorerView.scss';

export interface ExplorerViewProps {
  // 打开的编辑器
  openEditors?: EditorInfo[];
  showOpenEditors?: boolean;
  onCloseAll?: () => void;
  
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
  onOutlineNodeToggle?: (node: OutlineNode) => void;
  onOutlineCollapseAll?: () => void;
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
  showOpenEditors = true,
  onCloseAll,
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
  onOutlineNodeToggle,
  onOutlineCollapseAll,
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
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  
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
  const createMenuItem = useCallback(
    (id: string, label: string, handler: () => void): ContextMenuItem => ({
      id,
      label,
      onClick: handler,
    }),
    []
  );

  const buildGeneralMenuItems = useCallback((): ContextMenuItem[] => {
    const creationItems: ContextMenuItem[] = [];
    const utilityItems: ContextMenuItem[] = [];

    if (onNewFile) {
      creationItems.push(createMenuItem('new-file', '新建文件', onNewFile));
    }

    if (onNewFolder) {
      creationItems.push(createMenuItem('new-folder', '新建文件夹', onNewFolder));
    }

    if (onRefresh) {
      utilityItems.push(createMenuItem('refresh', '刷新', onRefresh));
    }

    if (onCollapseAll) {
      utilityItems.push(createMenuItem('collapse-all', '折叠所有', onCollapseAll));
    }

    const composedItems: ContextMenuItem[] = [...creationItems];

    if (creationItems.length > 0 && utilityItems.length > 0) {
      composedItems.push({
        id: 'general-separator',
        label: '',
        separator: true,
      });
    }

    composedItems.push(...utilityItems);
    return composedItems;
  }, [createMenuItem, onNewFile, onNewFolder, onRefresh, onCollapseAll]);

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const handleFileContextMenu = useCallback((node: FileTreeNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const nodeItems: ContextMenuItem[] = [];

    if (node.isDirectory && onFolderToggle) {
      nodeItems.push(
        createMenuItem(
          node.isExpanded ? 'collapse-folder' : 'expand-folder',
          node.isExpanded ? '折叠文件夹' : '展开文件夹',
          () => onFolderToggle(node)
        )
      );
    }

    if (!node.isDirectory) {
      if (onFileClick) {
        nodeItems.push(createMenuItem('select-file', '定位文件', () => onFileClick(node)));
      }
      if (onFileDoubleClick) {
        nodeItems.push(createMenuItem('open-file', '打开文件', () => onFileDoubleClick(node)));
      }
    }

    const generalItems = buildGeneralMenuItems();
    const items: ContextMenuItem[] = [...nodeItems];

    if (nodeItems.length > 0 && generalItems.length > 0) {
      items.push({
        id: 'node-separator',
        label: '',
        separator: true,
      });
    }

    items.push(...generalItems);

    if (items.length === 0) {
      return;
    }

    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, [buildGeneralMenuItems, createMenuItem, onFileClick, onFileDoubleClick, onFolderToggle]);

  const handleTreeBackgroundContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const items = buildGeneralMenuItems();
    if (items.length === 0) {
      return;
    }

    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, [buildGeneralMenuItems]);

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
      {showOpenEditors && openEditors.length > 0 && (
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
        onContainerContextMenu={handleTreeBackgroundContextMenu}
      />

      {/* 大纲 */}
      {outlineNodes.length > 0 && (
        <OutlineSection
          nodes={outlineNodes}
          selectedNode={selectedOutlineNode}
          onNodeSelect={handleOutlineNodeSelect}
          onNodeToggle={onOutlineNodeToggle}
          onCollapse={onOutlineCollapseAll || (() => console.log('Collapse outline'))}
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

      {contextMenuState && (
        <ContextMenu
          items={contextMenuState.items}
          position={contextMenuState.position}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

export default ExplorerView;

