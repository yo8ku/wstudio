/**
 * 模板视图组件
 * 显示可插入的模板列表
 */

import React from 'react';
import './ViewStyles.scss';

export const TemplatesView: React.FC = () => {
  return (
    <div className="right-sidebar-view">
      <div className="view-empty">
        <p>暂无模板</p>
      </div>
    </div>
  );
};


