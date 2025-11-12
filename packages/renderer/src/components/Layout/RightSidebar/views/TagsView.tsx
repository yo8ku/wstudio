/**
 * 标签视图
 * 显示当前文档的标
 */

import React from 'react';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

export const TagsView: React.FC = () => {
  // TODO: 实现标签获取逻辑
  const tags: string[] = [];

  if (tags.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="tags" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          当前文档暂无标签
        </div>
      </div>
    );
  }

  return (
    <div className="tags-view">
      {tags.map((tag, index) => (
        <div key={index} className="tag-item">
          <Icon name="tags" size={16} />
          <span className="tag-name">{tag}</span>
        </div>
      ))}
    </div>
  );
};









