/**
 * 图标系统统一导出
 */

// 导出核心组件和函数
export { Icon } from './Icon';
export type { IconProps } from './Icon';

// 导出注册中心
export { iconRegistry } from './IconRegistry';
export type { IconComponent, IconSet } from './IconRegistry';

// 导出初始化函数
export { initIconSystem, isIconSystemInitialized } from './initIcons';

// 导出图标集
export { availableIconSets, defaultIconSet, materialIconSet } from './iconSets';

