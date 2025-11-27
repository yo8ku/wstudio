/**
 * 扩展详情组件
 */

import React from 'react';

interface ExtensionDetailProps {
  extensionId: string;
}

export const ExtensionDetail: React.FC<ExtensionDetailProps> = ({ extensionId }) => {
  return (
    <div className="extension-detail">
      <h2>扩展详情</h2>
      <p>扩展 ID: {extensionId}</p>
    </div>
  );
};



