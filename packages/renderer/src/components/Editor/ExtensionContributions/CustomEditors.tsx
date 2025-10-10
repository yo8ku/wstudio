/**
 * 自定义编辑器组件
 */

import React from 'react';

interface CustomEditorsProps {
  editorId: string;
  resource: string;
}

export const CustomEditors: React.FC<CustomEditorsProps> = ({ editorId, resource }) => {
  return (
    <div className="custom-editor">
      <p>自定义编辑器: {editorId}</p>
      <p>资源: {resource}</p>
    </div>
  );
};



