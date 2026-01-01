/**
 * 标签栏组件
 * 功能：编辑器标签页管理，标签栏设计
 * 描述：提供文件标签切换、关闭、悬停效果等功能
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorTab } from '../EditorArea';
import { Icon } from '../../../Icons/Icon';
import { MonacoContextMenu } from '../MonacoContextMenu/MonacoContextMenu';
import type { MenuGroup } from '../MonacoContextMenu/MonacoContextMenu';
import './TabBar.scss';

export interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose
}) => {
  const [isEditorFocused, setIsEditorFocused] = useState(true);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ x: 0, y: 0 });
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [codeMirrorMode, setCodeMirrorMode] = useState<'source' | 'preview'>('source');
  
  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // 切换 CodeMirror 模式
  const toggleCodeMirrorMode = useCallback(() => {
    const newMode = codeMirrorMode === 'source' ? 'preview' : 'source';
    setCodeMirrorMode(newMode);
    window.dispatchEvent(new CustomEvent('set-codemirror-mode', { detail: newMode }));
  }, [codeMirrorMode]);
  
  // 监听编辑器区域焦点变化
  useEffect(() => {
    const handleFocus = () => setIsEditorFocused(true);
    const handleBlur = () => setIsEditorFocused(false);
    
    const editorArea = document.querySelector('.editor-area');
    if (editorArea) {
      editorArea.addEventListener('focusin', handleFocus);
      editorArea.addEventListener('focusout', handleBlur);
      
      return () => {
        editorArea.removeEventListener('focusin', handleFocus);
        editorArea.removeEventListener('focusout', handleBlur);
      };
    }
  }, []);

  // 当活动标签改变时，滚动到可见区域
  useEffect(() => {
    if (activeTabId && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTabId]);

  // 获取文件图标（简化版，使用通用文件图标）
  const getFileIcon = (language?: string) => {
    return (
      <svg className="tab-item-icon" fill="currentColor" viewBox="0 0 16 16">
        <path d="M13.5 1h-11C1.67 1 1 1.67 1 2.5v11c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zm-1 11h-9v-9h9v9z"/>
      </svg>
    );
  };

  // 处理打开设置 JSON
  const handleOpenSettingsJson = async () => {
    try {
      // 使用 openJson 直接从文件读取内容，而不是使用 getAll（包含默认值）
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

  // 处理标签点击
  const handleTabClick = (tabId: string) => {
    onTabClick(tabId);
  };

  // 处理标签关闭
  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  // 处理更多操作按钮点击
  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMoreMenuPosition({
        x: rect.right - 200, // 菜单宽度 200px，向左对齐
        y: rect.bottom + 4
      });
      setShowMoreMenu(!showMoreMenu);
    }
  };

  // 更多操作菜单
  const moreMenuGroups: MenuGroup[] = [
    {
      id: 'close-group',
      items: [
        {
          id: 'close-all',
          label: '全部关闭',
          action: () => {
            tabs.forEach(tab => onTabClose(tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'close-saved',
          label: '关闭已保存',
          action: () => {
            tabs.filter(tab => !tab.isDirty).forEach(tab => onTabClose(tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'lock-current',
          label: '锁定当前',
          action: () => {
            console.log('锁定当前');
            // TODO: 实现锁定功能
          },
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'view-group',
      items: [
        {
          id: 'show-backlinks',
          label: '显示反向链接',
          action: () => {
            console.log('显示反向链接');
            // TODO: 实现反向链接功能
          },
          disabled: !activeTab
        },
        {
          id: 'source-mode',
          label: codeMirrorMode === 'source' ? '预览模式' : '源码模式',
          action: toggleCodeMirrorMode,
          disabled: !activeTab
        }
      ]
    },
    {
      id: 'split-group',
      items: [
        {
          id: 'split-horizontal',
          label: '左右分屏',
          action: () => {
            console.log('左右分屏');
            // TODO: 实现左右分屏
          },
          disabled: !activeTab
        },
        {
          id: 'split-vertical',
          label: '上下分屏',
          action: () => {
            console.log('上下分屏');
            // TODO: 实现上下分屏
          },
          disabled: !activeTab
        },
        {
          id: 'open-in-new-window',
          label: '在新窗口中打开',
          action: () => {
            console.log('在新窗口中打开');
            // TODO: 实现在新窗口中打开
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
          label: '重命名',
          action: () => {
            console.log('重命名');
            // TODO: 实现重命名功能
          },
          disabled: !activeTab
        },
        {
          id: 'move-file',
          label: '将文件移动到...',
          action: () => {
            console.log('将文件移动到...');
            // TODO: 实现移动文件功能
          },
          disabled: !activeTab
        },
        {
          id: 'mark-important',
          label: '标记重要文件',
          action: () => {
            console.log('标记重要文件');
            // TODO: 实现标记重要文件功能
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
          label: '在资源管理器中打开',
          action: async () => {
            if (activeTab?.path) {
              try {
                await window.electron?.ipcRenderer.invoke('open-in-explorer', activeTab.path);
              } catch (error) {
                console.error('在资源管理器中打开失败:', error);
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
          label: '删除文件',
          action: async () => {
            if (activeTab?.path) {
              const confirmed = confirm(`确定要删除文档"${activeTab.title}" 吗？`);
              if (confirmed) {
                try {
                  await window.electron?.ipcRenderer.invoke('delete-file', activeTab.path);
                  onTabClose(activeTab.id);
                } catch (error) {
                  console.error('删除文件失败:', error);
                  alert('删除文件失败');
                }
              }
            }
          },
          disabled: !activeTab || !activeTab.path
        }
      ]
    }
  ];

  return (
    <div className="tab-bar">
      <div className="tab-bar-scroll-container" ref={scrollContainerRef}>
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          const isHovered = hoveredTabId === tab.id;
          
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab-item ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${tab.isDirty ? 'dirty' : ''} ${tab.isPreview ? 'preview' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
              title={tab.path}
            >
              {/* 活动标签顶部指示例*/}
              {isActive && <div className="tab-item-border-top" />}
              
              {/* 文件图标 */}
              {getFileIcon(tab.language)}
              
              {/* 文件名 */}
              <span className="tab-item-title">
                {tab.title}
              </span>
              
              {/* 脏标记或关闭按钮 */}
              {tab.isDirty && !isHovered ? (
                <span className="tab-item-dirty-indicator">●</span>
              ) : (
                <button
                  className="tab-item-close"
                  onClick={(e) => handleTabClose(e, tab.id)}
                  title="关闭"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      
      {/* 操作按钮区域 */}
      <div className="tab-bar-actions">
        {activeTab?.type === 'settings' && (
          <button 
            className="tab-bar-action-btn"
            onClick={handleOpenSettingsJson}
            title="打开设置 (JSON)"
          >
            <Icon name="file-code" size={16} />
          </button>
        )}
        
        <button 
          className="tab-bar-action-btn"
          title="拆分编辑器"
        >
          <Icon name="split-vertical" size={16} />
        </button>
        
        <button 
          className="tab-bar-action-btn"
          title="CodeMirror 编辑器"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('set-editor-type', { detail: 'codemirror' }));
          }}
        >
          <Icon name="code" size={16} />
        </button>
        
        <button 
          ref={moreButtonRef}
          className="tab-bar-action-btn"
          title="更多操作"
          onClick={handleMoreClick}
        >
          <Icon name="more-vert" size={16} />
        </button>
      </div>

      {/* 更多操作菜单 */}
      <MonacoContextMenu
        visible={showMoreMenu}
        x={moreMenuPosition.x}
        y={moreMenuPosition.y}
        menuGroups={moreMenuGroups}
        onClose={() => setShowMoreMenu(false)}
      />
    </div>
  );
};
