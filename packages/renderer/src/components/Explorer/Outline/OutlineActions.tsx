import React from 'react';
import { LuChevronsDownUp } from 'react-icons/lu';
import { Icon } from '../../Icons/Icon';

export interface OutlineActionsProps {
  onSort?: () => void;
  onFilter?: () => void;
  onCollapse?: () => void;
}

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
          title="折叠全部"
          onClick={onCollapse}
        >
          <LuChevronsDownUp size={16} />
        </div>
      )}
      {onFilter && (
        <div
          className="outline-action-button"
          title="筛选"
          onClick={onFilter}
        >
          <Icon name="filter" size={16} />
        </div>
      )}
    </div>
  );
};

export default OutlineActions;
