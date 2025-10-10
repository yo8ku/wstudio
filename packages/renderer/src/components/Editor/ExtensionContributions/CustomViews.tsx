/**
 * 自定义视图组件
 */

import React from 'react';

interface CustomViewsProps {
  viewId: string;
}

export const CustomViews: React.FC<CustomViewsProps> = ({ viewId }) => {
  return (
    <div className="custom-view">
      <p>自定义视图: {viewId}</p>
    </div>
  );
};



