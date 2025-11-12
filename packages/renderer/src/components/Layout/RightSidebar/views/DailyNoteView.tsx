/**
 * 每日笔记视图组件
 * 显示每日笔记相关功能
 */

import React from 'react';
import './ViewStyles.scss';

export const DailyNoteView: React.FC = () => {
  return (
    <div className="right-sidebar-view">
      <div className="view-empty">
        <p>暂无每日笔记</p>
      </div>
    </div>
  );
};


