/**
 * Window title bar and menu.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  VscChromeMaximize,
  VscChromeRestore,
  VscLayoutPanel,
  VscLayoutPanelOff,
  VscLayoutSidebarLeft,
  VscLayoutSidebarLeftOff
} from 'react-icons/vsc';
import { Icon } from '../Icons';
import './TitleBar.scss';

interface TitleBarProps {
  onToggleSidebar?: () => void;
  onToggleAIPanel?: () => void;
  onTogglePanel?: () => void;
  isSidebarOpen?: boolean;
  isTerminalPanelOpen?: boolean;
}

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  submenu?: MenuItem[];
  checked?: boolean;
}

interface MenuConfig {
  title: string;
  items: MenuItem[];
}

type TitleBarControl = 'ai-assistant' | 'sidebar' | 'terminal' | 'minimize' | 'maximize' | 'close';

const TITLEBAR_ICON_SIZE = 16;

export const TitleBar: React.FC<TitleBarProps> = ({
  onToggleSidebar,
  onToggleAIPanel,
  onTogglePanel,
  isSidebarOpen = false,
  isTerminalPanelOpen = false
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]);
  const [isWindowActive, setIsWindowActive] = useState<boolean>(true);
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [hoveredControl, setHoveredControl] = useState<TitleBarControl | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const syncWindowMaximizedState = async (): Promise<void> => {
    const isMaximized = await window.electronAPI?.isWindowMaximized?.();
    if (typeof isMaximized === 'boolean') {
      setIsWindowMaximized(isMaximized);
    }
  };

  useEffect(() => {
    if (window.electronAPI?.onWindowFocus) {
      window.electronAPI.onWindowFocus(() => setIsWindowActive(true));
    }

    if (window.electronAPI?.onWindowBlur) {
      window.electronAPI.onWindowBlur(() => setIsWindowActive(false));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const handleWindowResize = (): void => {
      if (!isMounted) {
        return;
      }
      void syncWindowMaximizedState();
    };

    void syncWindowMaximizedState();
    window.addEventListener('resize', handleWindowResize);

    if (window.electronAPI?.onWindowMaximizedStateChanged) {
      window.electronAPI.onWindowMaximizedStateChanged((isMaximized) => {
        if (isMounted) {
          setIsWindowMaximized(isMaximized);
        }
      });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  const handleMinimize = (): void => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = async (): Promise<void> => {
    const isMaximized = await window.electronAPI?.maximizeWindow?.();
    if (typeof isMaximized === 'boolean') {
      setIsWindowMaximized(isMaximized);
      return;
    }

    window.setTimeout(() => {
      void syncWindowMaximizedState();
    }, 80);
  };

  const handleClose = (): void => {
    window.electronAPI?.closeWindow();
  };

  const handleControlMouseLeave = (): void => {
    setHoveredControl(null);
  };

  const getTitleBarControlStyle = (control: TitleBarControl): React.CSSProperties => {
    if (hoveredControl !== control) {
      return {
        backgroundColor: 'transparent',
        color: 'var(--ws-activityBar-inactiveForeground)'
      };
    }

    if (control === 'close') {
      return {
        backgroundColor: 'var(--titlebar-close-hover)',
        color: 'var(--titlebar-fg)'
      };
    }

    return {
      backgroundColor: 'var(--titlebar-hover)',
      color: 'var(--ws-activityBar-foreground)'
    };
  };

  const handleNewFile = (): void => {
    console.log('新建文件');
  };

  const handleOpenFile = (): void => {
    window.dispatchEvent(new CustomEvent('open-file'));
  };

  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.electron?.folder?.open();
      if (result?.success && result.data) {
        window.dispatchEvent(
          new CustomEvent('folder-opened', {
            detail: { path: result.data.path }
          })
        );
      }
    } catch (error) {
      console.error('打开文件夹失败:', error);
    }
  };

  const handleSave = (): void => {
    console.log('保存文件');
  };

  const handleSaveAs = async (): Promise<void> => {
    try {
      await window.electron?.ipcRenderer.invoke('file:save-as');
    } catch (error) {
      console.error('另存为失败:', error);
    }
  };

  const handleSaveAll = (): void => {
    console.log('全部保存');
  };

  const handleQuit = (): void => {
    window.electronAPI?.closeWindow();
  };

  const handleOpenSettings = (): void => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  };

  const menuConfig: MenuConfig[] = [
    {
      title: '文件',
      items: [
        { label: '新建文件', shortcut: 'Ctrl+N', action: handleNewFile },
        { label: '打开文件...', shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: '打开文件夹...', shortcut: 'Ctrl+K Ctrl+O', action: handleOpenFolder },
        {
          label: '打开最近的文件',
          shortcut: 'Ctrl+R',
          submenu: [
            { label: '无最近文件' },
            { separator: true },
            { label: '更多...' },
            { label: '清除最近打开的文件...' }
          ]
        },
        { separator: true },
        { label: '保存', shortcut: 'Ctrl+S', action: handleSave },
        { label: '另存为...', shortcut: 'Ctrl+Shift+S', action: handleSaveAs },
        { label: '全部保存', shortcut: 'Ctrl+K S', action: handleSaveAll },
        { separator: true },
        { label: '命令面板...', shortcut: 'Ctrl+Shift+P' },
        {
          label: '查看分块数据',
          action: () => window.dispatchEvent(new CustomEvent('open-lancedb-view'))
        },
        { separator: true },
        {
          label: '首选项',
          submenu: [
            { label: '设置', shortcut: 'Ctrl+,', action: handleOpenSettings },
            { label: '键盘快捷方式', shortcut: 'Ctrl+K Ctrl+S' },
            { label: '配置常用片段' },
            { separator: true },
            {
              label: '主题',
              shortcut: 'Ctrl+K Ctrl+T',
              submenu: [
                { label: '颜色主题' },
                { label: '文件图标主题' }
              ]
            },
          ]
        },
        { separator: true },
        { label: '关闭编辑器', shortcut: 'Ctrl+W' },
        { label: '关闭文件夹', shortcut: 'Ctrl+K F' },
        { separator: true },
        { label: '退出', shortcut: 'Alt+F4', action: handleQuit },
      ]
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (!activeMenu) {
      return undefined;
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu]);

  const handleMenuClick = (title: string): void => {
    setActiveMenu(activeMenu === title ? null : title);
    setOpenSubmenus([]);
  };

  const handleMenuHoverEnter = (title: string): void => {
    if (activeMenu && activeMenu !== title) {
      setActiveMenu(title);
      setOpenSubmenus([]);
    }
  };

  const handleMenuItemClick = (item: MenuItem): void => {
    if (item.action) {
      item.action();
    }
    setActiveMenu(null);
    setOpenSubmenus([]);
  };

  const handleSubmenuEnter = (submenuPath: string): void => {
    if (openSubmenus.includes(submenuPath)) {
      return;
    }

    const pathParts = submenuPath.split('/');
    const parentPath = pathParts.slice(0, -1).join('/');

    if (parentPath) {
      const nextPaths = openSubmenus.filter(path => {
        return !path.startsWith(`${parentPath}/`) || path === submenuPath;
      });
      if (!nextPaths.includes(submenuPath)) {
        nextPaths.push(submenuPath);
      }
      setOpenSubmenus(nextPaths);
      return;
    }

    const nextPaths = openSubmenus.filter(path => path.includes('/'));
    nextPaths.push(submenuPath);
    setOpenSubmenus(nextPaths);
  };

  useEffect(() => {
    if (!activeMenu) {
      setOpenSubmenus([]);
    }
  }, [activeMenu]);

  const renderMenuItem = (item: MenuItem, index: number, parentPath = ''): React.ReactNode => {
    if (item.separator) {
      return <div key={`separator-${index}`} className="titlebar-dropdown-separator" />;
    }

    if (item.submenu) {
      const submenuPath = parentPath ? `${parentPath}/${item.label}-${index}` : `${item.label}-${index}`;
      const isOpen = openSubmenus.includes(submenuPath);

      return (
        <div
          key={item.label}
          className="titlebar-dropdown-item has-submenu"
          onMouseEnter={() => handleSubmenuEnter(submenuPath)}
        >
          <span className="menu-item-content">
            {item.checked && <span className="menu-check">✓</span>}
            <span>{item.label}</span>
          </span>
          {item.shortcut && <span className="titlebar-shortcut">{item.shortcut}</span>}
          <Icon name="submenu-arrow" size={12} className="submenu-arrow" />
          {isOpen && (
            <div className="titlebar-submenu">
              {item.submenu.map((subitem, subindex) => renderMenuItem(subitem, subindex, submenuPath))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={item.label}
        className="titlebar-dropdown-item"
        onClick={() => handleMenuItemClick(item)}
      >
        <span className="menu-item-content">
          {item.checked && <span className="menu-check">✓</span>}
          <span>{item.label}</span>
        </span>
        {item.shortcut && <span className="titlebar-shortcut">{item.shortcut}</span>}
      </div>
    );
  };

  return (
    <div className={`titlebar${!isWindowActive ? ' inactive' : ''}`}>
      <div className="titlebar-drag-region">
        <div className="titlebar-icon">
          <div
            className="titlebar-sidebar-toggle"
            onClick={onToggleSidebar}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <Icon iconSet="ui" name="panel-left" size={18} />
          </div>
        </div>

        <div className="titlebar-menu" ref={menuRef}>
          {menuConfig.map(menu => (
            <div
              key={menu.title}
              className="titlebar-menu-item"
              onMouseEnter={() => handleMenuHoverEnter(menu.title)}
            >
              <div
                className={`titlebar-menu-button ${activeMenu === menu.title ? 'active' : ''}`}
                onClick={() => handleMenuClick(menu.title)}
              >
                {menu.title}
              </div>

              {activeMenu === menu.title && (
                <div className="titlebar-dropdown">
                  {menu.items.map((item, index) => renderMenuItem(item, index))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      

      <div className="titlebar-controls">
        <div className="titlebar-control-group titlebar-utility-controls">
          <div
            className="titlebar-ai-button"
            onClick={onToggleAIPanel}
            onMouseEnter={() => setHoveredControl('ai-assistant')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('ai-assistant')}
            title="AI助手"
          >
            <Icon name="ai-assistant" size={TITLEBAR_ICON_SIZE} />
          </div>

          <div
            className="titlebar-ai-button"
            onClick={onToggleSidebar}
            onMouseEnter={() => setHoveredControl('sidebar')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('sidebar')}
            title="侧边栏"
          >
            {isSidebarOpen ? (
              <VscLayoutSidebarLeft size={TITLEBAR_ICON_SIZE} />
            ) : (
              <VscLayoutSidebarLeftOff size={TITLEBAR_ICON_SIZE} />
            )}
          </div>

          <div
            className="titlebar-ai-button"
            onClick={onTogglePanel}
            onMouseEnter={() => setHoveredControl('terminal')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('terminal')}
            title="终端"
          >
            {isTerminalPanelOpen ? (
              <VscLayoutPanel size={TITLEBAR_ICON_SIZE} />
            ) : (
              <VscLayoutPanelOff size={TITLEBAR_ICON_SIZE} />
            )}
          </div>
        </div>

        <div className="titlebar-control-group titlebar-window-controls">
          <div
            className="titlebar-button titlebar-minimize"
            onClick={handleMinimize}
            onMouseEnter={() => setHoveredControl('minimize')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('minimize')}
            title="最小化"
          >
            <Icon name="minimize" size={TITLEBAR_ICON_SIZE} />
          </div>

          <div
            className="titlebar-button titlebar-maximize"
            onClick={handleMaximize}
            onMouseEnter={() => setHoveredControl('maximize')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('maximize')}
            title={isWindowMaximized ? '还原' : '最大化'}
          >
            {isWindowMaximized ? (
              <VscChromeRestore size={16} />
            ) : (
              <VscChromeMaximize size={16} />
            )}
          </div>

          <div
            className="titlebar-button titlebar-close"
            onClick={handleClose}
            onMouseEnter={() => setHoveredControl('close')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('close')}
            title="关闭"
          >
            <Icon name="x" size={TITLEBAR_ICON_SIZE} />
          </div>
        </div>
      </div>
    </div>
  );
};
