import React, { useState, useRef, useEffect } from 'react';
import type { ActivityBarItem } from '../MainLayout';
import { FileExplorer } from './FileExplorer';
import { Search } from './Search';
import { SourceControl } from './SourceControl';
import { Extensions } from './Extensions';
import { KnowledgeBase } from './KnowledgeBase/index';
import { AIModel } from './AIModel';
import { Settings } from './Settings';
import './Sidebar.scss';

interface SidebarProps {
  activeView: ActivityBarItem;
  onClose: () => void;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 256;
const COLLAPSE_THRESHOLD = 150; // 小于此宽度时自动收缩

export function Sidebar({ activeView, onClose }: SidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

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
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    const titles: Record<ActivityBarItem, string> = {
      'explorer': '资源管理器',
      'search': '搜索',
      'source-control': '源代码管理',
      'extensions': '扩展',
      'knowledge-base': '知识库',
      'ai-model': 'AI 模型',
      'user': '用户',
      'settings': '设置'
    };
    return titles[activeView];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      
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
  }, [isResizing, onClose]);

  return (
    <div 
      ref={sidebarRef}
      className="sidebar" 
      style={{ 
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`
      }}
    >
      <div className="sidebar-header">
        <span>{getTitle()}</span>
        <button
          onClick={onClose}
          title="关闭"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="sidebar-content">
        {renderContent()}
      </div>

      <div
        className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
        style={{
          backgroundColor: (isResizing || isHoveringHandle) ? undefined : 'transparent',
          opacity: (isResizing || isHoveringHandle) ? undefined : 0
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setIsHoveringHandle(true)}
        onMouseLeave={() => setIsHoveringHandle(false)}
      />
    </div>
  );
}
