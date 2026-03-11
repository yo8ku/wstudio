import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icons';
import './TitleBar.scss';

const logIconSrc = new URL('../../../../../log/log.png', import.meta.url).href;

interface TitleBarProps {
  onToggleSidebar?: () => void;
  onToggleAIPanel?: () => void;
  onTogglePanel?: () => void;
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

export const TitleBar: React.FC<TitleBarProps> = ({
  onToggleSidebar,
  onToggleAIPanel,
  onTogglePanel
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]); // 改用数组跟踪所有打开的子菜单路径
  const [isWindowActive, setIsWindowActive] = useState<boolean>(true); // 窗口活动状态
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const menuHoverTimerRef = useRef<NodeJS.Timeout | null>(null); // 用于菜单悬停延迟

  // 监听窗口焦点变化（从 Electron 主进程）
  useEffect(() => {
    if (window.electronAPI?.onWindowFocus) {
      window.electronAPI.onWindowFocus(() => setIsWindowActive(true));
    }
    
    if (window.electronAPI?.onWindowBlur) {
      window.electronAPI.onWindowBlur(() => setIsWindowActive(false));
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  // 文件操作处理
  const handleNewFile = () => {
    console.log('新建文件');
    // TODO: 实现新建文件功能
  };

  const handleOpenFile = () => {
    // 触发打开文件事件，由 EditorArea 处理
    window.dispatchEvent(new CustomEvent('open-file'));
  };

  const handleOpenFolder = async () => {
    try {
      const result = await window.electron?.folder?.open();
      if (result?.success && result.data) {
        console.log('打开文件夹', result.data);
        // 触发自定义事件，通知FileExplorer加载文件树
        window.dispatchEvent(new CustomEvent('folder-opened', { 
          detail: { path: result.data.path }
        }));
      }
    } catch (error) {
      console.error('打开文件夹失败', error);
    }
  };

  const handleSave = () => {
    console.log('保存文件');
    // TODO: 实现保存功能
  };

  const handleSaveAs = async () => {
    try {
      const result = await window.electron?.ipcRenderer.invoke('file:save-as');
      if (result?.success) {
        console.log('另存储', result.data);
      }
    } catch (error) {
      console.error('另存为失败', error);
    }
  };

  const handleSaveAll = () => {
    console.log('全部保存');
    // TODO: 实现全部保存功能
  };

  const handleQuit = () => {
    window.electronAPI?.closeWindow();
  };

  const handleOpenSettings = () => {
    console.log('打开设置');
    // 发送打开设置的事件
    window.dispatchEvent(new CustomEvent('open-settings'));
  };

  const handleOpenExtensions = () => {
    console.log('打开扩展管理');
    // 发送打开扩展管理的事件
    window.dispatchEvent(new CustomEvent('open-extension-manager'));
  };

  // 菜单配置
  const menuConfig: MenuConfig[] = [
    {
      title: '文件',
      items: [
        { label: '新建文件', shortcut: 'Ctrl+N', action: handleNewFile },
        { label: '打开文件...', shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: '打开文件夹..', shortcut: 'Ctrl+K Ctrl+O', action: handleOpenFolder },
        {
          label: '打开最近的文件',
          shortcut: 'Ctrl+R',
          submenu: [
            { label: '无最近文档' },
            { separator: true },
            { label: '更多...' },
            { label: '清除最近打开的..' }
          ]
        },
        { separator: true },
        { label: '保存', shortcut: 'Ctrl+S', action: handleSave },
        { label: '另存为..', shortcut: 'Ctrl+Shift+S', action: handleSaveAs },
        { label: '全部保存', shortcut: 'Ctrl+K S', action: handleSaveAll },
        { separator: true },
        { label: '命令面板...', shortcut: 'Ctrl+Shift+P' },
        { label: '查看分块数据', action: () => window.dispatchEvent(new CustomEvent('open-lancedb-view')) },
        { separator: true },
        {
          label: '首选项',
          submenu: [
            { label: '设置', shortcut: 'Ctrl+,', action: handleOpenSettings },
            { label: '扩展', action: handleOpenExtensions },
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

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  const handleMenuClick = (title: string) => {
    setActiveMenu(activeMenu === title ? null : title);
    setOpenSubmenus([]); // 切换菜单时重置子菜单
  };

  // 处理菜单悬停进入 - 只在已有菜单打开时切换
  const handleMenuHoverEnter = (title: string) => {
    // 只有当已经有菜单打开时，才响应悬停切换
    if (activeMenu && activeMenu !== title) {
      setActiveMenu(title);
      setOpenSubmenus([]); // 切换菜单时重置子菜单
    }
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
    }
    setActiveMenu(null);
    setOpenSubmenus([]);
  };

  // 处理子菜单鼠标进入（显示子菜单，但不会自动隐藏）
  const handleSubmenuEnter = (submenuPath: string) => {
    // 如果子菜单未打开，则打开它
    if (!openSubmenus.includes(submenuPath)) {
      const pathParts = submenuPath.split('/');
      const parentPath = pathParts.slice(0, -1).join('/');
      
      if (parentPath) {
        // 有父路径，关闭同级的所有子菜单
        const newPaths = openSubmenus.filter(path => {
          // 保留所有非同级的路径          return !path.startsWith(parentPath + '/') || path === submenuPath;
        });
        // 添加当前路径
        if (!newPaths.includes(submenuPath)) {
          newPaths.push(submenuPath);
        }
        setOpenSubmenus(newPaths);
      } else {
        // 顶级菜单项，关闭所有其他顶级子菜单
        const newPaths = openSubmenus.filter(path => path.includes('/'));
        newPaths.push(submenuPath);
        setOpenSubmenus(newPaths);
      }
    }
  };

  // 当主菜单关闭时，重置子菜单状态
  useEffect(() => {
    if (!activeMenu) {
      setOpenSubmenus([]);
    }
  }, [activeMenu]);

  // 渲染菜单项（支持递归子菜单）
  const renderMenuItem = (item: MenuItem, index: number, parentPath = '') => {
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
          {item.shortcut && (
            <span className="titlebar-shortcut">{item.shortcut}</span>
          )}
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
        {item.shortcut && (
          <span className="titlebar-shortcut">{item.shortcut}</span>
        )}
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
            {/* 隐藏侧边活动栏图标*/}
        </div>
        
        {/* 菜单*/}
        <div 
          className="titlebar-menu" 
          ref={menuRef}
        >
          {menuConfig.map((menu) => (
            <div 
              key={menu.title} 
              className="titlebar-menu-item"
              onMouseEnter={() => handleMenuHoverEnter(menu.title)}
            >
              <div
                className={`titlebar-menu-button ${
                  activeMenu === menu.title ? 'active' : ''
                }`}
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
      
      <div className="titlebar-title">Note WStudio</div>
      
      <div className="titlebar-controls">
        {/* AI 助手按钮 */}
        <div 
          className={'titlebar-ai-button'}
          onClick={onToggleAIPanel}
          title="AI 助手 (Ctrl+Shift+A)"
        >
          <Icon name="ai-assistant" size={16} />
        </div>

        {/* 终端按钮 */}
        <div 
          className={'titlebar-ai-button'}
          onClick={onTogglePanel}
          title="终端"
        >
          <Icon name="terminal" size={16} />
        </div>

        {/* 扩展管理按钮 */}
        <div 
          className={'titlebar-ai-button'}
          onClick={handleOpenExtensions}
          title="扩展管理"
        >
          <Icon name="extensions" size={16} />
        </div>

        {/* 更多工具按钮 - 切换右侧活动*/}
        <div 
          style={{ display: 'none' }}
          title="更多工具"
        >
        </div>

        <div 
          className="titlebar-button titlebar-minimize" 
          onClick={handleMinimize}
          aria-label="最小化"
        >
          <Icon name="minimize" size={10} />
        </div>
        
        <div 
          className="titlebar-button titlebar-maximize" 
          onClick={handleMaximize}
          aria-label="最大化"
        >
          <Icon name="maximize" size={10} />
        </div>
        
        <div 
          className="titlebar-button titlebar-close" 
          onClick={handleClose}
          aria-label="关闭"
        >
          <Icon name="close-window" size={10} />
        </div>
      </div>
    </div>
  );
};



