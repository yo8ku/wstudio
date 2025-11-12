import React from 'react';

export interface OutlineActionsProps {
  onSort?: () => void;
  onFilter?: () => void;
  onCollapse?: () => void;
}

/**
 * 大纲工具栏
 * 提供排序、筛选、折叠等操作
 */
export const OutlineActions: React.FC<OutlineActionsProps> = ({
  onSort,
  onFilter,
  onCollapse,
}) => {
  return (
    <div className="outline-actions">
      {onCollapse && (
        <div
          className="outline-action-button"
          title="折叠所有"
          onClick={onCollapse}
        >
          <i className="codicon codicon-collapse-all" />
        </div>
      )}
      {onFilter && (
        <div
          className="outline-action-button"
          title="筛选"
          onClick={onFilter}
        >
          <i className="codicon codicon-filter" />
        </div>
      )}
    </div>
  );
};

export default OutlineActions;
