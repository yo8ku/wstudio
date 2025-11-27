import React from 'react';

export interface TimelineActionsProps {
  onPin?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
}

/**
 * 时间线工具栏
 * 提供固定、刷新、搜索、筛选等操作
 */
export const TimelineActions: React.FC<TimelineActionsProps> = ({
  onPin,
  onRefresh,
  onSearch,
  onFilter,
}) => {
  return (
    <div className="timeline-actions">
      {onPin && (
        <button
          className="timeline-action-button"
          title="固定到顶部"
          onClick={onPin}
        >
          📌
        </button>
      )}
      {onRefresh && (
        <button
          className="timeline-action-button"
          title="刷新"
          onClick={onRefresh}
        >
          🔄
        </button>
      )}
      {onSearch && (
        <button
          className="timeline-action-button"
          title="搜索"
          onClick={onSearch}
        >
          🔍
        </button>
      )}
      {onFilter && (
        <button
          className="timeline-action-button"
          title="筛选"
          onClick={onFilter}
        >
          ⋯
        </button>
      )}
    </div>
  );
};

export default TimelineActions;





















