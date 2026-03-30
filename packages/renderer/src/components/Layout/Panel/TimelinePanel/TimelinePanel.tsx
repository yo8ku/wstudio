/**
 * Timeline panel component.
 * Displays file history, save points, and edit activity.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const [filter, setFilter] = useState<FilterType>('all');
  const locale = i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN';
  const timelineItems = useMemo<TimelineItem[]>(() => [
    {
      id: '1',
      type: 'commit',
      title: translateText('timelinePanel.samples.addTerminalUi', 'feat: 添加终端面板 UI'),
      description: 'packages/renderer/src/components/Layout/Panel/Panel.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      author: translateText('timelinePanel.meta.user', '用户'),
      changes: { additions: 150, deletions: 0 },
    },
    {
      id: '2',
      type: 'save',
      title: translateText('timelinePanel.samples.autoSave', '自动保存'),
      description: 'packages/renderer/src/components/Layout/Panel/Panel.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
    },
    {
      id: '3',
      type: 'edit',
      title: translateText('timelinePanel.samples.editFile', '编辑文件'),
      description: 'packages/renderer/src/components/Layout/Panel/Panel.scss',
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
    },
    {
      id: '4',
      type: 'commit',
      title: translateText('timelinePanel.samples.fixPanelStyle', 'fix: 修复面板样式问题'),
      description: 'packages/renderer/src/components/Layout/Panel/Panel.scss',
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      author: translateText('timelinePanel.meta.user', '用户'),
      changes: { additions: 12, deletions: 5 },
    },
    {
      id: '5',
      type: 'save',
      title: translateText('timelinePanel.samples.autoSave', '自动保存'),
      description: 'packages/renderer/src/components/Layout/MainLayout.tsx',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
  ], [t]);

  const filteredItems = timelineItems.filter((item) => {
    if (filter === 'all') {
      return true;
    }
    return item.type === filter;
  });

  const formatRelativeCount = (key: string, defaultValue: string, count: number): string => (
    translateText(key, defaultValue).replace('{{count}}', String(count))
  );

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) {
      return translateText('timelinePanel.relative.justNow', '刚刚');
    }
    if (minutes < 60) {
      return formatRelativeCount('timelinePanel.relative.minutesAgo', '{{count}} 分钟前', minutes);
    }
    if (hours < 24) {
      return formatRelativeCount('timelinePanel.relative.hoursAgo', '{{count}} 小时前', hours);
    }
    if (days < 7) {
      return formatRelativeCount('timelinePanel.relative.daysAgo', '{{count}} 天前', days);
    }

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTypeLabel = (type: TimelineItem['type']): string => {
    switch (type) {
      case 'commit':
        return translateText('timelinePanel.types.commit', 'Git');
      case 'save':
        return translateText('timelinePanel.types.save', '保存');
      case 'edit':
      default:
        return translateText('timelinePanel.types.edit', '编辑');
    }
  };

  const groupedItems = filteredItems.reduce((groups, item) => {
    const date = item.timestamp;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    let groupKey: string;
    if (date >= today) {
      groupKey = translateText('timelinePanel.groups.today', '今天');
    } else if (date >= yesterday) {
      groupKey = translateText('timelinePanel.groups.yesterday', '昨天');
    } else {
      groupKey = translateText('timelinePanel.groups.earlier', '更早');
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, TimelineItem[]>);

  return (
    <div className='timeline-panel'>
      <div className='timeline-panel-toolbar'>
        <div className='timeline-panel-title'>
          {translateText('timelinePanel.title', '时间线')}
        </div>
        <div className='timeline-panel-filter'>
          <button
            className={`timeline-panel-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {translateText('timelinePanel.filters.all', '全部')}
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'commit' ? 'active' : ''}`}
            onClick={() => setFilter('commit')}
          >
            {translateText('timelinePanel.filters.commit', 'Git')}
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'save' ? 'active' : ''}`}
            onClick={() => setFilter('save')}
          >
            {translateText('timelinePanel.filters.save', '保存')}
          </button>
          <button
            className={`timeline-panel-filter-btn ${filter === 'edit' ? 'active' : ''}`}
            onClick={() => setFilter('edit')}
          >
            {translateText('timelinePanel.filters.edit', '编辑')}
          </button>
        </div>
      </div>

      <div className='timeline-panel-content'>
        {filteredItems.length > 0 ? (
          <div className='timeline-panel-list'>
            {Object.entries(groupedItems).map(([groupName, items]) => (
              <div key={groupName}>
                <div className='timeline-panel-group-title'>{groupName}</div>
                {items.map((item) => (
                  <div key={item.id} className='timeline-panel-item'>
                    <div className='timeline-panel-item-icon'>
                      {item.type === 'commit' && (
                        <svg viewBox='0 0 16 16' fill='currentColor'>
                          <path d='M11.17 6A3.001 3.001 0 0 0 8 4a3.001 3.001 0 0 0-3.17 2H1v1h3.83A3.001 3.001 0 0 0 8 9a3.001 3.001 0 0 0 3.17-2H15V6h-3.83zM8 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z' />
                        </svg>
                      )}
                      {item.type === 'save' && (
                        <svg viewBox='0 0 16 16' fill='currentColor'>
                          <path d='M13.353 1.146l1.5 1.5L15 2.5V13l-.5.5h-13l-.5-.5V2l.5-.5h10.647l.353.146zM2 2v11h12V2.854l-1.146-1.147L12.707 2H2zm6 10H3V7h5v5zm0-6H3V3h5v3zm1-3h3v2H9V3zm0 3h3v7H9V6z' />
                        </svg>
                      )}
                      {item.type === 'edit' && (
                        <svg viewBox='0 0 16 16' fill='currentColor'>
                          <path d='M13.23 1h-1.46L3.52 9.25l-.16.22L1 13.59 2.41 15l4.12-2.36.22-.16L15 4.23V2.77L13.23 1zM2.41 13.59l1.51-3 1.45 1.45-2.96 1.55zm3.83-2.06L4.47 9.76l8-8 1.77 1.77-8 8z' />
                        </svg>
                      )}
                    </div>
                    <div className='timeline-panel-item-content'>
                      <div className='timeline-panel-item-header'>
                        <div className='timeline-panel-item-title'>{item.title}</div>
                        <div className='timeline-panel-item-badge'>{getTypeLabel(item.type)}</div>
                        <div className='timeline-panel-item-time'>{formatTime(item.timestamp)}</div>
                      </div>
                      <div className='timeline-panel-item-description'>{item.description}</div>
                      {item.changes && (
                        <div className='timeline-panel-item-meta'>
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
          <div className='timeline-panel-empty'>
            <svg viewBox='0 0 24 24' fill='none' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
            </svg>
            <div className='timeline-panel-empty-title'>
              {translateText('timelinePanel.states.emptyTitle', '暂无时间线记录')}
            </div>
            <div className='timeline-panel-empty-description'>
              {translateText('timelinePanel.states.emptyDescription', '打开文件后将显示其最近活动。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
