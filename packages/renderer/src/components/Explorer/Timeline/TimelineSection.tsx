import React from 'react';
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
  showResizeHandle?: boolean; // 是否显示拖动手柄（默认为 true）
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * 时间线面板
 * 显示文件的历史记录
 */
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
  const actions = [];

  if (onPin) {
    actions.push({
      id: 'pin',
      icon: '📌',
      tooltip: '固定到顶部',
      onClick: onPin,
    });
  }

  if (onRefresh) {
    actions.push({
      id: 'refresh',
      icon: '🔄',
      tooltip: '刷新',
      onClick: onRefresh,
    });
  }

  if (onSearch) {
    actions.push({
      id: 'search',
      icon: '🔍',
      tooltip: '搜索',
      onClick: onSearch,
    });
  }

  if (onFilter) {
    actions.push({
      id: 'filter',
      icon: '⋯',
      tooltip: '筛选',
      onClick: onFilter,
    });
  }

  return (
    <AccordionSection
      title="时间线"
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
          <div className="timeline-empty">暂无历史记录</div>
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

