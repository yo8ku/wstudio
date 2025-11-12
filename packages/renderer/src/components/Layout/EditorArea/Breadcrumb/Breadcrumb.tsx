/**
 * 面包屑导航组件
 */

import React, { useMemo } from 'react';
import './Breadcrumb.scss';

interface BreadcrumbProps {
  path: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ path }) => {
  // 获取相对路径（去掉工作区路径前缀）
  const relativePath = useMemo(() => {
    // 尝试从路径中提取工作区相对路径
    const workspaceMarkers = ['WISEAI', 'note-studio', 'src'];
    
    for (const marker of workspaceMarkers) {
      const index = path.indexOf(marker);
      if (index !== -1) {
        // 找到标记，返回从标记开始的路径
        return path.substring(index);
      }
    }
    
    // 如果没有找到标记，尝试只保留最后几个路径段
    const segments = path.split(/[/\\]/).filter(Boolean);
    if (segments.length > 3) {
      return segments.slice(-3).join('/');
    }
    
    return path;
  }, [path]);

  // 同时支持正斜杠和反斜杠
  const segments = relativePath.split(/[/\\]/).filter(Boolean);

  // 点击面包屑项，定位到文件树中的文档
  const handleClick = () => {
    // 派发自定义事件，让文件树滚动到该文件
    window.dispatchEvent(new CustomEvent('file-tree-reveal', {
      detail: { path }
    }));
  };

  // 如果路径段太多，只显示前面和最后的部分
  const displaySegments = useMemo(() => {
    if (segments.length <= 4) {
      return segments;
    }
    // 显示前几个和最后一个，中间用 ... 表示
    return [
      ...segments.slice(0, 2),
      '...',
      segments[segments.length - 1]
    ];
  }, [segments]);

  return (
    <div className="breadcrumb">
      {displaySegments.map((segment, index) => (
        <React.Fragment key={index}>
          {segment === '...' ? (
            <span className="breadcrumb-ellipsis">...</span>
          ) : (
            <button 
              onClick={handleClick}
              title={`${path} - 在文件树中定位`}
            >
              {segment}
            </button>
          )}
          {index < displaySegments.length - 1 && (
            <svg className="breadcrumb-separator" fill="currentColor" viewBox="0 0 20 20" width="10" height="10">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
