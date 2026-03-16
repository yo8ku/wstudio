/**
 * 鏂囦欢鏍戝尯鍩熺粍浠?
 * 鏄剧ず宸ヤ綔鍖虹殑鏂囦欢鍜屾枃浠跺す缁撴瀯
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
  // 浠?store 鑾峰彇婊氬姩浣嶇疆
  const { fileTreeScrollTop, setFileTreeScrollTop, workspacePath } = useExplorerStore();

  // 澶勭悊婊氬姩浜嬩欢锛屼繚瀛樻粴鍔ㄤ綅缃?
  const handleScroll = useCallback((scrollTop: number) => {
    if (!isRestoringScrollRef.current) {
      setFileTreeScrollTop(scrollTop);
    }
  }, [setFileTreeScrollTop]);

  // 鎭㈠婊氬姩浣嶇疆锛堝綋璺緞鍖归厤鏃讹級
  useEffect(() => {
    if (!rootPath) return;
    
    // 鍙湁褰撹矾寰勫尮閰嶆椂鎵嶆仮澶嶆粴鍔ㄤ綅缃?
    if (rootPath === workspacePath) {
      if (fileTreeScrollTop > 0) {
        isRestoringScrollRef.current = true;
        
        // 浣跨敤 requestAnimationFrame 纭繚 DOM 宸叉洿鏂?
        requestAnimationFrame(() => {
          scrollbarRef.current?.setScrollTop(fileTreeScrollTop);
          // 寤惰繜閲嶇疆鏍囧織锛岄伩鍏嶇珛鍗宠Е鍙戞粴鍔ㄤ簨浠?
          setTimeout(() => {
            isRestoringScrollRef.current = false;
          }, 100);
        });
      }
    } else {
      // 璺緞涓嶅尮閰嶆椂锛岄噸缃粴鍔ㄤ綅缃?
      scrollbarRef.current?.setScrollTop(0);
    }
  }, [rootPath, workspacePath, fileTreeScrollTop]);

  // 鑺傜偣鍙樺寲鏃舵洿鏂版粴鍔ㄦ潯
  useEffect(() => {
    scrollbarRef.current?.updateScrollbar();
  }, [nodes]);

  // 鏋勫缓鎿嶄綔鎸夐挳
  const actions = [];

  if (onNewFile) {
    actions.push({
      id: 'new-file',
      icon: <i className="codicon codicon-new-file" />,
      tooltip: '鏂板缓鏂囦欢',
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
      tooltip: '鍒锋柊',
      onClick: onRefresh,
    });
  }

  if (onCollapseAll) {
    actions.push({
      id: 'collapse-all',
      icon: <i className="codicon codicon-collapse-all" />,
      tooltip: '鍏ㄩ儴鎶樺彔',
      onClick: onCollapseAll,
    });
  }

  // 娓叉煋鏂囦欢鏍戣妭鐐?
  const renderNode = (node: FileTreeNode) => {
    // 鏂囦欢鍜屾枃浠跺す鍏辩敤閫変腑鐘舵€侊細閫氳繃璺緞鍖归厤鍒ゆ柇鏄惁閫変腑
    const isSelected = node.path === selectedFilePath;
    const isContextMenuTarget = node.path === contextMenuSelectionPath;
    const icon = node.isDirectory
      ? node.isExpanded
        ? 'codicon-folder-opened'
        : 'codicon-folder'
      : 'codicon-file';

    // 濡傛灉鏄垱寤轰腑鐨勮妭鐐癸紝鏄剧ず鍐呰仈杈撳叆妗?
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

    // 濡傛灉鏄紪杈戜腑鐨勮妭鐐癸紝鏄剧ず鍐呰仈杈撳叆妗?
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
              placeholder="杈撳叆鍚嶇О"
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
              // 鏂囦欢澶癸細鐐瑰嚮鏃堕€変腑骞跺垏鎹㈠睍寮€/鎶樺彔鐘舵€?
              callbacks?.onFileClick?.(node);
              callbacks?.onFolderToggle?.(node);
            } else {
              // 鏂囦欢锛氱偣鍑绘椂閫変腑
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

  // 澶勭悊绌虹櫧鍖哄煙鐐瑰嚮
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 鍙湁褰撶偣鍑荤殑鏄鍣ㄦ湰韬紙绌虹櫧鍖哄煙锛夛紝鑰屼笉鏄瓙鍏冪礌鏃舵墠瑙﹀彂
    if (e.target === e.currentTarget && onBlankAreaClick) {
      onBlankAreaClick();
    }
  };

  const fileTreeTitle = rootPath && rootName ? rootName : '文件夹';

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
          onScroll={handleScroll}
          onClick={handleContentClick}
          onContextMenu={onContainerContextMenu}
        >
          {nodes.length === 0 ? (
            <div className="file-tree-empty">
              {rootPath ? '文件夹为空' : '尚未打开文件夹'}
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
