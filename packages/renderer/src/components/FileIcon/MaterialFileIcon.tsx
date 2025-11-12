/**
 * Material 文件图标组件
 * 基于 MaterialFileIcons 工具类的 React 封装
 */

import React, { useMemo, useState, useEffect } from 'react';
import { MaterialFileIcons } from '../../utils/MaterialFileIcons';

export interface MaterialFileIconProps {
  /** 文件*/
  fileName?: string;
  /** 文件夹名 */
  folderName?: string;
  /** 是否为文件夹 */
  isFolder?: boolean;
  /** 文件夹是否展开 */
  isOpen?: boolean;
  /** 编程语言（可选） */
  language?: string;
  /** 图标大小（像素） */
  size?: number;
  /** 自定义类型*/
  className?: string;
  /** 自定义样式*/
  style?: React.CSSProperties;
}

/**
 * Material 文件图标组件
 * 
 * 使用示例
 * ```tsx
 * // 文件图标
 * <MaterialFileIcon fileName="App.tsx" size={16} />
 * 
 * // 文件夹图标
 * <MaterialFileIcon folderName="components" isFolder isOpen size={16} />
 * 
 * // 指定语言
 * <MaterialFileIcon fileName="main" language="python" size={16} />
 * ```
 */
export const MaterialFileIcon: React.FC<MaterialFileIconProps> = ({
  fileName,
  folderName,
  isFolder = false,
  isOpen = false,
  language,
  size = 16,
  className = '',
  style = {}
}) => {
  const name = isFolder ? (folderName || '') : (fileName || '');
  
  // 获取图标路径
  const iconPath = useMemo(() => {
    return MaterialFileIcons.getIconPath({
      fileName: name,
      isFolder,
      isOpen,
      language
    });
  }, [name, isFolder, isOpen, language]);
  
  // 通过 Electron IPC 加载 SVG 内容
  const [iconUrl, setIconUrl] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  
  useEffect(() => {
    let mounted = true;
    
    const loadIcon = async () => {
      try {
        const content = await window.electronAPI?.fs?.readFile?.(iconPath, 'utf-8');
        
        if (mounted && content) {
          // SVG 内容转换data URL
          const blob = new Blob([content], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          setIconUrl(url);
          setError(false);
        } else if (mounted) {
          setError(true);
        }
      } catch (err) {
        console.error('[MaterialFileIcon] 加载图标失败:', iconPath, err);
        if (mounted) {
          setError(true);
        }
      }
    };
    
    loadIcon();
    
    return () => {
      mounted = false;
      if (iconUrl) {
        URL.revokeObjectURL(iconUrl);
      }
    };
  }, [iconPath]);
  
  // 如果加载失败，显示默认占位符
  if (error || !iconUrl) {
    return (
      <span
        className={`file-icon-placeholder ${className}`}
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          backgroundColor: 'var(--ws-icon-foreground, currentColor)',
          opacity: 0.2,
          borderRadius: '2px',
          ...style
        }}
        title={name}
      />
    );
  }
  
  return (
    <img
      src={iconUrl}
      alt={name}
      width={size}
      height={size}
      className={`file-icon ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style
      }}
      title={name}
    />
  );
};

/**
 * 导出默认组件
 */
export default MaterialFileIcon;
















