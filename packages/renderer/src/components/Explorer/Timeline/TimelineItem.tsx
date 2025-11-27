import React from 'react';
import { TimelineItem as TimelineItemType } from './types';

export interface TimelineItemProps {
  item: TimelineItemType;
  selected?: boolean;
  onClick: (item: TimelineItemType) => void;
}

/**
 * 时间线项组件
 * 显示单个历史记录
 */
export const TimelineItem: React.FC<TimelineItemProps> = ({
  item,
  selected = false,
  onClick,
}) => {
  const getIcon = () => {
    if (item.icon) return item.icon;
    
    switch (item.source) {
      case 'git':
        return '⎇';
      case 'local-history':
        return '📝';
      case 'file-saved':
        return '💾';
      default:
        return '•';
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  return (
    <div
      className={`timeline-item ${selected ? 'selected' : ''}`}
      onClick={() => onClick(item)}
    >
      <div className="timeline-item-icon">{getIcon()}</div>
      <div className="timeline-item-content">
        <div className="timeline-item-header">
          <span className="timeline-item-time">
            {item.relativeTime || formatRelativeTime(item.timestamp)}
          </span>
          <span className="timeline-item-source">• {item.source}</span>
        </div>
        <div className="timeline-item-label">{item.label}</div>
        {item.description && (
          <div className="timeline-item-description">{item.description}</div>
        )}
        {item.detail && (
          <div className="timeline-item-detail">{item.detail}</div>
        )}
      </div>
    </div>
  );
};

export default TimelineItem;





















