/**
 * 鏍囩鏍忕粍浠?
 * 鍔熻兘锛氱紪杈戝櫒鏍囩椤电鐞嗭紝鏍囩鏍忚璁?
 * 鎻忚堪锛氭彁渚涙枃浠舵爣绛惧垏鎹€佸叧闂€佹偓鍋滄晥鏋滅瓑鍔熻兘
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { WorkbenchNoteMenuContext } from '@note-studio/shared';
import { useTranslation } from 'react-i18next';
import { EditorTab } from '../EditorArea';
import { Icon } from '../../../Icons/Icon';
import { GroupedContextMenu } from '../GroupedContextMenu/GroupedContextMenu';
import type { MenuGroup } from '../GroupedContextMenu/GroupedContextMenu';
import { CustomScrollbar, type CustomScrollbarRef } from '../../../common/CustomScrollbar';
import { ContextMenu, type ContextMenuItem } from '../../../Explorer/Common/ContextMenu';
import { useExplorerStore } from '../../../../stores/explorerStore';
import { useNoteEditorSettingsStore } from '../../../../stores/noteEditorSettingsStore';
import { useWorkbenchMenuContributions } from '../../../../hooks/useWorkbenchMenuContributions';
import {
  executeWorkbenchMenuContribution,
  groupWorkbenchMenuContributions,
} from '../../../../utils/workbenchMenus';
import { FileParser } from '@note-studio/global-rag';
import './TabBar.scss';

type SplitMoveDirection = 'left' | 'right' | 'up' | 'down';

export interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onCloseMultipleTabs?: (tabIds: string[]) => void;
  dragGroupId?: string;
  onTabDragStart?: (payload: { tabId: string; sourceGroupId: string }) => void;
  onTabDragEnd?: () => void;
  onSplitHorizontal?: (tabId: string) => void;
  onSplitVertical?: (tabId: string) => void;
  onSplitToDirection?: (tabId: string, direction: SplitMoveDirection) => void;
  onMoveToDirection?: (tabId: string, direction: SplitMoveDirection) => void;
  onAddTabToChat?: (tabId: string) => void;
  onOpenTabInExplorer?: (tabId: string) => void;
  onRevealTabInExplorerView?: (tabId: string) => void;
  onOpenInNewWindow?: (tabId: string) => void;
  showSplitEditorAction?: boolean;
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

const getLastSegment = (value: string): string => {
  const segments = normalizePath(value).split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
};

const toRelativePath = (fullPath: string, workspacePath: string): string => {
  const normalizedFullPath = normalizePath(fullPath);
  const normalizedWorkspace = normalizePath(workspacePath || '');
  if (!normalizedWorkspace) {
    return normalizedFullPath;
  }
  if (normalizedFullPath === normalizedWorkspace) {
    return '';
  }
  if (normalizedFullPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedFullPath.slice(normalizedWorkspace.length + 1);
  }
  return normalizedFullPath;
};

const toBreadcrumbPathText = (fullPath: string, workspacePath: string): string => {
  const normalizedPath = normalizePath(fullPath || '');
  if (!normalizedPath) {
    return '';
  }

  const normalizedWorkspace = normalizePath(workspacePath || '');
  if (
    normalizedWorkspace &&
    (normalizedPath === normalizedWorkspace || normalizedPath.startsWith(`${normalizedWorkspace}/`))
  ) {
    const rootFolderName = getLastSegment(normalizedWorkspace);
    const relativePath =
      normalizedPath === normalizedWorkspace
        ? ''
        : normalizedPath.slice(normalizedWorkspace.length + 1);
    const relativeSegments = relativePath ? relativePath.split('/').filter(Boolean) : [];
    const segments = rootFolderName ? [rootFolderName, ...relativeSegments] : relativeSegments;
    return segments.join(' / ');
  }

  const fallbackSegments = normalizedPath.split('/').filter(Boolean);
  if (fallbackSegments.length > 0 && /^[A-Za-z]:$/.test(fallbackSegments[0])) {
    fallbackSegments.shift();
  }
  return fallbackSegments.slice(-4).join(' / ');
};

const toWorkspaceRelativePath = (
  fullPath: string | undefined,
  workspacePath: string | null,
): string | null => {
  if (!fullPath) {
    return null;
  }

  if (!workspacePath) {
    return null;
  }

  return toRelativePath(fullPath, workspacePath);
};

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onCloseMultipleTabs,
  dragGroupId,
  onTabDragStart,
  onTabDragEnd,
  onSplitHorizontal,
  onSplitVertical,
  onSplitToDirection,
  onMoveToDirection,
  onAddTabToChat,
  onOpenTabInExplorer,
  onRevealTabInExplorerView,
  onOpenInNewWindow,
  showSplitEditorAction = true
}) => {
  const { t } = useTranslation();
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const scrollContainerRef = useRef<CustomScrollbarRef>(null);
  const previousTabIdsRef = useRef<string[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ x: 0, y: 0 });
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [codeMirrorMode, setCodeMirrorMode] = useState<'source' | 'preview'>('source');
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const workspacePath = useExplorerStore((state) => state.workspacePath);
  const showLineNumbers = useNoteEditorSettingsStore((state) => state.showLineNumbers);
  const loadNoteEditorSettings = useNoteEditorSettingsStore((state) => state.loadSettings);
  const setShowLineNumbers = useNoteEditorSettingsStore((state) => state.setShowLineNumbers);
  const noteContextMenus = useWorkbenchMenuContributions('note/context');
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  const isEditableDocumentTab = (() => {
    if (!activeTab || activeTab.type !== 'file') return false;
    const title = activeTab.title?.trim() || '';
    const path = activeTab.path?.trim() || '';
    const hasExtension = (value: string) => /\.[^./\\]+$/.test(value);
    if (FileParser.isSupportedFileType(title) || FileParser.isSupportedFileType(path)) {
      return true;
    }
    // 无扩展名的新文件也按可编辑处理
    if (!hasExtension(title) && !hasExtension(path)) {
      return true;
    }
    return false;
  })();

  useEffect(() => {
    if (!isEditableDocumentTab && showMoreMenu) {
      setShowMoreMenu(false);
    }
  }, [isEditableDocumentTab, showMoreMenu]);

  useEffect(() => {
    void loadNoteEditorSettings();
  }, [loadNoteEditorSettings]);

  const handleTabBarWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const scrollContainer = scrollContainerRef.current?.getContentElement();
    if (!scrollContainer) return;

    const maxScrollLeft = Math.max(scrollContainer.scrollWidth - scrollContainer.clientWidth, 0);
    if (maxScrollLeft <= 0) return;

    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (horizontalDelta === 0) return;

    const nextScrollLeft = Math.min(
      Math.max(scrollContainer.scrollLeft + horizontalDelta, 0),
      maxScrollLeft
    );

    event.preventDefault();
    scrollContainerRef.current?.setScrollLeft(nextScrollLeft);
  }, []);

  const ensureTabFullyVisible = useCallback((tabId: string) => {
    const scrollContainer = scrollContainerRef.current?.getContentElement();
    if (!scrollContainer) return;

    const tabElement = scrollContainer.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement | null;
    if (!tabElement) return;

    const tabLeft = tabElement.offsetLeft;
    const tabRight = tabLeft + tabElement.offsetWidth;
    const viewLeft = scrollContainer.scrollLeft;
    const viewRight = viewLeft + scrollContainer.clientWidth;
    let nextScrollLeft = viewLeft;

    if (tabRight > viewRight) {
      nextScrollLeft = tabRight - scrollContainer.clientWidth;
    } else if (tabLeft < viewLeft) {
      nextScrollLeft = tabLeft;
    }

    const maxScrollLeft = Math.max(scrollContainer.scrollWidth - scrollContainer.clientWidth, 0);
    nextScrollLeft = Math.min(Math.max(nextScrollLeft, 0), maxScrollLeft);

    if (nextScrollLeft !== viewLeft) {
      scrollContainerRef.current?.setScrollLeft(nextScrollLeft);
    }
  }, []);

  // 鍒囨崲 CodeMirror 妯″紡
  const toggleCodeMirrorMode = useCallback(() => {
    const newMode = codeMirrorMode === 'source' ? 'preview' : 'source';
    setCodeMirrorMode(newMode);
    window.dispatchEvent(new CustomEvent('set-codemirror-mode', { detail: newMode }));
  }, [codeMirrorMode]);

  // 褰撴椿鍔ㄦ爣绛炬敼鍙樻椂锛屾粴鍔ㄥ埌鍙鍖哄煙
  useEffect(() => {
    if (!activeTabId) return;
    const rafId = window.requestAnimationFrame(() => {
      ensureTabFullyVisible(activeTabId);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTabId, ensureTabFullyVisible]);

  useEffect(() => {
    const previousTabIds = previousTabIdsRef.current;
    const currentTabIds = tabs.map(tab => tab.id);
    const lastTab = tabs[tabs.length - 1];
    const hasNewLastTab =
      tabs.length > previousTabIds.length &&
      !!lastTab &&
      !previousTabIds.includes(lastTab.id);

    previousTabIdsRef.current = currentTabIds;

    if (!hasNewLastTab || !lastTab) return;
    const rafId = window.requestAnimationFrame(() => {
      ensureTabFullyVisible(lastTab.id);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [tabs, ensureTabFullyVisible]);

  useEffect(() => {
    if (!tabContextMenu) {
      return;
    }
    const exists = tabs.some(tab => tab.id === tabContextMenu.tabId);
    if (!exists) {
      setTabContextMenu(null);
    }
  }, [tabContextMenu, tabs]);

  // 鑾峰彇鏂囦欢鍥炬爣锛堢畝鍖栫増锛屼娇鐢ㄩ€氱敤鏂囦欢鍥炬爣锛?
  const getFileIcon = (language?: string) => {
    return (
      <svg className="tab-item-icon" fill="currentColor" viewBox="0 0 16 16">
        <path d="M13.5 1h-11C1.67 1 1 1.67 1 2.5v11c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zm-1 11h-9v-9h9v9z"/>
      </svg>
    );
  };

  // 澶勭悊鎵撳紑璁剧疆 JSON
  const handleOpenSettingsJson = async () => {
    try {
      // 浣跨敤 openJson 鐩存帴浠庢枃浠惰鍙栧唴瀹癸紝鑰屼笉鏄娇鐢?getAll锛堝寘鍚粯璁ゅ€硷級
      const result = await window.electronAPI?.settings?.openJson('user');
      const jsonContent = result?.success && result.data?.content
        ? result.data.content
        : '{}';
      
      window.dispatchEvent(new CustomEvent('open-settings-json', {
        detail: { 
          content: jsonContent,
          path: result?.data?.path,
          name: result?.data?.name,
          language: result?.data?.language
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('open-settings-json', {
        detail: { content: '{}' }
      }));
    }
  };

  // 澶勭悊鏍囩鐐瑰嚮
  const handleTabClick = (tabId: string) => {
    onTabClick(tabId);
  };

  // 澶勭悊鏍囩鍏抽棴
  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  const closeTabs = useCallback((tabIds: string[]) => {
    if (tabIds.length === 0) {
      return;
    }
    if (onCloseMultipleTabs) {
      onCloseMultipleTabs(tabIds);
      return;
    }
    tabIds.forEach((tabId) => onTabClose(tabId));
  }, [onCloseMultipleTabs, onTabClose]);

  const copyText = useCallback(async (text: string) => {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[TabBar] 复制失败:', error);
    }
  }, []);

  const handleOpenInExplorerByTab = useCallback(async (tab: EditorTab) => {
    if (!tab.path || tab.type !== 'file') {
      return;
    }
    if (onOpenTabInExplorer) {
      onOpenTabInExplorer(tab.id);
      return;
    }
    try {
      if (window.electron?.folder?.revealInExplorer) {
        await window.electron.folder.revealInExplorer(tab.path);
        return;
      }
      await window.electron?.ipcRenderer.invoke('open-in-explorer', tab.path);
    } catch (error) {
      console.error('[TabBar] 在资源管理器中打开失败:', error);
    }
  }, [onOpenTabInExplorer]);

  const handleRevealInExplorerViewByTab = useCallback((tab: EditorTab) => {
    if (!tab.path || tab.type !== 'file') {
      return;
    }
    if (onRevealTabInExplorerView) {
      onRevealTabInExplorerView(tab.id);
      return;
    }
    window.dispatchEvent(new CustomEvent('tab-switched', { detail: { path: tab.path } }));
    window.dispatchEvent(new CustomEvent('file-tree-reveal', { detail: { path: tab.path } }));
  }, [onRevealTabInExplorerView]);

  const handleAddTabToChatClick = useCallback((tab: EditorTab) => {
    if (!tab.path || tab.type !== 'file') {
      return;
    }
    if (onAddTabToChat) {
      onAddTabToChat(tab.id);
      return;
    }
    window.dispatchEvent(new Event('restore-ai-chat-panel'));
    window.dispatchEvent(new CustomEvent('ai-chat:add-file-context', {
      detail: {
        path: tab.path,
        name: tab.title,
      },
    }));
  }, [onAddTabToChat]);

  const handleTabContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>, tabId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setShowMoreMenu(false);
    setTabContextMenu({
      x: event.clientX,
      y: event.clientY,
      tabId,
    });
  }, []);

  const handleTabDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, tabId: string) => {
    if (!dragGroupId) {
      return;
    }

    event.dataTransfer.clearData();
    const payload = JSON.stringify({ tabId, sourceGroupId: dragGroupId });
    event.dataTransfer.setData('application/x-note-studio-tab', payload);
    event.dataTransfer.effectAllowed = 'move';
    onTabDragStart?.({ tabId, sourceGroupId: dragGroupId });
  }, [dragGroupId, onTabDragStart]);

  const handleTabDragEnd = useCallback(() => {
    onTabDragEnd?.();
  }, [onTabDragEnd]);

  const handleSplitHorizontal = useCallback(() => {
    if (!activeTab) return;
    onSplitHorizontal?.(activeTab.id);
  }, [activeTab, onSplitHorizontal]);

  const handleSplitVertical = useCallback(() => {
    if (!activeTab) return;
    onSplitVertical?.(activeTab.id);
  }, [activeTab, onSplitVertical]);

  const handleOpenInNewWindow = useCallback(() => {
    if (!activeTab) return;
    onOpenInNewWindow?.(activeTab.id);
  }, [activeTab, onOpenInNewWindow]);

  // 澶勭悊鏇村鎿嶄綔鎸夐挳鐐瑰嚮
  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMoreMenuPosition({
        x: rect.right - 200, // 鑿滃崟瀹藉害 200px锛屽悜宸﹀榻?
        y: rect.bottom + 4
      });
      setShowMoreMenu(!showMoreMenu);
    }
  };

  const moreMenuGroups: MenuGroup[] = [
    {
      id: 'close-group',
      items: [
        {
          id: 'close-all',
          label: translateText('tabBar.moreMenu.closeAll', 'Close All'),
          action: () => {
            closeTabs(tabs.map(tab => tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'close-saved',
          label: translateText('tabBar.moreMenu.closeSaved', 'Close Saved'),
          action: () => {
            closeTabs(tabs.filter(tab => !tab.isDirty).map(tab => tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'lock-current',
          label: translateText('tabBar.moreMenu.lockCurrent', 'Lock Current'),
          action: () => {
            console.log('lock current');
            // TODO: implement lock feature
          },
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'view-group',
      items: [
        {
          id: 'source-mode',
          label: codeMirrorMode === 'source'
            ? translateText('tabBar.moreMenu.previewMode', 'Preview Mode')
            : translateText('tabBar.moreMenu.sourceMode', 'Source Mode'),
          action: toggleCodeMirrorMode,
          disabled: !activeTab
        },
        {
          id: 'toggle-line-numbers',
          label: showLineNumbers
            ? translateText('tabBar.moreMenu.hideLineNumbers', 'Hide Line Numbers')
            : translateText('tabBar.moreMenu.showLineNumbers', 'Show Line Numbers'),
          action: () => {
            void setShowLineNumbers(!showLineNumbers);
          },
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'split-group',
      items: [
        {
          id: 'split-horizontal',
          label: translateText('tabBar.moreMenu.splitHorizontal', 'Split Horizontally'),
          action: () => {
            handleSplitHorizontal();
          },
          disabled: !activeTab
        },
        {
          id: 'split-vertical',
          label: translateText('tabBar.moreMenu.splitVertical', 'Split Vertically'),
          action: () => {
            handleSplitVertical();
          },
          disabled: !activeTab
        },
        {
          id: 'open-in-new-window',
          label: translateText('tabBar.moreMenu.openInNewWindow', 'Open in New Window'),
          action: () => {
            handleOpenInNewWindow();
          },
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'file-operations-group',
      items: [
        {
          id: 'rename',
          label: translateText('tabBar.moreMenu.rename', 'Rename'),
          action: () => {
            console.log('rename');
            // TODO: implement rename
          },
          disabled: !activeTab
        },
        {
          id: 'move-file',
          label: translateText('tabBar.moreMenu.moveFile', 'Move File'),
          action: () => {
            console.log('move file');
            // TODO: implement move file
          },
          disabled: !activeTab
        },
        {
          id: 'mark-important',
          label: translateText('tabBar.moreMenu.markImportant', 'Mark as Important'),
          action: () => {
            console.log('mark important file');
            // TODO: implement mark important
          },
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'explorer-group',
      items: [
        {
          id: 'reveal-in-explorer',
          label: translateText('tabBar.moreMenu.revealInExplorer', 'Reveal in Explorer'),
          action: async () => {
            if (activeTab?.path) {
              try {
                await window.electron?.ipcRenderer.invoke('open-in-explorer', activeTab.path);
              } catch (error) {
                console.error('failed to reveal in explorer:', error);
              }
            }
          },
          disabled: !activeTab || !activeTab.path
        }
      ]
    },
    {
      id: 'delete-group',
      items: [
        {
          id: 'delete-file',
          label: translateText('tabBar.moreMenu.deleteFile', 'Delete File'),
          action: async () => {
            if (activeTab?.path) {
              const confirmed = window.confirm(String(t('tabBar.dialogs.confirmDeleteFile', {
                defaultValue: 'Delete "{{title}}"?',
                title: activeTab.title,
              })));
              if (confirmed) {
                try {
                  await window.electron?.ipcRenderer.invoke('delete-file', activeTab.path);
                  onTabClose(activeTab.id);
                } catch (error) {
                  console.error('delete file failed:', error);
                  window.alert(translateText('tabBar.dialogs.deleteFileFailed', 'Failed to delete file.'));
                }
              }
            }
          },
          disabled: !activeTab || !activeTab.path
        }
      ]
    }
  ];

  const contextTargetTab = useMemo(
    () => (tabContextMenu ? tabs.find(tab => tab.id === tabContextMenu.tabId) || null : null),
    [tabContextMenu, tabs]
  );

  const tabContextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextTargetTab) {
      return [];
    }

    const clickedIndex = tabs.findIndex(tab => tab.id === contextTargetTab.id);
    const rightTabIds = clickedIndex >= 0 ? tabs.slice(clickedIndex + 1).map(tab => tab.id) : [];
    const closeOtherTabIds = tabs.filter(tab => tab.id !== contextTargetTab.id).map(tab => tab.id);
    const closeSavedTabIds = tabs.filter(tab => !tab.isDirty).map(tab => tab.id);
    const closeAllTabIds = tabs.map(tab => tab.id);
    const canOperateFile = contextTargetTab.type === 'file' && !!contextTargetTab.path;
    const relativePathText = canOperateFile
      ? toRelativePath(contextTargetTab.path, workspacePath || '')
      : '';
    const breadcrumbPathText = canOperateFile
      ? toBreadcrumbPathText(contextTargetTab.path, workspacePath || '')
      : '';
    const noteMenuContext: WorkbenchNoteMenuContext = {
      kind: 'note/context',
      tabId: contextTargetTab.id,
      tabType: contextTargetTab.type || 'file',
      title: contextTargetTab.title || '',
      path: contextTargetTab.path ?? null,
      language: contextTargetTab.language ?? null,
      isDirty: Boolean(contextTargetTab.isDirty),
      isPreview: Boolean(contextTargetTab.isPreview),
      workspaceRelativePath: toWorkspaceRelativePath(
        contextTargetTab.path,
        workspacePath,
      ),
    };
    const pluginContextMenuItems: ContextMenuItem[] = [];
    const groupedNoteContextMenus = groupWorkbenchMenuContributions(noteContextMenus);

    groupedNoteContextMenus.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        pluginContextMenuItems.push({
          id: `plugin-group-separator-${group.key}`,
          label: '',
          separator: true,
        });
      }

      group.items.forEach((menu) => {
        pluginContextMenuItems.push({
          id: menu.menuItemId,
          label: menu.title,
          onClick: () => {
            void executeWorkbenchMenuContribution(menu, [noteMenuContext]);
          },
        });
      });
    });

    return [
      {
        id: 'close',
        label: translateText('tabBar.contextMenu.close', 'Close'),
        onClick: () => onTabClose(contextTargetTab.id),
      },
      {
        id: 'close-others',
        label: translateText('tabBar.contextMenu.closeOthers', 'Close Others'),
        disabled: closeOtherTabIds.length === 0,
        onClick: () => closeTabs(closeOtherTabIds),
      },
      {
        id: 'close-right',
        label: translateText('tabBar.contextMenu.closeToRight', 'Close to the Right'),
        disabled: rightTabIds.length === 0,
        onClick: () => closeTabs(rightTabIds),
      },
      {
        id: 'close-saved',
        label: translateText('tabBar.contextMenu.closeSaved', 'Close Saved'),
        disabled: closeSavedTabIds.length === 0,
        onClick: () => closeTabs(closeSavedTabIds),
      },
      {
        id: 'close-all',
        label: translateText('tabBar.contextMenu.closeAll', 'Close All'),
        disabled: closeAllTabIds.length === 0,
        onClick: () => closeTabs(closeAllTabIds),
      },
      {
        id: 'separator-close-copy',
        label: '',
        separator: true,
      },
      {
        id: 'copy-path',
        label: translateText('tabBar.contextMenu.copyPath', 'Copy Path'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            void copyText(contextTargetTab.path);
          }
        },
      },
      {
        id: 'copy-relative-path',
        label: translateText('tabBar.contextMenu.copyRelativePath', 'Copy Relative Path'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            void copyText(relativePathText);
          }
        },
      },
      {
        id: 'copy-breadcrumb-path',
        label: translateText('tabBar.contextMenu.copyBreadcrumbPath', 'Copy Breadcrumb Path'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            void copyText(breadcrumbPathText);
          }
        },
      },
      {
        id: 'separator-copy-chat',
        label: '',
        separator: true,
      },
      {
        id: 'add-to-chat',
        label: translateText('tabBar.contextMenu.addToChat', 'Add to Chat'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            handleAddTabToChatClick(contextTargetTab);
          }
        },
      },
      {
        id: 'open-in-system-explorer',
        label: translateText('tabBar.contextMenu.openInSystemExplorer', 'Open in System Explorer'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            void handleOpenInExplorerByTab(contextTargetTab);
          }
        },
      },
      {
        id: 'reveal-in-explorer-view',
        label: translateText('tabBar.contextMenu.revealInExplorerView', 'Reveal in Explorer View'),
        disabled: !canOperateFile,
        onClick: () => {
          if (canOperateFile) {
            handleRevealInExplorerViewByTab(contextTargetTab);
          }
        },
      },
      {
        id: 'split-right',
        label: translateText('tabBar.contextMenu.splitRight', 'Split Right'),
        disabled: !canOperateFile || !onSplitToDirection,
        onClick: () => {
          if (canOperateFile) {
            onSplitToDirection?.(contextTargetTab.id, 'right');
          }
        },
      },
      {
        id: 'split-and-move',
        label: translateText('tabBar.contextMenu.splitAndMove', 'Split and Move'),
        disabled: !canOperateFile,
        submenuType: 'hover',
        submenu: [
          {
            id: 'split-to-right',
            label: translateText('tabBar.contextMenu.splitToRight', 'Split to Right'),
            disabled: !onSplitToDirection,
            onClick: () => onSplitToDirection?.(contextTargetTab.id, 'right'),
          },
          {
            id: 'split-to-left',
            label: translateText('tabBar.contextMenu.splitToLeft', 'Split to Left'),
            disabled: !onSplitToDirection,
            onClick: () => onSplitToDirection?.(contextTargetTab.id, 'left'),
          },
          {
            id: 'split-to-down',
            label: translateText('tabBar.contextMenu.splitToDown', 'Split to Down'),
            disabled: !onSplitToDirection,
            onClick: () => onSplitToDirection?.(contextTargetTab.id, 'down'),
          },
          {
            id: 'split-to-up',
            label: translateText('tabBar.contextMenu.splitToUp', 'Split to Up'),
            disabled: !onSplitToDirection,
            onClick: () => onSplitToDirection?.(contextTargetTab.id, 'up'),
          },
          {
            id: 'split-move-separator',
            label: '',
            separator: true,
          },
          {
            id: 'move-to-up',
            label: translateText('tabBar.contextMenu.moveToUp', 'Move to Up'),
            disabled: !onMoveToDirection,
            onClick: () => onMoveToDirection?.(contextTargetTab.id, 'up'),
          },
          {
            id: 'move-to-down',
            label: translateText('tabBar.contextMenu.moveToDown', 'Move to Down'),
            disabled: !onMoveToDirection,
            onClick: () => onMoveToDirection?.(contextTargetTab.id, 'down'),
          },
          {
            id: 'move-to-left',
            label: translateText('tabBar.contextMenu.moveToLeft', 'Move to Left'),
            disabled: !onMoveToDirection,
            onClick: () => onMoveToDirection?.(contextTargetTab.id, 'left'),
          },
          {
            id: 'move-to-right',
            label: translateText('tabBar.contextMenu.moveToRight', 'Move to Right'),
            disabled: !onMoveToDirection,
            onClick: () => onMoveToDirection?.(contextTargetTab.id, 'right'),
          },
        ],
      },
      ...(pluginContextMenuItems.length > 0
        ? [
          {
            id: 'separator-plugin-note-context',
            label: '',
            separator: true,
          },
          ...pluginContextMenuItems,
        ]
        : []),
    ];
  }, [
    closeTabs,
    contextTargetTab,
    copyText,
    noteContextMenus,
    handleAddTabToChatClick,
    handleOpenInExplorerByTab,
    handleRevealInExplorerViewByTab,
    onMoveToDirection,
    onSplitToDirection,
    onTabClose,
    tabs,
    workspacePath,
  ]);

  return (
    <div className="tab-bar">
      <CustomScrollbar
        ref={scrollContainerRef}
        className="tab-bar-scroll-container"
        direction="horizontal"
        scrollbarWidth={3}
        defaultOpacity={0.6}
        fadeOutDelay={800}
        onWheel={handleTabBarWheel}
      >
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          const isHovered = hoveredTabId === tab.id;
          
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab-item ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${tab.isDirty ? 'dirty' : ''} ${tab.isPreview ? 'preview' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              draggable={!!dragGroupId}
              onDragStart={(event) => handleTabDragStart(event, tab.id)}
              onDragEnd={handleTabDragEnd}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
              onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
              title={tab.path}
            >
              {/* 娲诲姩鏍囩椤堕儴鎸囩ず渚?/}
              {isActive && <div className="tab-item-border-top" />}
              
              {/* 鏂囦欢鍥炬爣 */}
              {getFileIcon(tab.language)}
              
              {/* 鏂囦欢鍚?*/}
              <span className="tab-item-title">
                {tab.title}
              </span>
              
              {/* 鑴忔爣璁版垨鍏抽棴鎸夐挳 */}
              {tab.isDirty && !isHovered ? (
                <span className="tab-item-dirty-indicator">●</span>
              ) : (
                <button
                  className="tab-item-close"
                  onClick={(e) => handleTabClose(e, tab.id)}
                  title={translateText('tabBar.actions.closeTab', 'Close Tab')}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </CustomScrollbar>

      {/* 鎿嶄綔鎸夐挳鍖哄煙 */}
      <div className="tab-bar-actions">
        {activeTab?.type === 'settings' && (
          <button 
            className="tab-bar-action-btn"
            onClick={handleOpenSettingsJson}
            title={translateText('tabBar.actions.openSettingsJson', 'Open settings.json')}
          >
            <Icon name="file-code" size={16} />
          </button>
        )}
        
        {isEditableDocumentTab && (
          <>
            {showSplitEditorAction && (
            <button 
              className="tab-bar-action-btn"
              title={translateText('tabBar.actions.splitEditor', 'Split Editor')}
              onClick={handleSplitHorizontal}
            >
              <Icon name="split-vertical" size={16} />
            </button>
            )}
            
            <button 
              ref={moreButtonRef}
              className="tab-bar-action-btn"
              title={translateText('tabBar.actions.moreActions', 'More Actions')}
              onClick={handleMoreClick}
            >
              <Icon name="more-vert" size={16} />
            </button>
          </>
        )}
      </div>

      {/* 鏇村鎿嶄綔鑿滃崟 */}
      <GroupedContextMenu
        visible={showMoreMenu}
        x={moreMenuPosition.x}
        y={moreMenuPosition.y}
        menuGroups={moreMenuGroups}
        onClose={() => setShowMoreMenu(false)}
      />

      {tabContextMenu && contextTargetTab && (
        <ContextMenu
          items={tabContextMenuItems}
          position={{ x: tabContextMenu.x, y: tabContextMenu.y }}
          onClose={() => setTabContextMenu(null)}
        />
      )}
    </div>
  );
};
