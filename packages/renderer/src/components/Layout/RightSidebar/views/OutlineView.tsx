/**
 * 章节大纲视图组件
 * 显示当前文档的章节结构
 */

import React from 'react';
import './ViewStyles.scss';

export const OutlineView: React.FC = () => {
  return (
    <div className="right-sidebar-view">
      <div className="view-empty">
        <p>暂无大纲</p>
      </div>
    </div>
  );
};


