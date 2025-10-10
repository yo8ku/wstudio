/**
 * 图标注册中心 - 模块化图标管理系统
 * 支持动态注册和扩展图标集
 */

import type { ComponentType } from 'react';

export type IconComponent = ComponentType<{ style?: React.CSSProperties; className?: string }>;

export interface IconSet {
  name: string;
  icons: Record<string, IconComponent>;
}

class IconRegistry {
  private iconSets: Map<string, IconSet> = new Map();
  private aliases: Map<string, string> = new Map();

  /**
   * 注册图标集
   * @param iconSet 图标集对象
   */
  registerIconSet(iconSet: IconSet): void {
    if (this.iconSets.has(iconSet.name)) {
      console.warn(`图标集 "${iconSet.name}" 已存在，将被覆盖`);
    }
    this.iconSets.set(iconSet.name, iconSet);
  }

  /**
   * 批量注册图标集
   * @param iconSets 图标集数组
   */
  registerIconSets(iconSets: IconSet[]): void {
    iconSets.forEach(iconSet => this.registerIconSet(iconSet));
  }

  /**
   * 获取图标组件
   * @param iconSetName 图标集名称
   * @param iconName 图标名称
   * @returns 图标组件或 undefined
   */
  getIcon(iconSetName: string, iconName: string): IconComponent | undefined {
    const iconSet = this.iconSets.get(iconSetName);
    if (!iconSet) {
      console.warn(`图标集 "${iconSetName}" 未找到`);
      return undefined;
    }

    const icon = iconSet.icons[iconName];
    if (!icon) {
      console.warn(`图标 "${iconName}" 在图标集 "${iconSetName}" 中未找到`);
      return undefined;
    }

    return icon;
  }

  /**
   * 通过别名获取图标
   * @param alias 别名
   * @returns 图标组件或 undefined
   */
  getIconByAlias(alias: string): IconComponent | undefined {
    const fullName = this.aliases.get(alias);
    if (!fullName) {
      console.warn(`别名 "${alias}" 未找到`);
      return undefined;
    }

    const [iconSetName, iconName] = fullName.split(':');
    return this.getIcon(iconSetName, iconName);
  }

  /**
   * 注册图标别名
   * @param alias 别名
   * @param iconSetName 图标集名称
   * @param iconName 图标名称
   */
  registerAlias(alias: string, iconSetName: string, iconName: string): void {
    this.aliases.set(alias, `${iconSetName}:${iconName}`);
  }

  /**
   * 批量注册别名
   * @param aliases 别名映射对象
   */
  registerAliases(aliases: Record<string, string>): void {
    Object.entries(aliases).forEach(([alias, fullName]) => {
      const [iconSetName, iconName] = fullName.split(':');
      if (iconSetName && iconName) {
        this.registerAlias(alias, iconSetName, iconName);
      }
    });
  }

  /**
   * 列出所有已注册的图标集
   * @returns 图标集名称数组
   */
  listIconSets(): string[] {
    return Array.from(this.iconSets.keys());
  }

  /**
   * 列出指定图标集中的所有图标
   * @param iconSetName 图标集名称
   * @returns 图标名称数组
   */
  listIcons(iconSetName: string): string[] {
    const iconSet = this.iconSets.get(iconSetName);
    if (!iconSet) {
      return [];
    }
    return Object.keys(iconSet.icons);
  }

  /**
   * 列出所有别名
   * @returns 别名数组
   */
  listAliases(): string[] {
    return Array.from(this.aliases.keys());
  }

  /**
   * 移除图标集
   * @param iconSetName 图标集名称
   */
  removeIconSet(iconSetName: string): void {
    this.iconSets.delete(iconSetName);
  }

  /**
   * 移除别名
   * @param alias 别名
   */
  removeAlias(alias: string): void {
    this.aliases.delete(alias);
  }

  /**
   * 清空所有图标集和别名
   */
  clear(): void {
    this.iconSets.clear();
    this.aliases.clear();
  }
}

// 导出单例
export const iconRegistry = new IconRegistry();

