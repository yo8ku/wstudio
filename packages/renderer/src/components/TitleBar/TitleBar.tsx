import React, { useState, useRef, useEffect } from 'react';
import './TitleBar.css';

interface TitleBarProps {
  onToggleSidebar?: () => void;
  onToggleAIPanel?: () => void;
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
  onToggleAIPanel
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [themes, setThemes] = useState<any[]>([]);
  const [currentTheme, setCurrentTheme] = useState<string>('');
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]); // 改用数组跟踪所有打开的子菜单路径
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<NodeJS.Timeout | null>(null);
  const menuHoverTimerRef = useRef<NodeJS.Timeout | null>(null); // 用于菜单悬停延迟

  // 加载主题列表
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const result = await window.electronAPI?.theme.list();
        if (result?.success && result.data) {
          setThemes(result.data);
        }
        
        // 获取当前主题
        const currentResult = await window.electronAPI?.theme.getCurrent();
        if (currentResult?.success && currentResult.data) {
          setCurrentTheme(currentResult.data.id);
        }
      } catch (error) {
        console.error('加载主题失败:', error);
      }
    };
    
    loadThemes();
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
        console.log('打开文件夹:', result.data);
        // 触发自定义事件，通知FileExplorer加载文件树
        window.dispatchEvent(new CustomEvent('folder-opened', { 
          detail: result.data 
        }));
      }
    } catch (error) {
      console.error('打开文件夹失败:', error);
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
        console.log('另存为:', result.data);
      }
    } catch (error) {
      console.error('另存为失败:', error);
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

  const handleThemeChange = async (themeId: string) => {
    try {
      const result = await window.electronAPI?.theme.apply(themeId);
      if (result?.success) {
        setCurrentTheme(themeId);
        console.log('主题已切换:', themeId);
      }
    } catch (error) {
      console.error('切换主题失败:', error);
    }
  };

  // 生成主题菜单项
  const themeMenuItems: MenuItem[] = themes.map(theme => ({
    label: theme.name,
    checked: theme.id === currentTheme,
    action: () => handleThemeChange(theme.id)
  }));

  // 菜单配置
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
            { label: '清除最近打开的...' }
          ]
        },
        { separator: true },
        { label: '保存', shortcut: 'Ctrl+S', action: handleSave },
        { label: '另存为...', shortcut: 'Ctrl+Shift+S', action: handleSaveAs },
        { label: '全部保存', shortcut: 'Ctrl+K S', action: handleSaveAll },
        { separator: true },
        { 
          label: '首选项', 
          submenu: [
            { label: '设置', shortcut: 'Ctrl+,', action: handleOpenSettings },
            { label: '扩展', shortcut: 'Ctrl+Shift+X' },
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
    {
      title: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
        { label: '重做', shortcut: 'Ctrl+Y', action: () => document.execCommand('redo') },
        { separator: true },
        { label: '剪切', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
        { label: '复制', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
        { label: '粘贴', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
        { separator: true },
        { label: '查找', shortcut: 'Ctrl+F' },
        { label: '替换', shortcut: 'Ctrl+H' },
        { separator: true },
        { label: '在文件中查找', shortcut: 'Ctrl+Shift+F' },
        { label: '在文件中替换', shortcut: 'Ctrl+Shift+H' }
      ]
    },
    {
      title: '选择',
      items: [
        { label: '全选', shortcut: 'Ctrl+A' },
        { label: '展开选择', shortcut: 'Shift+Alt+→' },
        { label: '收缩选择', shortcut: 'Shift+Alt+←' },
      ]
    },
    {
      title: '查看',
      items: [
        { label: '命令面板...', shortcut: 'Ctrl+Shift+P' },
        { separator: true },
        {
          label: '外观',
          submenu: [
            { label: '切换侧边栏', shortcut: 'Ctrl+B', action: onToggleSidebar },
            { label: 'AI 助手', shortcut: 'Ctrl+Shift+A', action: onToggleAIPanel },
          ]
        },
      ]
    },
    {
      title: '转到',
      items: [
        { label: '转到文件...', shortcut: 'Ctrl+P' },
        { label: '转到行/列...', shortcut: 'Ctrl+G' },
        { label: '转到符号...', shortcut: 'Ctrl+Shift+O' },
      ]
    },
    {
      title: '运行',
      items: [
        { label: '启动调试', shortcut: 'F5' },
        { label: '运行(不调试)', shortcut: 'Ctrl+F5' },
      ]
    },
    {
      title: '帮助',
      items: [
        { label: '欢迎', shortcut: '' },
        { label: '文档' },
        { separator: true },
        { label: '关于' },
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
          // 保留所有非同级的路径
          return !path.startsWith(parentPath + '/') || path === submenuPath;
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
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="submenu-arrow">
            <path d="M4 2l4 4-4 4V2z" />
          </svg>
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
    <div className="titlebar">
      <div className="titlebar-drag-region">
        <div className="titlebar-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1L3 6h10L8 1zm0 14l5-5H3l5 5z"/>
          </svg>
        </div>
        
        {/* 菜单栏 */}
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
              <button
                className={`titlebar-menu-button ${
                  activeMenu === menu.title ? 'active' : ''
                }`}
                onClick={() => handleMenuClick(menu.title)}
              >
                {menu.title}
              </button>
              
              {activeMenu === menu.title && (
                <div className="titlebar-dropdown">
                  {menu.items.map((item, index) => renderMenuItem(item, index))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="titlebar-title">WiseAI Note Studio</div>
      
      <div className="titlebar-controls">
        {/* AI 助手按钮 */}
        <button 
          className="titlebar-ai-button" 
          onClick={onToggleAIPanel}
          title="AI 助手 (Ctrl+Shift+A)"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" />
          </svg>
          <span className="ml-1">AI</span>
        </button>

        <button 
          className="titlebar-button titlebar-minimize" 
          onClick={handleMinimize}
          aria-label="最小化"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
        
        <button 
          className="titlebar-button titlebar-maximize" 
          onClick={handleMaximize}
          aria-label="最大化"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0v10h10V0H0zm1 1h8v8H1V1z" fill="currentColor"/>
          </svg>
        </button>
        
        <button 
          className="titlebar-button titlebar-close" 
          onClick={handleClose}
          aria-label="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
      </div>
    </div>
  );
};



