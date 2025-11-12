/**
 * 右侧活动栏组件 * 包含标签、反向链接、章节预览、标注、链接、模板、每日笔记等功能
 */

import React from 'react';
import { Icon } from '../../Icons';
import { useRightSidebarStore, type RightSidebarView } from '../../../stores/rightSidebarStore';
import './RightActivityBar.scss';

interface ActivityItem {
  id: RightSidebarView;
  iconName: string;
  title: string;
}

export const RightActivityBar: React.FC = () => {
  const { activeView, isVisible, toggle } = useRightSidebarStore();

  const activities: ActivityItem[] = [
    {
      id: 'important-files',
      title: '重要文件',
      iconName: 'important-files',
    },
    {
      id: 'tags',
      title: '标签',
      iconName: 'tags',
    },
    {
      id: 'backlinks',
      title: '反向链接',
      iconName: 'backlinks',
    },
    {
      id: 'outline',
      title: '章节大纲',
      iconName: 'outline',
    },
    {
      id: 'annotations',
      title: '标注',
      iconName: 'annotations',
    },
    {
      id: 'links',
      title: '链接',
      iconName: 'links',
    },
    {
      id: 'templates',
      title: '插入模板',
      iconName: 'templates',
    },
    {
      id: 'daily-note',
      title: '打开/创建今天的笔记',
      iconName: 'daily-note',
    },
  ];

  return (
    <div className="right-activity-bar">
      {activities.map((activity) => (
        <button
          key={activity.id}
          onClick={() => toggle(activity.id)}
          className={`right-activity-bar-item ${
            activeView === activity.id && isVisible ? 'active' : ''
          }`}
          title={activity.title}
        >
          <span className="right-activity-bar-icon">
            <Icon name={activity.iconName} size={18} />
          </span>
        </button>
      ))}
    </div>
  );
};

