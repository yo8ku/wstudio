/**
 * 标注视图组件
 * 显示文档中的标注信息
 */

import React from 'react';
import './ViewStyles.scss';

export const AnnotationsView: React.FC = () => {
  return (
    <div className="right-sidebar-view">
      <div className="view-empty">
        <p>暂无标注</p>
      </div>
    </div>
  );
};


