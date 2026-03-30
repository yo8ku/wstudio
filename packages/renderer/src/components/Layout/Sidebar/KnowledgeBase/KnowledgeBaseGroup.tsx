/**
 * Knowledge base group component.
 * Renders grouped knowledge base items and group-level actions.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { KnowledgeGroup, KnowledgeItem } from './types';
import { KnowledgeBaseItem } from './KnowledgeBaseItem';
import { ChevronRightIcon, ChevronDownIcon, AddIcon } from './KnowledgeBaseIcons';

interface KnowledgeBaseGroupProps {
  group: KnowledgeGroup;
  expandedItems: Set<string>;
  selectedItemId?: string;
  onToggleGroupExpanded: () => void;
  onToggleItemExpanded: (itemId: string) => void;
  onItemClick: (item: KnowledgeItem) => void;
  onAddClick?: () => void;
  onEdit?: (item: KnowledgeItem) => void;
  onDelete?: (item: KnowledgeItem) => void;
  onAddToChat?: (item: KnowledgeItem) => void;
  onSettings?: (item: KnowledgeItem) => void;
}

const countItems = (items: KnowledgeItem[]): number => items.length;

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
  onSettings,
}) => {
  const { t } = useTranslation();
  const itemCount = countItems(group.items);
  const groupTitle = group.type === 'created'
    ? String(t('knowledgeBase.main.groups.created', { defaultValue: 'Created by Me' }))
    : String(t('knowledgeBase.main.groups.joined', { defaultValue: 'Joined by Me' }));

  return (
    <div className="knowledge-base-group">
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
          <div className="knowledge-base-group__title">{groupTitle}</div>
          {itemCount > 0 && (
            <div className="knowledge-base-group__count">({itemCount})</div>
          )}
        </div>

        {onAddClick && (
          <button
            className="knowledge-base-group__action-button"
            onClick={(event) => {
              event.stopPropagation();
              onAddClick();
            }}
            title={String(t('knowledgeBase.group.create', { defaultValue: 'Create Knowledge Base' }))}
            style={{
              color: 'var(--ws-sidebar-foreground)',
            }}
          >
            <AddIcon className="icon-add" />
          </button>
        )}
      </div>

      {group.expanded && (
        <div className="knowledge-base-group__content">
          {group.items.length === 0 ? (
            <div
              className="knowledge-base-group__empty"
              style={{ color: 'var(--ws-sidebar-foreground)' }}
            >
              {String(t('knowledgeBase.group.empty', { defaultValue: 'No content yet' }))}
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
                onSettings={onSettings}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
