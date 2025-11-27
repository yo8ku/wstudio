/**
 * 时间线组件
 * 显示文件的历史记录和修改
 */

import React from 'react';

interface TimelineItem {
  id: string;
  time: string;
  type: 'saved' | 'git';
  description: string;
  details?: string;
}

export const Timeline: React.FC = () => {
  const TimeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
      <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
    </svg>
  );

  const GitIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M15.698 7.287L8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.55 1.56l1.773 1.774a1.224 1.224 0 0 1 1.267 2.025 1.226 1.226 0 0 1-2.002-1.334L8.58 5.963v4.353a1.226 1.226 0 1 1-1.008-.036V5.887a1.226 1.226 0 0 1-.666-1.608L5.093 2.465l-4.79 4.79a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.031 1.031 0 0 0 0-1.458z" />
    </svg>
  );

  const timelineData: TimelineItem[] = [
    {
      id: '1',
      time: '2 小时前',
      type: 'saved',
      description: '已保存',
      details: 'Button.tsx (第 45 行)',
    },
    {
      id: '2',
      time: '昨天 14:32',
      type: 'saved',
      description: '已保存',
      details: 'Button.tsx (第 12 行)',
    },
    {
      id: '3',
      time: '2天前',
      type: 'git',
      description: 'Git: main',
      details: 'feat: add new button component',
    },
    {
      id: '4',
      time: '3天前',
      type: 'saved',
      description: '已保存',
      details: 'Button.tsx (完整文件)',
    }
  ];

  return (
    <div className="timeline">
      {timelineData.map((item) => (
        <div key={item.id} className="timeline-item">
          <div className="timeline-header">
            <span className="icon">
              {item.type === 'git' ? <GitIcon /> : <TimeIcon />}
            </span>
            <span className="time">{item.time}</span>
            <span className="description">- {item.description}</span>
          </div>
          {item.details && (
            <div className="timeline-details">
              {item.details}
            </div>
          )}
        </div>
      ))}

      <style>{`
        .timeline {
          padding: 0;
        }

        .timeline-item {
          padding: 0 8px 0 0;
          cursor: pointer;
          border-left: 2px solid transparent;
        }

        .timeline-item:hover {
          background: var(--hover-bg, rgba(255, 255, 255, 0.1));
          border-left-color: var(--accent-color, #007acc);
        }

        .timeline-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          margin-bottom: 1px;
          line-height: 18px;
        }

        .icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          color: var(--sidebar-fg, currentColor);
        }

        .time {
          font-weight: 500;
          color: var(--sidebar-fg);
        }

        .description {
          color: var(--secondary-fg, rgba(255, 255, 255, 0.7));
        }

        .timeline-details {
          padding-left: 0;
          font-size: 12px;
          color: var(--secondary-fg, rgba(255, 255, 255, 0.6));
          line-height: 1.3;
        }
      `}</style>
    </div>
  );
};
