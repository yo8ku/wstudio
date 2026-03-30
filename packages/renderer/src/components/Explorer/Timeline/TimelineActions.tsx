import React from 'react';
import { useTranslation } from 'react-i18next';

export interface TimelineActionsProps {
  onPin?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
}

export const TimelineActions: React.FC<TimelineActionsProps> = ({
  onPin,
  onRefresh,
  onSearch,
  onFilter,
}) => {
  const { t } = useTranslation();

  return (
    <div className="timeline-actions">
      {onPin && (
        <button
          className="timeline-action-button"
          title={String(t('timeline.actions.pin', { defaultValue: 'Pin to Top' }))}
          onClick={onPin}
        >
          📌
        </button>
      )}
      {onRefresh && (
        <button
          className="timeline-action-button"
          title={String(t('explorerView.workspaceMenu.general.refresh', { defaultValue: 'Refresh' }))}
          onClick={onRefresh}
        >
          🔄
        </button>
      )}
      {onSearch && (
        <button
          className="timeline-action-button"
          title={String(t('tableDesigner.queryResult.searchPlaceholder', { defaultValue: 'Search...' }))}
          onClick={onSearch}
        >
          🔍
        </button>
      )}
      {onFilter && (
        <button
          className="timeline-action-button"
          title={String(t('tableDesigner.toolbar.filter', { defaultValue: 'Filter' }))}
          onClick={onFilter}
        >
          ☰
        </button>
      )}
    </div>
  );
};

export default TimelineActions;
