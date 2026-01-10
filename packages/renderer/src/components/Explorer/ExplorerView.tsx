import React, { useCallback, useState } from 'react';
import { OpenEditorsSection } from './OpenEditors/OpenEditorsSection';
import { FileTreeSection } from './FileTree/FileTreeSection';
import { TimelineSection } from './Timeline/TimelineSection';
import { DatabaseSection } from './Database';
import { FormSection } from './Form';
import { FileTreeNode, EditorInfo } from './FileTree/types';
import { TimelineItem } from './Timeline/types';
import { ContextMenu, ContextMenuItem } from './Common/ContextMenu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../common/AlertDialog/AlertDialog';
import './ExplorerView.scss';

export interface ExplorerViewProps {
  // 打开的编辑器
  openEditors?: EditorInfo[];
  showOpenEditors?: boolean;
  onCloseAll?: () => void;
  
  // 文件树
  rootName?: string;
  rootPath?: string;
  fileTreeNodes?: FileTreeNode[];
  selectedFilePath?: string;
  
  // 时间线
  timelineItems?: TimelineItem[];
  
  // 回调函数
  onEditorClick?: (editor: EditorInfo) => void;
  onEditorClose?: (editor: EditorInfo) => void;
  onFileClick?: (node: FileTreeNode) => void;
  onFileDoubleClick?: (node: FileTreeNode) => void;
  onFolderToggle?: (node: FileTreeNode) => void;
  onTimelineItemClick?: (item: TimelineItem) => void;
  
  // 文件树操作
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void;
  onCreateCancel?: (node: FileTreeNode) => void;
  onRename?: (node: FileTreeNode, newName: string) => void;
  onBlankAreaClick?: () => void;
}

/**
 * 资源管理器主容器
 * 整合所有资源管理器功能模块
 */
export const ExplorerView: React.FC<ExplorerViewProps> = ({
  openEditors = [],
  showOpenEditors = true,
  onCloseAll,
  rootName = 'MY-PROJECT',
  rootPath = '',
  fileTreeNodes = [],
  selectedFilePath = '',
  timelineItems = [],
  onEditorClick,
  onEditorClose,
  onFileClick,
  onFileDoubleClick,
  onFolderToggle,
  onTimelineItemClick,
  onNewFile,
  onNewFolder,
  onRefresh,
  onCollapseAll,
  onCreateConfirm,
  onCreateCancel,
  onRename,
  onBlankAreaClick,
}) => {
  
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  const [contextMenuSelectionPath, setContextMenuSelectionPath] = useState<string | null>(null);
  
  // 追踪展开/折叠状态
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(true);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isDatabaseExpanded, setIsDatabaseExpanded] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(false);

  // 表单状态
  const [formGroups, setFormGroups] = useState<import('./Form/types').FormGroupItem[]>([]);
  const [forms, setForms] = useState<import('./Form/types').FormItem[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();

  // 删除分组确认对话框状态
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<import('./Form/types').FormGroupItem | null>(null);

  // 加载表单数据
  const loadFormData = useCallback(async () => {
    try {
      // 初始化数据库
      await window.electron?.form?.initialize();
      
      // 加载分组
      const groupsResult = await window.electron?.form?.getAllGroups();
      if (groupsResult?.success && groupsResult.data) {
        const groupsData = groupsResult.data;
        setFormGroups(prev => {
          // 保留现有分组的展开状态
          const expandedMap = new Map(prev.map(g => [g.id, g.isExpanded]));
          return groupsData.map(g => ({
            ...g,
            isExpanded: expandedMap.get(g.id) ?? true,
          }));
        });
      }
      
      // 加载表单
      const formsResult = await window.electron?.form?.getAllForms();
      if (formsResult?.success && formsResult.data) {
        setForms(formsResult.data);
      }
    } catch (error) {
      console.error('[ExplorerView] 加载表单数据失败:', error);
    }
  }, []);

  // 初始化时加载表单数据
  React.useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  // 监听表格设计器标签页关闭事件，清除表单选中状态
  React.useEffect(() => {
    const handleFormTabClosed = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string }>;
      const { formId } = customEvent.detail || {};
      // 如果关闭的是当前选中的表单，清除选中状态
      if (formId && formId === selectedFormId) {
        setSelectedFormId(undefined);
      }
    };

    // 监听表格设计器标签页激活事件，更新表单选中状态
    const handleFormTabActivated = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string }>;
      const { formId } = customEvent.detail || {};
      if (formId) {
        setSelectedFormId(formId);
        setSelectedGroupId(undefined);
      }
    };

    // 监听非表格设计器标签页激活事件，清除表单选中状态
    const handleFormTabDeactivated = () => {
      setSelectedFormId(undefined);
    };

    window.addEventListener('form-tab-closed', handleFormTabClosed);
    window.addEventListener('form-tab-activated', handleFormTabActivated);
    window.addEventListener('form-tab-deactivated', handleFormTabDeactivated);
    return () => {
      window.removeEventListener('form-tab-closed', handleFormTabClosed);
      window.removeEventListener('form-tab-activated', handleFormTabActivated);
      window.removeEventListener('form-tab-deactivated', handleFormTabDeactivated);
    };
  }, [selectedFormId]);

  // 新建表单
  const handleNewForm = useCallback(async (groupId?: string | null) => {
    try {
      const result = await window.electron?.form?.createForm('未命名表单', groupId ?? null);
      if (result?.success && result.data) {
        const newForm = result.data;
        // 直接将新表单添加到状态中
        setForms(prev => [...prev, newForm]);
        // 打开新建的表单
        window.dispatchEvent(new CustomEvent('open-form-view', {
          detail: { formId: newForm.id, formName: newForm.name }
        }));
      }
    } catch (error) {
      console.error('[ExplorerView] 新建表单失败:', error);
    }
  }, []);

  // 新建分组
  const handleNewGroup = useCallback(async (name: string) => {
    try {
      const result = await window.electron?.form?.createGroup(name, null);
      if (result?.success && result.data) {
        const newGroup = result.data;
        // 直接将新分组添加到状态中
        setFormGroups(prev => [...prev, { ...newGroup, isExpanded: true }]);
      }
    } catch (error) {
      console.error('[ExplorerView] 新建分组失败:', error);
    }
  }, []);

  // 点击表单
  const handleFormClick = useCallback((item: import('./Form/types').FormItem) => {
    setSelectedFormId(item.id);
    setSelectedGroupId(undefined);
  }, []);

  // 双击表单打开编辑器
  const handleFormDoubleClick = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-form-view', {
      detail: { formId: item.id, formName: item.name }
    }));
  }, []);

  // 点击分组
  const handleGroupClick = useCallback((item: import('./Form/types').FormGroupItem) => {
    setSelectedGroupId(item.id);
    setSelectedFormId(undefined);
  }, []);

  // 切换分组展开状态
  const handleGroupToggle = useCallback((item: import('./Form/types').FormGroupItem) => {
    setFormGroups(prev => prev.map(g => 
      g.id === item.id ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  }, []);

  // 打开表单（打开表格设计器）
  const handleOpenForm = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-table-designer', {
      detail: { formId: item.id, formName: item.name }
    }));
  }, []);

  // 在新选项卡打开表单
  const handleOpenFormInNewTab = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-table-designer', {
      detail: { formId: item.id, formName: item.name, newTab: true }
    }));
  }, []);

  // 重命名表单
  const handleRenameForm = useCallback(async (item: import('./Form/types').FormItem, newName: string) => {
    try {
      const result = await window.electron?.form?.updateForm(item.id, { name: newName });
      if (result?.success) {
        // 直接更新状态中的表单名称
        setForms(prev => prev.map(f => 
          f.id === item.id ? { ...f, name: newName } : f
        ));
        // 触发事件更新标签页标题
        window.dispatchEvent(new CustomEvent('table-name-change', {
          detail: { formId: item.id, newName }
        }));
      }
    } catch (error) {
      console.error('[ExplorerView] 重命名表单失败:', error);
    }
  }, []);

  // 删除表单
  const handleDeleteForm = useCallback(async (item: import('./Form/types').FormItem) => {
    try {
      const result = await window.electron?.form?.deleteForm(item.id);
      if (result?.success) {
        // 直接从状态中移除该表单，不重新加载
        setForms(prev => prev.filter(f => f.id !== item.id));
        // 如果删除的是当前选中的表单，清除选中状态
        if (selectedFormId === item.id) {
          setSelectedFormId(undefined);
        }
      }
    } catch (error) {
      console.error('[ExplorerView] 删除表单失败:', error);
    }
  }, [selectedFormId]);

  // 重命名分组
  const handleRenameGroup = useCallback(async (item: import('./Form/types').FormGroupItem, newName: string) => {
    try {
      const result = await window.electron?.form?.updateGroup(item.id, { name: newName });
      if (result?.success) {
        // 直接更新状态中的分组名称
        setFormGroups(prev => prev.map(g => 
          g.id === item.id ? { ...g, name: newName } : g
        ));
      }
    } catch (error) {
      console.error('[ExplorerView] 重命名分组失败:', error);
    }
  }, []);

  // 删除分组（同时删除分组中的表单）
  const handleDeleteGroup = useCallback((item: import('./Form/types').FormGroupItem) => {
    // 显示确认对话框
    setGroupToDelete(item);
    setDeleteGroupDialogOpen(true);
  }, []);

  // 确认删除分组
  const confirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete) return;
    
    try {
      const result = await window.electron?.form?.deleteGroup(groupToDelete.id);
      if (result?.success) {
        // 递归获取所有要删除的分组ID（包括子分组）
        const getGroupIdsToDelete = (groupId: string, allGroups: import('./Form/types').FormGroupItem[]): string[] => {
          const ids = [groupId];
          const children = allGroups.filter(g => g.parentId === groupId);
          for (const child of children) {
            ids.push(...getGroupIdsToDelete(child.id, allGroups));
          }
          return ids;
        };
        
        setFormGroups(prev => {
          const idsToDelete = getGroupIdsToDelete(groupToDelete.id, prev);
          return prev.filter(g => !idsToDelete.includes(g.id));
        });
        
        // 删除该分组及子分组下的所有表单
        setForms(prev => {
          const groupIdsToDelete = getGroupIdsToDelete(groupToDelete.id, formGroups);
          return prev.filter(f => !f.groupId || !groupIdsToDelete.includes(f.groupId));
        });
        
        // 如果删除的是当前选中的分组，清除选中状态
        if (selectedGroupId === groupToDelete.id) {
          setSelectedGroupId(undefined);
        }
      }
    } catch (error) {
      console.error('[ExplorerView] 删除分组失败:', error);
    }
  }, [groupToDelete, selectedGroupId, formGroups]);

  // 处理文件点击
  const handleFileClick = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    setSelectedFile(node);
    onFileClick?.(node);
  };

  // 处理文件双击
  const handleFileDoubleClick = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    onFileDoubleClick?.(node);
  };

  // 处理文件夹折叠/展开
  const handleFolderToggle = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    onFolderToggle?.(node);
  };

  // 处理文件右键菜单
  const createMenuItem = useCallback(
    (id: string, label: string, handler: () => void): ContextMenuItem => ({
      id,
      label,
      onClick: handler,
    }),
    []
  );

  const emitFileAction = useCallback((action: string, node: FileTreeNode) => {
    window.dispatchEvent(
      new CustomEvent('explorer-file-action', {
        detail: { action, node },
      })
    );
  }, []);

  // 最小文件大小（字节），与后端保持一致
  const MIN_FILE_SIZE = 2 * 1024; // 2KB

  const buildSelectedFileMenuItems = useCallback(
    async (node: FileTreeNode): Promise<ContextMenuItem[]> => {
      // 检查文件是否已索引和文件大小
      let isIndexed = false;
      let fileSize = 0;
      
      try {
        const ipcRenderer = window.electron?.ipcRenderer;
        if (ipcRenderer) {
          // 检查文件是否已索引
          const indexResult = await ipcRenderer.invoke('workspace-index-db:is-file-indexed', node.path);
          isIndexed = indexResult?.success === true && indexResult?.data === true;
          
          // 获取文件大小
          const statsResult = await ipcRenderer.invoke('file-stat', node.path);
          fileSize = statsResult?.size || 0;
        }
      } catch (e) {
        console.warn('[ExplorerView] 检查文件索引状态失败:', e);
      }

      // 判断是否禁用立即索引：已索引 或 文件小于2KB
      const disableIndex = isIndexed || fileSize < MIN_FILE_SIZE;

      return [
        {
          id: 'open-to-side',
          label: '在侧边打开',
          onClick: () => emitFileAction('open-to-side', node),
        },
        {
          id: 'add-to-chat',
          label: '添加到聊天',
          onClick: () => emitFileAction('add-to-chat', node),
        },
        {
          id: 'add-to-new-chat',
          label: '添加到新的聊天',
          onClick: () => emitFileAction('add-to-new-chat', node),
        },
        {
          id: 'reveal-in-explorer',
          label: '在资源管理器中打开',
          onClick: () => emitFileAction('reveal-in-explorer', node),
        },
        {
          id: 'file-menu-separator-1',
          label: '',
          separator: true,
        },
        {
          id: 'open-timeline',
          label: '打开时间线',
          onClick: () => emitFileAction('open-timeline', node),
        },
        {
          id: 'file-menu-separator-2',
          label: '',
          separator: true,
        },
        {
          id: 'cut-file',
          label: '剪切',
          onClick: () => emitFileAction('cut-file', node),
        },
        {
          id: 'copy-file',
          label: '复制',
          onClick: () => emitFileAction('copy-file', node),
        },
        {
          id: 'file-menu-separator-3',
          label: '',
          separator: true,
        },
        {
          id: 'rename-file',
          label: '重命名',
          onClick: () => emitFileAction('rename-file', node),
        },
        {
          id: 'delete-file',
          label: '删除',
          onClick: () => emitFileAction('delete-file', node),
        },
        {
          id: 'file-menu-separator-4',
          label: '',
          separator: true,
        },
        {
          id: 'index-file',
          label: '立即索引',
          disabled: disableIndex,
          onClick: () => emitFileAction('index-file', node),
        },
      ];
    },
    [emitFileAction]
  );

  const buildSelectedFolderMenuItems = useCallback(
    (node: FileTreeNode): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      // 新建文件...
      if (onNewFile) {
        items.push({
          id: 'new-file-in-folder',
          label: '新建文件...',
          onClick: () => emitFileAction('new-file-in-folder', node),
        });
      }

      // 新建文件夹...
      if (onNewFolder) {
        items.push({
          id: 'new-folder-in-folder',
          label: '新建文件夹...',
          onClick: () => emitFileAction('new-folder-in-folder', node),
        });
      }

      // 在资源管理器中打开
      items.push({
        id: 'reveal-folder-in-explorer',
        label: '在资源管理器中打开',
        onClick: () => emitFileAction('reveal-in-explorer', node),
      });

      // 分割线
      items.push({
        id: 'folder-menu-separator-1',
        label: '',
        separator: true,
      });

      // 折叠文件夹
      if (onFolderToggle && node.isExpanded) {
        items.push({
          id: 'collapse-folder',
          label: '折叠文件夹',
          onClick: () => onFolderToggle(node),
        });
      }

      // 折叠所有
      if (onCollapseAll) {
        items.push({
          id: 'collapse-all',
          label: '折叠所有',
          onClick: () => onCollapseAll(),
        });
      }

      // 分割线
      items.push({
        id: 'folder-menu-separator-2',
        label: '',
        separator: true,
      });

      // 添加到聊天
      items.push({
        id: 'add-folder-to-chat',
        label: '添加到聊天',
        onClick: () => emitFileAction('add-to-chat', node),
      });

      // 添加到新的聊天
      items.push({
        id: 'add-folder-to-new-chat',
        label: '添加到新的聊天',
        onClick: () => emitFileAction('add-to-new-chat', node),
      });

      // 分割线
      items.push({
        id: 'folder-menu-separator-3',
        label: '',
        separator: true,
      });

      // 在文件夹中查找...
      items.push({
        id: 'find-in-folder',
        label: '在文件夹中查找...',
        onClick: () => emitFileAction('find-in-folder', node),
      });

      // 分割线
      items.push({
        id: 'folder-menu-separator-4',
        label: '',
        separator: true,
      });

      // 剪切
      items.push({
        id: 'cut-folder',
        label: '剪切',
        onClick: () => emitFileAction('cut-folder', node),
      });

      // 复制
      items.push({
        id: 'copy-folder',
        label: '复制',
        onClick: () => emitFileAction('copy-folder', node),
      });

      // 粘贴
      items.push({
        id: 'paste-folder',
        label: '粘贴',
        onClick: () => emitFileAction('paste-folder', node),
      });

      // 分割线
      items.push({
        id: 'folder-menu-separator-5',
        label: '',
        separator: true,
      });

      // 重命名
      items.push({
        id: 'rename-folder',
        label: '重命名',
        onClick: () => emitFileAction('rename-folder', node),
      });

      // 删除
      items.push({
        id: 'delete-folder',
        label: '删除',
        onClick: () => emitFileAction('delete-folder', node),
      });

      // 分割线
      items.push({
        id: 'folder-menu-separator-6',
        label: '',
        separator: true,
      });

      // 立即索引
      items.push({
        id: 'index-folder',
        label: '立即索引',
        onClick: () => emitFileAction('index-folder', node),
      });

      return items;
    },
    [emitFileAction, onNewFile, onNewFolder, onFolderToggle, onCollapseAll]
  );

  const buildGeneralMenuItems = useCallback((): ContextMenuItem[] => {
    const creationItems: ContextMenuItem[] = [];
    const utilityItems: ContextMenuItem[] = [];

    if (onNewFile) {
      creationItems.push(createMenuItem('new-file', '新建文件', onNewFile));
    }

    if (onNewFolder) {
      creationItems.push(createMenuItem('new-folder', '新建文件夹', onNewFolder));
    }

    if (onRefresh) {
      utilityItems.push(createMenuItem('refresh', '刷新', onRefresh));
    }

    if (onCollapseAll) {
      utilityItems.push(createMenuItem('collapse-all', '折叠所有', onCollapseAll));
    }

    const composedItems: ContextMenuItem[] = [...creationItems];

    if (creationItems.length > 0 && utilityItems.length > 0) {
      composedItems.push({
        id: 'general-separator',
        label: '',
        separator: true,
      });
    }

    composedItems.push(...utilityItems);
    return composedItems;
  }, [createMenuItem, onNewFile, onNewFolder, onRefresh, onCollapseAll]);

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
    setContextMenuSelectionPath(null);
  }, []);

  const handleFileContextMenu = useCallback(async (node: FileTreeNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuSelectionPath(node.path);

    if (!node.isDirectory) {
      // 文件右键菜单（异步获取菜单项）
      const fileItems = await buildSelectedFileMenuItems(node);
      setContextMenuState({
        position: { x: event.clientX, y: event.clientY },
        items: fileItems,
      });
      return;
    }

    // 文件夹右键菜单
    const folderItems = buildSelectedFolderMenuItems(node);
    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      items: folderItems,
    });
  }, [buildSelectedFileMenuItems, buildSelectedFolderMenuItems]);

  const buildBlankAreaMenuItems = useCallback(async (): Promise<ContextMenuItem[]> => {
    const items: ContextMenuItem[] = [];
    
    // 检查剪贴板是否有数据
    let hasClipboardData = false;
    try {
      const clipboardText = await navigator.clipboard.readText();
      hasClipboardData = clipboardText.trim().length > 0;
    } catch (error) {
      // 剪贴板访问失败或没有权限，默认为 false
      hasClipboardData = false;
    }

    // 新建文件...
    if (onNewFile) {
      items.push({
        id: 'new-file',
        label: '新建文件...',
        onClick: () => {
          if (onNewFile) {
            onNewFile();
          }
        },
      });
    }

    // 新建文件夹...
    if (onNewFolder) {
      items.push({
        id: 'new-folder',
        label: '新建文件夹...',
        onClick: () => {
          if (onNewFolder) {
            onNewFolder();
          }
        },
      });
    }

    // 在资源管理器中打开
    if (rootPath) {
      items.push({
        id: 'reveal-workspace-in-explorer',
        label: '在资源管理器中打开',
        onClick: () => {
          const workspaceNode: FileTreeNode = {
            path: rootPath,
            name: rootName || 'ROOT',
            isDirectory: true,
            isExpanded: false,
          };
          emitFileAction('reveal-in-explorer', workspaceNode);
        },
      });
    }

    // 分割线
    items.push({
      id: 'blank-menu-separator-1',
        label: '',
        separator: true,
      });

    // 刷新
    if (onRefresh) {
      items.push({
        id: 'refresh',
        label: '刷新',
        onClick: () => {
          if (onRefresh) {
            onRefresh();
          }
        },
      });
    }

    // 折叠所有文件夹
    if (onCollapseAll) {
      items.push({
        id: 'collapse-all-folders',
        label: '折叠所有文件夹',
        onClick: () => {
          if (onCollapseAll) {
            onCollapseAll();
    }
        },
      });
    }

    // 分割线
    items.push({
      id: 'blank-menu-separator-2',
      label: '',
      separator: true,
    });

    // 在文件夹中查找
    if (rootPath) {
      items.push({
        id: 'find-in-workspace',
        label: '在文件夹中查找',
        onClick: () => {
          const workspaceNode: FileTreeNode = {
            path: rootPath,
            name: rootName || 'ROOT',
            isDirectory: true,
            isExpanded: false,
          };
          emitFileAction('find-in-folder', workspaceNode);
        },
      });
    }

    // 分割线
    items.push({
      id: 'blank-menu-separator-3',
      label: '',
      separator: true,
    });

    // 粘贴
    items.push({
      id: 'paste',
      label: '粘贴',
      disabled: !hasClipboardData,
      onClick: () => {
        if (rootPath && hasClipboardData) {
          const workspaceNode: FileTreeNode = {
            path: rootPath,
            name: rootName || 'ROOT',
            isDirectory: true,
            isExpanded: false,
          };
          emitFileAction('paste-folder', workspaceNode);
        }
      },
    });

    // 分割线
    items.push({
      id: 'blank-menu-separator-4',
      label: '',
      separator: true,
    });

    // 复制路径
    if (rootPath) {
      items.push({
        id: 'copy-path',
        label: '复制路径',
        onClick: () => {
          emitFileAction('copy-path', {
            path: rootPath,
            name: rootName || 'ROOT',
            isDirectory: true,
            isExpanded: false,
          } as FileTreeNode);
        },
      });
    }

    // 复制相对路径
    if (rootPath) {
      items.push({
        id: 'copy-relative-path',
        label: '复制相对路径',
        onClick: () => {
          emitFileAction('copy-relative-path', {
            path: rootPath,
            name: rootName || 'ROOT',
            isDirectory: true,
            isExpanded: false,
          } as FileTreeNode);
        },
      });
    }

    return items;
  }, [onNewFile, onNewFolder, onRefresh, onCollapseAll, rootPath, rootName, emitFileAction]);

  const handleTreeBackgroundContextMenu = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuSelectionPath(null);
    onBlankAreaClick?.();

    const items = await buildBlankAreaMenuItems();
    if (items.length === 0) {
      return;
    }

    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, [buildBlankAreaMenuItems, onBlankAreaClick]);

  // 处理时间线项点击
  const handleTimelineItemClick = (item: TimelineItem) => {
    setSelectedTimelineItem(item);
    onTimelineItemClick?.(item);
  };

  // 时间线始终显示拖动手柄（只要自己是展开状态）
  // 因为它使用 flexGrow + resizable 模式，应该始终可以调整高度
  const canTimelineResize = true;

  return (
    <div className="explorer-view">
      {/* 打开的编辑器 */}
      {showOpenEditors && openEditors.length > 0 && (
        <OpenEditorsSection
          editors={openEditors.map(editor => ({
            ...editor,
            name: editor.title, // 映射 title 到 name
          }))}
          onEditorClick={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClick?.(editor);
          }}
          onEditorClose={(path) => {
            const editor = openEditors.find(e => e.path === path);
            if (editor) onEditorClose?.(editor);
          }}
          onCloseAll={() => {
            openEditors.forEach(editor => onEditorClose?.(editor));
          }}
          onSaveAll={() => {
            console.log('Save all editors');
          }}
        />
      )}

      {/* 文件树 */}
      <FileTreeSection
        rootName={rootName}
        rootPath={rootPath}
        nodes={fileTreeNodes}
        selectedFilePath={selectedFilePath}
        contextMenuSelectionPath={contextMenuSelectionPath || undefined}
        callbacks={{
          onFileClick: handleFileClick,
          onFileDoubleClick: handleFileDoubleClick,
          onFolderToggle: handleFolderToggle,
          onContextMenu: handleFileContextMenu,
          onCreateConfirm: onCreateConfirm,
          onCreateCancel: onCreateCancel,
          onRename: onRename,
        }}
        onNewFile={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFile}
        onNewFolder={fileTreeNodes.length === 0 && !rootPath ? undefined : onNewFolder}
        onRefresh={onRefresh}
        onCollapseAll={onCollapseAll}
        onExpandedChange={setIsFileTreeExpanded}
        onBlankAreaClick={onBlankAreaClick}
        onContainerContextMenu={handleTreeBackgroundContextMenu}
      />

      {/* 数据库 */}
      <DatabaseSection
        databases={[]}
        onNewDatabase={() => {
          window.dispatchEvent(new CustomEvent('open-database-view'));
        }}
        onExpandedChange={setIsDatabaseExpanded}
      />

      {/* 表单 */}
      <FormSection
        forms={forms}
        groups={formGroups}
        selectedFormId={selectedFormId}
        selectedGroupId={selectedGroupId}
        onFormClick={handleFormClick}
        onFormDoubleClick={handleFormDoubleClick}
        onGroupClick={handleGroupClick}
        onGroupToggle={handleGroupToggle}
        onNewForm={handleNewForm}
        onNewGroup={handleNewGroup}
        onExpandedChange={setIsFormExpanded}
        onOpenForm={handleOpenForm}
        onOpenFormInNewTab={handleOpenFormInNewTab}
        onRenameForm={handleRenameForm}
        onDeleteForm={handleDeleteForm}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />

      {/* 时间线 */}
      {timelineItems.length > 0 && (
        <TimelineSection
          items={timelineItems}
          selectedItem={selectedTimelineItem}
          onItemClick={handleTimelineItemClick}
          onPin={() => console.log('Pin timeline')}
          onRefresh={() => console.log('Refresh timeline')}
          onSearch={() => console.log('Search timeline')}
          onFilter={() => console.log('Filter timeline')}
          showResizeHandle={canTimelineResize}
          onExpandedChange={setIsTimelineExpanded}
        />
      )}

      {contextMenuState && (
        <ContextMenu
          items={contextMenuState.items}
          position={contextMenuState.position}
          onClose={closeContextMenu}
        />
      )}

      {/* 删除分组确认对话框 */}
      <AlertDialog open={deleteGroupDialogOpen} onOpenChange={setDeleteGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除分组 "{groupToDelete?.name}" 吗？该分组下的所有表单和子分组也将被删除，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExplorerView;

