/**
 * 文件树区域组件
 * 显示工作区的文件和文件夹结构
 */

import React, { useRef, useState, useEffect } from 'react';
import ExplorerSection from '../ExplorerSection';
import { FileTreeNode, FileTreeCallbacks } from './types';
import { InlineInput } from '../Common/InlineInput';
import './FileTreeSection.scss';

export interface FileTreeSectionProps {
  rootName: string;
  rootPath: string;
  nodes: FileTreeNode[];
  selectedFilePath?: string;
  callbacks?: FileTreeCallbacks;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onBlankAreaClick?: () => void;
}

export const FileTreeSection: React.FC<FileTreeSectionProps> = ({
  rootName,
  rootPath,
  nodes,
  selectedFilePath,
  callbacks,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onExpandedChange,
  onBlankAreaClick,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const DEFAULT_OPACITY = 0.5; // 默认透明度
  const [scrollbarOpacity, setScrollbarOpacity] = useState(0.5); // 初始为0.5，始终显示
  const fadeTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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

  // 动态更新滚动条样式（使用主题配色）
  useEffect(() => {
    if (contentRef.current) {
      const styleId = 'file-tree-scrollbar-style';
      let styleElement = document.getElementById(styleId) as HTMLStyleElement;
      
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }

      // 获取 CSS 变量的颜色值并转换为 RGBA
      const getColorWithOpacity = (cssVar: string, fallbackColor: string, opacity: number) => {
        const computedStyle = getComputedStyle(document.documentElement);
        const color = computedStyle.getPropertyValue(cssVar).trim() || fallbackColor;
        
        // 如果颜色已经是 rgba 格式
        if (color.startsWith('rgba')) {
          return color.replace(/[\d.]+\)$/g, `${opacity})`);
        }
        
        // 如果是 rgb 格式，转换为 rgba
        if (color.startsWith('rgb')) {
          return color.replace('rgb', 'rgba').replace(')', `, ${opacity})`);
        }
        
        // 如果是十六进制，转换为 rgba
        if (color.startsWith('#')) {
          const hex = color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        
        return color;
      };

      // 使用主题配色，动态设置透明度
      const normalColor = getColorWithOpacity(
        '--ws-scrollbarSlider-background',
         'rgba(78, 79, 114, 0.37)',
        scrollbarOpacity
      );
      
      const hoverColor = getColorWithOpacity(
        '--ws-scrollbarSlider-hoverBackground',
        'rgba(78, 79, 114, 0.37)',
        scrollbarOpacity
      );
      
      const activeColor = getColorWithOpacity(
        '--ws-scrollbarSlider-activeBackground',
         'rgba(78, 79, 114, 0.37)',
        scrollbarOpacity
      );
      //TODO:  动态设置滚动条颜色
      styleElement.textContent = `
        .file-tree-content::-webkit-scrollbar-thumb {
          background: ${normalColor} !important;
        }
        .file-tree-content::-webkit-scrollbar-thumb:hover {
          background: ${hoverColor} !important;
        }
        .file-tree-content::-webkit-scrollbar-thumb:active {
          background: ${activeColor} !important;
        }
      `;
    }
  }, [scrollbarOpacity]);

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
    const isSelected = node.path === selectedFilePath;
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

    return (
      <div key={node.path} className="file-tree-node">
        <div
          className={`file-tree-node-content ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${(node.depth || 0) * 12 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              callbacks?.onFolderToggle?.(node);
            } else {
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
          <div className="file-tree-children">
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
          ref={contentRef}
          className="file-tree-content"
          onClick={handleContentClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
      </ExplorerSection>
    </div>
  );
};

export default FileTreeSection;

