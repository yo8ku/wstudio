/**
 * 活动栏组件
 * VSCode 风格的左侧活动栏
 */

import React from 'react';
import { ActivityBarItem } from './MainLayout';
import './ActivityBar.scss';

interface ActivityBarProps {
  activeItem: ActivityBarItem;
  onActivityClick: (item: ActivityBarItem) => void;
}

interface ActivityItem {
  id: ActivityBarItem;
  icon: React.ReactNode;
  title: string;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeItem, onActivityClick }) => {
  // 上部活动项
  const topActivities: ActivityItem[] = [
    {
      id: 'explorer',
      title: '资源管理器',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      )
    },
    {
      id: 'search',
      title: '搜索',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    },
    {
      id: 'source-control',
      title: '源代码管理',
      icon: (
        <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.5 3a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3zm.547 3.94A2.5 2.5 0 1 0 6 6.95v6.1a2.5 2.5 0 1 0 1 0V8.852A5.78 5.78 0 0 0 8.312 9.87c1.126.652 2.505 1.038 3.735 1.115a2.5 2.5 0 1 0 .006-1.001c-1.066-.077-2.27-.417-3.24-.98c-.95-.55-1.594-1.257-1.766-2.064zM13 10.5a1.5 1.5 0 1 1 3 0a1.5 1.5 0 0 1-3 0zM6.5 14a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3z" stroke="currentColor" strokeWidth="0.8" />
        </svg>
      )
    },
    {
      id: 'extensions',
      title: '扩展',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    },
    {
      id: 'knowledge-base',
      title: '知识库',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    {
      id: 'ai-model',
      title: 'AI 模型',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    }
  ];

  // 底部活动项
  const bottomActivities: ActivityItem[] = [
    {
      id: 'user',
      title: '用户',
      icon: (
        <svg width="24" height="24" viewBox="0 0 496 512" fill="currentColor">
          <path d="M248 104c-53 0-96 43-96 96s43 96 96 96s96-43 96-96s-43-96-96-96zm0 144c-26.5 0-48-21.5-48-48s21.5-48 48-48s48 21.5 48 48s-21.5 48-48 48zm0-240C111 8 0 119 0 256s111 248 248 248s248-111 248-248S385 8 248 8zm0 448c-49.7 0-95.1-18.3-130.1-48.4c14.9-23 40.4-38.6 69.6-39.5c20.8 6.4 40.6 9.6 60.5 9.6s39.7-3.1 60.5-9.6c29.2 1 54.7 16.5 69.6 39.5c-35 30.1-80.4 48.4-130.1 48.4zm162.7-84.1c-24.4-31.4-62.1-51.9-105.1-51.9c-10.2 0-26 9.6-57.6 9.6c-31.5 0-47.4-9.6-57.6-9.6c-42.9 0-80.6 20.5-105.1 51.9C61.9 339.2 48 299.2 48 256c0-110.3 89.7-200 200-200s200 89.7 200 200c0 43.2-13.9 83.2-37.3 115.9z" />
        </svg>
      )
    },
    {
      id: 'settings',
      title: '设置',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="activity-bar">
      {/* 上部活动项 */}
      <div className="activity-bar-top">
        {topActivities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${activeItem === activity.id ? 'active' : ''}`}
            title={activity.title}
          >
            {activeItem === activity.id && (
              <div className="activity-bar-indicator" />
            )}
            <span className="activity-bar-icon">
              {activity.icon}
            </span>
          </button>
        ))}
      </div>

      {/* 间隔区域 */}
      <div className="activity-bar-spacer"></div>

      {/* 底部活动项 */}
      <div className="activity-bar-bottom">
        {bottomActivities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => onActivityClick(activity.id)}
            className={`activity-bar-item ${activeItem === activity.id ? 'active' : ''}`}
            title={activity.title}
          >
            {activeItem === activity.id && (
              <div className="activity-bar-indicator" />
            )}
            <span className="activity-bar-icon">
              {activity.icon}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
