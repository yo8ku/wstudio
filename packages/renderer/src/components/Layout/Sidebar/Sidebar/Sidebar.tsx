import React, { useState, useRef, useEffect } from 'react';
import type { ActivityBarItem } from '../../MainLayout';
import { FileExplorer } from '../FileExplorer/FileExplorer';
import { Search } from '../Search/Search';
import { SourceControl } from '../SourceControl/SourceControl';
import { Extensions } from '../Extensions/Extensions';
import { KnowledgeBase } from '../KnowledgeBase/KnowledgeBase';
import { AIModel } from '../AIModel/AIModel';
import { AIAgent } from '../AIAgent/AIAgent';
import { Settings } from '../Settings/Settings';
import { UserSidebar } from '../User/UserSidebar';
import { NotionIcon, YuqueIcon, JoplinIcon, ObsidianIcon, SiyuanIcon, FeishuIcon, KouziIcon } from '../../../Icons';
import { Icon } from '../../../Icons';
import { SidebarHeaderMenu, SidebarHeaderMenuItem } from '../SidebarHeaderMenu';
import { electronStore } from '../../../../services/ElectronStoreService';
import { useActivityBarStore } from '../../../../stores/activityBarStore';
import './Sidebar.scss';

export interface SidebarProps {
  activeView: ActivityBarItem;
  onClose: () => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 256;
const COLLAPSE_THRESHOLD = 150; // 小于此宽度时自动收缩

export function Sidebar({ activeView, onClose }: SidebarProps): JSX.Element {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  
  // 获取侧边栏位置
  const { sidebarPosition } = useActivityBarStore();
  
  // 打开编辑器默认勾选状态
  const [openEditorsChecked, setOpenEditorsChecked] = useState(true);
  
  // 大纲默认勾选状态
  const [outlineChecked, setOutlineChecked] = useState(true);

  // 根据不同的视图返回对应的菜单配置
  const getMenuItems = (): SidebarHeaderMenuItem[] => {
    switch (activeView) {
      case 'explorer':
        // 资源管理器菜单
        return [
          {
            id: 'open-editors',
            label: '打开编辑器',
            checked: openEditorsChecked,
            onClick: () => {
              const newState = !openEditorsChecked;
              setOpenEditorsChecked(newState);
              console.log('[Sidebar] 切换打开编辑器显示', newState);
              
              // 发送事件通知 FileExplorer 组件
              window.dispatchEvent(new CustomEvent('toggle-open-editors', {
                detail: { show: newState }
              }));
            }
          },
          {
            id: 'outline',
            label: '大纲',
            checked: outlineChecked,
            onClick: () => {
              setOutlineChecked(!outlineChecked);
              console.log('切换大纲显示:', !outlineChecked);
              // TODO: 实现打开/关闭大纲功能
            }
          },
          {
            id: 'separator-1',
            label: '',
            separator: true
          },
          {
            id: 'import-notes-header',
            label: '其他笔记',
            disabled: true
          },
          {
            id: 'import-notion',
            label: 'Notion',
            icon: <NotionIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Notion');
              // TODO: 实现导入 Notion 功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('Notion 设置');
              // TODO: 实现 Notion 设置功能
            }
          },
          {
            id: 'import-yuque',
            label: '语雀',
            icon: <YuqueIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入语雀');
              // TODO: 实现导入语雀功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('语雀设置');
              // TODO: 实现语雀设置功能
            }
          },
          {
            id: 'import-joplin',
            label: 'Joplin',
            icon: <JoplinIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Joplin');
              // TODO: 实现导入 Joplin 功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('Joplin 设置');
              // TODO: 实现 Joplin 设置功能
            }
          },
          {
            id: 'import-obsidian',
            label: 'Obsidian',
            icon: <ObsidianIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入 Obsidian');
              // TODO: 实现导入 Obsidian 功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('Obsidian 设置');
              // TODO: 实现 Obsidian 设置功能
            }
          },
          {
            id: 'import-siyuan',
            label: '思源笔记',
            icon: <SiyuanIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入思源笔记');
              // TODO: 实现导入思源笔记功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('思源笔记设置');
              // TODO: 实现思源笔记设置功能
            }
          },
          {
            id: 'import-feishu',
            label: '飞书',
            icon: <FeishuIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('导入飞书');
              // TODO: 实现导入飞书功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('飞书设置');
              // TODO: 实现飞书设置功能
            }
          },
          {
            id: 'separator-2',
            label: '',
            separator: true
          },
          {
            id: 'kouzi-agent',
            label: '扣子智能体',
            icon: <KouziIcon size={16} />,
            actionIcon: <Icon name="settings" size={14} />,
            onClick: () => {
              console.log('扣子智能体');
              // TODO: 实现扣子智能体功能
            },
            onActionClick: (e: React.MouseEvent) => {
              console.log('扣子智能体设置');
              // TODO: 实现扣子智能体设置功能
            }
          }
        ];
      
      case 'search':
        // 搜索菜单
        return [
          {
            id: 'refresh-search',
            label: '刷新',
            onClick: () => {
              console.log('刷新搜索');
              // TODO: 实现刷新搜索功能
            }
          },
          {
            id: 'clear-search',
            label: '清除搜索结果',
            onClick: () => {
              console.log('清除搜索结果');
              // TODO: 实现清除搜索功能
            }
          }
        ];
      
      case 'source-control':
        // 源文件管理菜单
        return [
          {
            id: 'commit',
            label: '提交',
            onClick: () => {
              console.log('提交更改');
              // TODO: 实现提交功能
            }
          },
          {
            id: 'refresh-git',
            label: '刷新',
            onClick: () => {
              console.log('刷新源文件管理');
              // TODO: 实现刷新功能
            }
          }
        ];
      
      case 'extensions':
        // 扩展菜单
        return [
          {
            id: 'refresh-extensions',
            label: '刷新',
            onClick: () => {
              console.log('刷新扩展');
              // TODO: 实现刷新扩展功能
            }
          }
        ];
      
      case 'knowledge-base':
        // 知识库菜单
        return [
          {
            id: 'add-folder',
            label: '添加文件夹',
            onClick: () => {
              console.log('添加文件夹到知识库');
              // TODO: 实现添加文件夹功能
            }
          },
          {
            id: 'refresh-kb',
            label: '刷新',
            onClick: () => {
              console.log('刷新知识库');
              // TODO: 实现刷新知识库功能
            }
          },
          {
            id: 'separator-1',
            label: '',
            separator: true
          },
          {
            id: 'kb-settings',
            label: '知识库设置',
            onClick: () => {
              console.log('打开知识库设置');
              // TODO: 实现知识库设置功能
            }
          }
        ];
      
      case 'ai-model':
        // AI 模型菜单（AI 模型视图不显示标题栏，所以不需要菜单）
        return [];
      
      case 'ai-agent':
        // AI 智能体菜单
        return [
          {
            id: 'create-agent',
            label: '创建智能体',
            onClick: () => {
              console.log('创建智能体');
              // TODO: 实现创建智能体功能
            }
          },
          {
            id: 'refresh-agents',
            label: '刷新',
            onClick: () => {
              console.log('刷新智能体');
              // TODO: 实现刷新智能体功能
            }
          }
        ];
      
      case 'user':
        // 用户菜单
        return [
          {
            id: 'profile',
            label: '个人资料',
            onClick: () => {
              console.log('查看个人资料');
              // TODO: 实现查看个人资料功能
            }
          },
          {
            id: 'separator-1',
            label: '',
            separator: true
          },
          {
            id: 'logout',
            label: '退出登录',
            onClick: () => {
              console.log('退出登录');
              // TODO: 实现退出登录功能
            }
          }
        ];
      
      case 'settings':
        // 设置菜单
        return [
          {
            id: 'reset-settings',
            label: '重置所有设置',
            onClick: () => {
              console.log('重置所有设置');
              // TODO: 实现重置设置功能
            }
          },
          {
            id: 'separator-1',
            label: '',
            separator: true
          },
          {
            id: 'export-settings',
            label: '导出设置',
            onClick: () => {
              console.log('导出设置');
              // TODO: 实现导出设置功能
            }
          },
          {
            id: 'import-settings',
            label: '导入设置',
            onClick: () => {
              console.log('导入设置');
              // TODO: 实现导入设置功能
            }
          }
        ];
      
      default:
        return [];
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case 'explorer':
        return <FileExplorer />;
      case 'search':
        return <Search />;
      case 'source-control':
        return <SourceControl />;
      case 'extensions':
        return <Extensions />;
      case 'knowledge-base':
        return <KnowledgeBase />;
      case 'ai-model':
        return <AIModel />;
      case 'ai-agent':
        return <AIAgent />;
      case 'user':
        return <UserSidebar />;
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    const titles: Record<ActivityBarItem, string> = {
      'ai-agent': 'AI 智能体',
      'explorer': '资源管理器',
      'search': '搜索',
      'source-control': '源文件管理',
      'extensions': '扩展',
      'knowledge-base': '知识库',
      'ai-model': 'AI 模型',
      'user': '用户',
      'settings': '设置'
    };
    return titles[activeView];
  };

  // 打开菜单
  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      // 根据侧边栏位置调整菜单位置
      // 左侧：菜单在按钮左下方
      // 右侧：菜单在按钮右下方（向左对齐）
      const menuWidth = 200; // 菜单最小宽度
      setMenuPosition({
        x: sidebarPosition === 'left' ? rect.left : rect.right - menuWidth,
        y: rect.bottom + 4
      });
      setIsMenuOpen(true);
    }
  };

  // 关闭菜单
  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // 加载资源管理器配置（同步菜单勾选状态）
  useEffect(() => {
    const loadConfig = async () => {
      const config = await electronStore.get('explorer-config');
      if (config?.showOpenEditors !== undefined) {
        setOpenEditorsChecked(config.showOpenEditors);
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      
      const rect = sidebarRef.current.getBoundingClientRect();
      // 根据侧边栏位置计算新宽度
      const newWidth = sidebarPosition === 'left' 
        ? e.clientX - rect.left  // 左侧：从左边界到鼠标位置
        : rect.right - e.clientX; // 右侧：从鼠标位置到右边界
      
      // 如果宽度小于收缩阈值，自动关闭侧边栏
      if (newWidth < COLLAPSE_THRESHOLD) {
        onClose();
        setIsResizing(false);
        return;
      }
      
      // 限制在最小和最大宽度之间
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
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

  return (
    <div 
      ref={sidebarRef}
      className="sidebar"
      data-position={sidebarPosition}
      style={{ 
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`
      }}
    >
      {/* AI 模型视图不显示标题栏 */}
      {activeView !== 'ai-model' && (
        <div className="sidebar-header">
          <span>{getTitle()}</span>
          <button
            ref={menuButtonRef}
            onClick={handleMenuClick}
            title="更多选项"
          >
            <Icon name="more-horizontal" size={16} />
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {renderContent()}
      </div>

      <div
        className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''} ${sidebarPosition === 'right' ? 'sidebar-resize-handle--left' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* 下拉菜单 */}
      <SidebarHeaderMenu
        isOpen={isMenuOpen}
        position={menuPosition}
        onClose={handleMenuClose}
        items={getMenuItems()}
      />
    </div>
  );
}
