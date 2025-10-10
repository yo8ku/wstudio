/**
 * 文件浏览器组件
 * 集成了新的 ExplorerView 组件，读取真实文件系统数据
 */

import React, { useState, useEffect, useRef } from 'react';
import { ExplorerView } from '../../Explorer';
import { useTheme } from '../../../contexts/ThemeContext';
import type { 
  FileTreeNode, 
  EditorInfo
} from '../../Explorer/FileTree/types';
import type { OutlineNode } from '../../Explorer/Outline/types';
import type { TimelineItem } from '../../Explorer/Timeline/types';

export const FileExplorer: React.FC = () => {
  // 监听主题变化以触发重新渲染
  const { theme } = useTheme();
  
  // 工作区目录名称和路径
  const [workspaceName, setWorkspaceName] = useState<string>('NOTE-STUDIO');
  const [workspacePath, setWorkspacePath] = useState<string>('');
  
  // 文件树数据（从真实文件系统读取）
  const [fileTreeData, setFileTreeData] = useState<FileTreeNode[]>([]);
  
  // 添加加载状态以防止重复加载
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 选中的文件路径
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  
  // 正在创建的文件/文件夹类型
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  
  // 使用 ref 来立即标记是否正在创建（防止快速连续点击）
  const isCreatingRef = useRef<boolean>(false);

  // 获取工作区目录并加载文件树
  useEffect(() => {
    const fetchWorkspaceDir = async () => {
      try {
        console.log('[FileExplorer] 🔍 开始获取工作区目录...');
        console.log('[FileExplorer] window.electron:', window.electron);
        console.log('[FileExplorer] window.electron.workspace:', window.electron?.workspace);
        console.log('[FileExplorer] window.electron.folder:', window.electron?.folder);
        
        // 先测试 folder.readTree API 是否可用
        if (window.electron?.folder?.readTree) {
          console.log('[FileExplorer] ✅ folder.readTree API 可用');
        } else {
          console.error('[FileExplorer] ❌ folder.readTree API 不可用');
        }
        
        const result = await window.electron?.workspace?.getDir();
        console.log('[FileExplorer] 📦 获取工作区目录结果:', result);
        
        if (result?.success && result.data) {
          console.log('[FileExplorer] ✅ 工作区目录:', result.data);
          // 从完整路径中提取目录名称
          const parts = result.data.split(/[\\/]/);
          const dirName = parts[parts.length - 1] || 'NOTE-STUDIO';
          setWorkspaceName(dirName.toUpperCase());
          setWorkspacePath(result.data);
          
          // 加载文件树
          console.log('[FileExplorer] 📂 开始加载文件树...');
          await loadFileTree(result.data);
        } else {
          console.error('[FileExplorer] ❌ 获取工作区目录失败，尝试使用项目当前路径:', result);
          
          // 如果获取工作区目录失败，使用项目当前路径
          const currentPath = 'C:\\Users\\Administrator\\Desktop\\WiseAI\\test\\note-studio';
          console.log('[FileExplorer] 📁 使用当前路径:', currentPath);
          
          setWorkspaceName('NOTE-STUDIO');
          setWorkspacePath(currentPath);
          
          // 尝试加载当前路径的文件树
          console.log('[FileExplorer] 📂 开始加载当前路径文件树...');
          await loadFileTree(currentPath);
        }
      } catch (error) {
        console.error('[FileExplorer] ❌ 获取工作区目录异常，使用备用路径:', error);
        
        // 异常情况下使用备用路径
        const currentPath = 'C:\\Users\\Administrator\\Desktop\\WiseAI\\test\\note-studio';
        console.log('[FileExplorer] 📁 异常情况使用备用路径:', currentPath);
        
        setWorkspaceName('NOTE-STUDIO');
        setWorkspacePath(currentPath);
        
        // 尝试加载备用路径的文件树
        console.log('[FileExplorer] 📂 开始加载备用路径文件树...');
        await loadFileTree(currentPath);
      }
    };

    fetchWorkspaceDir();
  }, []);

  // 监听打开文件夹事件
  useEffect(() => {
    const handleFolderOpened = (event: CustomEvent) => {
      const { path, name } = event.detail;
      if (path) {
        setWorkspaceName(name.toUpperCase());
        setWorkspacePath(path);
        loadFileTree(path);
      }
    };

    // 监听文件打开事件，更新选中状态
    const handleOpenFile = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path) {
        setSelectedFilePath(customEvent.detail.path);
      }
    };

    window.addEventListener('folder-opened', handleFolderOpened as EventListener);
    window.addEventListener('open-file', handleOpenFile as EventListener);

    return () => {
      window.removeEventListener('folder-opened', handleFolderOpened as EventListener);
      window.removeEventListener('open-file', handleOpenFile as EventListener);
    };
  }, []);

  // 加载文件树
  const loadFileTree = async (folderPath: string) => {
    if (isLoading) {
      console.log('[FileExplorer] ⏳ 正在加载中，跳过重复请求');
      return;
    }
    
    if (!folderPath) {
      console.log('[FileExplorer] ❌ 文件夹路径为空，无法加载文件树');
      setFileTreeData([]);
      return;
    }
    
    try {
      setIsLoading(true);
      console.log('[FileExplorer] 📂 loadFileTree 被调用，路径:', folderPath);
      console.log('[FileExplorer] 📊 当前文件树节点数量:', fileTreeData.length);
      
      // 检查API是否可用
      if (!window.electron?.folder?.readTree) {
        console.error('[FileExplorer] ❌ window.electron.folder.readTree 不可用');
        setFileTreeData([]);
        return;
      }
      
      console.log('[FileExplorer] 🚀 调用 window.electron.folder.readTree...');
      const result = await window.electron.folder.readTree(folderPath);
      console.log('[FileExplorer] 📂 readTree 结果:', result);
      console.log('[FileExplorer] 📂 result.success:', result?.success);
      console.log('[FileExplorer] 📂 result.data:', result?.data);
      console.log('[FileExplorer] 📂 result.error:', result?.error);
      
      if (result?.success) {
        if (result.data && Array.isArray(result.data)) {
          console.log('[FileExplorer] ✅ 文件树数据:', result.data);
          console.log('[FileExplorer] 📊 新文件树节点数量:', result.data.length);
          
          // 显示前几个节点的详细信息
          if (result.data.length > 0) {
            console.log('[FileExplorer] 📁 前3个节点详情:');
            result.data.slice(0, 3).forEach((node, index) => {
              console.log(`  [${index}] ${node.name} (${node.type}) - ${node.path}`);
            });
          }
          
          setFileTreeData(result.data);
        } else {
          console.log('[FileExplorer] 📂 文件夹为空或没有可显示的文件');
          console.log('[FileExplorer] 📂 result.data 类型:', typeof result.data);
          console.log('[FileExplorer] 📂 result.data 是数组:', Array.isArray(result.data));
          setFileTreeData([]);
        }
      } else {
        console.error('[FileExplorer] ❌ 加载文件树失败:', result);
        console.error('[FileExplorer] ❌ 错误信息:', result?.error);
        // 如果加载失败，设置为空数组以显示空状态
        setFileTreeData([]);
      }
    } catch (error) {
      console.error('[FileExplorer] ❌ 加载文件树异常:', error);
      console.error('[FileExplorer] ❌ 异常堆栈:', (error as Error).stack);
      // 出现异常时设置为空数组
      setFileTreeData([]);
    } finally {
      setIsLoading(false);
      console.log('[FileExplorer] 🏁 loadFileTree 完成，最终节点数量:', fileTreeData.length);
    }
  };

  // 递归查找节点
  const findNodeByPath = (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
    for (const node of nodes) {
      if (node.path === path) {
        return node;
      }
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // 打开的编辑器（暂时保留空数组，后续可集成编辑器状态）
  const [openEditors] = useState<EditorInfo[]>([]);

  // 大纲数据（暂时保留空数组，后续可集成代码分析）
  const [outlineData] = useState<OutlineNode[]>([]);

  // 时间线数据（暂时保留空数组，后续可集成Git）
  const [timelineData] = useState<TimelineItem[]>([]);

  // 处理文件夹展开/折叠
  const handleFolderToggle = React.useCallback(async (node: FileTreeNode) => {
    if (node.type !== 'directory') return;

    // 如果是展开且没有子节点，则加载子节点
    if (!node.isExpanded && (!node.children || node.children.length === 0)) {
      try {
        const result = await window.electron?.folder?.expand(node.path, workspacePath);
        if (result?.success && result.data) {
          // 更新文件树，添加子节点
          setFileTreeData(prevData => {
            const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
              return nodes.map(n => {
                if (n.path === node.path) {
                  return { ...n, children: result.data, isExpanded: true };
                }
                if (n.children) {
                  return { ...n, children: updateNode(n.children) };
                }
                return n;
              });
            };
            return updateNode(prevData);
          });
          return;
        }
      } catch (error) {
        console.error('Failed to expand folder:', error);
      }
    }

    // 切换展开/折叠状态
    setFileTreeData(prevData => {
      const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.map(n => {
          if (n.path === node.path) {
            return { ...n, isExpanded: !n.isExpanded };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      };
      return updateNode(prevData);
    });
  }, [workspacePath]);

  // 递归查找文件路径上的所有父文件夹，并展开它们
  const revealFileInTree = React.useCallback(async (filePath: string) => {
    if (!filePath || !workspacePath) {
      console.log('[FileExplorer] revealFileInTree: 缺少必要参数', { filePath, workspacePath });
      return;
    }

    console.log('[FileExplorer] 开始自动展开文件路径:', filePath);
    console.log('[FileExplorer] 工作区路径:', workspacePath);

    // 规范化路径（统一使用反斜杠，因为 Windows 路径使用反斜杠）
    const normalizedFilePath = filePath.replace(/\//g, '\\');
    const normalizedWorkspacePath = workspacePath.replace(/\//g, '\\');
    
    console.log('[FileExplorer] 规范化文件路径:', normalizedFilePath);
    console.log('[FileExplorer] 规范化工作区路径:', normalizedWorkspacePath);

    // 获取文件路径中相对于工作区的所有父文件夹
    const relativePath = normalizedFilePath.replace(normalizedWorkspacePath, '').replace(/^[\\/]/, '');
    const pathParts = relativePath.split(/[\\/]/);
    console.log('[FileExplorer] 路径部分:', pathParts);
    
    // 逐级展开父文件夹
    let currentPath = normalizedWorkspacePath;
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath = `${currentPath}${currentPath.endsWith('\\') ? '' : '\\'}${pathParts[i]}`;
      console.log('[FileExplorer] 检查路径:', currentPath);
      
      // 查找该路径对应的节点
      const nodeToExpand = findNodeByPath(fileTreeData, currentPath);
      if (nodeToExpand) {
        console.log('[FileExplorer] 找到节点:', nodeToExpand.name, '已展开:', nodeToExpand.isExpanded);
        if (!nodeToExpand.isExpanded) {
          // 展开该节点
          await handleFolderToggle(nodeToExpand);
          console.log('[FileExplorer] 展开节点:', nodeToExpand.name);
        }
      } else {
        console.log('[FileExplorer] 未找到节点:', currentPath);
        // 调试：显示文件树中的所有路径
        console.log('[FileExplorer] 文件树中的路径示例:');
        const debugPrintPaths = (nodes: FileTreeNode[], prefix = '') => {
          nodes.slice(0, 3).forEach(node => {
            console.log(`${prefix}${node.path}`);
            if (node.children) {
              debugPrintPaths(node.children, prefix + '  ');
            }
          });
        };
        debugPrintPaths(fileTreeData);
      }
    }

    // 延迟一帧，确保 DOM 更新后再滚动
    requestAnimationFrame(() => {
      // 触发滚动事件
      console.log('[FileExplorer] 触发滚动事件:', normalizedFilePath);
      window.dispatchEvent(new CustomEvent('file-tree-reveal', {
        detail: { path: normalizedFilePath }
      }));
    });
  }, [fileTreeData, workspacePath, handleFolderToggle]);

  // 监听编辑器活动文件变化事件（切换选项卡时）
  useEffect(() => {
    const handleActiveFileChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path) {
        const filePath = customEvent.detail.path;
        console.log('[FileExplorer] 收到 editor-active-file-change 事件, 切换到文件:', filePath);
        setSelectedFilePath(filePath);
        // 自动展开到该文件的父文件夹
        revealFileInTree(filePath);
      }
    };

    window.addEventListener('editor-active-file-change', handleActiveFileChange as EventListener);

    return () => {
      window.removeEventListener('editor-active-file-change', handleActiveFileChange as EventListener);
    };
  }, [revealFileInTree]);

  const handleFileClick = async (node: FileTreeNode) => {
    console.log('Node clicked:', node.path, 'type:', node.type);
    
    // 如果正在创建节点，忽略其他节点的点击，防止干扰创建流程
    if (isCreatingRef.current && !node.isCreating) {
      console.log('[FileExplorer] 正在创建节点，忽略其他节点点击');
      return;
    }
    
    // 更新选中状态（文件和文件夹都可以选中）
    setSelectedFilePath(node.path);
    
    if (node.type === 'file') {
      try {
        // 读取文件内容
        const result = await window.electron?.file?.read(node.path);
        if (result?.success && result.data) {
          // 触发 open-file 事件，默认以固定模式（多标签）打开
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: {
              path: node.path,
              name: node.name,
              content: result.data.content,
              language: node.language || 'plaintext',
              isPreview: false  // 单击以固定模式打开
            }
          }));
          console.log('[FileExplorer] 打开文件:', node.name);
        }
      } catch (error) {
        console.error('[FileExplorer] 打开文件失败:', error);
      }
    }
  };

  const handleFileDoubleClick = async (node: FileTreeNode) => {
    if (node.type === 'file') {
      console.log('File double clicked:', node.path);
      // 更新选中状态
      setSelectedFilePath(node.path);
      try {
        // 读取文件内容
        const result = await window.electron?.file?.read(node.path);
        if (result?.success && result.data) {
          // 触发 open-file 事件，以固定模式打开
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: {
              path: node.path,
              name: node.name,
              content: result.data.content,
              language: node.language || 'plaintext',
              isPreview: false  // 双击以固定模式打开
            }
          }));
          console.log('[FileExplorer] 打开文件成功:', node.name);
        }
      } catch (error) {
        console.error('[FileExplorer] 打开文件失败:', error);
      }
    }
  };

  const handleFileRename = (node: FileTreeNode, newName: string) => {
    console.log('Rename file:', node.path, 'to', newName);
    // TODO: 实现重命名逻辑
  };

  const handleFileDelete = (node: FileTreeNode) => {
    console.log('Delete file:', node.path);
    // TODO: 实现删除逻辑
  };

  const handleFileMove = (node: FileTreeNode, targetPath: string) => {
    console.log('Move file:', node.path, 'to', targetPath);
    // TODO: 实现移动逻辑
  };

  const handleEditorClose = (editor: EditorInfo) => {
    console.log('Close editor:', editor.path);
    // TODO: 实现关闭编辑器的逻辑
  };

  const handleOutlineClick = (node: OutlineNode) => {
    console.log('Outline clicked:', node.name);
    // TODO: 实现跳转到代码位置的逻辑
  };

  const handleTimelineClick = (item: TimelineItem) => {
    console.log('Timeline clicked:', item.label);
    // TODO: 实现查看历史记录的逻辑
  };

  // 新建文件
  const handleNewFile = () => {
    const timestamp = new Date().getTime();
    console.log(`=== 新建文件开始 [${timestamp}] ===`);
    console.log('[FileExplorer] 新建文件被触发');
    console.log('[FileExplorer] selectedFilePath:', selectedFilePath);
    console.log('[FileExplorer] workspacePath:', workspacePath);
    console.log('[FileExplorer] 当前 creatingType:', creatingType);
    console.log('[FileExplorer] isCreatingRef.current:', isCreatingRef.current);
    console.log('[FileExplorer] Stack trace:', new Error().stack);
    
    // 如果已经有正在创建的节点，忽略此次操作（使用 ref 进行即时检查）
    if (isCreatingRef.current) {
      console.log(`[FileExplorer] ❌ 已存在创建节点（ref检查），忽略此次操作 [${timestamp}]`);
      return;
    }
    
    // 立即设置 ref 标记，防止快速连续点击
    console.log(`[FileExplorer] ✅ 通过检查，设置 ref 为 true [${timestamp}]`);
    isCreatingRef.current = true;
    setCreatingType('file');
    // 找到目标目录：如果没有选中或选中为空，使用根目录；否则根据选中项类型决定
    const targetPath = (selectedFilePath && selectedFilePath.trim()) ? getTargetDirectory(selectedFilePath) : workspacePath;
    console.log('[FileExplorer] targetPath:', targetPath);
    
    // 在文件树中添加临时的创建节点
    setFileTreeData(prevData => {
      console.log('[FileExplorer] prevData:', JSON.stringify(prevData, null, 2));
      const newData = insertCreatingNode(prevData, targetPath, 'file');
      console.log('[FileExplorer] newData:', JSON.stringify(newData, null, 2));
      console.log('=== 新建文件结束 ===');
      return newData;
    });
  };

  // 新建文件夹
  const handleNewFolder = () => {
    console.log('[FileExplorer] 新建文件夹被触发');
    console.log('[FileExplorer] 当前 creatingType:', creatingType);
    console.log('[FileExplorer] isCreatingRef.current:', isCreatingRef.current);
    
    // 如果已经有正在创建的节点，忽略此次操作（使用 ref 进行即时检查）
    if (isCreatingRef.current) {
      console.log('[FileExplorer] 已存在创建节点（ref检查），忽略此次操作');
      return;
    }
    
    // 立即设置 ref 标记，防止快速连续点击
    isCreatingRef.current = true;
    setCreatingType('folder');
    // 找到目标目录：如果没有选中或选中为空，使用根目录；否则根据选中项类型决定
    const targetPath = (selectedFilePath && selectedFilePath.trim()) ? getTargetDirectory(selectedFilePath) : workspacePath;
    
    // 在文件树中添加临时的创建节点
    setFileTreeData(prevData => {
      return insertCreatingNode(prevData, targetPath, 'directory');
    });
  };
  
  // 获取父目录路径
  const getParentPath = (filePath: string): string => {
    const parts = filePath.split(/[\\/]/);
    parts.pop(); // 移除最后一个部分（文件名或文件夹名）
    return parts.join('\\'); // Windows 使用反斜杠
  };
  
  // 获取目标目录：如果选中的是文件夹返回文件夹路径，如果是文件返回父目录路径
  const getTargetDirectory = (selectedPath: string): string => {
    // 在文件树中查找选中的节点
    const findNode = (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.path === path) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, path);
          if (found) return found;
        }
      }
      return null;
    };
    
    const selectedNode = findNode(fileTreeData, selectedPath);
    
    // 如果选中的是文件夹，直接返回文件夹路径
    if (selectedNode && selectedNode.type === 'directory') {
      console.log('[getTargetDirectory] 选中的是文件夹，返回:', selectedPath);
      return selectedPath;
    }
    
    // 如果选中的是文件，返回父目录路径
    console.log('[getTargetDirectory] 选中的是文件，返回父目录');
    return getParentPath(selectedPath);
  };
  
  // 在文件树中插入临时创建节点
  const insertCreatingNode = (
    nodes: FileTreeNode[], 
    targetPath: string, 
    type: 'file' | 'directory'
  ): FileTreeNode[] => {
    console.log('[insertCreatingNode] targetPath:', targetPath);
    console.log('[insertCreatingNode] workspacePath:', workspacePath);
    console.log('[insertCreatingNode] nodes count:', nodes.length);
    
    // 规范化路径以便比较
    const normalizedTarget = targetPath.replace(/\//g, '\\');
    const normalizedWorkspace = workspacePath.replace(/\//g, '\\');
    
    // 创建临时节点的工厂函数
    const createTempNode = (): FileTreeNode => ({
      id: `temp-creating-${Date.now()}`,
      name: '',
      path: '',
      type: type,
      isCreating: true,
      isExpanded: false,
    });
    
    // 如果目标路径是工作区根目录
    // 注意：fileTreeData 存储的是根目录的子项，不包含根目录本身
    if (normalizedTarget === normalizedWorkspace || !targetPath) {
      console.log('[insertCreatingNode] 目标是根目录，直接在根级别添加临时节点');
      const tempNode = createTempNode();
      
      // 如果是创建文件，插入到所有文件夹之后、第一个文件之前
      if (type === 'file') {
        // 找到第一个文件的索引
        const firstFileIndex = nodes.findIndex(child => child.type === 'file');
        
        if (firstFileIndex === -1) {
          // 没有文件，添加到最后（所有文件夹之后）
          console.log('[insertCreatingNode] 没有文件，添加到最后');
          return [...nodes, tempNode];
        } else {
          // 插入到第一个文件之前
          console.log('[insertCreatingNode] 插入到第一个文件之前，索引:', firstFileIndex);
          return [
            ...nodes.slice(0, firstFileIndex),
            tempNode,
            ...nodes.slice(firstFileIndex)
          ];
        }
      } else {
        // 如果是创建文件夹，添加到最前面
        console.log('[insertCreatingNode] 创建文件夹，添加到最前面');
        return [tempNode, ...nodes];
      }
    }
    
    // 递归查找目标目录并添加临时节点
    return nodes.map(node => {
      const normalizedNodePath = node.path.replace(/\//g, '\\');
      
      if (normalizedNodePath === normalizedTarget && node.type === 'directory') {
        console.log('[insertCreatingNode] 找到目标目录，添加临时节点:', node.name);
        const tempNode = createTempNode();
        const children = node.children || [];
        
        // 如果是创建文件，插入到所有文件夹之后、第一个文件之前
        if (type === 'file') {
          // 找到第一个文件的索引
          const firstFileIndex = children.findIndex(child => child.type === 'file');
          
          if (firstFileIndex === -1) {
            // 没有文件，添加到最后（所有文件夹之后）
            console.log('[insertCreatingNode] 没有文件，添加到最后');
            return {
              ...node,
              isExpanded: true,
              children: [...children, tempNode]
            };
          } else {
            // 插入到第一个文件之前
            console.log('[insertCreatingNode] 插入到第一个文件之前，索引:', firstFileIndex);
            const newChildren = [
              ...children.slice(0, firstFileIndex),
              tempNode,
              ...children.slice(firstFileIndex)
            ];
            return {
              ...node,
              isExpanded: true,
              children: newChildren
            };
          }
        } else {
          // 如果是创建文件夹，添加到最前面
          console.log('[insertCreatingNode] 创建文件夹，添加到最前面');
          return {
            ...node,
            isExpanded: true,
            children: [tempNode, ...children]
          };
        }
      }
      
      if (node.children) {
        return {
          ...node,
          children: insertCreatingNode(node.children, targetPath, type)
        };
      }
      
      return node;
    });
  };
  
  // 处理创建确认
  const handleCreateConfirm = async (node: FileTreeNode, name: string) => {
    if (!name.trim()) {
      removeCreatingNode();
      return;
    }
    
    try {
      // 确定父目录路径
      const parentPath = selectedFilePath ? getParentPath(selectedFilePath) : workspacePath;
      const fullPath = `${parentPath}/${name}`;
      
      let result;
      if (creatingType === 'file') {
        result = await window.electron?.folder?.createFile(parentPath, name);
      } else {
        result = await window.electron?.folder?.createFolder(parentPath, name);
      }
      
      if (result?.success) {
        console.log(`[FileExplorer] ${creatingType === 'file' ? '文件' : '文件夹'}创建成功:`, name);
        // 移除临时节点并重新加载文件树
        removeCreatingNode();
        loadFileTree(workspacePath);
        // 选中新创建的文件/文件夹
        setSelectedFilePath(fullPath);
      } else {
        console.error(`创建失败: ${result?.error}`);
        removeCreatingNode();
      }
    } catch (error) {
      console.error(`创建失败:`, error);
      removeCreatingNode();
    }
  };
  
  // 处理创建取消
  const handleCreateCancel = () => {
    removeCreatingNode();
  };
  
  // 移除临时创建节点
  const removeCreatingNode = () => {
    const timestamp = new Date().getTime();
    console.log(`[FileExplorer] 🧹 移除创建节点，重置 ref [${timestamp}]`);
    // 重置 ref 标记，允许下次创建
    isCreatingRef.current = false;
    setCreatingType(null);
    setFileTreeData(prevData => {
      const remove = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes
          .filter(node => !node.isCreating)
          .map(node => ({
            ...node,
            children: node.children ? remove(node.children) : undefined
          }));
      };
      return remove(prevData);
    });
  };

  // 刷新文件树
  const handleRefresh = () => {
    console.log('[FileExplorer] 刷新文件树');
    loadFileTree(workspacePath);
  };

  // 全部折叠
  const handleCollapseAll = () => {
    console.log('[FileExplorer] 折叠所有文件夹');
    setFileTreeData(prevData => {
      const collapseNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.map(node => {
          if (node.type === 'directory') {
            return {
              ...node,
              isExpanded: false,
              children: node.children ? collapseNode(node.children) : []
            };
          }
          return node;
        });
      };
      return collapseNode(prevData);
    });
  };

  // 处理点击空白区域：清除选中状态，选择根目录
  const handleBlankAreaClick = () => {
    console.log('[FileExplorer] 点击空白区域');
    console.log('[FileExplorer] 当前 isCreatingRef.current:', isCreatingRef.current);
    
    // 如果正在创建节点，忽略空白区域点击，防止干扰创建流程
    if (isCreatingRef.current) {
      console.log('[FileExplorer] 正在创建节点，忽略空白区域点击');
      return;
    }
    
    console.log('[FileExplorer] 清除选中状态');
    setSelectedFilePath('');
  };


  return (
    <ExplorerView
      rootName={workspaceName}
      rootPath={workspacePath}
      fileTreeNodes={fileTreeData}
      openEditors={openEditors}
      outlineNodes={outlineData}
      timelineItems={timelineData}
      selectedFilePath={selectedFilePath}
      onFileClick={handleFileClick}
      onFileDoubleClick={handleFileDoubleClick}
      onFolderToggle={handleFolderToggle}
      onEditorClose={handleEditorClose}
      onOutlineNodeSelect={handleOutlineClick}
      onTimelineItemClick={handleTimelineClick}
      onNewFile={handleNewFile}
      onNewFolder={handleNewFolder}
      onRefresh={handleRefresh}
      onCollapseAll={handleCollapseAll}
      onCreateConfirm={handleCreateConfirm}
      onCreateCancel={handleCreateCancel}
      onBlankAreaClick={handleBlankAreaClick}
    />
  );
};
