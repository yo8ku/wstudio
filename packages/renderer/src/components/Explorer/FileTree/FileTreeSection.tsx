import React, { useState, useEffect, useRef } from 'react';
import { AccordionSection } from '../Accordion/AccordionSection';
import { TreeView } from '../Common/TreeView';
import { FileTreeNode } from './FileTreeNode';
import { FileTreeNode as FileTreeNodeType, FileTreeCallbacks } from './types';
import { DragDropHandler } from './DragDropHandler';
import './FileTreeSection.scss';

export interface FileTreeSectionProps {
  rootName: string;
  rootPath: string;
  nodes: FileTreeNodeType[];
  selectedFilePath?: string;
  callbacks: FileTreeCallbacks;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onBlankAreaClick?: () => void;
}

/**
 * 文件树面板
 * 显示项目文件结构
 */
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
  
  const [dragDropHandler] = useState(() => new DragDropHandler());
  const treeViewRef = useRef<HTMLDivElement>(null);
  
  // 监听文件树展示事件，滚动到选中的文件
  useEffect(() => {
    const handleReveal = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      console.log('[FileTreeSection] 收到 file-tree-reveal 事件:', customEvent.detail?.path);
      console.log('[FileTreeSection] treeViewRef.current:', treeViewRef.current);
      
      if (customEvent.detail?.path && treeViewRef.current) {
        let targetElement: HTMLElement | null = null;
        const originalPath = customEvent.detail.path;
        
        // 标准化路径：统一使用反斜杠（Windows风格）
        const normalizedSearchPath = originalPath.replace(/\//g, '\\');
        
        // 尝试精确匹配
        targetElement = treeViewRef.current.querySelector(
          `[data-file-path="${normalizedSearchPath}"]`
        ) as HTMLElement;

        console.log('[FileTreeSection] 查找选择器:', `[data-file-path="${normalizedSearchPath}"]`);
        console.log('[FileTreeSection] 找到的元素:', targetElement);

        // 如果没找到，尝试正斜杠格式
        if (!targetElement) {
          const forwardSlashPath = originalPath.replace(/\\/g, '/');
          targetElement = treeViewRef.current.querySelector(
            `[data-file-path="${forwardSlashPath}"]`
          ) as HTMLElement;
          console.log('[FileTreeSection] 尝试正斜杠路径:', forwardSlashPath);
          console.log('[FileTreeSection] 找到的元素:', targetElement);
        }

        // 如果还没找到，尝试原始路径
        if (!targetElement) {
          targetElement = treeViewRef.current.querySelector(
            `[data-file-path="${originalPath}"]`
          ) as HTMLElement;
          console.log('[FileTreeSection] 尝试原始路径:', originalPath);
          console.log('[FileTreeSection] 找到的元素:', targetElement);
        }

        // 如果还是没找到，尝试通过文件名模糊匹配（作为后备）
        if (!targetElement) {
          const allElements = treeViewRef.current.querySelectorAll('[data-file-path]');
          const fileName = originalPath.split(/[\\/]/).pop();
          
          if (fileName) {
            // 尝试找到路径末尾匹配的元素
            for (const el of Array.from(allElements)) {
              const elPath = el.getAttribute('data-file-path');
              if (elPath && elPath.endsWith(fileName)) {
                targetElement = el as HTMLElement;
                console.log('[FileTreeSection] 通过文件名找到匹配:', elPath);
                break;
              }
            }
          }
        }

        if (targetElement) {
          // 滚动到视图中，居中显示
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          console.log('[FileTreeSection] ✅ 已滚动到元素');
        } else {
          console.error('[FileTreeSection] ❌ 未找到匹配的元素');
          console.error('[FileTreeSection] 原始路径:', originalPath);
          console.error('[FileTreeSection] 路径字符统计:', {
            hasBackslash: originalPath.includes('\\'),
            hasForwardSlash: originalPath.includes('/'),
            length: originalPath.length
          });
          
          // 调试：列出所有带 data-file-path 的元素
          const allElements = treeViewRef.current.querySelectorAll('[data-file-path]');
          console.error('[FileTreeSection] 所有文件路径元素数量:', allElements.length);
          
          if (allElements.length > 0) {
            console.error('[FileTreeSection] 前10个元素的路径:');
            Array.from(allElements).slice(0, 10).forEach((el, idx) => {
              const path = el.getAttribute('data-file-path');
              console.error(`  [${idx}]`, path);
              console.error(`      字符统计:`, {
                hasBackslash: path?.includes('\\'),
                hasForwardSlash: path?.includes('/'),
                length: path?.length
              });
            });
            
            // 尝试模糊匹配
            console.error('[FileTreeSection] 尝试模糊匹配（文件名）...');
            const fileName = originalPath.split(/[\\/]/).pop();
            const fuzzyMatches = Array.from(allElements).filter(el => {
              const path = el.getAttribute('data-file-path');
              return path?.includes(fileName || '');
            });
            console.error(`[FileTreeSection] 找到 ${fuzzyMatches.length} 个包含 "${fileName}" 的元素`);
            fuzzyMatches.slice(0, 3).forEach(el => {
              console.error('  匹配:', el.getAttribute('data-file-path'));
            });
          }
        }
      }
    };

    window.addEventListener('file-tree-reveal', handleReveal as EventListener);
    return () => {
      window.removeEventListener('file-tree-reveal', handleReveal as EventListener);
    };
  }, []);

  // 当 selectedFilePath 改变时也触发滚动（作为后备方案）
  useEffect(() => {
    if (selectedFilePath && treeViewRef.current) {
      // 延迟执行，确保 DOM 已更新
      setTimeout(() => {
        const targetElement = treeViewRef.current?.querySelector(
          `[data-file-path="${selectedFilePath}"]`
        ) as HTMLElement;

        if (targetElement) {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }
      }, 100);
    }
  }, [selectedFilePath]);

  const actions = [];

  if (onNewFile) {
    actions.push({
      id: 'new-file',
      icon: 'codicon-new-file',
      tooltip: '新建文件',
      onClick: onNewFile,
    });
  }

  if (onNewFolder) {
    actions.push({
      id: 'new-folder',
      icon: 'codicon-new-folder',
      tooltip: '新建文件夹',
      onClick: onNewFolder,
    });
  }

  if (onRefresh) {
    actions.push({
      id: 'refresh',
      icon: 'codicon-refresh',
      tooltip: '刷新资源管理器',
      onClick: onRefresh,
    });
  }

  if (onCollapseAll) {
    actions.push({
      id: 'collapse-all',
      icon: 'codicon-collapse-all',
      tooltip: '全部折叠',
      onClick: onCollapseAll,
    });
  }

  // 添加调试日志
  console.log('[FileTreeSection] 🎨 渲染中，参数:', {
    rootName,
    rootPath,
    nodesLength: nodes.length,
    nodes: nodes.slice(0, 3), // 只显示前3个节点避免日志过长
    selectedFilePath
  });

  // 添加更多调试信息
  console.log('[FileTreeSection] 🔍 详细渲染状态:', {
    hasNodes: nodes.length > 0,
    firstNodeName: nodes[0]?.name,
    firstNodeType: nodes[0]?.type,
    firstNodePath: nodes[0]?.path,
    renderingEmptyState: nodes.length === 0
  });

  return (
    <AccordionSection
      title={rootName.toUpperCase()}
      defaultExpanded={true}
      actions={actions}
      flexGrow={true}
      onExpandChange={onExpandedChange}
    >
      <div 
        className="file-tree-section" 
        ref={treeViewRef}
      >
        <TreeView onBlankAreaClick={onBlankAreaClick}>
          {nodes.length === 0 ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center',
              color: 'var(--vscode-descriptionForeground)',
              fontSize: '13px',
            }}>
              <p style={{ marginBottom: '12px' }}>尚未打开文件夹</p>
              <button 
                onClick={() => window.electron?.folder?.open()}
                style={{
                  padding: '6px 14px',
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: '1px solid var(--vscode-button-border, transparent)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--vscode-button-background)';
                }}
              >
                打开文件夹
              </button>
            </div>
          ) : (
            <>
              {(() => {
                console.log('[FileTreeSection] 🚀 开始渲染文件节点，数量:', nodes.length);
                return nodes.map((node, index) => {
                  return (
                    <FileTreeNode
                      key={node.id || node.path}
                      node={node}
                      selectedFilePath={selectedFilePath}
                      callbacks={callbacks}
                      dragDropHandler={dragDropHandler}
                    />
                  );
                });
              })()}
            </>
          )}
        </TreeView>
      </div>
    </AccordionSection>
  );
};

export default FileTreeSection;

