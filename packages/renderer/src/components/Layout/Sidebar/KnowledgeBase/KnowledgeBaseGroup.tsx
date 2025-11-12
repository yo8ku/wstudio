/**
 * 知识库分组组件
 * 功能：渲染知识库分组（我创建的、我加入的）
 * 描述：支持分组展开/折叠、显示分组标题和项数据
 */

import React from 'react';
import { KnowledgeGroup, KnowledgeItem } from './types';
import { KnowledgeBaseItem } from './KnowledgeBaseItem';
import { ChevronRightIcon, ChevronDownIcon, AddIcon } from './KnowledgeBaseIcons';

interface KnowledgeBaseGroupProps {
  /** 分组数据 */
  group: KnowledgeGroup;
  /** 展开的项ID集合 */
  expandedItems: Set<string>;
  /** 选中的项ID */
  selectedItemId?: string;
  /** 切换分组展开事件 */
  onToggleGroupExpanded: () => void;
  /** 切换项展开事件 */
  onToggleItemExpanded: (itemId: string) => void;
  /** 项点击事件 */
  onItemClick: (item: KnowledgeItem) => void;
  /** 添加文件点击事件 */
  onAddClick?: () => void;
  /** 编辑知识库 */
  onEdit?: (item: KnowledgeItem) => void;
  /** 删除知识库 */
  onDelete?: (item: KnowledgeItem) => void;
  /** 添加到聊天 */
  onAddToChat?: (item: KnowledgeItem) => void;
}

/**
 * 计算分组中的项总数（仅顶层项）
 */
const countItems = (items: KnowledgeItem[]): number => {
  return items.length;
};

export const KnowledgeBaseGroup: React.FC<KnowledgeBaseGroupProps> = ({
  group,
  expandedItems,
  selectedItemId,
  onToggleGroupExpanded,
  onToggleItemExpanded,
  onItemClick,
  onAddClick,
  onEdit,
  onDelete,
  onAddToChat,
}) => {
  const itemCount = countItems(group.items);

  return (
    <div className="knowledge-base-group">
      {/* 分组标题 */}
      <div
        className="knowledge-base-group__header"
        style={{
          color: 'var(--ws-sidebar-foreground)',
        }}
      >
        <div 
          className="knowledge-base-group__header-left"
          onClick={onToggleGroupExpanded}
        >
          <div className="knowledge-base-group__icon">
            {group.expanded ? (
              <ChevronDownIcon className="icon-chevron" />
            ) : (
              <ChevronRightIcon className="icon-chevron" />
            )}
          </div>
          <div className="knowledge-base-group__title">
            {group.title}
          </div>
          {itemCount > 0 && (
            <div className="knowledge-base-group__count">
              ({itemCount})
            </div>
          )}
        </div>
        
        {/* 添加知识库按钮*/}
        {onAddClick && (
          <button
            className="knowledge-base-group__action-button"
            onClick={(e) => {
              e.stopPropagation();
              onAddClick();
            }}
            title="创建知识库"
            style={{
              color: 'var(--ws-sidebar-foreground)',
            }}
          >
            <AddIcon className="icon-add" />
          </button>
        )}
      </div>

      {/* 分组内容 */}
      {group.expanded && (
        <div className="knowledge-base-group__content">
          {group.items.length === 0 ? (
            <div 
              className="knowledge-base-group__empty"
              style={{ color: 'var(--ws-sidebar-foreground)' }}
            >
              暂无内容
            </div>
          ) : (
            group.items.map((item) => (
              <KnowledgeBaseItem
                key={item.id}
                item={item}
                isExpanded={expandedItems.has(item.id)}
                isSelected={selectedItemId === item.id}
                level={0}
                onClick={onItemClick}
                onToggleExpand={onToggleItemExpanded}
                expandedItems={expandedItems}
                selectedItemId={selectedItemId}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddToChat={onAddToChat}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

