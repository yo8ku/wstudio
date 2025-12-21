/**
 * 右侧边栏组件
 * 显示标签、反向链接、章节大纲等内容
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRightSidebarStore } from '../../../stores/rightSidebarStore';
import { Icon } from '../../Icons';
import { ImportantFilesView } from './views/ImportantFilesView';
import { TagsView } from './views/TagsView';
import { BacklinksView } from './views/BacklinksView';
import { OutlineView } from './views/OutlineView';
import { AnnotationsView } from './views/AnnotationsView';
import { LinksView } from './views/LinksView';
import { TemplatesView } from './views/TemplatesView';
import { DailyNoteView } from './views/DailyNoteView';
import './RightSidebar.scss';

const MIN_WIDTH = 200;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 320;
const COLLAPSE_THRESHOLD = 150;

export const RightSidebar: React.FC = () => {
  const { activeView, isVisible, setVisible, width, setWidth } = useRightSidebarStore();
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 调试日志
  console.log('[RightSidebar] 状态:', { isVisible, activeView, width });

  const getTitle = () => {
    const titles = {
      'important-files': '重要文件',
      'tags': '标签',
      'backlinks': '反向链接',
      'outline': '章节大纲',
      'annotations': '标注',
      'links': '链接',
      'templates': '插入模板',
      'daily-note': '每日笔记',
    };
    return activeView ? titles[activeView] : '';
  };

  const renderContent = () => {
    switch (activeView) {
      case 'important-files':
        return <ImportantFilesView />;
      case 'tags':
        return <TagsView />;
      case 'backlinks':
        return <BacklinksView />;
      case 'outline':
        return <OutlineView />;
      case 'annotations':
        return <AnnotationsView />;
      case 'links':
        return <LinksView />;
      case 'templates':
        return <TemplatesView />;
      case 'daily-note':
        return <DailyNoteView />;
      default:
        return null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      
      // 如果宽度小于收缩阈值，自动关闭边栏
      if (newWidth < COLLAPSE_THRESHOLD) {
        setVisible(false);
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
  }, [isResizing, setVisible, setWidth]);

  if (!isVisible || !activeView) {
    return null;
  }

  return (
    <div 
      ref={sidebarRef}
      className="right-sidebar" 
      style={{ width: `${width}px` }}
    >
      {/* 拖拽手柄 */}
      <div
        className={`right-sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
        style={{
          backgroundColor: (isResizing || isHoveringHandle) ? undefined : 'transparent',
          opacity: (isResizing || isHoveringHandle) ? undefined : 0
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHoveringHandle(true)}
        onMouseLeave={() => setIsHoveringHandle(false)}
      />

      {/* 头部 */}
      <div className="right-sidebar-header">
        <h3 className="right-sidebar-title">{getTitle()}</h3>
        <div
          className="right-sidebar-close"
          onClick={() => setVisible(false)}
          title="关闭"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setVisible(false);
            }
          }}
        >
          <Icon name="close" size={16} />
        </div>
      </div>

      {/* 内容区域 */}
      <div className="right-sidebar-content">
        {renderContent()}
      </div>
    </div>
  );
};

