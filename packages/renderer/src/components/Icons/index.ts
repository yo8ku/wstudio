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

// 导出图标
export { availableIconSets, defaultIconSet, materialIconSet } from './iconSets';

// 导出 AI 提供商图标组件
export { AIProviderIcon, AIProviderIconFromModel, getProviderFromModel } from './AIProviderIcon';

// 导出第三方平台图标组件
export { 
  NotionIcon, 
  YuqueIcon, 
  JoplinIcon, 
  ObsidianIcon, 
  SiyuanIcon, 
  FeishuIcon, 
  KouziIcon 
} from './thirdParty/platforms';

