/**
 * 文件浏览器组件
 * 功能：集成资源管理器，包括打开的编辑器、文件树、大纲
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ExplorerView } from '../../../Explorer';
import type { EditorInfo, FileTreeNode } from '../../../Explorer';
import type { OutlineNode } from '../../../Explorer/Outline/types';
import { OutlineSymbolKind } from '../../../Explorer/Outline/types';
import { OutlineService } from '../../../../services/OutlineService';
import { electronStore } from '../../../../services/ElectronStoreService';

export const FileExplorer: React.FC = () => {
  // 文件树状态
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [rootFolderPath, setRootFolderPath] = useState<string>('');
  const [rootFolderName, setRootFolderName] = useState<string>('');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  
  // 内联编辑状态 - 使用 ref 避免闭包陷阱
  const [isInlineEditing, setIsInlineEditing] = useState<boolean>(false);
  const isInlineEditingRef = useRef<boolean>(false);
  
  // 打开的编辑器
  const [openEditors, setOpenEditors] = useState<EditorInfo[]>([]);
  
  // 是否显示"打开的编辑器"列表（由菜单控制）
  const [showOpenEditors, setShowOpenEditors] = useState<boolean>(true);

  // 大纲数据
  const [outlineData, setOutlineData] = useState<OutlineNode[]>([]);

  // 加载文件树
  const loadFileTree = useCallback(async (folderPath: string) => {
    try {
      console.log('[FileExplorer] 开始加载文件树:', folderPath);
      const result = await window.electron?.folder?.readTree(folderPath);
      
      if (result?.success && result.data) {
        console.log('[FileExplorer] 文件树加载成功', result.data);
        
        // 转换后端返回的数据结构为前端使用的结构，并添加 depth 属性
        const convertToFileTreeNode = (item: any, depth: number = 0): FileTreeNode => ({
          name: item.name,
          path: item.path,
          isDirectory: item.type === 'directory',
          isExpanded: item.isExpanded || false,
          depth: depth,
          children: item.children?.map((child: any) => convertToFileTreeNode(child, depth + 1)) || []
        });
        
        const treeData = result.data.map((item: any) => convertToFileTreeNode(item, 0));
        setFileTree(treeData);
        setRootFolderPath(folderPath);
        
        // 从路径中提取文件夹名称
        const folderName = folderPath.split(/[/\\]/).pop() || 'ROOT';
        setRootFolderName(folderName);
      } else {
        console.error('[FileExplorer] 文件树加载失败', result?.error);
      }
    } catch (error) {
      console.error('[FileExplorer] 加载文件树出错', error);
    }
  }, []);

  // 监听文件夹打开事件
  useEffect(() => {
    const handleFolderOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      console.log('[FileExplorer] 收到 folder-opened 事件:', customEvent.detail.path);
      loadFileTree(customEvent.detail.path);
    };

    window.addEventListener('folder-opened', handleFolderOpened as EventListener);

    return () => {
      window.removeEventListener('folder-opened', handleFolderOpened as EventListener);
    };
  }, [loadFileTree]);

  // 加载资源管理器配置（显示/隐藏"打开的编辑器"）
  useEffect(() => {
    const loadConfig = async () => {
      const config = await electronStore.get('explorer-config');
      if (config?.showOpenEditors !== undefined) {
        setShowOpenEditors(config.showOpenEditors);
      }
    };
    loadConfig();
  }, []);

  // 监听菜单中的"打开的编辑器"显示切换事件
  useEffect(() => {
    const handleToggleOpenEditors = async (event: Event) => {
      const customEvent = event as CustomEvent<{ show: boolean }>;
      const show = customEvent.detail.show;
      console.log('[FileExplorer] 切换"打开的编辑器"显示:', show);
      
      setShowOpenEditors(show);
      
      // 持久化配置
      await electronStore.set('explorer-config', {
        showOpenEditors: show,
      });
    };

    window.addEventListener('toggle-open-editors', handleToggleOpenEditors as EventListener);

    return () => {
      window.removeEventListener('toggle-open-editors', handleToggleOpenEditors as EventListener);
    };
  }, []);

  // 在组件挂载时检查是否有工作区路径
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const result = await window.electron?.workspace?.getDir();
        if (result?.success && result.data) {
          console.log('[FileExplorer] 加载工作区', result.data);
          loadFileTree(result.data);
        }
      } catch (error) {
        console.error('[FileExplorer] 加载工作区失败', error);
      }
    };

    loadWorkspace();
  }, [loadFileTree]);

  // 处理文件夹展开/折叠
  const handleFolderToggle = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) return;

    // 先更新展开状态
    const updateTree = (items: FileTreeNode[]): FileTreeNode[] => {
      return items.map(item => {
        if (item.path === node.path && item.isDirectory) {
          return { ...item, isExpanded: !item.isExpanded };
        }
        if (item.children) {
          return { ...item, children: updateTree(item.children) };
        }
        return item;
      });
    };

    // 如果是展开操作且子项为空，懒加载子目录
    if (!node.isExpanded && node.children?.length === 0) {
      try {
        console.log('[FileExplorer] 懒加载子目录:', node.path);
        const result = await window.electron?.folder?.expand(node.path, rootFolderPath);
        
        if (result?.success && result.data) {
          console.log('[FileExplorer] 子目录加载成功', result.data);
          
          // 转换数据结构，设置子节点的 depth
          const parentDepth = node.depth || 0;
          const convertToFileTreeNode = (item: any, depth: number): FileTreeNode => ({
            name: item.name,
            path: item.path,
            isDirectory: item.type === 'directory',
            isExpanded: item.isExpanded || false,
            depth: depth,
            children: item.children?.map((child: any) => convertToFileTreeNode(child, depth + 1)) || []
          });
          
          const children = result.data.map((item: any) => convertToFileTreeNode(item, parentDepth + 1));
          
          // 更新树结构，添加子项
          setFileTree(prevTree => {
            const updateTreeWithChildren = (items: FileTreeNode[]): FileTreeNode[] => {
              return items.map(item => {
                if (item.path === node.path && item.isDirectory) {
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
        console.error('[FileExplorer] 加载子目录失败', error);
      }
    } else {
      // 只是切换展开状态
      setFileTree(prevTree => updateTree(prevTree));
    }
  }, [rootFolderPath]);

  // 处理文件点击（单击打开文件）
  const handleFileClick = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) {
      setSelectedFilePath(node.path);
      console.log('[FileExplorer] 单击打开文件:', node.path);
      
      try {
        const result = await window.electron?.file?.read(node.path);
        
        if (result?.success && result.data) {
          // 触发打开文件事件
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: { 
              path: result.data.path || node.path,
              name: result.data.name || node.name,
              content: result.data.content,
              language: result.data.language
            }
          }));
        } else {
          console.error('[FileExplorer] 读取文件失败:', result?.error);
        }
      } catch (error) {
        console.error('[FileExplorer] 读取文件出错:', error);
      }
    }
  }, []);

  // 处理文件双击
  const handleFileDoubleClick = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) {
      try {
        console.log('[FileExplorer] 双击打开文件:', node.path);
        const result = await window.electron?.file?.read(node.path);
        
        if (result?.success && result.data) {
          // 触发打开文件事件
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: { 
              path: result.data.path || node.path,
              name: result.data.name || node.name,
              content: result.data.content,
              language: result.data.language
            }
          }));
        } else {
          console.error('[FileExplorer] 读取文件失败:', result?.error);
        }
      } catch (error) {
        console.error('[FileExplorer] 读取文件出错:', error);
      }
    }
  }, []);

  // 监听编辑器打开文件事件
  useEffect(() => {
    const handleOpenFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string; name?: string }>;
      if (customEvent.detail?.path && customEvent.detail?.name) {
        // 检查文件是否已经打开
        const existingIndex = openEditors.findIndex(
          editor => editor.path === customEvent.detail.path
        );

        if (existingIndex === -1) {
          // 添加新的编辑器，并将其他编辑器设置为非活动状态
          setOpenEditors(prev => [
            ...prev.map(editor => ({ ...editor, isActive: false })),
            {
              path: customEvent.detail.path!,
              title: customEvent.detail.name!,
              isDirty: false,
              isActive: true,
            }
          ]);
        } else {
          // 设置为活动编辑器
          setOpenEditors(prev => prev.map((editor, index) => ({
            ...editor,
            isActive: index === existingIndex,
          })));
        }
      }
    };

    window.addEventListener('open-file', handleOpenFile as EventListener);

    return () => {
      window.removeEventListener('open-file', handleOpenFile as EventListener);
    };
  }, [openEditors]);

  // 监听编辑器标签页切换事件
  useEffect(() => {
    const handleTabSwitch = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (customEvent.detail?.path) {
        // 更新打开的编辑器列表的活动状态
        setOpenEditors(prev => prev.map(editor => ({
          ...editor,
          isActive: editor.path === customEvent.detail.path,
        })));
        
        // 同步更新文件树的选中状态
        setSelectedFilePath(customEvent.detail.path);
        console.log('[FileExplorer] 标签页切换，更新文件树选中状态:', customEvent.detail.path);
      }
    };

    window.addEventListener('tab-switched', handleTabSwitch as EventListener);

    return () => {
      window.removeEventListener('tab-switched', handleTabSwitch as EventListener);
    };
  }, []);

  // 监听编辑器活动文件变化事件（用于标签页切换）
  useEffect(() => {
    const handleActiveFileChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (customEvent.detail?.path) {
        // 同步更新文件树的选中状态
        setSelectedFilePath(customEvent.detail.path);
        console.log('[FileExplorer] 活动文件变化，更新文件树选中状态:', customEvent.detail.path);
      }
    };

    window.addEventListener('editor-active-file-change', handleActiveFileChange as EventListener);

    return () => {
      window.removeEventListener('editor-active-file-change', handleActiveFileChange as EventListener);
    };
  }, []);

  // 监听编辑器关闭事件
  useEffect(() => {
    const handleRemoveEditor = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (customEvent.detail?.path) {
        console.log('[FileExplorer] 收到移除编辑器事件', customEvent.detail.path);
        // 从打开的编辑器列表中移除对应项
        setOpenEditors(prev => prev.filter(editor => editor.path !== customEvent.detail.path));
      }
    };

    window.addEventListener('remove-editor', handleRemoveEditor as EventListener);

    return () => {
      window.removeEventListener('remove-editor', handleRemoveEditor as EventListener);
    };
  }, []);

  // 处理编辑器点击
  const handleEditorClick = (editor: EditorInfo) => {
    console.log('切换到编辑器:', editor.path);
    // 设置为活动编辑器
    setOpenEditors(prev => prev.map(e => ({
      ...e,
      isActive: e.path === editor.path,
    })));
    
    // 触发编辑器切换事件
    window.dispatchEvent(new CustomEvent('editor-active-file-change', {
      detail: { path: editor.path }
    }));
  };

  // 处理编辑器关闭
  const handleEditorClose = (editor: EditorInfo) => {
    console.log('关闭编辑器', editor.path);
    setOpenEditors(prev => {
      const filtered = prev.filter(e => e.path !== editor.path);
      
      // 如果关闭的是活动编辑器，激活第一个编辑器
      if (editor.isActive && filtered.length > 0) {
        filtered[0].isActive = true;
        window.dispatchEvent(new CustomEvent('editor-active-file-change', {
          detail: { path: filtered[0].path }
        }));
      }
      
      return filtered;
    });
  };

  // 处理关闭所有编辑器
  const handleCloseAll = () => {
    console.log('[FileExplorer] 关闭所有编辑器');
    // 派发事件通知 EditorArea 关闭所有标签页
    window.dispatchEvent(new CustomEvent('close-all-editors'));
    // 清空本地的编辑器列表
    setOpenEditors([]);
  };
  
  // 监听编辑器内容变化，更新大纲
  useEffect(() => {
    const handleContentChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        content: string; 
        language: string;
        path: string;
      }>;
      
      const { content, language, path } = customEvent.detail;
      
      console.log('[FileExplorer] 收到大纲更新事件:', {
        contentLength: content?.length || 0,
        language,
        path,
        hasContent: !!content && !!content.trim()
      });
      
      // 如果内容为空，清空大纲
      if (!content || !content.trim()) {
        console.log('[FileExplorer] 内容为空，清空大纲');
        setOutlineData([]);
        return;
      }

      // 使用 OutlineService 解析大纲
      try {
        const outline = OutlineService.parseOutline(content, language);
        setOutlineData(outline);
      } catch (error) {
        setOutlineData([]);
      }
    };

    window.addEventListener('editor:content-changed', handleContentChanged as EventListener);

    return () => {
      window.removeEventListener('editor:content-changed', handleContentChanged as EventListener);
    };
  }, []);

  // 处理大纲节点选择
  const handleOutlineClick = (node: OutlineNode) => {
    console.log('大纲节点点击:', node.name, '行号:', node.range.start.line);
    
    // 触发编辑器跳转到指定行的事件
    window.dispatchEvent(new CustomEvent('editor-reveal-line', {
      detail: {
        lineNumber: node.range.start.line,
        column: node.range.start.character + 1
      }
    }));
  };

  // 处理大纲节点展开/折叠
  const handleOutlineToggle = (node: OutlineNode) => {
    const toggleNodeExpanded = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(n => {
        if (n.id === node.id) {
          return { ...n, expanded: !n.expanded };
        }
        if (n.children && n.children.length > 0) {
          return { ...n, children: toggleNodeExpanded(n.children) };
        }
        return n;
      });
    };

    setOutlineData(prevData => toggleNodeExpanded(prevData));
  };

  // 折叠所有大纲节点
  const handleOutlineCollapseAll = () => {
    const collapseAll = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map(n => ({
        ...n,
        expanded: false,
        children: n.children ? collapseAll(n.children) : n.children
      }));
    };

    setOutlineData(prevData => collapseAll(prevData));
  };


  // 处理新建文件
  const handleNewFile = useCallback(() => {
    console.log('[FileExplorer] 新建文件按钮点击 - isInlineEditingRef:', isInlineEditingRef.current);
    console.trace('[FileExplorer] 调用堆栈');
    
    // 如果正在内联编辑，什么都不做
    if (isInlineEditingRef.current) {
      console.log('[FileExplorer] 正在内联编辑，忽略本次操作');
      return;
    }

    if (!rootFolderPath) {
      console.warn('[FileExplorer] 没有打开文件夹');
      return;
    }

    console.log('[FileExplorer] 添加新建文件节点');
    isInlineEditingRef.current = true;
    setIsInlineEditing(true);
    
    // 找到第一个文件的位置（所有文件夹之后）
    setFileTree(prevTree => {
      const firstFileIndex = prevTree.findIndex(node => !node.isDirectory);
      const insertIndex = firstFileIndex === -1 ? prevTree.length : firstFileIndex;
      
      const creatingNode: FileTreeNode = {
        path: '',
        name: '',
        isDirectory: false,
        isCreating: true,
        creatingType: 'file',
        depth: 0,
        children: []
      };
      
      const newTree = [...prevTree];
      newTree.splice(insertIndex, 0, creatingNode);
      return newTree;
    });
  }, [rootFolderPath]);

  // 处理新建文件夹
  const handleNewFolder = useCallback(() => {
    console.log('[FileExplorer] 新建文件夹按钮点击 - isInlineEditingRef:', isInlineEditingRef.current);
    
    // 如果正在内联编辑，什么都不做
    if (isInlineEditingRef.current) {
      console.log('[FileExplorer] 正在内联编辑，忽略本次操作');
      return;
    }

    if (!rootFolderPath) {
      console.warn('[FileExplorer] 没有打开文件夹');
      return;
    }

    console.log('[FileExplorer] 添加新建文件夹节点');
    isInlineEditingRef.current = true;
    setIsInlineEditing(true);
    
    // 添加新的创建节点到最前面
    setFileTree(prevTree => [{
      path: '',
      name: '',
      isDirectory: true,
      isCreating: true,
      creatingType: 'folder',
      depth: 0,
      children: []
    }, ...prevTree]);
  }, [rootFolderPath]);

  // 处理创建取消
  const handleCreateCancel = useCallback((node: FileTreeNode) => {
    console.log('[FileExplorer] 创建取消:', node);
    isInlineEditingRef.current = false;
    setIsInlineEditing(false);
    // 移除创建节点
    setFileTree(prevTree => prevTree.filter(item => !item.isCreating));
  }, []);

  // 处理创建确认
  const handleCreateConfirm = useCallback(async (node: FileTreeNode, name: string) => {
    console.log('[FileExplorer] 创建确认:', { node, name });
    
    if (!rootFolderPath || !name.trim()) {
      console.warn('[FileExplorer] 无效的创建参数');
      handleCreateCancel(node);
      return;
    }
    
    try {
      if (node.creatingType === 'file') {
        // 创建文件
        const result = await window.electron?.folder?.createFile(rootFolderPath, name);
        
        if (result?.success) {
          console.log('[FileExplorer] 文件创建成功:', result.data);
          isInlineEditingRef.current = false;
          setIsInlineEditing(false);
          // 重新加载文件树
          await loadFileTree(rootFolderPath);
        } else {
          console.error('[FileExplorer] 文件创建失败:', result?.error);
          // 移除创建节点
          handleCreateCancel(node);
        }
      } else if (node.creatingType === 'folder') {
        // 创建文件夹
        const result = await window.electron?.folder?.createFolder(rootFolderPath, name);
        
        if (result?.success) {
          console.log('[FileExplorer] 文件夹创建成功');
          isInlineEditingRef.current = false;
          setIsInlineEditing(false);
          // 重新加载文件树
          await loadFileTree(rootFolderPath);
        } else {
          console.error('[FileExplorer] 文件夹创建失败', result?.error);
          // 移除创建节点
          handleCreateCancel(node);
        }
      }
    } catch (error) {
      console.error('[FileExplorer] 创建失败:', error);
      // 移除创建节点
      handleCreateCancel(node);
    }
  }, [rootFolderPath, handleCreateCancel, loadFileTree]);

  // 处理全部折叠
  const handleCollapseAll = useCallback(() => {
    console.log('[FileExplorer] 全部折叠');
    // 折叠所有节点
    const collapseTree = (items: FileTreeNode[]): FileTreeNode[] => {
      return items.map(item => ({
        ...item,
        isExpanded: false,
        children: item.children ? collapseTree(item.children) : []
      }));
    };
    setFileTree(prevTree => collapseTree(prevTree));
  }, []);

  return (
    <ExplorerView
      // 打开的编辑器
      openEditors={openEditors}
      showOpenEditors={showOpenEditors}
      onEditorClick={handleEditorClick}
      onEditorClose={handleEditorClose}
      onCloseAll={handleCloseAll}
      
      // 文件树
      rootName={rootFolderName}
      rootPath={rootFolderPath}
      fileTreeNodes={fileTree}
      selectedFilePath={selectedFilePath}
      onFileClick={handleFileClick}
      onFileDoubleClick={handleFileDoubleClick}
      onFolderToggle={handleFolderToggle}
      onNewFile={handleNewFile}
      onNewFolder={handleNewFolder}
      onRefresh={() => rootFolderPath && loadFileTree(rootFolderPath)}
      onCollapseAll={handleCollapseAll}
      onCreateConfirm={handleCreateConfirm}
      onCreateCancel={handleCreateCancel}
      
      // 大纲
      outlineNodes={outlineData}
      onOutlineNodeSelect={handleOutlineClick}
      onOutlineNodeToggle={handleOutlineToggle}
      onOutlineCollapseAll={handleOutlineCollapseAll}
    />
  );
};
