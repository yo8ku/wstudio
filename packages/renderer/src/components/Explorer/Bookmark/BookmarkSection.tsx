/**
 * Bookmark section.
 * Renders grouped and ungrouped bookmark items inside the explorer bookmark view.
 */

import React, { useMemo, useState } from 'react';
import { LuBookmarkPlus, LuChevronsDownUp, LuFolderPlus } from 'react-icons/lu';
import { Icon } from '../../Icons/Icon';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import { ContextMenu, type ContextMenuItem } from '../Common/ContextMenu';
import { InlineInput } from '../Common/InlineInput';
import { TreeChildren, TreeNodeRow } from '../Common/TreeNode';
import type { BookmarkGroupItem, BookmarkGroupSection, BookmarkNoteDisplayItem } from './types';
import './BookmarkSection.scss';

export interface BookmarkSectionProps {
  groupedItems: BookmarkGroupSection[];
  ungroupedItems: BookmarkNoteDisplayItem[];
  selectedNotePath?: string;
  contextMenuSelectionPath?: string;
  canCreateBookmark?: boolean;
  canCreateBookmarkGroup?: boolean;
  canCollapseAll?: boolean;
  onCreateBookmark?: () => void;
  onCreateBookmarkGroup?: (name: string, parentId?: string | null) => void;
  onRenameBookmarkGroup?: (groupId: string, name: string) => void;
  onRemoveBookmarkGroup?: (groupId: string) => void;
  onToggleBookmarkGroup?: (groupId: string) => void;
  onCollapseAll?: () => void;
  onNoteSelect: (item: BookmarkNoteDisplayItem) => void;
  onNoteContextMenu?: (
    item: BookmarkNoteDisplayItem,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void;
}

interface BookmarkTreeChildrenStyle extends React.CSSProperties {
  '--bookmark-guide-left'?: string;
}

const LABEL_RENAME = '\u91cd\u547d\u540d';
const LABEL_CREATE_GROUP = '\u65b0\u5efa\u5206\u7ec4';
const LABEL_REMOVE = '\u79fb\u9664';
const LABEL_NEW_BOOKMARK_GROUP = '\u65b0\u5efa\u4e66\u7b7e\u7ec4';
const LABEL_RENAME_BOOKMARK_GROUP = '\u91cd\u547d\u540d\u4e66\u7b7e\u7ec4';
const LABEL_BOOKMARK_CURRENT_TAB = '\u6536\u85cf\u5f53\u524d\u6807\u7b7e\u9875';
const LABEL_COLLAPSE_ALL = '\u5168\u90e8\u6298\u53e0';
const LABEL_NO_BOOKMARKS = '\u6682\u65e0\u4e66\u7b7e\u5185\u5bb9';

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const createTreeChildrenStyle = (depth: number): BookmarkTreeChildrenStyle => ({
  '--bookmark-guide-left': `${depth * 12 + 15}px`,
});

export const BookmarkSection: React.FC<BookmarkSectionProps> = ({
  groupedItems,
  ungroupedItems,
  selectedNotePath = '',
  contextMenuSelectionPath = '',
  canCreateBookmark = false,
  canCreateBookmarkGroup = false,
  canCollapseAll = false,
  onCreateBookmark,
  onCreateBookmarkGroup,
  onRenameBookmarkGroup,
  onRemoveBookmarkGroup,
  onToggleBookmarkGroup,
  onCollapseAll,
  onNoteSelect,
  onNoteContextMenu,
}) => {
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [creatingGroupParentId, setCreatingGroupParentId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupContextMenuState, setGroupContextMenuState] = useState<{
    group: BookmarkGroupItem;
    position: { x: number; y: number };
  } | null>(null);

  const normalizedSelectedPath = normalizePath(selectedNotePath);
  const normalizedContextMenuSelectionPath = normalizePath(contextMenuSelectionPath);
  const hasAnyBookmarkContent = groupedItems.length > 0 || ungroupedItems.length > 0;

  const groupContextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!groupContextMenuState) {
      return [];
    }

    const items: ContextMenuItem[] = [
      {
        id: 'bookmark-group-rename',
        label: LABEL_RENAME,
        onClick: (): void => {
          setEditingGroupId(groupContextMenuState.group.id);
          setIsCreatingGroup(false);
          setCreatingGroupParentId(null);
          setGroupContextMenuState(null);
        },
      },
      {
        id: 'bookmark-group-create',
        label: LABEL_CREATE_GROUP,
        onClick: (): void => {
          setIsCreatingGroup(true);
          setEditingGroupId(null);
          setCreatingGroupParentId(groupContextMenuState.group.id);
          setGroupContextMenuState(null);
        },
      },
    ];

    if (onRemoveBookmarkGroup) {
      items.push(
        {
          id: 'bookmark-group-separator-1',
          label: '',
          separator: true,
        },
        {
          id: 'bookmark-group-remove',
          label: LABEL_REMOVE,
          onClick: (): void => {
            setEditingGroupId(null);
            setIsCreatingGroup(false);
            setCreatingGroupParentId(null);
            setGroupContextMenuState(null);
            onRemoveBookmarkGroup(groupContextMenuState.group.id);
          },
        },
      );
    }

    return items;
  }, [groupContextMenuState, onRemoveBookmarkGroup]);

  const handleGroupContextMenu = (
    group: BookmarkGroupItem,
    event: React.MouseEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    setGroupContextMenuState({
      group,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const renderNoteItem = (
    item: BookmarkNoteDisplayItem,
    depth: number,
  ): React.ReactNode => {
    const isActive = normalizePath(item.note.path) === normalizedSelectedPath;
    const isContextMenuTarget = normalizePath(item.note.path) === normalizedContextMenuSelectionPath;

    return (
      <TreeNodeRow
        key={item.note.id}
        depth={depth}
        selected={isActive}
        contextMenuActive={isContextMenuTarget}
        role="button"
        tabIndex={0}
        title={item.note.path}
        onClick={(): void => {
          onNoteSelect(item);
        }}
        onContextMenu={(event): void => {
          onNoteContextMenu?.(item, event);
        }}
        onKeyDown={(event): void => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          onNoteSelect(item);
        }}
        leading={<span className="file-tree-chevron" />}
        icon={<Icon name="file" size={16} className="file-tree-icon" />}
      >
        <span className="file-tree-name">{item.entry.name}</span>
      </TreeNodeRow>
    );
  };

  const renderCreateGroupInput = (parentId: string | null, depth: number): React.ReactNode => {
    if (!isCreatingGroup || creatingGroupParentId !== parentId) {
      return null;
    }

    return (
      <TreeNodeRow
        depth={depth}
        creating={true}
        nodeClassName="bookmark-group bookmark-group--creating"
        leading={<span className="file-tree-chevron" />}
        icon={<Icon name="folder" size={16} className="file-tree-icon" />}
      >
        <InlineInput
          placeholder={LABEL_NEW_BOOKMARK_GROUP}
          onConfirm={(name): void => {
            onCreateBookmarkGroup?.(name, parentId);
            setEditingGroupId(null);
            setCreatingGroupParentId(null);
            setIsCreatingGroup(false);
          }}
          onCancel={(): void => {
            setEditingGroupId(null);
            setCreatingGroupParentId(null);
            setIsCreatingGroup(false);
          }}
          autoFocus={true}
        />
      </TreeNodeRow>
    );
  };

  const renderGroupSection = (section: BookmarkGroupSection): React.ReactNode => {
    const isEditing = editingGroupId === section.group.id;
    const isContextMenuTarget = groupContextMenuState?.group.id === section.group.id;
    const shouldShowCreateInput = isCreatingGroup && creatingGroupParentId === section.group.id;
    const shouldShowBody = !section.group.collapsed || shouldShowCreateInput;

    return (
      <React.Fragment key={section.group.id}>
        <TreeNodeRow
          depth={section.depth}
          editing={isEditing}
          contextMenuActive={isContextMenuTarget}
          nodeClassName="bookmark-group"
          role="button"
          tabIndex={0}
          onClick={(): void => {
            if (isEditing) {
              return;
            }

            onToggleBookmarkGroup?.(section.group.id);
          }}
          onContextMenu={(event): void => {
            handleGroupContextMenu(section.group, event);
          }}
          onKeyDown={(event): void => {
            if (isEditing || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onToggleBookmarkGroup?.(section.group.id);
          }}
          leading={(
            <Icon
              name={section.group.collapsed ? 'chevron-right' : 'chevron-down'}
              size={14}
              className="file-tree-chevron"
            />
          )}
          icon={<Icon name="folder" size={16} className="file-tree-icon" />}
        >
          {isEditing ? (
            <InlineInput
              initialValue={section.group.name}
              placeholder={LABEL_RENAME_BOOKMARK_GROUP}
              onConfirm={(name): void => {
                onRenameBookmarkGroup?.(section.group.id, name);
                setEditingGroupId(null);
              }}
              onCancel={(): void => {
                setEditingGroupId(null);
              }}
              autoFocus={true}
            />
          ) : (
            <span className="file-tree-name bookmark-group-name">{section.group.name}</span>
          )}
        </TreeNodeRow>
        {shouldShowBody && (
          <TreeChildren parentDepth={section.depth} style={createTreeChildrenStyle(section.depth)}>
            {section.items.map((item) => renderNoteItem(item, section.depth + 1))}
            {renderCreateGroupInput(section.group.id, section.depth + 1)}
            {section.children.map((childSection) => renderGroupSection(childSection))}
          </TreeChildren>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="bookmark-section">
      <div className="bookmark-toolbar">
        <div
          role="button"
          tabIndex={canCreateBookmark ? 0 : -1}
          className={`bookmark-toolbar-action${canCreateBookmark ? '' : ' is-disabled'}`}
          aria-disabled={!canCreateBookmark}
          title={LABEL_BOOKMARK_CURRENT_TAB}
          aria-label={LABEL_BOOKMARK_CURRENT_TAB}
          onMouseDown={(event): void => {
            event.stopPropagation();
          }}
          onClick={(): void => {
            if (!canCreateBookmark) {
              return;
            }

            onCreateBookmark?.();
          }}
          onKeyDown={(event): void => {
            if (!canCreateBookmark || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onCreateBookmark?.();
          }}
        >
          <LuBookmarkPlus size={16} />
        </div>
        <div
          role="button"
          tabIndex={canCreateBookmarkGroup ? 0 : -1}
          className={`bookmark-toolbar-action${canCreateBookmarkGroup ? '' : ' is-disabled'}`}
          aria-disabled={!canCreateBookmarkGroup}
          title={LABEL_NEW_BOOKMARK_GROUP}
          aria-label={LABEL_NEW_BOOKMARK_GROUP}
          onMouseDown={(event): void => {
            event.stopPropagation();
          }}
          onClick={(): void => {
            if (!canCreateBookmarkGroup) {
              return;
            }

            setEditingGroupId(null);
            setCreatingGroupParentId(null);
            setIsCreatingGroup(true);
          }}
          onKeyDown={(event): void => {
            if (!canCreateBookmarkGroup || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setEditingGroupId(null);
            setCreatingGroupParentId(null);
            setIsCreatingGroup(true);
          }}
        >
          <LuFolderPlus size={16} />
        </div>
        <div
          role="button"
          tabIndex={canCollapseAll ? 0 : -1}
          className={`bookmark-toolbar-action${canCollapseAll ? '' : ' is-disabled'}`}
          aria-disabled={!canCollapseAll}
          title={LABEL_COLLAPSE_ALL}
          aria-label={LABEL_COLLAPSE_ALL}
          onMouseDown={(event): void => {
            event.stopPropagation();
          }}
          onClick={(): void => {
            if (!canCollapseAll) {
              return;
            }

            onCollapseAll?.();
          }}
          onKeyDown={(event): void => {
            if (!canCollapseAll || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            onCollapseAll?.();
          }}
        >
          <LuChevronsDownUp size={16} />
        </div>
      </div>
      <CustomScrollbar className="bookmark-content" scrollbarWidth={10}>
        {renderCreateGroupInput(null, 0)}

        {!hasAnyBookmarkContent && !isCreatingGroup ? (
          <div className="bookmark-empty">{LABEL_NO_BOOKMARKS}</div>
        ) : (
          <div className="bookmark-groups">
            {groupedItems.map((section) => renderGroupSection(section))}
            {ungroupedItems.map((item) => renderNoteItem(item, 0))}
          </div>
        )}
      </CustomScrollbar>
      {groupContextMenuState && (
        <ContextMenu
          items={groupContextMenuItems}
          position={groupContextMenuState.position}
          className="bookmark-context-menu"
          onClose={(): void => {
            setGroupContextMenuState(null);
          }}
        />
      )}
    </div>
  );
};

export default BookmarkSection;
