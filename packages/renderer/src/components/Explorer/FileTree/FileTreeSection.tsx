/**
 * 文件树区域组件
 * 显示工作区的文件和文件夹结构
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import ExplorerSection from '../ExplorerSection';
import { FileTreeNode, FileTreeCallbacks } from './types';
import { InlineInput } from '../Common/InlineInput';
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
  const contentRef = useRef<HTMLDivElement>(null);
  const DEFAULT_OPACITY = 0.5; // 默认透明度
  const [scrollbarOpacity, setScrollbarOpacity] = useState(0.5); // 初始为0.5，始终显示
  const fadeTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRestoringScrollRef = useRef<boolean>(false);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
  const scrollbarUpdateFrameRef = useRef<number | null>(null);
  const isThumbDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  const hasScrollableContentRef = useRef(false);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  
  // 从 store 获取滚动位置
  const { fileTreeScrollTop, setFileTreeScrollTop, workspacePath } = useExplorerStore();

  // 淡入：立即中断所有动画并显示滚动条（鼠标悬停时显示默认透明度）
  const fadeIn = () => {
    // 取消所有进行中的动画
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // 立即设置为默认透明度
    setScrollbarOpacity(DEFAULT_OPACITY);
  };

  // 淡出：从默认透明度逐步降低到完全消失（每次减少 1%）
  const fadeOut = () => {
    const step = 0.01; // 每次减少 1%
    const interval = 10; // 10ms 减少一次
    let currentOpacity = DEFAULT_OPACITY;
    
    const animate = () => {
      currentOpacity -= step;
      
      // 降低到 0 时完全消失
      if (currentOpacity <= 0) {
        setScrollbarOpacity(0);
        return;
      }
      
      setScrollbarOpacity(currentOpacity);
      animationFrameRef.current = window.setTimeout(() => {
        animate();
      }, interval) as unknown as number;
    };

    animate();
  };

  // 处理鼠标进入
  const handleMouseEnter = () => {
    fadeIn();
  };

  // 处理鼠标离开
  const handleMouseLeave = () => {
    if (isThumbDraggingRef.current) {
      return;
    }
    fadeOut();
  };

  // 清理定时器和动画
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const updateHasScrollableContent = useCallback((value: boolean) => {
    if (hasScrollableContentRef.current !== value) {
      hasScrollableContentRef.current = value;
      setHasScrollableContent(value);
    }
  }, []);

  const scheduleScrollbarUpdate = useCallback(() => {
    if (scrollbarUpdateFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollbarUpdateFrameRef.current);
    }

    scrollbarUpdateFrameRef.current = window.requestAnimationFrame(() => {
      scrollbarUpdateFrameRef.current = null;

      const contentElement = contentRef.current;
      const thumbElement = scrollbarThumbRef.current;
      const trackElement = scrollbarTrackRef.current;

      if (!contentElement || !thumbElement) {
        updateHasScrollableContent(false);
        return;
      }

      const { scrollHeight, clientHeight, scrollTop } = contentElement;
      const hasScroll = scrollHeight - clientHeight > 1;

      updateHasScrollableContent(hasScroll);

      if (!hasScroll) {
        thumbElement.style.height = '0px';
        thumbElement.style.top = '0px';
        thumbElement.style.opacity = '0';
        return;
      }

      const trackHeight = trackElement?.clientHeight ?? clientHeight;
      const availableTrack = Math.max(trackHeight, 0);
      const ratio = scrollHeight > 0 ? clientHeight / scrollHeight : 0;
      const minThumbHeight = 24;
      const thumbHeight = Math.max(Math.round(availableTrack * ratio), minThumbHeight);
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbOffset = Math.max(availableTrack - thumbHeight, 0);
      const thumbOffset = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbOffset : 0;

      thumbElement.style.height = `${thumbHeight}px`;
      thumbElement.style.top = `${thumbOffset}px`;
      thumbElement.style.opacity = '1';
    });
  }, [updateHasScrollableContent]);

  const handleThumbMouseMove = useCallback((event: MouseEvent) => {
    if (!isThumbDraggingRef.current) {
      return;
    }

    event.preventDefault();
    const contentElement = contentRef.current;
    const thumbElement = scrollbarThumbRef.current;
    const trackElement = scrollbarTrackRef.current;

    if (!contentElement || !thumbElement) {
      return;
    }

    const { clientHeight, scrollHeight } = contentElement;
    const maxScrollTop = scrollHeight - clientHeight;

    if (maxScrollTop <= 0) {
      return;
    }

    const thumbHeight = parseFloat(thumbElement.style.height || '0');
    const trackHeight = trackElement?.clientHeight ?? clientHeight;
    const availableTrack = Math.max(trackHeight - thumbHeight, 0);

    if (availableTrack <= 0) {
      return;
    }

    const delta = event.clientY - dragStartYRef.current;
    const scrollRatio = maxScrollTop / availableTrack;
    const nextScrollTop = Math.min(
      Math.max(dragStartScrollTopRef.current + delta * scrollRatio, 0),
      maxScrollTop
    );

    contentElement.scrollTop = nextScrollTop;
    scheduleScrollbarUpdate();
  }, [scheduleScrollbarUpdate]);

  const handleThumbMouseUp = useCallback(() => {
    if (!isThumbDraggingRef.current) {
      return;
    }

    isThumbDraggingRef.current = false;
    setIsThumbDragging(false);
    window.removeEventListener('mousemove', handleThumbMouseMove);
    window.removeEventListener('mouseup', handleThumbMouseUp);
    const wrapperElement = scrollbarTrackRef.current?.parentElement;
    if (!wrapperElement || !wrapperElement.matches(':hover')) {
      fadeOut();
    } else {
      fadeIn();
    }
  }, [handleThumbMouseMove]);

  const handleThumbMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!contentRef.current) {
      return;
    }

    isThumbDraggingRef.current = true;
    setIsThumbDragging(true);
    fadeIn();
    dragStartYRef.current = event.clientY;
    dragStartScrollTopRef.current = contentRef.current.scrollTop;

    window.addEventListener('mousemove', handleThumbMouseMove);
    window.addEventListener('mouseup', handleThumbMouseUp);
  }, [handleThumbMouseMove, handleThumbMouseUp]);

  useEffect(() => {
    return () => {
      if (scrollbarUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollbarUpdateFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleThumbMouseMove);
      window.removeEventListener('mouseup', handleThumbMouseUp);
    };
  }, [handleThumbMouseMove, handleThumbMouseUp]);

  // 监听滚动事件，保存滚动位置并同步自定义滚动条
  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const handleScroll = () => {
      if (!contentElement) {
        return;
      }

      if (!isRestoringScrollRef.current) {
        setFileTreeScrollTop(contentElement.scrollTop);
      }

      scheduleScrollbarUpdate();
    };

    contentElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      contentElement.removeEventListener('scroll', handleScroll);
    };
  }, [scheduleScrollbarUpdate, setFileTreeScrollTop]);

  // 恢复滚动位置（当路径匹配时）
  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement || !rootPath) return;
    
    // 只有当路径匹配时才恢复滚动位置
    if (rootPath === workspacePath) {
      if (fileTreeScrollTop > 0) {
        isRestoringScrollRef.current = true;
        
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          contentElement.scrollTop = fileTreeScrollTop;
          scheduleScrollbarUpdate();
          // 延迟重置标志，避免立即触发滚动事件
          setTimeout(() => {
            isRestoringScrollRef.current = false;
          }, 100);
        });
      }
    } else {
      // 路径不匹配时，重置滚动位置
      contentElement.scrollTop = 0;
      scheduleScrollbarUpdate();
    }
  }, [rootPath, workspacePath, fileTreeScrollTop, scheduleScrollbarUpdate]);

  useEffect(() => {
    scheduleScrollbarUpdate();
  }, [nodes, scheduleScrollbarUpdate]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    scheduleScrollbarUpdate();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleScrollbarUpdate();
    });

    observer.observe(contentElement);

    return () => {
      observer.disconnect();
    };
  }, [scheduleScrollbarUpdate]);

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
  const handleContentClick = (e: React.MouseEvent) => {
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
        <div
          className="file-tree-content-wrapper"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div 
            ref={contentRef}
            className="file-tree-content"
            onClick={handleContentClick}
            onContextMenu={(event) => {
              if (onContainerContextMenu) {
                onContainerContextMenu(event);
              }
            }}
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
          </div>
          <div
            className="file-tree-custom-scrollbar"
            ref={scrollbarTrackRef}
            aria-hidden="true"
            style={{ opacity: hasScrollableContent ? scrollbarOpacity : 0 }}
          >
            <div
              className={`file-tree-custom-scrollbar-thumb${isThumbDragging ? ' is-dragging' : ''}`}
              ref={scrollbarThumbRef}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        </div>
      </ExplorerSection>
    </div>
  );
};

export default FileTreeSection;

