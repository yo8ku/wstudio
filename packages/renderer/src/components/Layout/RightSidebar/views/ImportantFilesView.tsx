/**
 * 重要文件视图
 * 显示用户标记的重要文件列表
 */

import React from 'react';
import { Icon } from '../../../Icons';
import './ViewStyles.scss';

export const ImportantFilesView: React.FC = () => {
  // TODO: 实现重要文件获取逻辑
  const importantFiles: string[] = [];

  if (importantFiles.length === 0) {
    return (
      <div className="right-sidebar-empty">
        <div className="right-sidebar-empty-icon">
          <Icon name="important-files" size={48} />
        </div>
        <div className="right-sidebar-empty-text">
          暂无重要文件
        </div>
      </div>
    );
  }

  return (
    <div className="important-files-view">
      {importantFiles.map((file, index) => (
        <div key={index} className="important-file-item">
          <Icon name="important-files" size={16} />
          <span className="file-name">{file}</span>
        </div>
      ))}
    </div>
  );
};




































































































