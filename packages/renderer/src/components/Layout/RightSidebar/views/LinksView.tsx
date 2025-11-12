/**
 * 链接视图组件
 * 显示文档中的所有链接
 */

import React from 'react';
import './ViewStyles.scss';

export const LinksView: React.FC = () => {
  return (
    <div className="right-sidebar-view">
      <div className="view-empty">
        <p>暂无链接</p>
      </div>
    </div>
  );
};


