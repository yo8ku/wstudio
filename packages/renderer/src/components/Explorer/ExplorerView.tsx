import React, { useCallback, useState } from 'react';
import { FileTreeSection } from './FileTree/FileTreeSection';
import { TimelineSection } from './Timeline/TimelineSection';
import { FormSection } from './Form';
import { FileTreeNode } from './FileTree/types';
import { OutlineSection } from './Outline/OutlineSection';
import { OutlineNode as OutlineNodeType } from './Outline/types';
import { TimelineItem } from './Timeline/types';
import { ContextMenu, ContextMenuItem } from './Common/ContextMenu';
import { LuChevronsDownUp, LuChevronsUpDown, LuDiscAlbum } from 'react-icons/lu';
import { VscListUnordered } from 'react-icons/vsc';
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
import { CustomScrollbar } from '../common/CustomScrollbar';
import './ExplorerView.scss';

type WorkspaceHeaderActionMode = 'collapse-all' | 'expand-all';

export interface ExplorerViewProps {
  // 鏂囦欢鏍?
  rootName?: string;
  rootPath?: string;
  fileTreeNodes?: FileTreeNode[];
  outlineNodes?: OutlineNodeType[];
  selectedOutlineNode?: OutlineNodeType | null;
  selectedFilePath?: string;
  fileTreeRevealRequest?: {
    id: number;
    path: string;
  } | null;
  workspaceHeaderActionMode?: WorkspaceHeaderActionMode;
  canRevealCurrentFile?: boolean;
  isOutlineViewActive?: boolean;
  
  // 鏃堕棿绾?
  timelineItems?: TimelineItem[];
  
  // 鍥炶皟鍑芥暟
  onFileClick?: (node: FileTreeNode) => void;
  onFileDoubleClick?: (node: FileTreeNode) => void;
  onFolderToggle?: (node: FileTreeNode) => void;
  onTimelineItemClick?: (item: TimelineItem) => void;
  
  // 鏂囦欢鏍戞搷浣?
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onToggleOutlineView?: () => void;
  onRevealCurrentFile?: () => void;
  onOutlineNodeSelect?: (node: OutlineNodeType) => void;
  onOutlineNodeToggle?: (node: OutlineNodeType) => void;
  onCollapseOutline?: () => void;
  onCreateConfirm?: (node: FileTreeNode, name: string) => void;
  onCreateCancel?: (node: FileTreeNode) => void;
  onRename?: (node: FileTreeNode, newName: string) => void;
  onBlankAreaClick?: () => void;
  initialFormExpanded?: boolean;
  onFormExpandedChange?: (expanded: boolean) => void;
}

/**
 * 璧勬簮绠＄悊鍣ㄤ富瀹瑰櫒
 * 鏁村悎鎵€鏈夎祫婧愮鐞嗗櫒鍔熻兘妯″潡
 */
export const ExplorerView: React.FC<ExplorerViewProps> = ({
  rootName = 'MY-PROJECT',
  rootPath = '',
  fileTreeNodes = [],
  outlineNodes = [],
  selectedOutlineNode = null,
  selectedFilePath = '',
  fileTreeRevealRequest = null,
  workspaceHeaderActionMode = 'collapse-all',
  canRevealCurrentFile = false,
  isOutlineViewActive = false,
  timelineItems = [],
  onFileClick,
  onFileDoubleClick,
  onFolderToggle,
  onTimelineItemClick,
  onNewFile,
  onNewFolder,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  onToggleOutlineView,
  onRevealCurrentFile,
  onOutlineNodeSelect,
  onOutlineNodeToggle,
  onCollapseOutline,
  onCreateConfirm,
  onCreateCancel,
  onRename,
  onBlankAreaClick,
  initialFormExpanded = false,
  onFormExpandedChange,
}) => {
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number };
    items: ContextMenuItem[];
  } | null>(null);
  const [contextMenuSelectionPath, setContextMenuSelectionPath] = useState<string | null>(null);
  
  // 杩借釜灞曞紑/鎶樺彔鐘舵€?
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(true);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isFormExpanded, setIsFormExpanded] = useState(initialFormExpanded);

  // 琛ㄥ崟鐘舵€?
  const [formGroups, setFormGroups] = useState<import('./Form/types').FormGroupItem[]>([]);
  const [forms, setForms] = useState<import('./Form/types').FormItem[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();

  // 鍒犻櫎鍒嗙粍纭瀵硅瘽妗嗙姸鎬?
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<import('./Form/types').FormGroupItem | null>(null);

  // 鍔犺浇琛ㄥ崟鏁版嵁
  const loadFormData = useCallback(async () => {
    try {
      // 鍒濆鍖栨暟鎹簱
      await window.electron?.form?.initialize();
      
      // 鍔犺浇鍒嗙粍
      const groupsResult = await window.electron?.form?.getAllGroups();
      if (groupsResult?.success && groupsResult.data) {
        const groupsData = groupsResult.data;
        setFormGroups(prev => {
          // 淇濈暀鐜版湁鍒嗙粍鐨勫睍寮€鐘舵€?
          const expandedMap = new Map(prev.map(g => [g.id, g.isExpanded]));
          return groupsData.map(g => ({
            ...g,
            isExpanded: expandedMap.get(g.id) ?? true,
          }));
        });
      }
      
      // 鍔犺浇琛ㄥ崟
      const formsResult = await window.electron?.form?.getAllForms();
      if (formsResult?.success && formsResult.data) {
        setForms(formsResult.data);
      }
    } catch (error) {
      console.error('[ExplorerView] 鍔犺浇琛ㄥ崟鏁版嵁澶辫触:', error);
    }
  }, []);

  // 鍒濆鍖栨椂鍔犺浇琛ㄥ崟鏁版嵁
  React.useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  // 鐩戝惉琛ㄦ牸璁捐鍣ㄦ爣绛鹃〉鍏抽棴浜嬩欢锛屾竻闄よ〃鍗曢€変腑鐘舵€?
  React.useEffect(() => {
    const handleFormTabClosed = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string }>;
      const { formId } = customEvent.detail || {};
      // 濡傛灉鍏抽棴鐨勬槸褰撳墠閫変腑鐨勮〃鍗曪紝娓呴櫎閫変腑鐘舵€?
      if (formId && formId === selectedFormId) {
        setSelectedFormId(undefined);
      }
    };

    // 鐩戝惉琛ㄦ牸璁捐鍣ㄦ爣绛鹃〉婵€娲讳簨浠讹紝鏇存柊琛ㄥ崟閫変腑鐘舵€?
    const handleFormTabActivated = (event: Event) => {
      const customEvent = event as CustomEvent<{ formId?: string }>;
      const { formId } = customEvent.detail || {};
      if (formId) {
        setSelectedFormId(formId);
        setSelectedGroupId(undefined);
      }
    };

    // 鐩戝惉闈炶〃鏍艰璁″櫒鏍囩椤垫縺娲讳簨浠讹紝娓呴櫎琛ㄥ崟閫変腑鐘舵€?
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

  // 鏂板缓琛ㄥ崟
  const handleNewForm = useCallback(async (groupId?: string | null) => {
    try {
      const result = await window.electron?.form?.createForm('\u672A\u547D\u540D\u8868\u5355', groupId ?? null);
      if (result?.success && result.data) {
        const newForm = result.data;
        // 鐩存帴灏嗘柊琛ㄥ崟娣诲姞鍒扮姸鎬佷腑
        setForms(prev => [...prev, newForm]);
        // 鎵撳紑鏂板缓鐨勮〃鍗?
        window.dispatchEvent(new CustomEvent('open-form-view', {
          detail: { formId: newForm.id, formName: newForm.name }
        }));
      }
    } catch (error) {
      console.error('[ExplorerView] 鏂板缓琛ㄥ崟澶辫触:', error);
    }
  }, []);

  // 鏂板缓鍒嗙粍
  const handleNewGroup = useCallback(async (name: string) => {
    try {
      const result = await window.electron?.form?.createGroup(name, null);
      if (result?.success && result.data) {
        const newGroup = result.data;
        // 鐩存帴灏嗘柊鍒嗙粍娣诲姞鍒扮姸鎬佷腑
        setFormGroups(prev => [...prev, { ...newGroup, isExpanded: true }]);
      }
    } catch (error) {
      console.error('[ExplorerView] 鏂板缓鍒嗙粍澶辫触:', error);
    }
  }, []);

  // 鐐瑰嚮琛ㄥ崟
  const handleFormClick = useCallback((item: import('./Form/types').FormItem) => {
    setSelectedFormId(item.id);
    setSelectedGroupId(undefined);
  }, []);

  // 鍙屽嚮琛ㄥ崟鎵撳紑缂栬緫鍣?
  const handleFormDoubleClick = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-form-view', {
      detail: { formId: item.id, formName: item.name }
    }));
  }, []);

  // 鐐瑰嚮鍒嗙粍
  const handleGroupClick = useCallback((item: import('./Form/types').FormGroupItem) => {
    setSelectedGroupId(item.id);
    setSelectedFormId(undefined);
  }, []);

  // 鍒囨崲鍒嗙粍灞曞紑鐘舵€?
  const handleGroupToggle = useCallback((item: import('./Form/types').FormGroupItem) => {
    setFormGroups(prev => prev.map(g => 
      g.id === item.id ? { ...g, isExpanded: !g.isExpanded } : g
    ));
  }, []);

  // 鎵撳紑琛ㄥ崟锛堟墦寮€琛ㄦ牸璁捐鍣級
  const handleOpenForm = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-table-designer', {
      detail: { formId: item.id, formName: item.name }
    }));
  }, []);

  // 鍦ㄦ柊閫夐」鍗℃墦寮€琛ㄥ崟
  const handleOpenFormInNewTab = useCallback((item: import('./Form/types').FormItem) => {
    window.dispatchEvent(new CustomEvent('open-table-designer', {
      detail: { formId: item.id, formName: item.name, newTab: true }
    }));
  }, []);

  // 閲嶅懡鍚嶈〃鍗?
  const handleRenameForm = useCallback(async (item: import('./Form/types').FormItem, newName: string) => {
    try {
      const result = await window.electron?.form?.updateForm(item.id, { name: newName });
      if (result?.success) {
        // 鐩存帴鏇存柊鐘舵€佷腑鐨勮〃鍗曞悕绉?
        setForms(prev => prev.map(f => 
          f.id === item.id ? { ...f, name: newName } : f
        ));
        // 瑙﹀彂浜嬩欢鏇存柊鏍囩椤垫爣棰?
        window.dispatchEvent(new CustomEvent('table-name-change', {
          detail: { formId: item.id, newName }
        }));
      }
    } catch (error) {
      console.error('[ExplorerView] 閲嶅懡鍚嶈〃鍗曞け璐?', error);
    }
  }, []);

  // 鍒犻櫎琛ㄥ崟
  const handleDeleteForm = useCallback(async (item: import('./Form/types').FormItem) => {
    try {
      const result = await window.electron?.form?.deleteForm(item.id);
      if (result?.success) {
        // 鐩存帴浠庣姸鎬佷腑绉婚櫎璇ヨ〃鍗曪紝涓嶉噸鏂板姞杞?
        setForms(prev => prev.filter(f => f.id !== item.id));
        // 濡傛灉鍒犻櫎鐨勬槸褰撳墠閫変腑鐨勮〃鍗曪紝娓呴櫎閫変腑鐘舵€?
        if (selectedFormId === item.id) {
          setSelectedFormId(undefined);
        }
      }
    } catch (error) {
      console.error('[ExplorerView] 鍒犻櫎琛ㄥ崟澶辫触:', error);
    }
  }, [selectedFormId]);

  // 閲嶅懡鍚嶅垎缁?
  const handleRenameGroup = useCallback(async (item: import('./Form/types').FormGroupItem, newName: string) => {
    try {
      const result = await window.electron?.form?.updateGroup(item.id, { name: newName });
      if (result?.success) {
        // 鐩存帴鏇存柊鐘舵€佷腑鐨勫垎缁勫悕绉?
        setFormGroups(prev => prev.map(g => 
          g.id === item.id ? { ...g, name: newName } : g
        ));
      }
    } catch (error) {
      console.error('[ExplorerView] 閲嶅懡鍚嶅垎缁勫け璐?', error);
    }
  }, []);

  // 鍒犻櫎鍒嗙粍锛堝悓鏃跺垹闄ゅ垎缁勪腑鐨勮〃鍗曪級
  const handleDeleteGroup = useCallback((item: import('./Form/types').FormGroupItem) => {
    // 鏄剧ず纭瀵硅瘽妗?
    setGroupToDelete(item);
    setDeleteGroupDialogOpen(true);
  }, []);

  // 纭鍒犻櫎鍒嗙粍
  const confirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete) return;
    
    try {
      const result = await window.electron?.form?.deleteGroup(groupToDelete.id);
      if (result?.success) {
        // 閫掑綊鑾峰彇鎵€鏈夎鍒犻櫎鐨勫垎缁処D锛堝寘鎷瓙鍒嗙粍锛?
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
        
        // 鍒犻櫎璇ュ垎缁勫強瀛愬垎缁勪笅鐨勬墍鏈夎〃鍗?
        setForms(prev => {
          const groupIdsToDelete = getGroupIdsToDelete(groupToDelete.id, formGroups);
          return prev.filter(f => !f.groupId || !groupIdsToDelete.includes(f.groupId));
        });
        
        // 濡傛灉鍒犻櫎鐨勬槸褰撳墠閫変腑鐨勫垎缁勶紝娓呴櫎閫変腑鐘舵€?
        if (selectedGroupId === groupToDelete.id) {
          setSelectedGroupId(undefined);
        }
      }
    } catch (error) {
      console.error('[ExplorerView] 鍒犻櫎鍒嗙粍澶辫触:', error);
    }
  }, [groupToDelete, selectedGroupId, formGroups]);

  // 澶勭悊鏂囦欢鐐瑰嚮
  const handleFileClick = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    onFileClick?.(node);
  };

  // 澶勭悊鏂囦欢鍙屽嚮
  const handleFileDoubleClick = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    onFileDoubleClick?.(node);
  };

  // 澶勭悊鏂囦欢澶规姌鍙?灞曞紑
  const handleFolderToggle = (node: FileTreeNode) => {
    setContextMenuSelectionPath(null);
    onFolderToggle?.(node);
  };

  // 澶勭悊鏂囦欢鍙抽敭鑿滃崟
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
      let isIndexed = false;
      let fileSize = 0;

      try {
        const ipcRenderer = window.electron?.ipcRenderer;
        if (ipcRenderer) {
          const indexResult = await ipcRenderer.invoke('workspace-index-db:is-file-indexed', node.path);
          isIndexed = indexResult?.success === true && indexResult?.data === true;

          const statsResult = await ipcRenderer.invoke('file-stat', node.path);
          fileSize = statsResult?.size || 0;
        }
      } catch (e) {
        console.warn('[ExplorerView] 检查文件索引状态失败:', e);
      }

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

      if (onNewFile) {
        items.push({
          id: 'new-file-in-folder',
          label: '新建文件...',
          onClick: () => emitFileAction('new-file-in-folder', node),
        });
      }

      if (onNewFolder) {
        items.push({
          id: 'new-folder-in-folder',
          label: '新建文件夹...',
          onClick: () => emitFileAction('new-folder-in-folder', node),
        });
      }

      items.push({
        id: 'reveal-folder-in-explorer',
        label: '在资源管理器中打开',
        onClick: () => emitFileAction('reveal-in-explorer', node),
      });

      items.push({
        id: 'folder-menu-separator-1',
        label: '',
        separator: true,
      });

      if (onFolderToggle && node.isExpanded) {
        items.push({
          id: 'collapse-folder',
          label: '折叠文件夹',
          onClick: () => onFolderToggle(node),
        });
      }

      if (onCollapseAll) {
        items.push({
          id: 'collapse-all',
          label: '折叠所有',
          onClick: () => onCollapseAll(),
        });
      }

      items.push({
        id: 'folder-menu-separator-2',
        label: '',
        separator: true,
      });

      items.push({
        id: 'add-folder-to-chat',
        label: '添加到聊天',
        onClick: () => emitFileAction('add-to-chat', node),
      });

      items.push({
        id: 'add-folder-to-new-chat',
        label: '添加到新的聊天',
        onClick: () => emitFileAction('add-to-new-chat', node),
      });

      items.push({
        id: 'folder-menu-separator-3',
        label: '',
        separator: true,
      });

      items.push({
        id: 'find-in-folder',
        label: '在文件夹中查找...',
        onClick: () => emitFileAction('find-in-folder', node),
      });

      items.push({
        id: 'folder-menu-separator-4',
        label: '',
        separator: true,
      });

      items.push({
        id: 'cut-folder',
        label: '剪切',
        onClick: () => emitFileAction('cut-folder', node),
      });

      items.push({
        id: 'copy-folder',
        label: '复制',
        onClick: () => emitFileAction('copy-folder', node),
      });

      items.push({
        id: 'paste-folder',
        label: '粘贴',
        onClick: () => emitFileAction('paste-folder', node),
      });

      items.push({
        id: 'folder-menu-separator-5',
        label: '',
        separator: true,
      });

      items.push({
        id: 'rename-folder',
        label: '重命名',
        onClick: () => emitFileAction('rename-folder', node),
      });

      items.push({
        id: 'delete-folder',
        label: '删除',
        onClick: () => emitFileAction('delete-folder', node),
      });

      items.push({
        id: 'folder-menu-separator-6',
        label: '',
        separator: true,
      });

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
      // 鏂囦欢鍙抽敭鑿滃崟锛堝紓姝ヨ幏鍙栬彍鍗曢」锛?
      const fileItems = await buildSelectedFileMenuItems(node);
      setContextMenuState({
        position: { x: event.clientX, y: event.clientY },
        items: fileItems,
      });
      return;
    }

    // 鏂囦欢澶瑰彸閿彍鍗?
    const folderItems = buildSelectedFolderMenuItems(node);
    setContextMenuState({
      position: { x: event.clientX, y: event.clientY },
      items: folderItems,
    });
  }, [buildSelectedFileMenuItems, buildSelectedFolderMenuItems]);

  const buildBlankAreaMenuItems = useCallback(async (): Promise<ContextMenuItem[]> => {
    const items: ContextMenuItem[] = [];

    let hasClipboardData = false;
    try {
      const clipboardText = await navigator.clipboard.readText();
      hasClipboardData = clipboardText.trim().length > 0;
    } catch (error) {
      hasClipboardData = false;
    }

    if (onNewFile) {
      items.push({
        id: 'new-file',
        label: '新建文件...',
        onClick: () => {
          onNewFile?.();
        },
      });
    }

    if (onNewFolder) {
      items.push({
        id: 'new-folder',
        label: '新建文件夹...',
        onClick: () => {
          onNewFolder?.();
        },
      });
    }

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

    items.push({
      id: 'blank-menu-separator-1',
      label: '',
      separator: true,
    });

    if (onRefresh) {
      items.push({
        id: 'refresh',
        label: '刷新',
        onClick: () => {
          onRefresh?.();
        },
      });
    }

    if (onCollapseAll) {
      items.push({
        id: 'collapse-all-folders',
        label: '折叠所有文件夹',
        onClick: () => {
          onCollapseAll?.();
        },
      });
    }

    items.push({
      id: 'blank-menu-separator-2',
      label: '',
      separator: true,
    });

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

    items.push({
      id: 'blank-menu-separator-3',
      label: '',
      separator: true,
    });

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

    items.push({
      id: 'blank-menu-separator-4',
      label: '',
      separator: true,
    });

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

  // 澶勭悊鏃堕棿绾块」鐐瑰嚮
  const handleTimelineItemClick = (item: TimelineItem) => {
    setSelectedTimelineItem(item);
    onTimelineItemClick?.(item);
  };

  // 鏃堕棿绾垮缁堟樉绀烘嫋鍔ㄦ墜鏌勶紙鍙鑷繁鏄睍寮€鐘舵€侊級
  // 鍥犱负瀹冧娇鐢?flexGrow + resizable 妯″紡锛屽簲璇ュ缁堝彲浠ヨ皟鏁撮珮搴?
  const canTimelineResize = true;
  const showExpandAllAction = workspaceHeaderActionMode === 'expand-all';
  const canHandleOutlineViewToggle = Boolean(onToggleOutlineView);
  const canHandleWorkspaceHeaderAction =
    !isOutlineViewActive && Boolean(onExpandAll || onCollapseAll);
  const canHandleRevealCurrentFile =
    !isOutlineViewActive && canRevealCurrentFile && Boolean(onRevealCurrentFile);
  const outlineToggleTitle = isOutlineViewActive ? '资源管理器' : '大纲';
  const workspaceHeaderActionTitle = showExpandAllAction ? '展开全部' : '折叠全部';
  const revealCurrentFileTitle = '定位当前文件';
  const handleOutlineViewToggleAction = (): void => {
    if (!canHandleOutlineViewToggle) {
      return;
    }

    onToggleOutlineView?.();
  };
  const handleRevealCurrentFileAction = (): void => {
    if (!canHandleRevealCurrentFile) {
      return;
    }

    onRevealCurrentFile?.();
  };
  const handleWorkspaceHeaderAction = (): void => {
    if (!canHandleWorkspaceHeaderAction) {
      return;
    }

    if (showExpandAllAction) {
      if (onExpandAll) {
        onExpandAll();
        return;
      }

      onCollapseAll?.();
      return;
    }

    if (onCollapseAll) {
      onCollapseAll();
      return;
    }

    onExpandAll?.();
  };
  const handleOutlineViewToggleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!canHandleOutlineViewToggle || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleOutlineViewToggleAction();
  };
  const handleRevealCurrentFileKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!canHandleRevealCurrentFile || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleRevealCurrentFileAction();
  };
  const handleWorkspaceHeaderActionKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!canHandleWorkspaceHeaderAction || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleWorkspaceHeaderAction();
  };

  return (
    <div className="explorer-view">
      <div className="explorer-workspace-title">
        <div className="explorer-workspace-title-actions">
          <div
            role="button"
            tabIndex={canHandleOutlineViewToggle ? 0 : -1}
            className={`explorer-workspace-title-icon${canHandleOutlineViewToggle ? '' : ' is-disabled'}${isOutlineViewActive ? ' is-active' : ''}`}
            aria-disabled={!canHandleOutlineViewToggle}
            aria-pressed={isOutlineViewActive}
            onMouseDown={(event): void => {
              event.stopPropagation();
            }}
            onClick={(): void => {
              handleOutlineViewToggleAction();
            }}
            onKeyDown={handleOutlineViewToggleKeyDown}
            title={outlineToggleTitle}
            aria-label={outlineToggleTitle}
          >
            <VscListUnordered size={17} />
          </div>
          <div
            role="button"
            tabIndex={canHandleRevealCurrentFile ? 0 : -1}
            className={`explorer-workspace-title-icon${canHandleRevealCurrentFile ? '' : ' is-disabled'}`}
            aria-disabled={!canHandleRevealCurrentFile}
            onMouseDown={(event): void => {
              event.stopPropagation();
            }}
            onClick={(): void => {
              handleRevealCurrentFileAction();
            }}
            onKeyDown={handleRevealCurrentFileKeyDown}
            title={revealCurrentFileTitle}
            aria-label={revealCurrentFileTitle}
          >
            <LuDiscAlbum size={16} />
          </div>
          <div
            role="button"
            tabIndex={canHandleWorkspaceHeaderAction ? 0 : -1}
            className={`explorer-workspace-title-icon${canHandleWorkspaceHeaderAction ? '' : ' is-disabled'}`}
            aria-disabled={!canHandleWorkspaceHeaderAction}
            onMouseDown={(event): void => {
              event.stopPropagation();
            }}
            onClick={(): void => {
              handleWorkspaceHeaderAction();
            }}
            onKeyDown={handleWorkspaceHeaderActionKeyDown}
            title={workspaceHeaderActionTitle}
            aria-label={workspaceHeaderActionTitle}
          >
            {showExpandAllAction ? <LuChevronsUpDown size={16} /> : <LuChevronsDownUp size={16} />}
          </div>
        </div>
      </div>

      <CustomScrollbar className="explorer-view-content" scrollbarWidth={10}>
        {isOutlineViewActive ? (
          <OutlineSection
            nodes={outlineNodes}
            selectedNode={selectedOutlineNode}
            defaultExpanded
            onNodeSelect={(node): void => {
              onOutlineNodeSelect?.(node);
            }}
            onNodeToggle={onOutlineNodeToggle}
            onCollapse={onCollapseOutline}
            showResizeHandle={false}
          />
        ) : (
          <>
            <FileTreeSection
              rootName={rootName}
              rootPath={rootPath}
              nodes={fileTreeNodes}
              selectedFilePath={selectedFilePath}
              revealRequest={fileTreeRevealRequest}
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
              onExpandedChange={setIsFileTreeExpanded}
              onBlankAreaClick={onBlankAreaClick}
              onContainerContextMenu={handleTreeBackgroundContextMenu}
            />

            {/* 琛ㄥ崟 */}
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
              onExpandedChange={(expanded) => {
                setIsFormExpanded(expanded);
                onFormExpandedChange?.(expanded);
              }}
              onOpenForm={handleOpenForm}
              onOpenFormInNewTab={handleOpenFormInNewTab}
              onRenameForm={handleRenameForm}
              onDeleteForm={handleDeleteForm}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
            />

            {/* 鏃堕棿绾?*/}
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
          </>
        )}
      </CustomScrollbar>

      {contextMenuState && (
        <ContextMenu
          items={contextMenuState.items}
          position={contextMenuState.position}
          onClose={closeContextMenu}
        />
      )}

      {/* 鍒犻櫎鍒嗙粍纭瀵硅瘽妗?*/}
      <AlertDialog open={deleteGroupDialogOpen} onOpenChange={setDeleteGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>鍒犻櫎鍒嗙粍</AlertDialogTitle>
            <AlertDialogDescription>
              纭畾瑕佸垹闄ゅ垎缁?"{groupToDelete?.name}" 鍚楋紵璇ュ垎缁勪笅鐨勬墍鏈夎〃鍗曞拰瀛愬垎缁勪篃灏嗚鍒犻櫎锛屾鎿嶄綔鏃犳硶鎾ら攢銆?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>鍙栨秷</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGroup}>鍒犻櫎</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExplorerView;


