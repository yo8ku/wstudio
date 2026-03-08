/**
 * 鏍囩鏍忕粍浠?
 * 鍔熻兘锛氱紪杈戝櫒鏍囩椤电鐞嗭紝鏍囩鏍忚璁?
 * 鎻忚堪锛氭彁渚涙枃浠舵爣绛惧垏鎹€佸叧闂€佹偓鍋滄晥鏋滅瓑鍔熻兘
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EditorTab } from '../EditorArea';
import { Icon } from '../../../Icons/Icon';
import { MonacoContextMenu } from '../MonacoContextMenu/MonacoContextMenu';
import type { MenuGroup } from '../MonacoContextMenu/MonacoContextMenu';
import { CustomScrollbar, type CustomScrollbarRef } from '../../../common/CustomScrollbar';
import { FileParser } from '@note-studio/global-rag';
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
  const scrollContainerRef = useRef<CustomScrollbarRef>(null);
  const previousTabIdsRef = useRef<string[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ x: 0, y: 0 });
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [codeMirrorMode, setCodeMirrorMode] = useState<'source' | 'preview'>('source');
  
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
  
  // 鐩戝惉缂栬緫鍣ㄥ尯鍩熺劍鐐瑰彉鍖?
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
          label: '\u5168\u90e8\u5173\u95ed',
          action: () => {
            tabs.forEach(tab => onTabClose(tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'close-saved',
          label: '\u5173\u95ed\u5df2\u4fdd\u5b58',
          action: () => {
            tabs.filter(tab => !tab.isDirty).forEach(tab => onTabClose(tab.id));
          },
          disabled: tabs.length === 0
        },
        {
          id: 'lock-current',
          label: '\u9501\u5b9a\u5f53\u524d',
          action: () => {
            console.log('\u9501\u5b9a\u5f53\u524d');
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
          label: codeMirrorMode === 'source' ? '\u9884\u89c8\u6a21\u5f0f' : '\u6e90\u7801\u6a21\u5f0f',
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
          label: '\u5de6\u53f3\u5206\u5c4f',
          action: () => {
            console.log('\u5de6\u53f3\u5206\u5c4f');
            // TODO: implement split horizontal
          },
          disabled: !activeTab
        },
        {
          id: 'split-vertical',
          label: '\u4e0a\u4e0b\u5206\u5c4f',
          action: () => {
            console.log('\u4e0a\u4e0b\u5206\u5c4f');
            // TODO: implement split vertical
          },
          disabled: !activeTab
        },
        {
          id: 'open-in-new-window',
          label: '\u5728\u65b0\u7a97\u53e3\u4e2d\u6253\u5f00',
          action: () => {
            console.log('\u5728\u65b0\u7a97\u53e3\u4e2d\u6253\u5f00');
            // TODO: implement open in new window
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
          label: '\u91cd\u547d\u540d',
          action: () => {
            console.log('\u91cd\u547d\u540d');
            // TODO: implement rename
          },
          disabled: !activeTab
        },
        {
          id: 'move-file',
          label: '\u5c06\u6587\u4ef6\u79fb\u52a8\u5230...',
          action: () => {
            console.log('\u5c06\u6587\u4ef6\u79fb\u52a8\u5230...');
            // TODO: implement move file
          },
          disabled: !activeTab
        },
        {
          id: 'mark-important',
          label: '\u6807\u8bb0\u91cd\u8981\u6587\u4ef6',
          action: () => {
            console.log('\u6807\u8bb0\u91cd\u8981\u6587\u4ef6');
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
          label: '\u5728\u8d44\u6e90\u7ba1\u7406\u5668\u4e2d\u6253\u5f00',
          action: async () => {
            if (activeTab?.path) {
              try {
                await window.electron?.ipcRenderer.invoke('open-in-explorer', activeTab.path);
              } catch (error) {
                console.error('\u5728\u8d44\u6e90\u7ba1\u7406\u5668\u4e2d\u6253\u5f00\u5931\u8d25:', error);
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
          label: '\u5220\u9664\u6587\u4ef6',
          action: async () => {
            if (activeTab?.path) {
              const confirmed = confirm(`\u786e\u5b9a\u8981\u5220\u9664\u6587\u6863 "${activeTab.title}" \u5417\uff1f`);
              if (confirmed) {
                try {
                  await window.electron?.ipcRenderer.invoke('delete-file', activeTab.path);
                  onTabClose(activeTab.id);
                } catch (error) {
                  console.error('\u5220\u9664\u6587\u4ef6\u5931\u8d25:', error);
                  alert('\u5220\u9664\u6587\u4ef6\u5931\u8d25');
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
              onMouseEnter={() => setHoveredTabId(tab.id)}
              onMouseLeave={() => setHoveredTabId(null)}
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
                  title={'\u5173\u95ed'}
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
            title={'\u6253\u5f00\u8bbe\u7f6e (JSON)'}
          >
            <Icon name="file-code" size={16} />
          </button>
        )}
        
        {isEditableDocumentTab && (
          <>
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
              title={'\u66f4\u591a\u64cd\u4f5c'}
              onClick={handleMoreClick}
            >
              <Icon name="more-vert" size={16} />
            </button>
          </>
        )}
      </div>

      {/* 鏇村鎿嶄綔鑿滃崟 */}
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
