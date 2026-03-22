/**
 * File tree section.
 * Renders workspace files and folders, header actions, and node interactions.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import ExplorerSection, { type ActionButton } from '../ExplorerSection';
import { FileTreeNode, FileTreeCallbacks } from './types';
import { InlineInput } from '../Common/InlineInput';
import { CustomScrollbar, CustomScrollbarRef } from '../../common/CustomScrollbar';
import { Icon } from '../../Icons/Icon';
import { useExplorerStore } from '../../../stores/explorerStore';
import './FileTreeSection.scss';

export interface FileTreeSectionProps {
  rootName: string;
  rootPath: string;
  nodes: FileTreeNode[];
  selectedFilePath?: string;
  revealRequest?: {
    id: number;
    path: string;
  } | null;
  contextMenuSelectionPath?: string;
  callbacks?: FileTreeCallbacks;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onBlankAreaClick?: () => void;
  onContainerContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const FileTreeSection: React.FC<FileTreeSectionProps> = ({
  rootName,
  rootPath,
  nodes,
  selectedFilePath,
  revealRequest,
  contextMenuSelectionPath,
  callbacks,
  onNewFile,
  onNewFolder,
  onRefresh,
  onExpandedChange,
  onBlankAreaClick,
  onContainerContextMenu,
}) => {
  const scrollbarRef = useRef<CustomScrollbarRef>(null);
  const isRestoringScrollRef = useRef<boolean>(false);
  const scrollSnapFrameRef = useRef<number | null>(null);
  const { fileTreeScrollTop, setFileTreeScrollTop, workspacePath } = useExplorerStore();

  const handleScroll = useCallback((scrollTop: number) => {
    if (!isRestoringScrollRef.current) {
      setFileTreeScrollTop(Math.round(scrollTop));
    }
  }, [setFileTreeScrollTop]);

  const snapScrollTopToPixel = useCallback((): void => {
    const contentElement = scrollbarRef.current?.getContentElement();
    if (!contentElement) {
      return;
    }

    const roundedScrollTop = Math.round(contentElement.scrollTop);
    if (Math.abs(contentElement.scrollTop - roundedScrollTop) < 0.01) {
      return;
    }

    contentElement.scrollTop = roundedScrollTop;
  }, []);

  useEffect(() => {
    if (!rootPath) {
      return;
    }

    if (rootPath === workspacePath) {
      if (fileTreeScrollTop > 0) {
        isRestoringScrollRef.current = true;

        requestAnimationFrame(() => {
          scrollbarRef.current?.setScrollTop(fileTreeScrollTop);
          setTimeout(() => {
            isRestoringScrollRef.current = false;
          }, 100);
        });
      }
      return;
    }

    scrollbarRef.current?.setScrollTop(0);
  }, [rootPath, workspacePath]);

  useEffect(() => {
    scrollbarRef.current?.updateScrollbar();
  }, [nodes]);

  useEffect(() => {
    const contentElement = scrollbarRef.current?.getContentElement();
    if (!contentElement) {
      return;
    }

    const handleNativeScroll = (): void => {
      if (scrollSnapFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSnapFrameRef.current);
      }

      scrollSnapFrameRef.current = window.requestAnimationFrame(() => {
        scrollSnapFrameRef.current = null;
        snapScrollTopToPixel();
      });
    };

    contentElement.addEventListener('scroll', handleNativeScroll, { passive: true });

    return () => {
      contentElement.removeEventListener('scroll', handleNativeScroll);
      if (scrollSnapFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSnapFrameRef.current);
        scrollSnapFrameRef.current = null;
      }
    };
  }, [snapScrollTopToPixel]);

  useEffect(() => {
    if (!revealRequest?.path) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const contentElement = scrollbarRef.current?.getContentElement();
      if (!contentElement) {
        return;
      }

      const targetElement = Array.from(
        contentElement.querySelectorAll<HTMLElement>('[data-file-path]'),
      ).find((element) => element.dataset.filePath === revealRequest.path);

      if (!targetElement) {
        return;
      }

      targetElement.scrollIntoView({
        block: 'nearest',
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, revealRequest]);

  const resolveNodeIconName = (node: FileTreeNode): 'folder' | 'folder-open' | 'file' => {
    if (node.isDirectory) {
      return node.isExpanded ? 'folder-open' : 'folder';
    }

    return 'file';
  };

  const actions: ActionButton[] = [];

  if (onNewFile) {
    actions.push({
      id: 'new-file',
      icon: <Icon iconSet="ui" name="new-file" size={16} />,
      tooltip: '\u65b0\u5efa\u6587\u4ef6',
      onClick: onNewFile,
    });
  }

  if (onNewFolder) {
    actions.push({
      id: 'new-folder',
      icon: <Icon iconSet="ui" name="new-folder" size={16} />,
      tooltip: '\u65b0\u5efa\u6587\u4ef6\u5939',
      onClick: onNewFolder,
    });
  }

  if (onRefresh) {
    actions.push({
      id: 'refresh',
      icon: <Icon iconSet="ui" name="refresh" size={16} />,
      tooltip: '\u5237\u65b0',
      onClick: onRefresh,
    });
  }

  const renderChevron = (expanded: boolean): React.ReactNode => {
    return (
      <Icon
        iconSet="ui"
        name={expanded ? 'chevron-down' : 'chevron-right'}
        size={14}
        className="file-tree-chevron"
      />
    );
  };

  const renderNodeIcon = (node: FileTreeNode): React.ReactNode => {
    return (
      <Icon
        iconSet="ui"
        name={resolveNodeIconName(node)}
        size={16}
        className="file-tree-icon"
      />
    );
  };

  const renderNode = (node: FileTreeNode): React.ReactNode => {
    const isSelected = node.path === selectedFilePath;
    const isContextMenuTarget = node.path === contextMenuSelectionPath;

    if (node.isCreating) {
      return (
        <div key={`creating-${node.creatingType}`} className="file-tree-node">
          <div
            className="file-tree-node-content creating"
            style={{ paddingLeft: `${(node.depth || 0) * 12 + 8}px` }}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onMouseUp={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <span className="file-tree-chevron" />
            <Icon
              iconSet="ui"
              name={node.creatingType === 'folder' ? 'folder' : 'file'}
              size={16}
              className="file-tree-icon"
            />
            <InlineInput
              placeholder={node.creatingType === 'folder' ? '\u65b0\u5efa\u6587\u4ef6\u5939' : '\u65b0\u5efa\u6587\u4ef6'}
              onConfirm={(name) => callbacks?.onCreateConfirm?.(node, name)}
              onCancel={() => callbacks?.onCreateCancel?.(node)}
              autoFocus={true}
            />
          </div>
        </div>
      );
    }

    if (node.isEditing) {
      return (
        <div key={node.path} className="file-tree-node">
          <div
            className="file-tree-node-content editing"
            style={{ paddingLeft: `${(node.depth || 0) * 12 + 8}px` }}
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            {node.isDirectory ? renderChevron(Boolean(node.isExpanded)) : <span className="file-tree-chevron" />}
            {renderNodeIcon(node)}
            <InlineInput
              initialValue={node.name}
              placeholder="\u8f93\u5165\u540d\u79f0"
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
          data-file-path={node.path}
          onClick={() => {
            if (node.isDirectory) {
              callbacks?.onFileClick?.(node);
              callbacks?.onFolderToggle?.(node);
              return;
            }

            callbacks?.onFileClick?.(node);
          }}
          onDoubleClick={() => {
            if (!node.isDirectory) {
              callbacks?.onFileDoubleClick?.(node);
            }
          }}
          onContextMenu={(event) => callbacks?.onContextMenu?.(node, event)}
        >
          {node.isDirectory ? renderChevron(Boolean(node.isExpanded)) : <span className="file-tree-chevron" />}
          {renderNodeIcon(node)}
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

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && onBlankAreaClick) {
      onBlankAreaClick();
    }
  };

  const fileTreeTitle = rootPath && rootName ? rootName : '\u6587\u4ef6\u5939';

  return (
    <div className="file-tree-section">
      <ExplorerSection
        title={fileTreeTitle}
        defaultExpanded={true}
        preserveTitleCase={true}
        toggleIconMode="folder-on-idle"
        actions={actions}
        onExpandChange={onExpandedChange}
      >
        <CustomScrollbar
          ref={scrollbarRef}
          className="file-tree-content"
          scrollbarWidth={10}
          onScroll={handleScroll}
          onClick={handleContentClick}
          onContextMenu={onContainerContextMenu}
        >
          {nodes.length === 0 ? (
            <div className="file-tree-empty">
              {rootPath ? '\u6587\u4ef6\u5939\u4e3a\u7a7a' : '\u5c1a\u672a\u6253\u5f00\u6587\u4ef6\u5939'}
            </div>
          ) : null}
          {nodes.length > 0 && (
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

