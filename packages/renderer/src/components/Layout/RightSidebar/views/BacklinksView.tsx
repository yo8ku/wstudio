/**
 * 反向链接视图
 * 显示链接到当前文档的其他文档
 */

import React from 'react';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

export const BacklinksView: React.FC = () => {
  // TODO: 实现反向链接获取逻辑
  const backlinks: Array<{ title: string; path: string }> = [];

  if (backlinks.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="backlinks" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无反向链接
        </div>
      </div>
    );
  }

  return (
    <div className="backlinks-view">
      {backlinks.map((link, index) => (
        <div key={index} className="backlink-item">
          <Icon name="backlinks" size={16} />
          <span className="backlink-title">{link.title}</span>
        </div>
      ))}
    </div>
  );
};









