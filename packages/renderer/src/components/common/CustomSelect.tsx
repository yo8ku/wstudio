/**
 * CustomSelect 组件 - 基于 Radix UI 的自定义下拉选择组件
 * 
 * 功能说明：
 * - 支持键盘导航和屏幕阅读器
 * - 支持自定义渲染选项和选中值
 * - 支持禁用状态
 * - 支持分组显示（按服务商/配置名称）
 * - 使用 CSS 变量实现主题适配
 */

import React, { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

/**
 * 选项数据类型
 */
export interface ItemDataType<T = string | number> {
  label: string;
  value: T;
  disabled?: boolean;
  configName?: string; // 用于特定配置场景
  group?: string; // 分组名称（可选）
}

/**
 * 分组数据类型
 */
export interface GroupDataType {
  groupName: string;
  items: ItemDataType[];
}

/**
 * CustomSelect 组件属性
 */
export interface CustomSelectProps {
  /** 选项数据列表（扁平列表） */
  items?: ItemDataType[];
  /** 分组数据列表（优先使用，如果提供则忽略 items） */
  groups?: GroupDataType[];
  /** 当前选中的值 */
  value?: string;
  /** 值变化时的回调函数 */
  onChange: (value: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 自定义 CSS 类名 */
  className?: string;
  /** 自定义渲染选项标签 */
  renderLabel?: (label: string, item: ItemDataType) => ReactNode;
  /** 自定义渲染选中值 */
  renderValue?: (value: string, item: ItemDataType, selectedElement: ReactNode) => ReactNode;
}

/**
 * CustomSelect 组件
 * 
 * @example
 * ```tsx
 * <CustomSelect
 *   items={[
 *     { label: 'Option 1', value: '1' },
 *     { label: 'Option 2', value: '2' },
 *   ]}
 *   value={selectedValue}
 *   onChange={setSelectedValue}
 *   placeholder="Select an option"
 * />
 * ```
 */
export const CustomSelect: React.FC<CustomSelectProps> = ({
  items = [],
  groups,
  value = '',
  onChange,
  disabled = false,
  placeholder = '请选择...',
  className,
  renderLabel,
  renderValue,
}) => {
  // 确保 items 是数组
  const safeItems = Array.isArray(items) ? items : [];
  const safeValue = value ?? '';
  
  // 获取所有项（用于查找选中项）
  const allItems = groups 
    ? groups.flatMap(g => g.items)
    : safeItems;
  
  // 查找当前选中的项
  const selectedItem = allItems.find((item) => String(item.value) === String(safeValue));

  // 渲染分组内容
  const renderGroupedContent = () => {
    if (!groups || groups.length === 0) {
      // 如果没有分组，渲染扁平列表
      return (
        <SelectGroup>
          {safeItems.map((item) => {
            const itemValue = String(item.value);
            const itemLabel = renderLabel ? renderLabel(item.label, item) : item.label;

            return (
              <SelectItem key={itemValue} value={itemValue} disabled={item.disabled}>
                {itemLabel}
              </SelectItem>
            );
          })}
        </SelectGroup>
      );
    }

    // 渲染分组列表
    return groups.map((group, groupIndex) => (
      <SelectGroup key={`group-${groupIndex}`}>
        <SelectLabel>{group.groupName}</SelectLabel>
        {group.items.map((item) => {
          const itemValue = String(item.value);
          const itemLabel = renderLabel ? renderLabel(item.label, item) : item.label;

          return (
            <SelectItem key={itemValue} value={itemValue} disabled={item.disabled}>
              {itemLabel}
            </SelectItem>
          );
        })}
      </SelectGroup>
    ));
  };

  return (
    <Select value={safeValue} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className} style={{ width: className ? undefined : '100%' }}>
        <SelectValue placeholder={placeholder}>
          {selectedItem && renderValue
            ? renderValue(safeValue, selectedItem, selectedItem.label)
            : selectedItem?.label || placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {renderGroupedContent()}
      </SelectContent>
    </Select>
  );
};

export default CustomSelect;
