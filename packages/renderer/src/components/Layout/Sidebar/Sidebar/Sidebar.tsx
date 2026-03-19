/**
 * Sidebar 负责渲染主侧边栏内容、标题栏菜单和插件 view container。
 */

import React, { useEffect, useRef, useState } from 'react';
import type {
  WorkbenchContributionSnapshot,
  WorkbenchSidebarTitleMenuContext,
} from '@note-studio/shared';
import { FileExplorer } from '../FileExplorer/FileExplorer';
import { Search } from '../Search/Search';
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

function getSidebarTitle(
  activeView: ActivityBarItem,
  pluginContainerTitle: string | null,
): string {
  if (pluginContainerTitle) {
    return pluginContainerTitle;
  }

  switch (activeView) {
    case 'explorer':
      return '资源管理器';
    case 'search':
      return '搜索';
    case 'extensions':
      return '扩展插件';
    case 'knowledge-base':
      return '知识库';
    case 'ai-model':
      return 'AI 模型';
    case 'user':
      return '用户';
    case 'settings':
      return '设置';
    case 'media':
      return '素材管理';
    default:
      return '';
  }
}

export function Sidebar({
  activeView,
  onClose,
  workbenchContributions,
}: SidebarProps): JSX.Element {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [outlineChecked, setOutlineChecked] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { sidebarPosition } = useActivityBarStore();

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
  const title = getSidebarTitle(activeView, activePluginContainer?.title ?? null);

  const getBuiltInMenuItems = (): SidebarHeaderMenuItem[] => {
    switch (activeView) {
      case 'explorer':
        return [
          {
            id: 'outline',
            label: '大纲',
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
            label: '其他笔记',
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
            label: '语雀',
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
            label: '思源笔记',
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
            label: '飞书',
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
            label: '扣子智能体',
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
            label: '刷新',
            onClick: () => {
              console.log('刷新搜索');
            },
          },
          {
            id: 'clear-search',
            label: '清除搜索结果',
            onClick: () => {
              console.log('清除搜索结果');
            },
          },
        ];
      case 'knowledge-base':
        return [
          {
            id: 'add-folder',
            label: '添加文件夹',
            onClick: () => {
              console.log('添加文件夹到知识库');
            },
          },
          {
            id: 'refresh-kb',
            label: '刷新',
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
            label: '知识库设置',
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
            label: '个人资料',
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
            label: '退出登录',
            onClick: () => {
              console.log('退出登录');
            },
          },
        ];
      case 'settings':
        return [
          {
            id: 'reset-settings',
            label: '重置所有设置',
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
            label: '导出设置',
            onClick: () => {
              console.log('导出设置');
            },
          },
          {
            id: 'import-settings',
            label: '导入设置',
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
        return <Search />;
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

  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
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
  const showHeaderMenu = menuItems.length > 0;

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
          {showHeaderMenu && (
            <button
              ref={menuButtonRef}
              onClick={handleMenuClick}
              title="更多选项"
            >
              <Icon name="more-horizontal" size={16} />
            </button>
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
    </div>
  );
}
