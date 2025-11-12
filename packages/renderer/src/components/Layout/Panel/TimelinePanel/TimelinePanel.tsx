/**
 * 时间线面板组件
 * 功能：显示文件的历史变更记录
 * 描述：展示文件的保存历史、Git提交等时间线信息
 */

import React, { useState } from 'react';
import './TimelinePanel.scss';

interface TimelineItem {
  id: string;
  type: 'save' | 'commit' | 'edit';
  title: string;
  description: string;
  timestamp: Date;
  author?: string;
  changes?: {
    additions: number;
    deletions: number;
  };
}

type FilterType = 'all' | 'save' | 'commit' | 'edit';

export const TimelinePanel: React.FC = () => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [timelineItems] = useState<TimelineItem[]>([
    {
      id: '1',
      type: 'commit',
      title: 'feat: 添加终端面板UI',
      description: 'packages/renderer/src/components/Layout/Panel/Panel.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      author: 'User',
      changes: { additions: 150, deletions: 0 }
    },
    {
      id: '2',
      type: 'save',
      title: '自动保存',
      description: 'packages/renderer/src/components/Layout/Panel/Panel.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 10)
    },
    {
      id: '3',
      type: 'edit',
      title: '编辑文件',
      description: 'packages/renderer/src/components/Layout/Panel/Panel.scss',
      timestamp: new Date(Date.now() - 1000 * 60 * 15)
    },
    {
      id: '4',
      type: 'commit',
      title: 'fix: 修复面板样式问题',
      description: 'packages/renderer/src/components/Layout/Panel/Panel.scss',
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      author: 'User',
      changes: { additions: 12, deletions: 5 }
    },
    {
      id: '5',
      type: 'save',
      title: '自动保存',
      description: 'packages/renderer/src/components/Layout/MainLayout.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  ]);

  // 过滤时间线项
  const filteredItems = timelineItems.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  // 格式化时
  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // 获取图标
  const getIcon = (type: TimelineItem['type']) => {
    switch (type) {
      case 'commit':
        return (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.17 6A3.001 3.001 0 0 0 8 4a3.001 3.001 0 0 0-3.17 2H1v1h3.83A3.001 3.001 0 0 0 8 9a3.001 3.001 0 0 0 3.17-2H15V6h-3.83zM8 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
          </svg>
        );
      case 'save':
        return (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.353 1.146l1.5 1.5L15 2.5V13l-.5.5h-13l-.5-.5V2l.5-.5h10.647l.353.146zM2 2v11h12V2.854l-1.146-1.147L12.707 2H2zm6 10H3V7h5v5zm0-6H3V3h5v3zm1-3h3v2H9V3zm0 3h3v7H9V6z"/>
          </svg>
        );
      case 'edit':
        return (
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z"/>
          </svg>
        );
    }
  };

  // 获取类型标签
  const getTypeLabel = (type: TimelineItem['type']): string => {
    switch (type) {
      case 'commit': return 'Git';
      case 'save': return '保存';
      case 'edit': return '编辑';
    }
  };

  // 分组时间线项
  const groupedItems = filteredItems.reduce((groups, item) => {
    const date = item.timestamp;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    let groupKey: string;
    if (date >= today) {
      groupKey = '今天';
    } else if (date >= yesterday) {
      groupKey = '昨天';
    } else {
      groupKey = '更早';
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, TimelineItem[]>);

  return (
    <div className="timeline-panel">
      {/* 工具栏*/}
      <div className="timeline-panel-toolbar">
        <div className="timeline-panel-title">时间线</div>
        <div className="timeline-panel-filter">
          <button
            className={`timeline-panel-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'commit' ? 'active' : ''}`}
            onClick={() => setFilter('commit')}
          >
            Git
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'save' ? 'active' : ''}`}
            onClick={() => setFilter('save')}
          >
            保存
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'edit' ? 'active' : ''}`}
            onClick={() => setFilter('edit')}
          >
            编辑
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="timeline-panel-content">
        {filteredItems.length > 0 ? (
          <div className="timeline-panel-list">
            {Object.entries(groupedItems).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="timeline-panel-group-title">{groupName}</div>
                {items.map((item) => (
                  <div key={item.id} className="timeline-panel-item">
                    <div className="timeline-panel-item-icon">
                      {getIcon(item.type)}
                    </div>
                    <div className="timeline-panel-item-content">
                      <div className="timeline-panel-item-header">
                        <div className="timeline-panel-item-title">{item.title}</div>
                        <div className="timeline-panel-item-badge">{getTypeLabel(item.type)}</div>
                        <div className="timeline-panel-item-time">{formatTime(item.timestamp)}</div>
                      </div>
                      <div className="timeline-panel-item-description">{item.description}</div>
                      {item.changes && (
                        <div className="timeline-panel-item-meta">
                          <span>
                            <span style={{ color: 'var(--ws-git-decoration-added-resource-foreground)' }}>
                              +{item.changes.additions}
                            </span>
                          </span>
                          <span>
                            <span style={{ color: 'var(--ws-git-decoration-deleted-resource-foreground)' }}>
                              -{item.changes.deletions}
                            </span>
                          </span>
                          {item.author && <span>{item.author}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="timeline-panel-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="timeline-panel-empty-title">暂无时间线记录</div>
            <div className="timeline-panel-empty-description">
              打开文件后将显示其历史记录
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


