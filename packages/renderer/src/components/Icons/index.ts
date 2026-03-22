/**
 * Icon system public exports.
 */

export { Icon } from './Icon';
export type { IconProps } from './Icon';

export { iconRegistry } from './IconRegistry';
export type { IconComponent, IconSet } from './IconRegistry';

export { initIconSystem, isIconSystemInitialized } from './initIcons';

export { availableIconSets, defaultIconSet, uiIconSet } from './iconSets';

export { AIProviderIcon, AIProviderIconFromModel, getProviderFromModel } from './AIProviderIcon';

export {
  NotionIcon,
  YuqueIcon,
  JoplinIcon,
  ObsidianIcon,
  SiyuanIcon,
  FeishuIcon,
  KouziIcon,
} from './thirdParty/platforms';
