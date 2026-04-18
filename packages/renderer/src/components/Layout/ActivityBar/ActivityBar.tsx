/**
 * Activity bar navigation.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VscChevronDown, VscChevronUp, VscFiles } from 'react-icons/vsc';
import { PluginUiIcon } from '../../Icons';
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
  readonly iconName?: string | null;
  readonly iconSvg?: string | null;
  readonly title: string;
  readonly onClick?: () => void;
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
  readonly iconName?: string | null;
  readonly iconPath?: string | null;
  readonly iconSvg?: string | null;
  readonly iconSet?: string;
  readonly title: string;
  readonly onClick?: () => void;
  readonly visibilityKey?: keyof ActivityBarVisibility;
}

const ACTIVITY_BAR_ICON_SIZE = 18;

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem,
  onActivityClick,
  additionalItems = [],
}) => {
  const { t } = useTranslation();
  const { visibility } = useActivityBarStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const pluginScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [pluginOverflowState, setPluginOverflowState] = React.useState({
    hasOverflow: false,
    canScrollBackward: false,
    canScrollForward: false,
  });
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const pluginSectionTitle = translateText('sidebar.titles.pluginEntries', '插件入口');
  const pluginScrollBackwardLabel = translateText('sidebar.actions.scrollPluginEntriesUp', '向上滚动插件入口');
  const pluginScrollForwardLabel = translateText('sidebar.actions.scrollPluginEntriesDown', '向下滚动插件入口');

  const topActivities: readonly ActivityItem[] = [
    {
      id: 'explorer',
      title: translateText('sidebar.titles.explorer', 'Explorer'),
      iconName: 'files-copy',
      iconSet: 'ui',
      visibilityKey: 'explorer',
    },
    {
      id: 'search',
      title: translateText('sidebar.titles.search', 'Search'),
      iconName: 'search',
      visibilityKey: 'search',
    },
    {
      id: 'knowledge-base',
      title: translateText('sidebar.titles.knowledgeBase', 'Knowledge Base'),
      iconName: 'knowledge-base',
      visibilityKey: 'knowledgeBase',
    },
    {
      id: 'ai-model',
      title: translateText('sidebar.titles.aiModel', 'AI Models'),
      iconName: 'ai-model',
      visibilityKey: 'aiModel',
    },
    {
      id: 'media',
      title: translateText('sidebar.titles.media', 'Media Library'),
      iconName: 'media',
      visibilityKey: 'media',
    },
    {
      id: 'extensions',
      title: translateText('sidebar.titles.extensions', 'Extensions'),
      iconName: 'extensions-manager',
      visibilityKey: 'extensions',
    },
  ];

  const bottomActivities: readonly ActivityItem[] = [
    {
      id: 'user',
      title: translateText('sidebar.titles.user', 'User'),
      iconName: 'circle-user-round',
    },
    {
      id: 'settings',
      title: translateText('sidebar.titles.settings', 'Settings'),
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
    item: ActivityItem,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (item.onClick) {
        item.onClick();
        return;
      }

      onActivityClick(item.id);
    }
  };

  const visibleTopActivities = topActivities.filter(
    activity => !activity.visibilityKey || visibility[activity.visibilityKey],
  );
  const renderedTopActivities: readonly ActivityItem[] = visibleTopActivities;
  const pluginActivities = React.useMemo<readonly ActivityItem[]>(() => (
    additionalItems.map((item) => ({
      id: item.id,
      iconName: item.iconName ?? null,
      iconPath: item.iconPath,
      iconSvg: item.iconSvg ?? null,
      title: item.title,
      onClick: item.onClick,
    }))
  ), [additionalItems]);

  const updatePluginOverflowState = React.useCallback((): void => {
    const pluginScrollElement = pluginScrollRef.current;

    if (pluginScrollElement === null) {
      setPluginOverflowState({
        hasOverflow: false,
        canScrollBackward: false,
        canScrollForward: false,
      });
      return;
    }

    const hasOverflow = pluginScrollElement.scrollHeight > pluginScrollElement.clientHeight + 1;
    const canScrollBackward = pluginScrollElement.scrollTop > 1;
    const canScrollForward = (
      pluginScrollElement.scrollTop + pluginScrollElement.clientHeight
    ) < (pluginScrollElement.scrollHeight - 1);

    setPluginOverflowState((currentState) => {
      if (
        currentState.hasOverflow === hasOverflow
        && currentState.canScrollBackward === canScrollBackward
        && currentState.canScrollForward === canScrollForward
      ) {
        return currentState;
      }

      return {
        hasOverflow,
        canScrollBackward,
        canScrollForward,
      };
    });
  }, []);

  React.useEffect(() => {
    const pluginScrollElement = pluginScrollRef.current;

    if (pluginActivities.length === 0 || pluginScrollElement === null) {
      setPluginOverflowState({
        hasOverflow: false,
        canScrollBackward: false,
        canScrollForward: false,
      });
      return undefined;
    }

    updatePluginOverflowState();

    const handleScroll = (): void => {
      updatePluginOverflowState();
    };

    const resizeObserver = new ResizeObserver(() => {
      updatePluginOverflowState();
    });

    pluginScrollElement.addEventListener('scroll', handleScroll);
    resizeObserver.observe(pluginScrollElement);

    return () => {
      pluginScrollElement.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [pluginActivities.length, updatePluginOverflowState]);

  React.useEffect(() => {
    updatePluginOverflowState();
  }, [updatePluginOverflowState, pluginActivities.length]);

  const scrollPluginActivities = React.useCallback((direction: 'backward' | 'forward'): void => {
    const pluginScrollElement = pluginScrollRef.current;

    if (pluginScrollElement === null) {
      return;
    }

    const scrollDistance = Math.max(96, Math.floor(pluginScrollElement.clientHeight * 0.6));

    pluginScrollElement.scrollBy({
      top: direction === 'forward' ? scrollDistance : -scrollDistance,
      behavior: 'smooth',
    });
  }, []);

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

    if (activity.iconName) {
      return (
        <PluginUiIcon
          iconSet={activity.iconSet}
          name={activity.iconName}
          svgContent={activity.iconSvg}
          size={ACTIVITY_BAR_ICON_SIZE}
        />
      );
    }

    return (
      <PluginUiIcon
        iconSet={activity.iconSet}
        name={activity.iconName ?? 'extensions'}
        svgContent={activity.iconSvg}
        size={ACTIVITY_BAR_ICON_SIZE}
      />
    );
  };

  const renderActivityItem = (activity: ActivityItem): React.ReactElement => (
    <div
      key={activity.id}
      onClick={() => {
        if (activity.onClick) {
          activity.onClick();
          return;
        }

        onActivityClick(activity.id);
      }}
      className={`activity-bar-item ${activity.onClick === undefined && activeItem === activity.id ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={activity.title}
      aria-pressed={activity.onClick === undefined && activeItem === activity.id}
      title={activity.title}
      onKeyDown={event => handleActivityKeyDown(event, activity)}
    >
      <span className="activity-bar-icon">
        {renderActivityIcon(activity)}
      </span>
    </div>
  );

  return (
    <div className="activity-bar" onContextMenu={handleContextMenu}>
      <div className="activity-bar-main">
        <div className="activity-bar-top">
          {renderedTopActivities.map(renderActivityItem)}
        </div>

        {pluginActivities.length > 0 ? (
          <div
            className={`activity-bar-plugin-group ${pluginOverflowState.hasOverflow ? 'activity-bar-plugin-group--overflowing' : ''}`}
            title={pluginSectionTitle}
            aria-label={pluginSectionTitle}
          >
            {pluginOverflowState.hasOverflow && (
              <button
                type="button"
                className="activity-bar-plugin-scroll-button"
                onClick={() => scrollPluginActivities('backward')}
                disabled={!pluginOverflowState.canScrollBackward}
                aria-label={pluginScrollBackwardLabel}
                title={pluginScrollBackwardLabel}
              >
                <VscChevronUp size={14} />
              </button>
            )}

            <div
              ref={pluginScrollRef}
              className="activity-bar-plugin-scroll"
            >
              {pluginActivities.map(renderActivityItem)}
            </div>

            {pluginOverflowState.hasOverflow && (
              <button
                type="button"
                className="activity-bar-plugin-scroll-button"
                onClick={() => scrollPluginActivities('forward')}
                disabled={!pluginOverflowState.canScrollForward}
                aria-label={pluginScrollForwardLabel}
                title={pluginScrollForwardLabel}
              >
                <VscChevronDown size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="activity-bar-spacer" />
        )}
      </div>

      <div className="activity-bar-bottom">
        {bottomActivities.map(renderActivityItem)}
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
