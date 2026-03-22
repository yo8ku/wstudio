/**
 * Activity bar navigation.
 */

import React, { useState } from 'react';
import { VscFiles } from 'react-icons/vsc';
import { Icon } from '../../Icons';
import { ThemedMaskIcon } from '../../Icons/ThemedMaskIcon';
import {
  useActivityBarStore,
  type ActivityBarVisibility,
} from '../../../stores/activityBarStore';
import { ActivityBarContextMenu } from './ActivityBarContextMenu';
import './ActivityBar.scss';

export const BUILTIN_ACTIVITY_BAR_ITEMS = [
  'explorer',
  'search',
  'knowledge-base',
  'ai-model',
  'media',
  'extensions',
  'user',
  'settings',
] as const;

export type BuiltinActivityBarItem = (typeof BUILTIN_ACTIVITY_BAR_ITEMS)[number];
export type PluginActivityBarItem = `plugin-view:${string}`;
export type ActivityBarItem = BuiltinActivityBarItem | PluginActivityBarItem;

export interface AdditionalActivityBarItem {
  readonly id: PluginActivityBarItem;
  readonly iconPath: string | null;
  readonly title: string;
}

export function toPluginActivityBarItem(containerKey: string): PluginActivityBarItem {
  return `plugin-view:${containerKey}`;
}

export function isPluginActivityBarItem(value: string): value is PluginActivityBarItem {
  return value.startsWith('plugin-view:');
}

export function getPluginContainerKeyFromActivityBarItem(item: PluginActivityBarItem): string {
  return item.slice('plugin-view:'.length);
}

interface ActivityBarProps {
  readonly activeItem: ActivityBarItem;
  readonly onActivityClick: (item: ActivityBarItem) => void;
  readonly additionalItems?: readonly AdditionalActivityBarItem[];
}

interface ActivityItem {
  readonly id: ActivityBarItem;
  readonly iconName?: string;
  readonly iconPath?: string | null;
  readonly iconSet?: string;
  readonly title: string;
  readonly visibilityKey?: keyof ActivityBarVisibility;
}

const ACTIVITY_BAR_ICON_SIZE = 18;

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem,
  onActivityClick,
  additionalItems = [],
}) => {
  const { visibility } = useActivityBarStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const topActivities: readonly ActivityItem[] = [
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
    {
      id: 'extensions',
      title: '扩展插件',
      iconName: 'extensions-manager',
      visibilityKey: 'extensions',
    },
  ];

  const bottomActivities: readonly ActivityItem[] = [
    {
      id: 'user',
      title: '用户',
      iconName: 'circle-user-round',
    },
    {
      id: 'settings',
      title: '设置',
      iconName: 'bolt',
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
    item: ActivityBarItem,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivityClick(item);
    }
  };

  const visibleTopActivities = topActivities.filter(
    activity => !activity.visibilityKey || visibility[activity.visibilityKey],
  );
  const renderedTopActivities = [...visibleTopActivities, ...additionalItems];

  const renderActivityIcon = (activity: ActivityItem): React.ReactNode => {
    if (activity.id === 'explorer') {
      return (
        <VscFiles
          size={ACTIVITY_BAR_ICON_SIZE}
          className="activity-bar-plugin-icon"
        />
      );
    }

    if (activity.iconPath) {
      return (
        <ThemedMaskIcon
          className="activity-bar-plugin-icon"
          source={activity.iconPath}
          size={ACTIVITY_BAR_ICON_SIZE}
        />
      );
    }

    return (
      <Icon
        iconSet={activity.iconSet}
        name={activity.iconName ?? 'extensions'}
        size={ACTIVITY_BAR_ICON_SIZE}
      />
    );
  };

  return (
    <div className="activity-bar" onContextMenu={handleContextMenu}>
      <div className="activity-bar-top">
        {renderedTopActivities.map(activity => (
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
            <span className="activity-bar-icon">
              {renderActivityIcon(activity)}
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
            <span className="activity-bar-icon">
              {renderActivityIcon(activity)}
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
