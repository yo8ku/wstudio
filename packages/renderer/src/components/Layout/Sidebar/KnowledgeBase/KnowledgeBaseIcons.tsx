/**
 * 知识库图标组件模块 * 功能：提供知识库所需的所有SVG图标
 * 描述：集中管理知识库使用的图标，便于维护和复制 */

import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 折叠箭头图标（右箭头 */
export const ChevronRightIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path d="M8.59 16.59L13.17 12L8.59 7.41L10 6l6 6l-6 6l-1.41-1.41z" fill="currentColor" />
  </svg>
);

/**
 * 展开箭头图标（下箭头 */
export const ChevronDownIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z" fill="currentColor" />
  </svg>
);

/**
 * Markdown文件图标
 */
export const MarkdownIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15V9l2 2l2-2v6" />
      <path d="M14 13l2 2l2-2m-2 2V9" />
    </g>
  </svg>
);

/**
 * 文本文件图标
 */
export const TextFileIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
    </g>
  </svg>
);

/**
 * 文件夹图标 */
export const FolderIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path 
      d="M9.17 6l2 2H20v10H4V6h5.17M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" 
      fill="currentColor" 
    />
  </svg>
);

/**
 * 添加文件图标
 */
export const AddFileIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </g>
  </svg>
);

/**
 * 刷新图标
 */
export const RefreshIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </g>
  </svg>
);

/**
 * 搜索图标
 */
export const SearchIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </g>
  </svg>
);

/**
 * 添加按钮图标（加号）
 */
export const AddIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
  </svg>
);

/**
 * 搜索过滤图标（简洁的搜索图标 */
export const SearchFilterIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    xmlnsXlink="http://www.w3.org/1999/xlink"
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none">
      <path 
        d="M10 2.5a7.5 7.5 0 0 1 5.964 12.048l4.743 4.745a1 1 0 0 1-1.32 1.497l-.094-.083l-4.745-4.743A7.5 7.5 0 1 1 10 2.5zm0 2a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z" 
        fill="currentColor"
      />
    </g>
  </svg>
);

/**
 * 排序图标
 */
export const SortIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h9"></path>
      <path d="M4 12h7"></path>
      <path d="M4 18h7"></path>
      <path d="M15 15l3 3l3-3"></path>
      <path d="M18 6v12"></path>
    </g>
  </svg>
);

/**
 * 添加文件图标（带加号的文档）
 */
export const AddDocumentIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 1024 1024" 
    className={className}
    style={style}
  >
    <path 
      d="M854.6 288.6L639.4 73.4c-6-6-14.1-9.4-22.6-9.4H192c-17.7 0-32 14.3-32 32v832c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V311.3c0-8.5-3.4-16.7-9.4-22.7zM790.2 326H602V137.8L790.2 326zm1.8 562H232V136h302v216a42 42 0 0 0 42 42h216v494zM544 472c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v108H372c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8h108v108c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V644h108c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H544V472z" 
      fill="currentColor"
    />
  </svg>
);

/**
 * 清除图标（X符号 */
export const ClearIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path 
      d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59L7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12L5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z" 
      fill="currentColor"
    />
  </svg>
);

/**
 * 勾选图标（完成标记）
 */
export const CheckIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <path 
      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" 
      fill="currentColor"
    />
  </svg>
);

/**
 * 设置图标
 */
export const SettingsIcon: React.FC<IconProps> = ({ className, style }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    className={className}
    style={style}
  >
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
    </g>
  </svg>
);

/**
 * 获取文件类型对应的图标 */
export const getFileIcon = (fileType?: string): React.FC<IconProps> => {
  if (fileType === 'markdown' || fileType === 'md') {
    return MarkdownIcon;
  }
  return TextFileIcon;
};

