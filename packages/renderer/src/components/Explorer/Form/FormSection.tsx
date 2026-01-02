/**
 * 表单Section组件
 * 在资源管理器中显示表单列表，支持折叠展开
 */

import React, { useState } from 'react';
import ExplorerSection from '../ExplorerSection';
import { Icon } from '../../Icons/Icon';
import { FormItem } from './types';
import './FormSection.scss';

export interface FormSectionProps {
  /** 表单列表 */
  forms?: FormItem[];
  /** 选中的表单ID */
  selectedId?: string;
  /** 点击表单项 */
  onItemClick?: (item: FormItem) => void;
  /** 双击表单项 */
  onItemDoubleClick?: (item: FormItem) => void;
  /** 新建表单 */
  onNewForm?: () => void;
  /** 展开状态变化 */
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * 表单面板
 * 显示工作区中的表单列表
 */
export const FormSection: React.FC<FormSectionProps> = ({
  forms = [],
  selectedId,
  onItemClick,
  onItemDoubleClick,
  onNewForm,
  onExpandedChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const actions = [];

  if (onNewForm) {
    actions.push({
      id: 'new-form',
      icon: <Icon name="plus" size={14} />,
      tooltip: '新建表单',
      onClick: onNewForm,
    });
  }

  const handleExpandChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  const handleItemClick = (item: FormItem) => {
    onItemClick?.(item);
  };

  const handleItemDoubleClick = (item: FormItem) => {
    onItemDoubleClick?.(item);
  };

  return (
    <div className={`form-section ${isExpanded ? 'form-section--expanded' : 'form-section--collapsed'}`}>
      <ExplorerSection
        title="表单"
        defaultExpanded={isExpanded}
        actions={actions}
        onExpandChange={handleExpandChange}
      >
        <div className="form-content">
          {forms.length === 0 ? (
            <div className="form-empty">
              <Icon name="table-properties" size={24} className="empty-icon" />
              <span>暂无表单</span>
            </div>
          ) : (
            <div className="form-list">
              {forms.map((item) => (
                <div
                  key={item.id}
                  className={`form-item ${selectedId === item.id ? 'selected' : ''}`}
                  onClick={() => handleItemClick(item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                >
                  <Icon name="table-properties" size={16} className="item-icon" />
                  <span className="item-name">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ExplorerSection>
    </div>
  );
};

export default FormSection;
