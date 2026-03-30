import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <div className="outline-actions">
      {onCollapse && (
        <div
          className="outline-action-button"
          title={String(t('explorerView.headers.collapseAll', { defaultValue: 'Collapse All' }))}
          onClick={onCollapse}
        >
          <LuChevronsDownUp size={16} />
        </div>
      )}
      {onFilter && (
        <div
          className="outline-action-button"
          title={String(t('tableDesigner.toolbar.filter', { defaultValue: 'Filter' }))}
          onClick={onFilter}
        >
          <Icon name="filter" size={16} />
        </div>
      )}
    </div>
  );
};

export default OutlineActions;
