/**
 * 数据库Section组件
 * 在资源管理器中显示数据库列表，支持折叠展开
 */

import React, { useState } from 'react';
import ExplorerSection from '../ExplorerSection';
import { Icon } from '../../Icons/Icon';
import { DatabaseItem } from './types';
import './DatabaseSection.scss';

export interface DatabaseSectionProps {
  /** 数据库列表 */
  databases?: DatabaseItem[];
  /** 选中的数据库ID */
  selectedId?: string;
  /** 点击数据库项 */
  onItemClick?: (item: DatabaseItem) => void;
  /** 双击数据库项 */
  onItemDoubleClick?: (item: DatabaseItem) => void;
  /** 新建数据库 */
  onNewDatabase?: () => void;
  /** 展开状态变化 */
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * 数据库面板
 * 显示工作区中的数据库列表
 */
export const DatabaseSection: React.FC<DatabaseSectionProps> = ({
  databases = [],
  selectedId,
  onItemClick,
  onItemDoubleClick,
  onNewDatabase,
  onExpandedChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const actions = [];

  if (onNewDatabase) {
    actions.push({
      id: 'new-database',
      icon: <Icon name="plus" size={14} />,
      tooltip: '新建数据库',
      onClick: onNewDatabase,
    });
  }

  const handleExpandChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  const handleItemClick = (item: DatabaseItem) => {
    onItemClick?.(item);
  };

  const handleItemDoubleClick = (item: DatabaseItem) => {
    onItemDoubleClick?.(item);
  };

  return (
    <div className={`database-section ${isExpanded ? 'database-section--expanded' : 'database-section--collapsed'}`}>
      <ExplorerSection
        title="数据库"
        defaultExpanded={isExpanded}
        actions={actions}
        onExpandChange={handleExpandChange}
      >
        <div className="database-content">
          {databases.length === 0 ? (
            <div className="database-empty">
              <Icon name="database" size={24} className="empty-icon" />
              <span>暂无数据库</span>
            </div>
          ) : (
            <div className="database-list">
              {databases.map((item) => (
                <div
                  key={item.id}
                  className={`database-item ${selectedId === item.id ? 'selected' : ''}`}
                  onClick={() => handleItemClick(item)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                >
                  <Icon name="database" size={16} className="item-icon" />
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

export default DatabaseSection;
