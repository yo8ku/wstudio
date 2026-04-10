/**
 * Window title bar and menu.
 */

import React, { useEffect, useRef, useState } from 'react';
import { LuAlignJustify } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import {
  VscChromeMaximize,
  VscChromeRestore,
  VscLayoutPanel,
  VscLayoutPanelOff,
  VscLayoutSidebarLeft,
  VscLayoutSidebarLeftOff
} from 'react-icons/vsc';
import { Icon } from '../Icons';
import { notification } from '../Notification';
import { usePluginUiEntries } from '../../hooks/usePluginUiEntries';
import { pluginUIService } from '../../services/PluginUIService';
import {
  OPEN_COLOR_THEME_PICKER_EVENT,
  OPEN_FILE_ICON_THEME_PICKER_EVENT,
} from '../../command-center/ThemeCommandEvents';
import './TitleBar.scss';

interface TitleBarProps {
  onToggleSidebar?: () => void;
  onToggleAIPanel?: () => void;
  onTogglePanel?: () => void;
  isSidebarOpen?: boolean;
  isTerminalPanelOpen?: boolean;
  windowMode?: 'full' | 'editor-only';
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
  isTerminalPanelOpen = false,
  windowMode = 'full'
}) => {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]);
  const [isWindowActive, setIsWindowActive] = useState<boolean>(true);
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [hoveredControl, setHoveredControl] = useState<TitleBarControl | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pluginTitleBarEntries = usePluginUiEntries('titleBar');
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const fileMenuTitle = translateText('titleBar.fileMenu', 'File');

  const syncWindowMaximizedState = async (): Promise<void> => {
    const isMaximized = await window.electronAPI?.isWindowMaximized?.();
    if (typeof isMaximized === 'boolean') {
      setIsWindowMaximized(isMaximized);
    }
  };

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (window.electronAPI?.onWindowFocus) {
      cleanups.push(window.electronAPI.onWindowFocus(() => setIsWindowActive(true)));
    }

    if (window.electronAPI?.onWindowBlur) {
      cleanups.push(window.electronAPI.onWindowBlur(() => setIsWindowActive(false)));
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const cleanupWindowMaximizedStateChanged = window.electronAPI?.onWindowMaximizedStateChanged?.((isMaximized) => {
      if (isMounted) {
        setIsWindowMaximized(isMaximized);
      }
    });

    const handleWindowResize = (): void => {
      if (!isMounted) {
        return;
      }
      void syncWindowMaximizedState();
    };

    void syncWindowMaximizedState();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleWindowResize);
      cleanupWindowMaximizedStateChanged?.();
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

  const handleExecutePluginEntry = async (entryId: string): Promise<void> => {
    try {
      await pluginUIService.executeEntry(entryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notification.error(`执行插件入口失败: ${message}`);
    }
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

  const handleOpenColorThemePicker = (): void => {
    window.dispatchEvent(new Event(OPEN_COLOR_THEME_PICKER_EVENT));
  };

  const handleOpenFileIconThemePicker = (): void => {
    window.dispatchEvent(new Event(OPEN_FILE_ICON_THEME_PICKER_EVENT));
  };

  const menuConfig: MenuConfig[] = [
    {
      title: fileMenuTitle,
      items: [
        { label: translateText('titleBar.items.newFile', 'New File'), shortcut: 'Ctrl+N', action: handleNewFile },
        { label: translateText('titleBar.items.openFile', 'Open File...'), shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: translateText('titleBar.items.openFolder', 'Open Folder...'), shortcut: 'Ctrl+K Ctrl+O', action: handleOpenFolder },
        {
          label: translateText('titleBar.items.openRecentFiles', 'Open Recent'),
          shortcut: 'Ctrl+R',
          submenu: [
            { label: translateText('titleBar.items.noRecentFiles', 'No Recent Files') },
            { separator: true },
            { label: translateText('titleBar.items.more', 'More...') },
            { label: translateText('titleBar.items.clearRecentFiles', 'Clear Recently Opened...') }
          ]
        },
        { separator: true },
        { label: translateText('titleBar.items.save', 'Save'), shortcut: 'Ctrl+S', action: handleSave },
        { label: translateText('titleBar.items.saveAs', 'Save As...'), shortcut: 'Ctrl+Shift+S', action: handleSaveAs },
        { label: translateText('titleBar.items.saveAll', 'Save All'), shortcut: 'Ctrl+K S', action: handleSaveAll },
        { separator: true },
        { label: translateText('titleBar.items.commandPalette', 'Command Palette...'), shortcut: 'Ctrl+Shift+P' },
        {
          label: translateText('titleBar.items.viewChunkData', 'View Chunk Data'),
          action: () => window.dispatchEvent(new CustomEvent('open-lancedb-view'))
        },
        { separator: true },
        {
          label: translateText('titleBar.items.preferences', 'Preferences'),
          submenu: [
            { label: translateText('titleBar.items.settings', 'Settings'), shortcut: 'Ctrl+,', action: handleOpenSettings },
            { label: translateText('titleBar.items.keyboardShortcuts', 'Keyboard Shortcuts'), shortcut: 'Ctrl+K Ctrl+S' },
            { label: translateText('titleBar.items.configureSnippets', 'Configure Snippets') },
            { separator: true },
            {
              label: translateText('titleBar.items.theme', 'Theme'),
              shortcut: 'Ctrl+K Ctrl+T',
              submenu: [
                {
                  label: translateText('titleBar.items.colorTheme', 'Color Theme'),
                  action: handleOpenColorThemePicker,
                },
                {
                  label: translateText('titleBar.items.fileIconTheme', 'File Icon Theme'),
                  action: handleOpenFileIconThemePicker,
                },
              ]
            },
          ]
        },
        { separator: true },
        { label: translateText('titleBar.items.closeEditor', 'Close Editor'), shortcut: 'Ctrl+W' },
        { label: translateText('titleBar.items.closeFolder', 'Close Folder'), shortcut: 'Ctrl+K F' },
        { separator: true },
        { label: translateText('titleBar.items.quit', 'Quit'), shortcut: 'Alt+F4', action: handleQuit },
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

  const renderMenuTitle = (menuTitle: string): React.ReactNode => {
    if (menuTitle === fileMenuTitle) {
      return (
        <LuAlignJustify
          className="titlebar-menu-button-icon"
          size={TITLEBAR_ICON_SIZE}
          aria-hidden="true"
        />
      );
    }

    return menuTitle;
  };

  return (
    <div className={`titlebar${!isWindowActive ? ' inactive' : ''}`}>
      <div className="titlebar-drag-region">
        {windowMode === 'full' && (
          <div className="titlebar-menu" ref={menuRef}>
            {menuConfig.map(menu => (
              <div
                key={menu.title}
                className="titlebar-menu-item"
                onMouseEnter={() => handleMenuHoverEnter(menu.title)}
              >
                <div
                  className={`titlebar-menu-button ${menu.title === fileMenuTitle ? 'titlebar-menu-button--icon' : ''} ${activeMenu === menu.title ? 'active' : ''}`}
                  onClick={() => handleMenuClick(menu.title)}
                  title={menu.title}
                  aria-label={menu.title}
                >
                  {renderMenuTitle(menu.title)}
                </div>

                {activeMenu === menu.title && (
                  <div className="titlebar-dropdown">
                    {menu.items.map((item, index) => renderMenuItem(item, index))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      

      <div className="titlebar-controls">
        {windowMode === 'full' && (
          <div className="titlebar-control-group titlebar-utility-controls">
            <div
              className="titlebar-ai-button"
              onClick={onToggleAIPanel}
              onMouseEnter={() => setHoveredControl('ai-assistant')}
              onMouseLeave={handleControlMouseLeave}
              style={getTitleBarControlStyle('ai-assistant')}
              title={translateText('titleBar.controls.aiAssistant', 'AI Assistant')}
            >
              <Icon name="ai-assistant" size={TITLEBAR_ICON_SIZE} />
            </div>

            <div
              className="titlebar-ai-button"
              onClick={onToggleSidebar}
              onMouseEnter={() => setHoveredControl('sidebar')}
              onMouseLeave={handleControlMouseLeave}
              style={getTitleBarControlStyle('sidebar')}
              title={translateText('titleBar.controls.sidebar', 'Sidebar')}
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
              title={translateText('titleBar.controls.terminal', 'Terminal')}
            >
              {isTerminalPanelOpen ? (
                <VscLayoutPanel size={TITLEBAR_ICON_SIZE} />
              ) : (
                <VscLayoutPanelOff size={TITLEBAR_ICON_SIZE} />
              )}
            </div>
          </div>
        )}

        {windowMode === 'full' && pluginTitleBarEntries.length > 0 && (
          <div className="titlebar-control-group titlebar-plugin-controls">
            {pluginTitleBarEntries.map((entry) => (
              <div
                key={entry.id}
                className="titlebar-ai-button titlebar-plugin-button"
                onClick={() => {
                  void handleExecutePluginEntry(entry.id);
                }}
                title={entry.tooltip ?? entry.title}
              >
                <Icon name={entry.icon ?? 'extensions'} size={TITLEBAR_ICON_SIZE} />
              </div>
            ))}
          </div>
        )}

        <div className="titlebar-control-group titlebar-window-controls">
          <div
            className="titlebar-button titlebar-minimize"
            onClick={handleMinimize}
            onMouseEnter={() => setHoveredControl('minimize')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('minimize')}
            title={translateText('titleBar.controls.minimize', 'Minimize')}
          >
            <Icon name="minimize" size={TITLEBAR_ICON_SIZE} />
          </div>

          <div
            className="titlebar-button titlebar-maximize"
            onClick={handleMaximize}
            onMouseEnter={() => setHoveredControl('maximize')}
            onMouseLeave={handleControlMouseLeave}
            style={getTitleBarControlStyle('maximize')}
            title={isWindowMaximized
              ? translateText('titleBar.controls.restore', 'Restore')
              : translateText('titleBar.controls.maximize', 'Maximize')}
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
            title={translateText('titleBar.controls.close', 'Close')}
          >
            <Icon name="x" size={TITLEBAR_ICON_SIZE} />
          </div>
        </div>
      </div>
    </div>
  );
};
