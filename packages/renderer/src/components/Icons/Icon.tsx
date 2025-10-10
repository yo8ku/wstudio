/**
 * 通用图标组件
 * 提供统一的图标使用接口
 */

import React from 'react';
import { iconRegistry } from './IconRegistry';

export interface IconProps {
  /** 图标集名称，默认为 'material' */
  iconSet?: string;
  /** 图标名称 */
  name: string;
  /** 图标大小，默认为 16 */
  size?: number;
  /** 图标颜色 */
  color?: string;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 点击事件 */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Icon 组件
 * 
 * @example
 * ```tsx
 * // 使用默认图标集
 * <Icon name="folder" size={20} color="#dcb67a" />
 * 
 * // 指定图标集
 * <Icon iconSet="material" name="folder-open" size={24} />
 * 
 * // 使用别名
 * <Icon name="file-js" size={16} />
 * ```
 */
export const Icon: React.FC<IconProps> = ({
  iconSet = 'material',
  name,
  size = 16,
  color,
  className,
  style,
  onClick,
}) => {
  // 尝试通过别名获取图标
  let IconComponent = iconRegistry.getIconByAlias(name);
  
  // 如果别名不存在，则通过图标集和名称获取
  if (!IconComponent) {
    IconComponent = iconRegistry.getIcon(iconSet, name);
  }

  // 如果图标不存在，使用默认图标
  if (!IconComponent) {
    IconComponent = iconRegistry.getIcon('material', 'unknown');
  }

  // 如果连默认图标都不存在，返回 null
  if (!IconComponent) {
    return null;
  }

  const iconStyle: React.CSSProperties = {
    width: size,
    height: size,
    color: color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };

  return (
    <span 
      className={className} 
      style={iconStyle}
      onClick={onClick}
    >
      <IconComponent />
    </span>
  );
};

export default Icon;

