/**
 * Activity bar navigation.
 */

import React, { useState } from 'react';
import { Icon } from '../../Icons';
import {
  useActivityBarStore,
  ActivityBarVisibility
} from '../../../stores/activityBarStore';
import { ActivityBarContextMenu } from './ActivityBarContextMenu';
import './ActivityBar.scss';

export type ActivityBarItem =
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'knowledge-base'
  | 'ai-model'
  | 'media'
  | 'user'
  | 'settings';

interface ActivityBarProps {
  activeItem: ActivityBarItem;
  onActivityClick: (item: ActivityBarItem) => void;
}

interface ActivityItem {
  id: ActivityBarItem;
  iconName: string;
  iconSet?: string;
  title: string;
  visibilityKey?: keyof ActivityBarVisibility;
}

const ACTIVITY_BAR_ICON_SIZE = 18;

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem,
  onActivityClick,
}) => {
  const { visibility } = useActivityBarStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const topActivities: ActivityItem[] = [
    {
      id: 'explorer',
      title: '资源管理器',
      iconName: 'files-copy',
      iconSet: 'ui',
      visibilityKey: 'explorer',
    },
    {
      id: 'search',
      title: '搜索',
      iconName: 'search',
      visibilityKey: 'search',
    },
    {
      id: 'source-control',
      title: '源代码管理',
      iconName: 'source-control',
      visibilityKey: 'sourceControl',
    },
    {
      id: 'knowledge-base',
      title: '知识库',
      iconName: 'knowledge-base',
      visibilityKey: 'knowledgeBase',
    },
    {
      id: 'ai-model',
      title: 'AI 模型',
      iconName: 'ai-model',
      visibilityKey: 'aiModel',
    },
    {
      id: 'media',
      title: '素材管理',
      iconName: 'media',
      visibilityKey: 'media',
    },
  ];

  const bottomActivities: ActivityItem[] = [
    {
      id: 'user',
      title: '用户',
      iconName: 'user',
    },
    {
      id: 'settings',
      title: '设置',
      iconName: 'settings-activity',
    },
  ];

  const handleContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleCloseContextMenu = (): void => {
    setContextMenu(null);
  };

  const handleActivityKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: ActivityBarItem
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivityClick(item);
    }
  };

  const visibleTopActivities = topActivities.filter(
    activity => !activity.visibilityKey || visibility[activity.visibilityKey]
  );

  return (
    <div className="activity-bar" onContextMenu={handleContextMenu}>
      <div className="activity-bar-top">
        {visibleTopActivities.map(activity => (
          <div
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${activeItem === activity.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={activity.title}
            aria-pressed={activeItem === activity.id}
            title={activity.title}
            onKeyDown={event => handleActivityKeyDown(event, activity.id)}
          >
            {activeItem === activity.id && <div className="activity-bar-indicator" />}
            <span className="activity-bar-icon">
              <Icon iconSet={activity.iconSet} name={activity.iconName} size={ACTIVITY_BAR_ICON_SIZE} />
            </span>
          </div>
        ))}
      </div>

      <div className="activity-bar-spacer" />

      <div className="activity-bar-bottom">
        {bottomActivities.map(activity => (
          <div
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${activeItem === activity.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={activity.title}
            aria-pressed={activeItem === activity.id}
            title={activity.title}
            onKeyDown={event => handleActivityKeyDown(event, activity.id)}
          >
            {activeItem === activity.id && <div className="activity-bar-indicator" />}
            <span className="activity-bar-icon">
              <Icon iconSet={activity.iconSet} name={activity.iconName} size={ACTIVITY_BAR_ICON_SIZE} />
            </span>
          </div>
        ))}
      </div>

      {contextMenu && (
        <ActivityBarContextMenu
          visible
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
