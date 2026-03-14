/**
 * 活动栏组件 *  左侧活动栏
 */

import React, { useState } from "react";
import { Icon } from "../../Icons";
import { useActivityBarStore, ActivityBarVisibility } from "../../../stores/activityBarStore";
import { ActivityBarContextMenu } from "./ActivityBarContextMenu";
import "./ActivityBar.scss";

export type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'extensions' | 'knowledge-base' | 'ai-model' | 'media' | 'user' | 'settings';

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

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem,
  onActivityClick,
}) => {
  const { visibility } = useActivityBarStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // 上部活动项
  const topActivities: ActivityItem[] = [
    {
      id: "explorer",
      title: "资源管理器",
      iconName: "files-copy",
      iconSet: "ui",
      visibilityKey: "explorer",
    },
    {
      id: "search",
      title: "搜索",
      iconName: "search",
      visibilityKey: "search",
    },
    {
      id: "source-control",
      title: "源代码管理",
      iconName: "source-control",
      visibilityKey: "sourceControl",
    },
    {
      id: "extensions",
      title: "扩展",
      iconName: "extensions",
      visibilityKey: "extensions",
    },
    {
      id: "knowledge-base",
      title: "知识库",
      iconName: "knowledge-base",
      visibilityKey: "knowledgeBase",
    },
    {
      id: "ai-model",
      title: "AI 模型",
      iconName: "ai-model",
      visibilityKey: "aiModel",
    },
    {
      id: "media",
      title: "素材管理",
      iconName: "media",
      visibilityKey: "media",
    },
  ];

  // 底部活动项
  const bottomActivities: ActivityItem[] = [
    {
      id: "user",
      title: "用户",
      iconName: "user",
    },
    {
      id: "settings",
      title: "设置",
      iconName: "settings-activity",
    },
  ];

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleActivityKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: ActivityBarItem
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivityClick(item);
    }
  };

  // 过滤出可见的活动项
  const visibleTopActivities = topActivities.filter(
    (activity) => !activity.visibilityKey || visibility[activity.visibilityKey]
  );

  return (
    <div className="activity-bar" onContextMenu={handleContextMenu}>
      {/* 上部活动项 */}
      <div className="activity-bar-top">
        {visibleTopActivities.map((activity) => (
          <div
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${
              activeItem === activity.id ? "active" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-label={activity.title}
            aria-pressed={activeItem === activity.id}
            title={activity.title}
            onKeyDown={(event) => handleActivityKeyDown(event, activity.id)}
          >
            {activeItem === activity.id && (
              <div className="activity-bar-indicator" />
            )}
            <span className="activity-bar-icon">
              <Icon iconSet={activity.iconSet} name={activity.iconName} size={18} />
            </span>
          </div>
        ))}
      </div>

      {/* 间隔区域 */}
      <div className="activity-bar-spacer"></div>

      {/* 底部活动项 */}
      <div className="activity-bar-bottom">
        {bottomActivities.map((activity) => (
          <div
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${
              activeItem === activity.id ? "active" : ""
            }`}
            role="button"
            tabIndex={0}
            aria-label={activity.title}
            aria-pressed={activeItem === activity.id}
            title={activity.title}
            onKeyDown={(event) => handleActivityKeyDown(event, activity.id)}
          >
            {activeItem === activity.id && (
              <div className="activity-bar-indicator" />
            )}
            <span className="activity-bar-icon">
              <Icon iconSet={activity.iconSet} name={activity.iconName} size={24} />
            </span>
          </div>
        ))}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ActivityBarContextMenu
          visible={true}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};
