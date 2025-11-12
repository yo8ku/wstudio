/**
 * 文件树组件
 * 功能：显示项目文件结构
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
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);
  const [rootFolderPath, setRootFolderPath] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // 滚动到指定文档
  const scrollToFile = useCallback((path: string) => {
    console.log('[FileTree] 尝试滚动到文档', path);
    const fileElement = document.querySelector(`[data-file-path="${path}"]`);
    console.log('[FileTree] 找到的元素', fileElement);
    if (fileElement) {
      fileElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      console.log('[FileTree] 滚动到文档', path);
    } else {
      console.warn('[FileTree] 未找到文件元素', path);
    }
  }, []);

  // 加载文件树
  const loadFileTree = useCallback(async (folderPath: string) => {
    try {
      console.log('[FileTree] 开始加载文件树:', folderPath);
      const result = await window.electron?.folder?.readTree(folderPath);
      
      if (result?.success && result.data) {
        console.log('[FileTree] 文件树加载成功', result.data);
        
        // 转换后端返回的数据结构为前端使用的结构
        const convertToFileTreeItem = (item: any): FileTreeItem => ({
          name: item.name,
          type: item.type === 'directory' ? 'folder' : 'file',
          path: item.path,
          isExpanded: item.isExpanded || false,
          children: item.children?.map(convertToFileTreeItem) || []
        });
        
        const treeData = result.data.map(convertToFileTreeItem);
        setFileTree(treeData);
        setRootFolderPath(folderPath);
      } else {
        console.error('[FileTree] 文件树加载失败', result?.error);
      }
    } catch (error) {
      console.error('[FileTree] 加载文件树出错', error);
    }
  }, []);

  // 监听文件夹打开事件
  useEffect(() => {
    const handleFolderOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      console.log('[FileTree] 收到 folder-opened 事件:', customEvent.detail.path);
      loadFileTree(customEvent.detail.path);
    };

    window.addEventListener('folder-opened', handleFolderOpened as EventListener);

    return () => {
      window.removeEventListener('folder-opened', handleFolderOpened as EventListener);
    };
  }, [loadFileTree]);

  // 在组件挂载时检查是否有工作区路径
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const result = await window.electron?.workspace?.getDir();
        if (result?.success && result.data) {
          console.log('[FileTree] 加载工作区', result.data);
          loadFileTree(result.data);
        }
      } catch (error) {
        console.error('[FileTree] 加载工作区失败', error);
      }
    };

    loadWorkspace();
  }, [loadFileTree]);

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

  // 监听刷新文件树事件
  useEffect(() => {
    const handleRefresh = () => {
      console.log('[FileTree] 收到 refresh-file-tree 事件');
      if (rootFolderPath) {
        loadFileTree(rootFolderPath);
      }
    };

    window.addEventListener('refresh-file-tree', handleRefresh);

    return () => {
      window.removeEventListener('refresh-file-tree', handleRefresh);
    };
  }, [rootFolderPath, loadFileTree]);

  const toggleFolder = useCallback(async (path: string) => {
    // 先更新展开状态
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
    
    // 查找当前文件夹项
    const findItem = (items: FileTreeItem[], targetPath: string): FileTreeItem | null => {
      for (const item of items) {
        if (item.path === targetPath) return item;
        if (item.children) {
          const found = findItem(item.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    setFileTree(currentTree => {
      const item = findItem(currentTree, path);
      
      // 如果是展开操作且子项为空，懒加载子目录
      if (item && !item.isExpanded && item.children?.length === 0) {
        // 异步加载子目录
        (async () => {
          if (!rootFolderPath) return;
          
          try {
            console.log('[FileTree] 懒加载子目录:', path);
            const result = await window.electron?.folder?.expand(path, rootFolderPath);
            
            if (result?.success && result.data) {
              console.log('[FileTree] 子目录加载成功', result.data);
              
              // 转换数据结构
              const convertToFileTreeItem = (item: any): FileTreeItem => ({
                name: item.name,
                type: item.type === 'directory' ? 'folder' : 'file',
                path: item.path,
                isExpanded: item.isExpanded || false,
                children: item.children?.map(convertToFileTreeItem) || []
              });
              
              const children = result.data.map(convertToFileTreeItem);
              
              // 更新树结构，添加子项
              setFileTree(prevTree => {
                const updateTreeWithChildren = (items: FileTreeItem[]): FileTreeItem[] => {
                  return items.map(item => {
                    if (item.path === path && item.type === 'folder') {
                      return { ...item, isExpanded: true, children };
                    }
                    if (item.children) {
                      return { ...item, children: updateTreeWithChildren(item.children) };
                    }
                    return item;
                  });
                };
                
                return updateTreeWithChildren(prevTree);
              });
            }
          } catch (error) {
            console.error('[FileTree] 加载子目录失败', error);
          }
        })();
        
        // 先展开当前节点
        return updateTree(currentTree);
      }
      
      // 否则只切换展开状态
      return updateTree(currentTree);
    });
  }, [rootFolderPath]);

  const handleFileClick = async (path: string) => {
    console.log('[FileTree] 点击文件:', path);
    setSelectedFilePath(path);
    
    try {
      // 读取文件内容
      console.log('[FileTree] 读取文件内容:', path);
      const content = await window.electron?.ipcRenderer.invoke('read-file', path);
      console.log('[FileTree] 文件内容长度:', content?.length || 0);
      
      // 获取文件名
      const fileName = path.split(/[/\\]/).pop() || 'Untitled';
      
      // 根据文件扩展名判断语言类型
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const languageMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'json': 'json',
        'md': 'markdown',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'less': 'less',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'py': 'python',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'shell',
        'bat': 'bat',
        'sql': 'sql',
      };
      const language = languageMap[ext] || 'plaintext';
      
      // 派发打开文件事件
      window.dispatchEvent(new CustomEvent('open-file', {
        detail: { 
          path,
          content,
          name: fileName,
          language
        }
      }));
    } catch (error) {
      console.error('[FileTree] 读取文件失败:', error);
      // 即使读取失败，也尝试打开（让 EditorArea 处理错误）
      window.dispatchEvent(new CustomEvent('open-file', {
        detail: { path }
      }));
    }
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
      {fileTree.length === 0 ? (
        <div className="file-tree-empty">
          <p>未打开任何文件夹</p>
          <p className="hint">使用 "文件 {'>'} 打开文件夹..." 打开一个文件夹</p>
        </div>
      ) : (
        renderFileTree(fileTree)
      )}

      <style>{`
        .file-tree {
          padding: 2px 0;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .file-tree-empty {
          padding: 20px;
          text-align: center;
          color: var(--ws-description-foreground, #888888);
          font-size: 13px;
        }

        .file-tree-empty p {
          margin: 8px 0;
        }

        .file-tree-empty .hint {
          font-size: 12px;
          opacity: 0.8;
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
          color: var(--ws-sidebar-foreground, currentColor);
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
