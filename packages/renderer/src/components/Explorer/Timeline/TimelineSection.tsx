import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../Icons/Icon';
import { AccordionSection } from '../Accordion/AccordionSection';
import { TimelineItem } from './TimelineItem';
import { TimelineItem as TimelineItemType } from './types';
import './TimelineSection.scss';

export interface TimelineSectionProps {
  items: TimelineItemType[];
  selectedItem?: TimelineItemType | null;
  onItemClick: (item: TimelineItemType) => void;
  onPin?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onFilter?: () => void;
  showResizeHandle?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export const TimelineSection: React.FC<TimelineSectionProps> = ({
  items,
  selectedItem,
  onItemClick,
  onPin,
  onRefresh,
  onSearch,
  onFilter,
  showResizeHandle = true,
  onExpandedChange,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
  const actions = [];

  if (onPin) {
    actions.push({
      id: 'pin',
      icon: <Icon name="star" size={16} />,
      tooltip: translateText('timelineSection.actions.pin', 'Pin to Top'),
      onClick: onPin,
    });
  }

  if (onRefresh) {
    actions.push({
      id: 'refresh',
      icon: <Icon name="refresh" size={16} />,
      tooltip: translateText('timelineSection.actions.refresh', 'Refresh'),
      onClick: onRefresh,
    });
  }

  if (onSearch) {
    actions.push({
      id: 'search',
      icon: <Icon name="search" size={16} />,
      tooltip: translateText('timelineSection.actions.search', 'Search'),
      onClick: onSearch,
    });
  }

  if (onFilter) {
    actions.push({
      id: 'filter',
      icon: <Icon name="filter" size={16} />,
      tooltip: translateText('timelineSection.actions.filter', 'Filter'),
      onClick: onFilter,
    });
  }

  return (
    <AccordionSection
      title={translateText('timelineSection.title', 'Timeline')}
      defaultExpanded={false}
      actions={actions}
      flexGrow={true}
      resizable={true}
      defaultHeight={250}
      minHeight={100}
      maxHeight={600}
      showResizeHandle={showResizeHandle}
      onExpandChange={onExpandedChange}
    >
      <div className="timeline-section">
        {items.length === 0 ? (
          <div className="timeline-empty">{translateText('timelineSection.empty', 'No history yet')}</div>
        ) : (
          <div className="timeline-items">
            {items.map((item) => (
              <TimelineItem
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onClick={onItemClick}
              />
            ))}
          </div>
        )}
      </div>
    </AccordionSection>
  );
};

export default TimelineSection;
