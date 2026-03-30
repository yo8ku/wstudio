/**
 * Sidebar 负责渲染主侧边栏内容、标题栏菜单和插件 view container。
 */

import React, { useEffect, useRef, useState } from 'react';
import { LuArrowDownZA } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { VscClearAll, VscCollapseAll, VscRefresh } from 'react-icons/vsc';
import type {
  WorkbenchContributionSnapshot,
  WorkbenchSidebarTitleMenuContext,
} from '@note-studio/shared';
import { FileExplorer } from '../FileExplorer/FileExplorer';
import { Search, type SearchSortMode } from '../Search/Search';
import { Extensions } from '../Extensions';
import { KnowledgeBase } from '../KnowledgeBase/KnowledgeBase';
import { AIModel } from '../AIModel/AIModel';
import { Settings } from '../Settings/Settings';
import { UserSidebar } from '../User/UserSidebar';
import type { ActivityBarItem } from '../../ActivityBar/ActivityBar';
import {
  getPluginContainerKeyFromActivityBarItem,
  isPluginActivityBarItem,
} from '../../ActivityBar/ActivityBar';
import {
  FeishuIcon,
  Icon,
  JoplinIcon,
  KouziIcon,
  NotionIcon,
  ObsidianIcon,
  SiyuanIcon,
  YuqueIcon,
} from '../../../Icons';
import { SidebarHeaderMenu, type SidebarHeaderMenuItem } from '../SidebarHeaderMenu';
import { useActivityBarStore } from '../../../../stores/activityBarStore';
import { PluginWorkbenchViews } from '../PluginWorkbenchViews/PluginWorkbenchViews';
import {
  executeWorkbenchMenuContribution,
  groupWorkbenchMenuContributions,
} from '../../../../utils/workbenchMenus';
import { PressableControl } from '../../../common/PressableControl';
import './Sidebar.scss';

export interface SidebarProps {
  activeView: ActivityBarItem;
  onClose: () => void;
  workbenchContributions?: WorkbenchContributionSnapshot;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 230;
const COLLAPSE_THRESHOLD = 150;
const SEARCH_SORT_MENU_WIDTH = 220;

const SEARCH_SORT_MENU_OPTIONS: readonly {
  readonly mode: SearchSortMode;
  readonly translationKey: string;
  readonly defaultLabel: string;
}[] = [
  { mode: 'fileNameAsc', translationKey: 'sidebar.searchSort.fileNameAsc', defaultLabel: 'File Name (A-Z)' },
  { mode: 'fileNameDesc', translationKey: 'sidebar.searchSort.fileNameDesc', defaultLabel: 'File Name (Z-A)' },
  { mode: 'updatedAtDesc', translationKey: 'sidebar.searchSort.updatedAtDesc', defaultLabel: 'Updated Time (Newest First)' },
  { mode: 'updatedAtAsc', translationKey: 'sidebar.searchSort.updatedAtAsc', defaultLabel: 'Updated Time (Oldest First)' },
  { mode: 'createdAtDesc', translationKey: 'sidebar.searchSort.createdAtDesc', defaultLabel: 'Created Time (Newest First)' },
  { mode: 'createdAtAsc', translationKey: 'sidebar.searchSort.createdAtAsc', defaultLabel: 'Created Time (Oldest First)' },
];

export function Sidebar({
  activeView,
  onClose,
  workbenchContributions,
}: SidebarProps): JSX.Element {
  const { t } = useTranslation();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [outlineChecked, setOutlineChecked] = useState(true);
  const [searchRefreshActionId, setSearchRefreshActionId] = useState(0);
  const [searchClearActionId, setSearchClearActionId] = useState(0);
  const [searchCollapseAllActionId, setSearchCollapseAllActionId] = useState(0);
  const [searchSortMode, setSearchSortMode] = useState<SearchSortMode>('fileNameAsc');
  const [isSearchSortMenuOpen, setIsSearchSortMenuOpen] = useState(false);
  const [searchSortMenuPosition, setSearchSortMenuPosition] = useState({ x: 0, y: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLDivElement>(null);
  const searchSortButtonRef = useRef<HTMLDivElement>(null);
  const { sidebarPosition } = useActivityBarStore();
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));

  const activePluginContainer = isPluginActivityBarItem(activeView)
    ? (
      workbenchContributions?.viewContainers.find(
        container => container.containerKey === getPluginContainerKeyFromActivityBarItem(activeView),
      ) ?? null
    )
    : null;
  const activePluginViews = activePluginContainer
    ? (
      workbenchContributions?.views.filter(
        view => view.containerKey === activePluginContainer.containerKey,
      ) ?? []
    )
    : [];
  const sidebarTitleMenus = workbenchContributions?.menus.filter(
    menu => menu.location === 'sidebar/title',
  ) ?? [];
  const title = (() => {
    if (activePluginContainer?.title) {
      return activePluginContainer.title;
    }

    switch (activeView) {
      case 'explorer':
        return translateText('sidebar.titles.explorer', 'Explorer');
      case 'search':
        return translateText('sidebar.titles.search', 'Search');
      case 'extensions':
        return translateText('sidebar.titles.extensions', 'Extensions');
      case 'knowledge-base':
        return translateText('sidebar.titles.knowledgeBase', 'Knowledge Base');
      case 'ai-model':
        return translateText('sidebar.titles.aiModel', 'AI Models');
      case 'user':
        return translateText('sidebar.titles.user', 'User');
      case 'settings':
        return translateText('sidebar.titles.settings', 'Settings');
      case 'media':
        return translateText('sidebar.titles.media', 'Media Library');
      default:
        return '';
    }
  })();

  const getBuiltInMenuItems = (): SidebarHeaderMenuItem[] => {
    switch (activeView) {
      case 'explorer':
        return [
          {
            id: 'outline',
            label: translateText('sidebar.menus.explorer.outline', 'Outline'),
            checked: outlineChecked,
            onClick: () => {
              setOutlineChecked(!outlineChecked);
              console.log('切换大纲显示:', !outlineChecked);
            },
          },
          {
            id: 'separator-1',
            label: '',
            separator: true,
          },
          {
            id: 'import-notes-header',
            label: translateText('sidebar.menus.explorer.otherNotes', 'Other Notes'),
            disabled: true,
          },
          {
            id: 'import-notion',
            label: 'Notion',
            icon: <NotionIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Notion');
            },
            onActionClick: () => {
              console.log('Notion 设置');
            },
          },
          {
            id: 'import-yuque',
            label: translateText('sidebar.menus.explorer.yuque', 'Yuque'),
            icon: <YuqueIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入语雀');
            },
            onActionClick: () => {
              console.log('语雀设置');
            },
          },
          {
            id: 'import-joplin',
            label: 'Joplin',
            icon: <JoplinIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Joplin');
            },
            onActionClick: () => {
              console.log('Joplin 设置');
            },
          },
          {
            id: 'import-obsidian',
            label: 'Obsidian',
            icon: <ObsidianIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Obsidian');
            },
            onActionClick: () => {
              console.log('Obsidian 设置');
            },
          },
          {
            id: 'import-siyuan',
            label: translateText('sidebar.menus.explorer.siyuan', 'SiYuan Notes'),
            icon: <SiyuanIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入思源笔记');
            },
            onActionClick: () => {
              console.log('思源笔记设置');
            },
          },
          {
            id: 'import-feishu',
            label: translateText('sidebar.menus.explorer.feishu', 'Feishu'),
            icon: <FeishuIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入飞书');
            },
            onActionClick: () => {
              console.log('飞书设置');
            },
          },
          {
            id: 'separator-2',
            label: '',
            separator: true,
          },
          {
            id: 'kouzi',
            label: translateText('sidebar.menus.explorer.kouzi', 'Kouzi Agent'),
            icon: <KouziIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('打开扣子智能体');
            },
            onActionClick: () => {
              console.log('扣子智能体设置');
            },
          },
        ];
      case 'search':
        return [
          {
            id: 'refresh-search',
            label: translateText('sidebar.menus.search.refresh', 'Refresh'),
            onClick: () => {
              console.log('刷新搜索');
            },
          },
          {
            id: 'clear-search',
            label: translateText('sidebar.menus.search.clearResults', 'Clear Search Results'),
            onClick: () => {
              console.log('清除搜索结果');
            },
          },
        ];
      case 'knowledge-base':
        return [
          {
            id: 'add-folder',
            label: translateText('sidebar.menus.knowledgeBase.addFolder', 'Add Folder'),
            onClick: () => {
              console.log('添加文件夹到知识库');
            },
          },
          {
            id: 'refresh-kb',
            label: translateText('sidebar.menus.knowledgeBase.refresh', 'Refresh'),
            onClick: () => {
              console.log('刷新知识库');
            },
          },
          {
            id: 'separator-kb',
            label: '',
            separator: true,
          },
          {
            id: 'kb-settings',
            label: translateText('sidebar.menus.knowledgeBase.settings', 'Knowledge Base Settings'),
            onClick: () => {
              console.log('打开知识库设置');
            },
          },
        ];
      case 'ai-model':
        return [];
      case 'extensions':
        return [];
      case 'user':
        return [
          {
            id: 'profile',
            label: translateText('sidebar.menus.user.profile', 'Profile'),
            onClick: () => {
              console.log('查看个人资料');
            },
          },
          {
            id: 'separator-user',
            label: '',
            separator: true,
          },
          {
            id: 'logout',
            label: translateText('sidebar.menus.user.logout', 'Log Out'),
            onClick: () => {
              console.log('退出登录');
            },
          },
        ];
      case 'settings':
        return [
          {
            id: 'reset-settings',
            label: translateText('sidebar.menus.settings.resetAll', 'Reset All Settings'),
            onClick: () => {
              console.log('重置所有设置');
            },
          },
          {
            id: 'separator-settings',
            label: '',
            separator: true,
          },
          {
            id: 'export-settings',
            label: translateText('sidebar.menus.settings.export', 'Export Settings'),
            onClick: () => {
              console.log('导出设置');
            },
          },
          {
            id: 'import-settings',
            label: translateText('sidebar.menus.settings.import', 'Import Settings'),
            onClick: () => {
              console.log('导入设置');
            },
          },
        ];
      default:
        return [];
    }
  };

  const renderContent = (): JSX.Element | null => {
    if (activePluginContainer) {
      return <PluginWorkbenchViews views={activePluginViews} />;
    }

    switch (activeView) {
      case 'explorer':
        return <FileExplorer />;
      case 'search':
        return (
          <Search
            refreshActionId={searchRefreshActionId}
            clearActionId={searchClearActionId}
            collapseAllActionId={searchCollapseAllActionId}
          />
        );
      case 'extensions':
        return <Extensions />;
      case 'knowledge-base':
        return <KnowledgeBase />;
      case 'ai-model':
        return <AIModel />;
      case 'user':
        return <UserSidebar />;
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  const sidebarTitleContext: WorkbenchSidebarTitleMenuContext = {
    kind: 'sidebar/title',
    activeView,
    title,
    containerId: activePluginContainer?.containerId ?? null,
    containerKey: activePluginContainer?.containerKey ?? null,
    containerExtensionId: activePluginContainer?.extensionId ?? null,
  };

  const pluginMenuItems: SidebarHeaderMenuItem[] = [];
  const groupedSidebarMenus = groupWorkbenchMenuContributions(sidebarTitleMenus);
  groupedSidebarMenus.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      pluginMenuItems.push({
        id: `plugin-group-separator-${group.key}`,
        label: '',
        separator: true,
      });
    }

    group.items.forEach((menu) => {
      pluginMenuItems.push({
        id: menu.menuItemId,
        label: menu.title,
        onClick: () => {
          void executeWorkbenchMenuContribution(menu, [sidebarTitleContext]);
        },
      });
    });
  });

  const menuItems = getBuiltInMenuItems();
  if (pluginMenuItems.length > 0) {
    if (menuItems.length > 0 && !menuItems[menuItems.length - 1].separator) {
      menuItems.push({
        id: 'plugin-menu-separator',
        label: '',
        separator: true,
      });
    }
    menuItems.push(...pluginMenuItems);
  }

  const handleMenuClick = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    event.stopPropagation();

    if (!menuButtonRef.current) {
      return;
    }

    const rect = menuButtonRef.current.getBoundingClientRect();
    const menuWidth = 200;
    setMenuPosition({
      x: sidebarPosition === 'left' ? rect.left : rect.right - menuWidth,
      y: rect.bottom + 4,
    });
    setIsMenuOpen(true);
  };

  const handleMenuClose = (): void => {
    setIsMenuOpen(false);
  };

  const handleSearchSortMenuClose = (): void => {
    setIsSearchSortMenuOpen(false);
  };

  const handleSearchSortMenuClick = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    event.stopPropagation();

    if (!searchSortButtonRef.current) {
      return;
    }

    if (isSearchSortMenuOpen) {
      setIsSearchSortMenuOpen(false);
      return;
    }

    const rect = searchSortButtonRef.current.getBoundingClientRect();
    setSearchSortMenuPosition({
      x: sidebarPosition === 'left' ? rect.left : rect.right - SEARCH_SORT_MENU_WIDTH,
      y: rect.bottom + 4,
    });
    setIsSearchSortMenuOpen(true);
  };

  const searchSortMenuItems: SidebarHeaderMenuItem[] = SEARCH_SORT_MENU_OPTIONS.map((option) => ({
    id: option.mode,
    label: translateText(option.translationKey, option.defaultLabel),
    checked: searchSortMode === option.mode,
    onClick: () => {
      setSearchSortMode(option.mode);
      setIsSearchSortMenuOpen(false);
    },
  }));

  const handleMouseDown = (event: React.MouseEvent): void => {
    event.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent): void => {
      if (!isResizing || !sidebarRef.current) {
        return;
      }

      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = sidebarPosition === 'left'
        ? event.clientX - rect.left
        : rect.right - event.clientX;

      if (newWidth < COLLAPSE_THRESHOLD) {
        onClose();
        setIsResizing(false);
        return;
      }

      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onClose, sidebarPosition]);

  const showSidebarHeader = activeView !== 'ai-model' && activeView !== 'explorer';
  const showSearchHeaderActions = activeView === 'search';
  const showHeaderMenu = !showSearchHeaderActions && menuItems.length > 0;

  return (
    <div
      ref={sidebarRef}
      className="sidebar"
      data-position={sidebarPosition}
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
      }}
    >
      {showSidebarHeader && (
        <div className="sidebar-header">
          <span>{title}</span>
          {showSearchHeaderActions && (
            <div className="sidebar-header-actions">
              <PressableControl
                className="sidebar-header-action"
                onPress={() => setSearchRefreshActionId((currentId) => currentId + 1)}
                aria-label={translateText('sidebar.headerActions.refreshSearch', 'Refresh Search')}
                title={translateText('sidebar.headerActions.refreshSearch', 'Refresh Search')}
              >
                <VscRefresh size={15} />
              </PressableControl>
              <PressableControl
                ref={searchSortButtonRef}
                className="sidebar-header-action sidebar-header-action--sort"
                onPress={handleSearchSortMenuClick}
                aria-label={translateText('sidebar.headerActions.sort', 'Sort')}
                title={translateText('sidebar.headerActions.sort', 'Sort')}
              >
                <LuArrowDownZA size={15} />
              </PressableControl>
              <PressableControl
                className="sidebar-header-action sidebar-header-action--collapse"
                onPress={() => setSearchCollapseAllActionId((currentId) => currentId + 1)}
                aria-label={translateText('sidebar.headerActions.collapseAll', 'Collapse All')}
                title={translateText('sidebar.headerActions.collapseAll', 'Collapse All')}
              >
                <VscCollapseAll size={15} />
              </PressableControl>
              <PressableControl
                className="sidebar-header-action sidebar-header-action--clear"
                onPress={() => setSearchClearActionId((currentId) => currentId + 1)}
                aria-label={translateText('sidebar.headerActions.clearSearchResults', 'Clear Search Results')}
                title={translateText('sidebar.headerActions.clearSearchResults', 'Clear Search Results')}
              >
                <VscClearAll size={15} />
              </PressableControl>
            </div>
          )}
          {showHeaderMenu && (
            <PressableControl
              ref={menuButtonRef}
              className="sidebar-header-action"
              onPress={handleMenuClick}
              aria-label={translateText('sidebar.headerActions.moreOptions', 'More Options')}
              title={translateText('sidebar.headerActions.moreOptions', 'More Options')}
            >
              <Icon name="more-horizontal" size={16} />
            </PressableControl>
          )}
        </div>
      )}

      <div className="sidebar-content">
        {renderContent()}
      </div>

      <div
        className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''} ${sidebarPosition === 'right' ? 'sidebar-resize-handle--left' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {showHeaderMenu && (
        <SidebarHeaderMenu
          isOpen={isMenuOpen}
          position={menuPosition}
          onClose={handleMenuClose}
          items={menuItems}
        />
      )}
      {showSearchHeaderActions && (
        <SidebarHeaderMenu
          isOpen={isSearchSortMenuOpen}
          position={searchSortMenuPosition}
          onClose={handleSearchSortMenuClose}
          items={searchSortMenuItems}
        />
      )}
    </div>
  );
}
