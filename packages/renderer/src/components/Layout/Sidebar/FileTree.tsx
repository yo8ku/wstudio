/**
 * 文件树组件
 * 显示项目文件结构
 */

import React, { useState, useEffect, useCallback } from 'react';

interface FileTreeItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeItem[];
  isExpanded?: boolean;
}

export const FileTree: React.FC = () => {
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([
    {
      name: 'src',
      type: 'folder',
      path: 'src',
      isExpanded: true,
      children: [
        {
          name: 'components',
          type: 'folder',
          path: 'src/components',
          isExpanded: true,
          children: [
            {
              name: 'Button.tsx',
              type: 'file',
              path: 'src/components/Button.tsx'
            }
          ]
        },
        {
          name: 'utils',
          type: 'folder',
          path: 'src/utils',
          isExpanded: false,
          children: []
        },
        {
          name: 'index.ts',
          type: 'file',
          path: 'src/index.ts'
        }
      ]
    },
    {
      name: 'public',
      type: 'folder',
      path: 'public',
      isExpanded: false,
      children: []
    },
    {
      name: 'README.md',
      type: 'file',
      path: 'README.md'
    }
  ]);

  // 跟踪当前选中的文件路径
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // 滚动到指定文件
  const scrollToFile = useCallback((path: string) => {
    console.log('[FileTree] 尝试滚动到文件:', path);
    const fileElement = document.querySelector(`[data-file-path="${path}"]`);
    console.log('[FileTree] 找到的元素:', fileElement);
    if (fileElement) {
      fileElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      console.log('[FileTree] 滚动到文件:', path);
    } else {
      console.warn('[FileTree] 未找到文件元素:', path);
    }
  }, []);

  // 监听编辑器切换文件事件
  useEffect(() => {
    const handleActiveFileChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      console.log('[FileTree] 收到 editor-active-file-change 事件:', customEvent.detail.path);
      setSelectedFilePath(customEvent.detail.path);
      
      // 延迟滚动，等待 DOM 更新
      setTimeout(() => {
        scrollToFile(customEvent.detail.path);
      }, 100);
    };

    window.addEventListener('editor-active-file-change', handleActiveFileChange as EventListener);

    return () => {
      window.removeEventListener('editor-active-file-change', handleActiveFileChange as EventListener);
    };
  }, [scrollToFile]);

  const toggleFolder = (path: string) => {
    const updateTree = (items: FileTreeItem[]): FileTreeItem[] => {
      return items.map(item => {
        if (item.path === path && item.type === 'folder') {
          return { ...item, isExpanded: !item.isExpanded };
        }
        if (item.children) {
          return { ...item, children: updateTree(item.children) };
        }
        return item;
      });
    };
    setFileTree(updateTree(fileTree));
  };

  const handleFileClick = (path: string) => {
    console.log('[FileTree] 点击文件:', path);
    setSelectedFilePath(path);
    // 派发打开文件事件
    window.dispatchEvent(new CustomEvent('open-file', {
      detail: { path }
    }));
  };

  const FileIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.5 1h-11l-.5.5v13l.5.5h11l.5-.5v-13l-.5-.5zM13 14H3V2h10v12z" />
      <path d="M5 4h6v1H5V4zm0 2h6v1H5V6zm0 2h6v1H5V8z" />
    </svg>
  );

  const FolderIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14.5 3H7.71l-.85-.85L6.51 2h-5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13h-12V7h4.49l.35-.15.86-.86H14v1.5l-.01 4zm0-6.49h-6.5l-.35.15-.86.86H2v-3h4.29l.85.85.36.15H14l-.01.99z" />
    </svg>
  );

  const ChevronIcon = ({ isExpanded }: { isExpanded: boolean }) => (
    <svg 
      className="w-4 h-4" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={
          isExpanded
            ? 'M19 9l-7 7-7-7'  // 展开：向下箭头
            : 'M9 5l7 7-7 7'    // 折叠：向右箭头
        }
      />
    </svg>
  );

  const renderFileTree = (items: FileTreeItem[], level = 0) => {
    return items.map((item) => {
      const isSelected = item.type === 'file' && item.path === selectedFilePath;
      
      return (
        <div key={item.path} className="tree-node" style={{ position: 'relative' }}>
          <div
            className={`file-tree-item ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            data-file-path={item.path}
            onClick={() => {
              if (item.type === 'folder') {
                toggleFolder(item.path);
              } else {
                handleFileClick(item.path);
              }
            }}
          >
          {level > 0 && (
            <div
              className="indent-guide"
              style={{
                position: 'absolute',
                left: `${(level - 1) * 20 + 12}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                background: 'var(--indent-guide-bg, rgba(255, 255, 255, 0.08))'
              }}
            />
          )}
          {item.type === 'folder' ? (
            <>
              <span className="chevron">
                <ChevronIcon isExpanded={item.isExpanded || false} />
              </span>
              <span className="icon">
                <FolderIcon />
              </span>
            </>
          ) : (
            <>
              <span className="chevron-placeholder"></span>
              <span className="icon">
                <FileIcon />
              </span>
            </>
          )}
          <span className="name">{item.name}</span>
          </div>
          {item.type === 'folder' && item.isExpanded && item.children && (
            <>{renderFileTree(item.children, level + 1)}</>
          )}
        </div>
      );
    });
  };

  return (
    <div className="file-tree">
      {renderFileTree(fileTree)}

      <style>{`
        .file-tree {
          padding: 2px 0;
        }

        .file-tree-item {
          display: flex;
          align-items: center;
          padding: 1px 8px;
          cursor: pointer;
          font-size: 13px;
          user-select: none;
          line-height: 20px;
        }

        .file-tree-item:hover {
          background: var(--hover-bg, rgba(255, 255, 255, 0.1));
        }

        .file-tree-item.selected {
          background: var(--selected-bg, rgba(100, 150, 255, 0.3));
        }

        .file-tree-item.selected:hover {
          background: var(--selected-hover-bg, rgba(100, 150, 255, 0.4));
        }

        .chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-right: 4px;
          opacity: 0.8;
          width: 16px;
          height: 16px;
        }

        .chevron-placeholder {
          display: inline-block;
          width: 16px;
          margin-right: 4px;
        }

        .icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-right: 6px;
          width: 16px;
          height: 16px;
          color: var(--sidebar-fg, currentColor);
        }

        .name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};
