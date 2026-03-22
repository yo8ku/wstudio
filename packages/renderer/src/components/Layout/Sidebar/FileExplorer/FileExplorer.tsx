/**
 * 文件浏览器组�?
 * 功能：集成资源管理器，包括打开的编辑器、文件树、大�?
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { ExplorerView } from '../../../Explorer';
import type { FileTreeNode, OutlineNode as ExplorerOutlineNode } from '../../../Explorer';
import { electronStore } from '../../../../services/ElectronStoreService';
import { OutlineService } from '../../../../services/OutlineService';
import { useExplorerStore } from '../../../../stores/explorerStore';
import { modal } from '../../../../stores/modalStore';
import { toastService } from '../../../../services/ToastService';
import {
  getActiveCodeMirrorEditorContent,
  getActiveCodeMirrorEditorMeta,
  getActiveCodeMirrorEditorView,
} from '../../../../lib/editor/activeCodeMirrorEditor';
import { getEditorLanguageForNote } from '../../../../utils/noteLinking';

interface FileSystemTreeEntry {
  name: string;
  path: string;
  type: string;
  children?: FileSystemTreeEntry[];
}

const findOutlineNodeById = (
  nodes: ExplorerOutlineNode[],
  targetId: string,
): ExplorerOutlineNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children && node.children.length > 0) {
      const childNode = findOutlineNodeById(node.children, targetId);
      if (childNode) {
        return childNode;
      }
    }
  }

  return null;
};

const toggleOutlineNodeExpansion = (
  nodes: ExplorerOutlineNode[],
  targetId: string,
): ExplorerOutlineNode[] => (
  nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        expanded: !node.expanded,
      };
    }

    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: toggleOutlineNodeExpansion(node.children, targetId),
      };
    }

    return node;
  })
);

const collapseOutlineNodes = (nodes: ExplorerOutlineNode[]): ExplorerOutlineNode[] => (
  nodes.map((node) => ({
    ...node,
    expanded: false,
    children: node.children ? collapseOutlineNodes(node.children) : node.children,
  }))
);

const collectOutlineExpansionState = (
  nodes: ExplorerOutlineNode[],
  expansionState: Map<string, boolean> = new Map<string, boolean>(),
): Map<string, boolean> => {
  for (const node of nodes) {
    expansionState.set(node.id, Boolean(node.expanded));
    if (node.children && node.children.length > 0) {
      collectOutlineExpansionState(node.children, expansionState);
    }
  }

  return expansionState;
};

const applyOutlineExpansionState = (
  nodes: ExplorerOutlineNode[],
  expansionState: Map<string, boolean>,
): ExplorerOutlineNode[] => (
  nodes.map((node) => ({
    ...node,
    expanded: expansionState.get(node.id) ?? node.expanded,
    children: node.children
      ? applyOutlineExpansionState(node.children, expansionState)
      : node.children,
  }))
);

export const FileExplorer: React.FC = () => {
  const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  const convertTreeEntryToNode = (
    item: FileSystemTreeEntry,
    depth: number,
    expandDirectories: boolean = false,
  ): FileTreeNode => ({
    name: item.name,
    path: item.path,
    isDirectory: item.type === 'directory',
    isExpanded: item.type === 'directory' ? expandDirectories : false,
    depth,
    children: item.children?.map((child) => convertTreeEntryToNode(child, depth + 1, expandDirectories)) || [],
  });
  // �?store 获取文件树数�?
  const { 
    fileTreeData: storeFileTreeData, 
    workspacePath: storeWorkspacePath,
    selectedOutlineNode,
    isOutlineExpanded,
    setFileTreeData,
    setWorkspacePath,
    setSelectedOutlineNode,
    setOutlineExpanded,
  } = useExplorerStore();
  
  // 文件树状�?- 优先使用 store 中的数据
  const [fileTree, setFileTree] = useState<FileTreeNode[]>(storeFileTreeData || []);
  const fileTreeRef = useRef<FileTreeNode[]>(storeFileTreeData || []);
  const [rootFolderPath, setRootFolderPath] = useState<string>(storeWorkspacePath);
  const [rootFolderName, setRootFolderName] = useState<string>('');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [currentActiveFilePath, setCurrentActiveFilePath] = useState<string>('');
  const [fileTreeRevealRequest, setFileTreeRevealRequest] = useState<{ id: number; path: string } | null>(null);
  const [outlineNodes, setOutlineNodes] = useState<ExplorerOutlineNode[]>([]);
  const outlineNodesRef = useRef<ExplorerOutlineNode[]>([]);
  const fileTreeRevealRequestIdRef = useRef<number>(0);
  
  // 内联编辑状�?- 使用 ref 避免闭包陷阱
  const [isInlineEditing, setIsInlineEditing] = useState<boolean>(false);
  const isInlineEditingRef = useRef<boolean>(false);
  const workspaceHeaderActionMode = useMemo<'collapse-all' | 'expand-all'>(() => {
    const collectExpandState = (
      nodes: FileTreeNode[],
    ): { hasDirectory: boolean; hasExpandedDirectory: boolean } => {
      let hasDirectory = false;
      let hasExpandedDirectory = false;

      for (const node of nodes) {
        if (node.isDirectory) {
          hasDirectory = true;
          if (node.isExpanded) {
            hasExpandedDirectory = true;
          }
        }

        if (node.children && node.children.length > 0) {
          const childState = collectExpandState(node.children);
          hasDirectory = hasDirectory || childState.hasDirectory;
          hasExpandedDirectory = hasExpandedDirectory || childState.hasExpandedDirectory;
        }

        if (hasDirectory && hasExpandedDirectory) {
          break;
        }
      }

      return { hasDirectory, hasExpandedDirectory };
    };

    const expandState = collectExpandState(fileTree);
    if (expandState.hasDirectory && !expandState.hasExpandedDirectory) {
      return 'expand-all';
    }

    return 'collapse-all';
  }, [fileTree]);
  
  // 同步 fileTree �?ref �?store
  useEffect(() => {
    fileTreeRef.current = fileTree;
    // 使用 useEffect 同步�?store，避免在渲染期间更新
    setFileTreeData(fileTree);
  }, [fileTree, setFileTreeData]);

  useEffect(() => {
    outlineNodesRef.current = outlineNodes;
  }, [outlineNodes]);
  // 表单区域展开状态（持久化）
  const [initialFormExpanded, setInitialFormExpanded] = useState<boolean>(false);

  const updateOutlineState = useCallback((
    content: string,
    language: string,
    path: string,
  ): void => {
    const resolvedPath = path || currentActiveFilePath;
    const normalizedLanguage = language.trim().toLowerCase();
    const fallbackLanguage = resolvedPath
      ? getEditorLanguageForNote({ path: resolvedPath, title: '' })
      : '';
    const resolvedLanguage = (
      normalizedLanguage && normalizedLanguage !== 'plaintext'
    )
      ? normalizedLanguage
      : fallbackLanguage || normalizedLanguage;
    const parsedOutlineNodes = OutlineService.parseOutline(content, resolvedLanguage);
    const nextOutlineNodes = applyOutlineExpansionState(
      parsedOutlineNodes,
      collectOutlineExpansionState(outlineNodesRef.current),
    );
    const shouldPreserveSelectedNode = Boolean(selectedOutlineNode)
      && resolvedPath === currentActiveFilePath;
    const nextSelectedOutlineNode = shouldPreserveSelectedNode && selectedOutlineNode
      ? findOutlineNodeById(nextOutlineNodes, selectedOutlineNode.id)
      : null;

    outlineNodesRef.current = nextOutlineNodes;
    setOutlineNodes(nextOutlineNodes);
    setSelectedOutlineNode(nextSelectedOutlineNode);
    if (resolvedPath) {
      setCurrentActiveFilePath(resolvedPath);
    }
  }, [currentActiveFilePath, selectedOutlineNode, setSelectedOutlineNode]);

  const syncOutlineFromActiveEditor = useCallback((): boolean => {
    const activeEditorView = getActiveCodeMirrorEditorView();
    if (!activeEditorView) {
      return false;
    }

    const activeEditorMeta = getActiveCodeMirrorEditorMeta();
    updateOutlineState(
      getActiveCodeMirrorEditorContent(),
      activeEditorMeta.language ?? '',
      activeEditorMeta.path ?? currentActiveFilePath,
    );

    return true;
  }, [currentActiveFilePath, updateOutlineState]);

  const scheduleOutlineSync = useCallback((attempt: number = 0): void => {
    const runSync = (nextAttempt: number): void => {
      const delay = nextAttempt === 0 ? 0 : 16;
      window.setTimeout(() => {
        const didSync = syncOutlineFromActiveEditor();
        if (!didSync && nextAttempt < 4) {
          runSync(nextAttempt + 1);
        }
      }, delay);
    };

    runSync(attempt);
  }, [syncOutlineFromActiveEditor]);


  // 辅助函数：根据路径查找节�?
  const findNodeByPath = useCallback((path: string | null | undefined): FileTreeNode | null => {
    if (!path) {
      return null;
    }
    const traverse = (nodes: FileTreeNode[]): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.path === path) {
          return node;
        }
        if (node.children) {
          const found = traverse(node.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return traverse(fileTreeRef.current || []);
  }, []);

  // 加载文件�?
  const loadFileTree = useCallback(async (folderPath: string, preserveExpandedState: boolean = true) => {
    try {
      console.log('[FileExplorer] 开始加载文件树:', folderPath);
      
      // 如果保留展开状态，�?store 中获取当前展开状态（和左右移动侧边栏一样）
      const expandedPaths = new Set<string>();
      if (preserveExpandedState) {
        // 优先�?store 中获取，如果没有则从 ref 中获�?
        const currentTree = storeFileTreeData || fileTreeRef.current;
        if (currentTree && currentTree.length > 0) {
          const collectExpandedPaths = (nodes: FileTreeNode[]) => {
            nodes.forEach(node => {
              if (node.isDirectory && node.isExpanded) {
                expandedPaths.add(node.path);
              }
              if (node.children) {
                collectExpandedPaths(node.children);
              }
            });
          };
          collectExpandedPaths(currentTree);
          console.log('[FileExplorer] �?store 保存展开状�?', Array.from(expandedPaths));
        }
      }
      
      const result = await window.electron?.folder?.readTree(folderPath);
      
      if (result?.success && result.data) {
        console.log('[FileExplorer] File tree loaded.', result.data);
        
        // 转换后端返回的数据结构为前端使用的结构，并添�?depth 属�?
        const convertToFileTreeNode = (item: any, depth: number = 0): FileTreeNode => {
          const isExpanded = preserveExpandedState && expandedPaths.has(item.path) 
            ? true 
            : (item.isExpanded || false);
          
          return {
            name: item.name,
            path: item.path,
            isDirectory: item.type === 'directory',
            isExpanded: isExpanded,
            depth: depth,
            children: item.children?.map((child: any) => convertToFileTreeNode(child, depth + 1)) || []
          };
        };
        
        const treeData = result.data.map((item: any) => convertToFileTreeNode(item, 0));
        setFileTree(treeData);
        fileTreeRef.current = treeData; // 同步更新 ref
        setRootFolderPath(folderPath);
        // 同步�?store
        setFileTreeData(treeData);
        setWorkspacePath(folderPath);
        
        console.log('[FileExplorer] 恢复展开状态后的文件树:', treeData.filter(node => node.isExpanded).map(n => n.path));
        
        // 如果保留了展开状态，需要为展开的文件夹加载子节点（如果子节点为空）
        if (preserveExpandedState && expandedPaths.size > 0) {
          // 延迟执行，确保状态已更新
          setTimeout(() => {
            const loadExpandedChildren = async (nodes: FileTreeNode[]) => {
              for (const node of nodes) {
                if (node.isDirectory && node.isExpanded && expandedPaths.has(node.path)) {
                  // 如果子节点为空，需要懒加载
                  if (!node.children || node.children.length === 0) {
                    try {
                      console.log('[FileExplorer] 恢复展开状态，懒加载子目录:', node.path);
                      const expandResult = await window.electron?.folder?.expand(node.path, folderPath);
                      
                      if (expandResult?.success && expandResult.data) {
                        const parentDepth = node.depth || 0;
                        const convertToFileTreeNode = (item: any, depth: number): FileTreeNode => {
                          const childIsExpanded = expandedPaths.has(item.path);
                          return {
                            name: item.name,
                            path: item.path,
                            isDirectory: item.type === 'directory',
                            isExpanded: childIsExpanded,
                            depth: depth,
                            children: item.children?.map((child: any) => convertToFileTreeNode(child, depth + 1)) || []
                          };
                        };
                        
                        const children = expandResult.data.map((item: any) => convertToFileTreeNode(item, parentDepth + 1));
                        
                        // 更新树结�?
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
                          
                          const newTree = updateTreeWithChildren(prevTree);
                          fileTreeRef.current = newTree;
                          return newTree;
                        });
                        
                        // 递归加载子节点的子节�?
                        if (children.length > 0) {
                          await loadExpandedChildren(children);
                        }
                      }
                    } catch (error) {
                      console.error('[FileExplorer] 恢复展开状态时加载子目录失�?', error);
                    }
                  } else if (node.children) {
                    // 如果子节点不为空，递归处理子节�?
                    await loadExpandedChildren(node.children);
                  }
                }
              }
            };
            
            loadExpandedChildren(treeData).catch(error => {
              console.error('[FileExplorer] 恢复展开状态时出错:', error);
            });
          }, 100);
        }
        
        // 从路径中提取文件夹名�?
        const folderName = folderPath.split(/[/\\]/).pop() || 'ROOT';
        setRootFolderName(folderName);
      } else {
        console.error('[FileExplorer] Failed to load file tree.', result?.error);
      }
    } catch (error) {
      console.error('[FileExplorer] Error while loading file tree.', error);
    }
  }, [storeFileTreeData, setFileTreeData, setWorkspacePath]);

  // 刷新文件树（保持当前状态，只更新新�?删除的文件，不闪烁）
  const refreshFileTree = useCallback(async (folderPath: string) => {
    try {
      console.log('[FileExplorer] 刷新文件树（无闪烁）:', folderPath);
      
      // 获取当前文件树状�?
      const currentTree = fileTreeRef.current;
      if (!currentTree || currentTree.length === 0) {
        // 如果当前没有数据，直接加�?
        loadFileTree(folderPath, false);
        return;
      }
      
      // 收集当前展开状�?
      const expandedPaths = new Set<string>();
      const collectExpandedPaths = (nodes: FileTreeNode[]) => {
        nodes.forEach(node => {
          if (node.isDirectory && node.isExpanded) {
            expandedPaths.add(node.path);
          }
          if (node.children) {
            collectExpandedPaths(node.children);
          }
        });
      };
      collectExpandedPaths(currentTree);
      
      // 加载新的文件�?
      const result = await window.electron?.folder?.readTree(folderPath);
      
      if (result?.success && result.data) {
        // 转换后端数据，恢复展开状�?
        const convertToFileTreeNode = (item: { name: string; path: string; type: string; children?: { name: string; path: string; type: string }[] }, depth: number = 0): FileTreeNode => ({
          name: item.name,
          path: item.path,
          isDirectory: item.type === 'directory',
          isExpanded: expandedPaths.has(item.path), // 恢复展开状�?
          depth: depth,
          children: item.children?.map((child: { name: string; path: string; type: string; children?: { name: string; path: string; type: string }[] }) => convertToFileTreeNode(child, depth + 1)) || []
        });
        
        const newTreeData = result.data.map((item: { name: string; path: string; type: string; children?: { name: string; path: string; type: string }[] }) => convertToFileTreeNode(item, 0));
        
        // 为展开的文件夹加载子节�?
        const loadChildrenForExpanded = async (nodes: FileTreeNode[]): Promise<FileTreeNode[]> => {
          const result: FileTreeNode[] = [];
          
          for (const node of nodes) {
            if (node.isDirectory && node.isExpanded) {
              // 加载子节�?
              try {
                const expandResult = await window.electron?.folder?.expand(node.path, folderPath);
                if (expandResult?.success && expandResult.data) {
                  const children = expandResult.data.map((item: { name: string; path: string; type: string }) => 
                    convertToFileTreeNode(item, (node.depth || 0) + 1)
                  );
                  // 递归加载子节点的子节�?
                  const loadedChildren = await loadChildrenForExpanded(children);
                  result.push({ ...node, children: loadedChildren });
                } else {
                  result.push(node);
                }
              } catch (error) {
                console.error('[FileExplorer] 加载子目录失�?', node.path, error);
                result.push(node);
              }
            } else {
              result.push(node);
            }
          }
          
          return result;
        };
        
        // 加载所有展开文件夹的子节�?
        const mergedTree = await loadChildrenForExpanded(newTreeData);
        
        // 更新状态（一次性更新，不闪烁）
        setFileTree(mergedTree);
        fileTreeRef.current = mergedTree;
        setFileTreeData(mergedTree);
        
        console.log('[FileExplorer] Refresh completed with expanded state preserved.');
      }
    } catch (error) {
      console.error('[FileExplorer] 刷新文件树出�?', error);
    }
  }, [loadFileTree, setFileTreeData]);

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

  // 加载资源管理器配置（显示/隐藏"打开的编辑器"、表单展开状态）
  useEffect(() => {
    const loadConfig = async () => {
      const config = await electronStore.get('explorer-config');
      if (config?.isFormExpanded !== undefined) {
        setInitialFormExpanded(config.isFormExpanded);
      }
    };
    loadConfig();
  }, []);

  // 在组件挂载时检查是否有工作区路�?
  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        // 如果 store 中已有数据且路径匹配，直接使�?store 中的数据
        if (storeFileTreeData && storeWorkspacePath) {
          const result = await window.electron?.workspace?.getDir();
          if (result?.success && result.data === storeWorkspacePath) {
            console.log('[FileExplorer] Using file tree data from store.');
            setFileTree(storeFileTreeData);
            fileTreeRef.current = storeFileTreeData; // 同步更新 ref
            setRootFolderPath(storeWorkspacePath);
            const folderName = storeWorkspacePath.split(/[/\\]/).pop() || 'ROOT';
            setRootFolderName(folderName);
            return;
          }
        }
        
        // 否则加载工作�?
        const result = await window.electron?.workspace?.getDir();
        if (result?.success && result.data) {
          console.log('[FileExplorer] Workspace loaded.', result.data);
          loadFileTree(result.data);
        }
      } catch (error) {
        console.error('[FileExplorer] Failed to load workspace.', error);
      }
    };

    loadWorkspace();
  }, [loadFileTree, storeFileTreeData, storeWorkspacePath]);

  const revealPathInFileTree = useCallback(async (targetPath: string) => {
    if (!rootFolderPath || !targetPath) {
      return;
    }

    const normalizedRootFolderPath = normalizePath(rootFolderPath);
    const normalizedTargetPath = normalizePath(targetPath);
    const isPathInsideWorkspace =
      normalizedTargetPath === normalizedRootFolderPath ||
      normalizedTargetPath.startsWith(`${normalizedRootFolderPath}/`);

    if (!isPathInsideWorkspace) {
      return;
    }

    const expandNodesToTarget = async (
      nodes: FileTreeNode[],
    ): Promise<{ nextNodes: FileTreeNode[]; found: boolean }> => {
      const nextNodes: FileTreeNode[] = [];
      let found = false;

      for (const node of nodes) {
        const normalizedNodePath = normalizePath(node.path);

        if (!node.isDirectory) {
          if (normalizedNodePath === normalizedTargetPath) {
            found = true;
          }

          nextNodes.push(node);
          continue;
        }

        const isTargetNode = normalizedNodePath === normalizedTargetPath;
        const isAncestorNode = normalizedTargetPath.startsWith(`${normalizedNodePath}/`);

        if (!isTargetNode && !isAncestorNode) {
          nextNodes.push(node);
          continue;
        }

        let nextChildren = node.children || [];

        if (isAncestorNode && nextChildren.length === 0) {
          try {
            const expandResult = await window.electron?.folder?.expand(node.path, rootFolderPath);
            if (expandResult?.success && expandResult.data) {
              nextChildren = expandResult.data.map((item: FileSystemTreeEntry) =>
                convertTreeEntryToNode(item, (node.depth || 0) + 1),
              );
            }
          } catch (error) {
            console.error('[FileExplorer] Failed to reveal current file.', error);
          }
        }

        let foundInChildren = false;
        if (nextChildren.length > 0) {
          const childResult = await expandNodesToTarget(nextChildren);
          nextChildren = childResult.nextNodes;
          foundInChildren = childResult.found;
        }

        nextNodes.push({
          ...node,
          isExpanded: isTargetNode ? node.isExpanded : true,
          children: nextChildren,
        });

        if (isTargetNode || foundInChildren) {
          found = true;
        }
      }

      return { nextNodes, found };
    };

    const revealResult = await expandNodesToTarget(fileTreeRef.current);

    if (revealResult.found) {
      fileTreeRef.current = revealResult.nextNodes;
      setFileTree(revealResult.nextNodes);
    }

    setSelectedFilePath(targetPath);
    setCurrentActiveFilePath(targetPath);
    fileTreeRevealRequestIdRef.current += 1;
    setFileTreeRevealRequest({
      id: fileTreeRevealRequestIdRef.current,
      path: targetPath,
    });
  }, [rootFolderPath]);

  // 处理文件夹展开/折叠
  const handleFolderToggle = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) return;

    // 先更新展开状�?
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
          console.log('[FileExplorer] Child directory loaded.', result.data);
          
          // 转换数据结构，设置子节点�?depth
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
          
          setFileTree(prevTree => {
            const newTree = updateTreeWithChildren(prevTree);
            return newTree;
          });
        }
      } catch (error) {
        console.error('[FileExplorer] Failed to load child directory.', error);
      }
    } else {
      // 只是切换展开状�?
      setFileTree(prevTree => {
        const newTree = updateTree(prevTree);
        return newTree;
      });
    }
  }, [rootFolderPath, setFileTreeData]);

  // 处理文件/文件夹点击（单击选中，文件同时打开�?
  const handleFileClick = useCallback(async (node: FileTreeNode) => {
    // 设置选中状态（文件和文件夹都可以被选中�?
    setSelectedFilePath(node.path);
    if (!node.isDirectory) {
      setCurrentActiveFilePath(node.path);
    }
    
    // 如果是文件，则打开文件
    if (!node.isDirectory) {
      console.log('[FileExplorer] 单击打开文件:', node.path);
      
      try {
        const fallbackLanguage = getEditorLanguageForNote({
          path: node.path,
          title: node.name,
        });

        window.dispatchEvent(new CustomEvent('open-file', {
          detail: {
            path: node.path,
            name: node.name,
            language: fallbackLanguage,
            isPreview: false,
          }
        }));

        const result = await window.electron?.file?.read(node.path);
        
        if (result?.success && result.data) {
          // 触发打开文件事件
          window.dispatchEvent(new CustomEvent('open-file', {
            detail: { 
              path: result.data.path || node.path,
              name: result.data.name || node.name,
              content: result.data.content,
              language: result.data.language || fallbackLanguage,
              activateIfExists: false,
              isPreview: false
            }
          }));
        } else {
          console.error('[FileExplorer] 读取文件失败:', result?.error);
        }
      } catch (error) {
        console.error('[FileExplorer] 读取文件出错:', error);
      }
    } else {
      console.log('[FileExplorer] 选中文件�?', node.path);
    }
  }, []);

  // 处理文件双击
  const handleFileDoubleClick = useCallback((node: FileTreeNode) => {
    if (!node.isDirectory) {
      setCurrentActiveFilePath(node.path);
      console.log('[FileExplorer] 鍙屽嚮鏂囦欢锛屽拷鐣ラ噸澶嶈鍙栵細', node.path);
      return;
      /*
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
      */
    }
  }, []);

  // 处理点击空白区域：清除选中状�?
  const handleBlankAreaClick = useCallback(() => {
    console.log('[FileExplorer] Blank area clicked, clearing selection.');
    setSelectedFilePath('');
  }, []);

  // 监听编辑器标签页切换事件
  useEffect(() => {
    const handleTabSwitch = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (customEvent.detail?.path) {
        if (
          customEvent.detail.path === selectedFilePath
          && customEvent.detail.path === currentActiveFilePath
        ) {
          return;
        }

        setSelectedFilePath(customEvent.detail.path);
        setCurrentActiveFilePath(customEvent.detail.path);
        setSelectedOutlineNode(null);
        scheduleOutlineSync();
        console.log('[FileExplorer] 标签页切换，更新文件树选中状�?', customEvent.detail.path);
      }
    };

    window.addEventListener('tab-switched', handleTabSwitch as EventListener);

    return () => {
      window.removeEventListener('tab-switched', handleTabSwitch as EventListener);
    };
  }, [currentActiveFilePath, scheduleOutlineSync, selectedFilePath, setSelectedOutlineNode]);

  // 监听编辑器活动文件变化事件（用于标签页切换）
  useEffect(() => {
    const handleActiveFileChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (customEvent.detail?.path) {
        if (
          customEvent.detail.path === selectedFilePath
          && customEvent.detail.path === currentActiveFilePath
        ) {
          return;
        }

        setSelectedFilePath(customEvent.detail.path);
        setCurrentActiveFilePath(customEvent.detail.path);
        scheduleOutlineSync();
        console.log('[FileExplorer] 活动文件变化，更新文件树选中状�?', customEvent.detail.path);
      }
    };

    window.addEventListener('editor-active-file-change', handleActiveFileChange as EventListener);

    return () => {
      window.removeEventListener('editor-active-file-change', handleActiveFileChange as EventListener);
    };
  }, [currentActiveFilePath, scheduleOutlineSync, selectedFilePath]);

  useEffect(() => {
    if (!selectedFilePath || selectedFilePath === rootFolderPath) {
      return;
    }

    const selectedNode = findNodeByPath(selectedFilePath);
    if (selectedNode?.isDirectory) {
      return;
    }

    setCurrentActiveFilePath((currentPath) => (
      currentPath === selectedFilePath ? currentPath : selectedFilePath
    ));
  }, [findNodeByPath, rootFolderPath, selectedFilePath, fileTree]);

  useEffect(() => {
    const handleFileTreeReveal = (event: Event) => {
      const customEvent = event as CustomEvent<{ path: string }>;
      if (!customEvent.detail?.path) {
        return;
      }

      void revealPathInFileTree(customEvent.detail.path);
    };

    window.addEventListener('file-tree-reveal', handleFileTreeReveal as EventListener);

    return () => {
      window.removeEventListener('file-tree-reveal', handleFileTreeReveal as EventListener);
    };
  }, [revealPathInFileTree]);

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
      updateOutlineState(content, language, path);
    };

    window.addEventListener('editor:content-changed', handleContentChanged as EventListener);

    return () => {
      window.removeEventListener('editor:content-changed', handleContentChanged as EventListener);
    };
  }, [updateOutlineState]);

  useEffect(() => {
    scheduleOutlineSync();
  }, [scheduleOutlineSync]);

  useEffect(() => {
    if (!isOutlineExpanded) {
      return;
    }

    scheduleOutlineSync();
  }, [isOutlineExpanded, scheduleOutlineSync]);

  // 在指定文件夹中添加创建节�?
  // 移除任何正在创建的临时节�?
  const removeCreatingNode = useCallback(() => {
    setFileTree(prevTree => {
      const remove = (nodes: FileTreeNode[]): FileTreeNode[] =>
        nodes
          .filter(node => !node.isCreating)
          .map(node => ({
            ...node,
            children: node.children ? remove(node.children) : node.children,
          }));

      const cleaned = remove(prevTree);
      fileTreeRef.current = cleaned;
      return cleaned;
    });
  }, []);

  const addCreatingNodeInFolder = useCallback((targetFolderPath: string | null, type: 'file' | 'folder') => {
    if (!rootFolderPath) {
      console.warn('[FileExplorer] No workspace is open.');
      return;
    }

    // 如果存在正在创建的节点，先清理再继续
    if (isInlineEditingRef.current) {
      console.log('[FileExplorer] 已存在创建节点，先移除再继续');
      removeCreatingNode();
    }

    console.log('[FileExplorer] 添加创建节点:', { targetFolderPath, type });
    isInlineEditingRef.current = true;
    setIsInlineEditing(true);

    setFileTree(prevTree => {
      // 如果 targetFolderPath �?null，在根目录创�?
      if (!targetFolderPath) {
        const creatingNode: FileTreeNode = {
          path: '',
          name: '',
          isDirectory: type === 'folder',
          isCreating: true,
          creatingType: type,
          parentPath: rootFolderPath, // 父目录为根目�?
          depth: 0,
          children: []
        };
        
        if (type === 'folder') {
          // 文件夹添加到最前面
          return [creatingNode, ...prevTree];
        } else {
          // 文件添加到所有文件夹之后
          const firstFileIndex = prevTree.findIndex(node => !node.isDirectory);
          const insertIndex = firstFileIndex === -1 ? prevTree.length : firstFileIndex;
          const newTree = [...prevTree];
          newTree.splice(insertIndex, 0, creatingNode);
          return newTree;
        }
      }

      // 在指定文件夹中创�?
      const addCreatingNode = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.map(node => {
          if (node.path === targetFolderPath && node.isDirectory) {
            const parentDepth = node.depth || 0;
            const creatingNode: FileTreeNode = {
              path: '',
              name: '',
              isDirectory: type === 'folder',
              isCreating: true,
              creatingType: type,
              parentPath: targetFolderPath, // 记录父目录路�?
              depth: parentDepth + 1,
              children: []
            };

            const children = node.children || [];
            let newChildren: FileTreeNode[];
            
            if (type === 'folder') {
              // 文件夹添加到最前面
              newChildren = [creatingNode, ...children];
            } else {
              // 文件添加到所有文件夹之后
              const firstFileIndex = children.findIndex(child => !child.isDirectory);
              const insertIndex = firstFileIndex === -1 ? children.length : firstFileIndex;
              newChildren = [...children];
              newChildren.splice(insertIndex, 0, creatingNode);
            }

            return {
              ...node,
              isExpanded: true, // 展开文件夹以显示创建节点
              children: newChildren
            };
          }
          if (node.children) {
            return { ...node, children: addCreatingNode(node.children) };
          }
          return node;
        });
      };

      const newTree = addCreatingNode(prevTree);
      fileTreeRef.current = newTree;
      return newTree;
    });
  }, [rootFolderPath, setFileTreeData]);

  // 处理新建文件（在根目录）
  const handleNewFile = useCallback(() => {
    console.log('[FileExplorer] 新建文件按钮点击');
    let targetFolderPath: string | null = null;
    const selectedNode = findNodeByPath(selectedFilePath);
    if (selectedNode?.isDirectory) {
      targetFolderPath = selectedNode.path;
    }
    addCreatingNodeInFolder(targetFolderPath, 'file');
  }, [addCreatingNodeInFolder, findNodeByPath, selectedFilePath]);

  // 处理新建文件夹（在根目录�?
  const handleNewFolder = useCallback(() => {
    console.log('[FileExplorer] New folder action triggered.');
    let targetFolderPath: string | null = null;
    const selectedNode = findNodeByPath(selectedFilePath);
    if (selectedNode?.isDirectory) {
      targetFolderPath = selectedNode.path;
    }
    addCreatingNodeInFolder(targetFolderPath, 'folder');
  }, [addCreatingNodeInFolder, findNodeByPath, selectedFilePath]);

  // 处理创建取消
  const handleCreateCancel = useCallback((node: FileTreeNode) => {
    console.log('[FileExplorer] 创建取消:', node);
    isInlineEditingRef.current = false;
    setIsInlineEditing(false);
    removeCreatingNode();
  }, [removeCreatingNode]);

  // 处理创建确认
  const handleCreateConfirm = useCallback(async (node: FileTreeNode, name: string) => {
    console.log('[FileExplorer] 创建确认:', { node, name, parentPath: node.parentPath });
    
    if (!rootFolderPath || !name.trim()) {
      console.warn('[FileExplorer] Invalid create arguments.');
      handleCreateCancel(node);
      return;
    }
    
    // 确定创建目录：如果有 parentPath 则在该目录下创建，否则在根目录创�?
    const targetPath = node.parentPath || rootFolderPath;
    
    try {
      if (node.creatingType === 'file') {
        // 创建文件
        const result = await window.electron?.folder?.createFile(targetPath, name);
        
        if (result?.success) {
          console.log('[FileExplorer] 文件创建成功:', result.data);
          isInlineEditingRef.current = false;
          setIsInlineEditing(false);
          // 刷新文件树（保持状态）
          await refreshFileTree(rootFolderPath);
        } else {
          console.error('[FileExplorer] 文件创建失败:', result?.error);
          handleCreateCancel(node);
        }
      } else if (node.creatingType === 'folder') {
        // 创建文件�?
        const result = await window.electron?.folder?.createFolder(targetPath, name);
        
        if (result?.success) {
          console.log('[FileExplorer] Folder created successfully.');
          isInlineEditingRef.current = false;
          setIsInlineEditing(false);
          // 刷新文件树（保持状态）
          await refreshFileTree(rootFolderPath);
        } else {
          console.error('[FileExplorer] Failed to create folder.', result?.error);
          handleCreateCancel(node);
        }
      }
    } catch (error) {
      console.error('[FileExplorer] 创建失败:', error);
      handleCreateCancel(node);
    }
  }, [rootFolderPath, handleCreateCancel, refreshFileTree]);

  // 处理全部折叠
  const handleCollapseAll = useCallback(() => {
    console.log('[FileExplorer] 全部折叠');
    // 折叠所有节�?
    const collapseTree = (items: FileTreeNode[]): FileTreeNode[] => {
      return items.map(item => ({
        ...item,
        isExpanded: false,
        children: item.children ? collapseTree(item.children) : []
      }));
    };
    setFileTree(prevTree => {
      const newTree = collapseTree(prevTree);
      fileTreeRef.current = newTree;
      return newTree;
    });
  }, [setFileTreeData]);

  // 开始重命名（设置节点为编辑状态）
  const handleExpandAll = useCallback(async () => {
    if (!rootFolderPath) {
      return;
    }

    console.log('[FileExplorer] 全部展开');

    const convertToFileTreeNode = (item: FileSystemTreeEntry, depth: number): FileTreeNode => ({
      name: item.name,
      path: item.path,
      isDirectory: item.type === 'directory',
      isExpanded: item.type === 'directory',
      depth,
      children: item.children?.map((child) => convertToFileTreeNode(child, depth + 1)) || []
    });

    const expandNodesRecursively = async (nodes: FileTreeNode[]): Promise<FileTreeNode[]> => {
      const expandedNodes: FileTreeNode[] = [];

      for (const node of nodes) {
        if (!node.isDirectory) {
          expandedNodes.push(node);
          continue;
        }

        let nextChildren = node.children || [];

        if (nextChildren.length === 0) {
          try {
            const expandResult = await window.electron?.folder?.expand(node.path, rootFolderPath);
            if (expandResult?.success && expandResult.data) {
              nextChildren = expandResult.data.map((item: FileSystemTreeEntry) =>
                convertToFileTreeNode(item, (node.depth || 0) + 1),
              );
            }
          } catch (error) {
            console.error('[FileExplorer] 展开全部时加载子目录失败:', node.path, error);
          }
        }

        const expandedChildren = await expandNodesRecursively(nextChildren);
        expandedNodes.push({
          ...node,
          isExpanded: true,
          children: expandedChildren
        });
      }

      return expandedNodes;
    };

    const expandedTree = await expandNodesRecursively(fileTreeRef.current);
    fileTreeRef.current = expandedTree;
    setFileTree(expandedTree);
  }, [rootFolderPath]);

  const revealCurrentFilePath = useMemo(() => {
    const selectedNode = findNodeByPath(selectedFilePath);
    if (selectedFilePath && (!selectedNode || !selectedNode.isDirectory)) {
      return selectedFilePath;
    }

    return currentActiveFilePath;
  }, [currentActiveFilePath, findNodeByPath, selectedFilePath, fileTree]);

  const handleRevealCurrentFile = useCallback(() => {
    if (!revealCurrentFilePath) {
      return;
    }

    void revealPathInFileTree(revealCurrentFilePath);
  }, [revealCurrentFilePath, revealPathInFileTree]);

  const handleToggleOutlineView = useCallback(() => {
    const nextExpanded = !isOutlineExpanded;
    setOutlineExpanded(nextExpanded);
    if (nextExpanded) {
      scheduleOutlineSync();
    }
  }, [isOutlineExpanded, scheduleOutlineSync, setOutlineExpanded]);

  const handleOutlineNodeSelect = useCallback((node: ExplorerOutlineNode) => {
    setSelectedOutlineNode(node);

    const view = getActiveCodeMirrorEditorView();
    const activeEditorMeta = getActiveCodeMirrorEditorMeta();
    if (!view) {
      return;
    }

    if (activeEditorMeta.path && currentActiveFilePath && activeEditorMeta.path !== currentActiveFilePath) {
      return;
    }

    const targetLineNumber = Math.max(node.range.start.line, 1);
    if (targetLineNumber > view.state.doc.lines) {
      return;
    }

    const targetLine = view.state.doc.line(targetLineNumber);
    const targetOffset = Math.max(node.range.start.character, 0);
    const targetPosition = Math.min(targetLine.from + targetOffset, targetLine.to);

    view.dispatch({
      selection: { anchor: targetPosition },
      effects: EditorView.scrollIntoView(targetPosition, { y: 'center' }),
    });
    view.focus();
  }, [currentActiveFilePath, setSelectedOutlineNode]);

  const handleOutlineNodeToggle = useCallback((node: ExplorerOutlineNode) => {
    setOutlineNodes((currentNodes) => {
      const nextNodes = toggleOutlineNodeExpansion(currentNodes, node.id);
      outlineNodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const handleOutlineCollapse = useCallback(() => {
    setOutlineNodes((currentNodes) => {
      const nextNodes = collapseOutlineNodes(currentNodes);
      outlineNodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const startRename = useCallback((targetPath: string) => {
    if (isInlineEditingRef.current) {
      console.log('[FileExplorer] 正在内联编辑，忽略重命名');
      return;
    }

    console.log('[FileExplorer] 开始重命名:', targetPath);
    isInlineEditingRef.current = true;
    setIsInlineEditing(true);

    setFileTree(prevTree => {
      const setEditing = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.map(node => {
          if (node.path === targetPath) {
            return { ...node, isEditing: true };
          }
          if (node.children) {
            return { ...node, children: setEditing(node.children) };
          }
          return node;
        });
      };

      const newTree = setEditing(prevTree);
      fileTreeRef.current = newTree;
      return newTree;
    });
  }, [setFileTreeData]);

  // 处理重命名确�?取消
  const handleRename = useCallback(async (node: FileTreeNode, newName: string) => {
    console.log('[FileExplorer] 重命�?', { oldName: node.name, newName, path: node.path });
    
    isInlineEditingRef.current = false;
    setIsInlineEditing(false);

    // 如果名称没有变化，直接取消编辑状�?
    if (newName === node.name) {
      setFileTree(prevTree => {
        const clearEditing = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map(n => {
            if (n.path === node.path) {
              return { ...n, isEditing: false };
            }
            if (n.children) {
              return { ...n, children: clearEditing(n.children) };
            }
            return n;
          });
        };

        const newTree = clearEditing(prevTree);
        fileTreeRef.current = newTree;
        return newTree;
      });
      return;
    }

    // 执行重命�?
    try {
      // 检�?API 是否可用
      if (!window.electron?.folder?.rename) {
        console.error('[FileExplorer] rename API unavailable, restart required.');
        throw new Error('rename API unavailable, restart required.');
      }

      const result = await window.electron.folder.rename(node.path, newName);
      
      if (result?.success) {
        console.log('[FileExplorer] 重命名成�?', result.data);
        // 刷新文件�?
        await refreshFileTree(rootFolderPath);
      } else {
        console.error('[FileExplorer] 重命名失�?', result?.error);
        // 恢复编辑状�?
        setFileTree(prevTree => {
          const clearEditing = (nodes: FileTreeNode[]): FileTreeNode[] => {
            return nodes.map(n => {
              if (n.path === node.path) {
                return { ...n, isEditing: false };
              }
              if (n.children) {
                return { ...n, children: clearEditing(n.children) };
              }
              return n;
            });
          };

          const newTree = clearEditing(prevTree);
          fileTreeRef.current = newTree;
          return newTree;
        });
      }
    } catch (error) {
      console.error('[FileExplorer] 重命名出�?', error);
      // 恢复编辑状�?
      setFileTree(prevTree => {
        const clearEditing = (nodes: FileTreeNode[]): FileTreeNode[] => {
          return nodes.map(n => {
            if (n.path === node.path) {
              return { ...n, isEditing: false };
            }
            if (n.children) {
              return { ...n, children: clearEditing(n.children) };
            }
            return n;
          });
        };

        const newTree = clearEditing(prevTree);
        fileTreeRef.current = newTree;
        return newTree;
      });
    }
  }, [rootFolderPath, refreshFileTree, setFileTreeData]);

  // 显示删除确认对话框（使用全局 modal.confirm，和知识库保持一致）
  const handleDelete = useCallback((node: FileTreeNode) => {
    if (!node.path) {
      console.warn('[FileExplorer] Invalid delete path.');
      return;
    }

    modal.confirm({
      title: `Delete ${node.isDirectory ? 'Folder' : 'File'}`,
      description: `Are you sure you want to delete "${node.name}"? ${node.isDirectory ? 'This will delete the folder and all its contents. ' : ''}This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          if (!window.electron?.folder?.delete) {
            console.error('[FileExplorer] delete API unavailable, restart required.');
            return;
          }

          const result = await window.electron.folder.delete(node.path);

          if (result?.success) {
            console.log('[FileExplorer] Delete success:', node.path);
            if (rootFolderPath) {
              await refreshFileTree(rootFolderPath);
            }
          } else {
            console.error('[FileExplorer] Delete failed:', result?.error);
          }
        } catch (error) {
          console.error('[FileExplorer] Delete error:', error);
        }
      },
    });
  }, [rootFolderPath, refreshFileTree]);

  // 在资源管理器中打开文件或文件夹
  const handleRevealInExplorer = useCallback(async (targetPath: string) => {
    try {
      console.log('[FileExplorer] 在资源管理器中打开:', targetPath);
      
      // 检�?API 是否可用
      if (!window.electron?.folder?.revealInExplorer) {
        console.error('[FileExplorer] revealInExplorer API unavailable, restart required.');
        return;
      }

      const result = await window.electron.folder.revealInExplorer(targetPath);
      
      if (result?.success) {
        console.log('[FileExplorer] 已在资源管理器中打开:', targetPath);
      } else {
        console.error('[FileExplorer] 在资源管理器中打开失败:', result?.error);
        // TODO: 显示错误提示
      }
    } catch (error) {
      console.error('[FileExplorer] 在资源管理器中打开出错:', error);
      // TODO: 显示错误提示
    }
  }, []);

  // 立即索引文件
  const handleIndexFile = useCallback(async (targetPath: string) => {
    try {
      console.log('[FileExplorer] Index file now:', targetPath);

      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) {
        console.error('[FileExplorer] IPC unavailable.');
        toastService.error('Index failed', { description: 'IPC unavailable.' });
        return;
      }

      const fileName = targetPath.split(/[/\\]/).pop() || targetPath;
      toastService.info('Indexing started', { description: fileName, duration: 2000 });

      const result = await ipcRenderer.invoke('workspace-vector-index:index-file', targetPath);

      if (result?.success) {
        console.log('[FileExplorer] File indexing completed.');
      } else {
        console.error('[FileExplorer] File indexing failed:', result?.error);
        toastService.error('Index failed', { description: result?.error || 'Unknown error' });
      }
    } catch (error) {
      console.error('[FileExplorer] Error indexing file:', error);
      toastService.error('Index failed', { description: String(error) });
    }
  }, []);

  // 立即索引文件�?
  const handleIndexFolder = useCallback(async (targetPath: string) => {
    try {
      console.log('[FileExplorer] Index folder now:', targetPath);

      const ipcRenderer = window.electron?.ipcRenderer;
      if (!ipcRenderer) {
        console.error('[FileExplorer] IPC unavailable.');
        toastService.error('Index failed', { description: 'IPC unavailable.' });
        return;
      }

      const folderName = targetPath.split(/[/\\]/).pop() || targetPath;
      toastService.info('Folder indexing started', { description: folderName, duration: 2000 });

      const result = await ipcRenderer.invoke('workspace-vector-index:start', targetPath);

      if (result?.success) {
        console.log('[FileExplorer] Folder indexing started.');
      } else {
        console.error('[FileExplorer] Failed to start indexing:', result?.error);
        toastService.error('Index failed', { description: result?.error || 'Unknown error' });
      }
    } catch (error) {
      console.error('[FileExplorer] Error indexing folder:', error);
      toastService.error('Index failed', { description: String(error) });
    }
  }, []);

  // 监听右键菜单的文件操作事�?
  useEffect(() => {
    const handleFileAction = (event: Event) => {
      const customEvent = event as CustomEvent<{ action: string; node: FileTreeNode }>;
      const { action, node } = customEvent.detail;
      
      console.log('[FileExplorer] 收到文件操作事件:', action, node?.path);
      
      switch (action) {
        case 'new-file-in-folder':
          // 在指定文件夹中新建文�?
          if (node?.isDirectory) {
            addCreatingNodeInFolder(node.path, 'file');
          }
          break;
        case 'new-folder-in-folder':
          // 在指定文件夹中新建文件夹
          if (node?.isDirectory) {
            addCreatingNodeInFolder(node.path, 'folder');
          }
          break;
        case 'rename-file':
        case 'rename-folder':
          // 重命名文件或文件�?
          if (node?.path) {
            startRename(node.path);
          }
          break;
        case 'delete-file':
        case 'delete-folder':
          // 删除文件或文件夹
          if (node?.path) {
            handleDelete(node);
          }
          break;
        case 'reveal-in-explorer':
          // 在资源管理器中打开文件或文件夹
          if (node?.path) {
            handleRevealInExplorer(node.path);
          }
          break;
        case 'index-file':
          // 立即索引文件
          if (node?.path) {
            handleIndexFile(node.path);
          }
          break;
        case 'index-folder':
          // 立即索引文件�?
          if (node?.path) {
            handleIndexFolder(node.path);
          }
          break;
        default:
          // 其他操作暂不处理
          break;
      }
    };

    window.addEventListener('explorer-file-action', handleFileAction as EventListener);

    return () => {
      window.removeEventListener('explorer-file-action', handleFileAction as EventListener);
    };
  }, [addCreatingNodeInFolder, startRename, handleDelete, handleRevealInExplorer, handleIndexFile, handleIndexFolder]);

  return (
    <>
      <ExplorerView
        rootName={rootFolderName}
        rootPath={rootFolderPath}
        fileTreeNodes={fileTree}
        outlineNodes={outlineNodes}
        selectedOutlineNode={selectedOutlineNode}
        selectedFilePath={selectedFilePath}
        fileTreeRevealRequest={fileTreeRevealRequest}
        workspaceHeaderActionMode={workspaceHeaderActionMode}
        canRevealCurrentFile={Boolean(revealCurrentFilePath)}
        isOutlineViewActive={isOutlineExpanded}
        onFileClick={handleFileClick}
        onFileDoubleClick={handleFileDoubleClick}
        onFolderToggle={handleFolderToggle}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRefresh={() => {
          // 刷新时保持当前状态，只更新新�?删除的文件，不闪�?
          if (rootFolderPath) {
            refreshFileTree(rootFolderPath);
          }
        }}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onToggleOutlineView={handleToggleOutlineView}
        onRevealCurrentFile={handleRevealCurrentFile}
        onOutlineNodeSelect={handleOutlineNodeSelect}
        onOutlineNodeToggle={handleOutlineNodeToggle}
        onCollapseOutline={handleOutlineCollapse}
        onCreateConfirm={handleCreateConfirm}
        onCreateCancel={handleCreateCancel}
        onRename={handleRename}
        onBlankAreaClick={handleBlankAreaClick}
        initialFormExpanded={initialFormExpanded}
        onFormExpandedChange={async (expanded) => {
          const currentConfig = await electronStore.get('explorer-config') ?? {};
          await electronStore.set('explorer-config', {
            ...currentConfig,
            isFormExpanded: expanded,
          });
        }}
      />
    </>
  );
};

