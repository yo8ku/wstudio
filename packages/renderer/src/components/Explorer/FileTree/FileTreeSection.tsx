/**
 * 文件树区域组件
 * 显示工作区的文件和文件夹结构
 */

import React, { useRef, useEffect, useCallback } from 'react';
import ExplorerSection from '../ExplorerSection';
import { FileTreeNode, FileTreeCallbacks } from './types';
import { InlineInput } from '../Common/InlineInput';
import { CustomScrollbar, CustomScrollbarRef } from '../../common/CustomScrollbar';
import { useExplorerStore } from '../../../stores/explorerStore';
import './FileTreeSection.scss';

export interface FileTreeSectionProps {
  rootName: string;
  rootPath: string;
  nodes: FileTreeNode[];
  selectedFilePath?: string;
  contextMenuSelectionPath?: string;
  callbacks?: FileTreeCallbacks;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onBlankAreaClick?: () => void;
  onContainerContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const FileTreeSection: React.FC<FileTreeSectionProps> = ({
  rootName,
  rootPath,
  nodes,
  selectedFilePath,
  contextMenuSelectionPath,
  callbacks,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onExpandedChange,
  onBlankAreaClick,
  onContainerContextMenu,
}) => {
  const scrollbarRef = useRef<CustomScrollbarRef>(null);
  const isRestoringScrollRef = useRef<boolean>(false);
  
  // 从 store 获取滚动位置
  const { fileTreeScrollTop, setFileTreeScrollTop, workspacePath } = useExplorerStore();

  // 处理滚动事件，保存滚动位置
  const handleScroll = useCallback((scrollTop: number) => {
    if (!isRestoringScrollRef.current) {
      setFileTreeScrollTop(scrollTop);
    }
  }, [setFileTreeScrollTop]);

  // 恢复滚动位置（当路径匹配时）
  useEffect(() => {
    if (!rootPath) return;
    
    // 只有当路径匹配时才恢复滚动位置
    if (rootPath === workspacePath) {
      if (fileTreeScrollTop > 0) {
        isRestoringScrollRef.current = true;
        
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          scrollbarRef.current?.setScrollTop(fileTreeScrollTop);
          // 延迟重置标志，避免立即触发滚动事件
          setTimeout(() => {
            isRestoringScrollRef.current = false;
          }, 100);
        });
      }
    } else {
      // 路径不匹配时，重置滚动位置
      scrollbarRef.current?.setScrollTop(0);
    }
  }, [rootPath, workspacePath, fileTreeScrollTop]);

  // 节点变化时更新滚动条
  useEffect(() => {
    scrollbarRef.current?.updateScrollbar();
  }, [nodes]);

  // 构建操作按钮
  const actions = [];

  if (onNewFile) {
    actions.push({
      id: 'new-file',
      icon: <i className="codicon codicon-new-file" />,
      tooltip: '新建文件',
      onClick: onNewFile,
    });
  }

  if (onNewFolder) {
    actions.push({
      id: 'new-folder',
      icon: <i className="codicon codicon-new-folder" />,
      tooltip: '新建文件夹',
      onClick: onNewFolder,
    });
  }

  if (onRefresh) {
    actions.push({
      id: 'refresh',
      icon: <i className="codicon codicon-refresh" />,
      tooltip: '刷新',
      onClick: onRefresh,
    });
  }

  if (onCollapseAll) {
    actions.push({
      id: 'collapse-all',
      icon: <i className="codicon codicon-collapse-all" />,
      tooltip: '全部折叠',
      onClick: onCollapseAll,
    });
  }

  // 渲染文件树节点
  const renderNode = (node: FileTreeNode) => {
    // 文件和文件夹共用选中状态：通过路径匹配判断是否选中
    const isSelected = node.path === selectedFilePath;
    const isContextMenuTarget = node.path === contextMenuSelectionPath;
    const icon = node.isDirectory
      ? node.isExpanded
        ? 'codicon-folder-opened'
        : 'codicon-folder'
      : 'codicon-file';

    // 如果是创建中的节点，显示内联输入框
    if (node.isCreating) {
      return (
        <div key={`creating-${node.creatingType}`} className="file-tree-node">
          <div
            className="file-tree-node-content creating"
            style={{ paddingLeft: `${(node.depth || 0) * 12 + 8}px` }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <span className="file-tree-chevron" />
            <i className={`file-tree-icon codicon ${node.creatingType === 'folder' ? 'codicon-folder' : 'codicon-file'}`} />
            <InlineInput
              placeholder={node.creatingType === 'folder' ? '新建文件夹' : '新建文件'}
              onConfirm={(name) => callbacks?.onCreateConfirm?.(node, name)}
              onCancel={() => callbacks?.onCreateCancel?.(node)}
              autoFocus={true}
            />
          </div>
        </div>
      );
    }

    // 如果是编辑中的节点，显示内联输入框
    if (node.isEditing) {
      return (
        <div key={node.path} className="file-tree-node">
          <div
            className="file-tree-node-content editing"
            style={{ paddingLeft: `${(node.depth || 0) * 12 + 8}px` }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            {node.isDirectory && (
              <i
                className={`file-tree-chevron codicon ${
                  node.isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
                }`}
              />
            )}
            {!node.isDirectory && <span className="file-tree-chevron" />}
            <i className={`file-tree-icon codicon ${icon}`} />
            <InlineInput
              initialValue={node.name}
              placeholder="输入名称"
              onConfirm={(newName) => callbacks?.onRename?.(node, newName)}
              onCancel={() => callbacks?.onRename?.(node, node.name)}
              autoFocus={true}
            />
          </div>
          {node.isDirectory && node.isExpanded && node.children && (
            <div className="file-tree-children">
              {node.children.map((child) => renderNode(child))}
            </div>
          )}
        </div>
      );
    }

    const depth = node.depth || 0;
    const parentDepth = depth > 0 ? depth - 1 : 0;

    return (
      <div key={node.path} className="file-tree-node" data-parent-depth={parentDepth}>
        <div
          className={`file-tree-node-content ${isSelected ? 'selected' : ''} ${
            isContextMenuTarget ? 'context-menu-active' : ''
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          data-depth={depth}
          onClick={() => {
            if (node.isDirectory) {
              // 文件夹：点击时选中并切换展开/折叠状态
              callbacks?.onFileClick?.(node);
              callbacks?.onFolderToggle?.(node);
            } else {
              // 文件：点击时选中
              callbacks?.onFileClick?.(node);
            }
          }}
          onDoubleClick={() => {
            if (!node.isDirectory) {
              callbacks?.onFileDoubleClick?.(node);
            }
          }}
          onContextMenu={(e) => callbacks?.onContextMenu?.(node, e)}
        >
          {node.isDirectory && (
            <i
              className={`file-tree-chevron codicon ${
                node.isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
              }`}
            />
          )}
          {!node.isDirectory && <span className="file-tree-chevron" />}
          <i className={`file-tree-icon codicon ${icon}`} />
          <span className="file-tree-name">{node.name}</span>
        </div>
        {node.isDirectory && node.isExpanded && node.children && (
          <div className="file-tree-children" data-parent-depth={depth}>
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  // 处理空白区域点击
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 只有当点击的是容器本身（空白区域），而不是子元素时才触发
    if (e.target === e.currentTarget && onBlankAreaClick) {
      onBlankAreaClick();
    }
  };

  return (
    <div className="file-tree-section">
      <ExplorerSection
        title={rootName}
        defaultExpanded={true}
        actions={actions}
        onExpandChange={onExpandedChange}
      >
        <CustomScrollbar
          ref={scrollbarRef}
          className="file-tree-content"
          onScroll={handleScroll}
          onClick={handleContentClick}
          onContextMenu={onContainerContextMenu}
        >
          {nodes.length === 0 ? (
            <div className="file-tree-empty">
              {rootPath ? '文件夹为空' : '尚未打开文件夹'}
            </div>
          ) : (
            <div className="tree-view">
              {nodes.map((node) => renderNode(node))}
            </div>
          )}
        </CustomScrollbar>
      </ExplorerSection>
    </div>
  );
};

export default FileTreeSection;
