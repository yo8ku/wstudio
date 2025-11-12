/**
 * 图标集导入
 * 统一管理所有图标集的导入和导出
 */

import { materialIconSet } from './material';
import { uiIconSet } from './ui';
import type { IconSet } from '../IconRegistry';

/**
 * 所有可用的图标
 */
export const availableIconSets: IconSet[] = [
  materialIconSet,
  uiIconSet,
];

/**
 * 默认图标
 */
export const defaultIconSet = materialIconSet;

export { materialIconSet, uiIconSet };

