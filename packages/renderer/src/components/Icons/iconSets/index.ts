/**
 * 图标集导出
 * 统一管理所有图标集的导入和导出
 */

import { materialIconSet } from './material';
import type { IconSet } from '../IconRegistry';

/**
 * 所有可用的图标集
 */
export const availableIconSets: IconSet[] = [
  materialIconSet,
];

/**
 * 默认图标集
 */
export const defaultIconSet = materialIconSet;

export { materialIconSet };

