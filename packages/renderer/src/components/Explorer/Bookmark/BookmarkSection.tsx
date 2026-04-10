/**
 * Bookmark section.
 * Renders grouped and ungrouped bookmark items inside the explorer bookmark view.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuBookmarkPlus, LuFolderPlus } from 'react-icons/lu';
import { Icon } from '../../Icons/Icon';
import { CustomScrollbar } from '../../common/CustomScrollbar';
import { ContextMenu, type ContextMenuItem } from '../Common/ContextMenu';
import { InlineInput } from '../Common/InlineInput';
import { TreeChildren, TreeNodeRow } from '../Common/TreeNode';
import { WorkspaceFileIcon } from '../../WorkspaceFileIcon/WorkspaceFileIcon';
import type { BookmarkGroupItem, BookmarkGroupSection, BookmarkNoteDisplayItem } from './types';
import './BookmarkSection.scss';

export interface BookmarkSectionProps {
  groupedItems: BookmarkGroupSection[];
  ungroupedItems: BookmarkNoteDisplayItem[];
  selectedNotePath?: string;
  contextMenuSelectionPath?: string;
  canCreateBookmark?: boolean;
  canCreateBookmarkGroup?: boolean;
  onCreateBookmark?: () => void;
  onCreateBookmarkGroup?: (name: string, parentId?: string | null) => void;
  onRenameBookmarkGroup?: (groupId: string, name: string) => void;
  onRemoveBookmarkGroup?: (groupId: string) => void;
  onToggleBookmarkGroup?: (groupId: string) => void;
  onNoteSelect: (item: BookmarkNoteDisplayItem) => void;
  onNoteContextMenu?: (
    item: BookmarkNoteDisplayItem,
    event: React.MouseEvent<HTMLDivElement>,
  ) => void;
}

interface BookmarkTreeChildrenStyle extends React.CSSProperties {
  '--bookmark-guide-left'?: string;
}

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
  onCreateBookmark,
  onCreateBookmarkGroup,
  onRenameBookmarkGroup,
  onRemoveBookmarkGroup,
  onToggleBookmarkGroup,
  onNoteSelect,
  onNoteContextMenu,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
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
  const labelRename = translateText('bookmarkSection.menu.rename', '重命名');
  const labelCreateGroup = translateText('bookmarkSection.menu.newGroup', '新建分组');
  const labelRemove = translateText('bookmarkSection.menu.remove', '移除');
  const labelNewBookmarkGroup = translateText('bookmarkSection.placeholders.newGroup', '新建书签组');
  const labelRenameBookmarkGroup = translateText(
    'bookmarkSection.placeholders.renameGroup',
    '重命名书签组',
  );
  const labelBookmarkCurrentTab = translateText(
    'bookmarkSection.actions.bookmarkCurrentTab',
    '收藏当前标签页',
  );
  const labelNoBookmarks = translateText('bookmarkSection.empty', '暂无书签内容');

  const groupContextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!groupContextMenuState) {
      return [];
    }

    const items: ContextMenuItem[] = [
      {
        id: 'bookmark-group-rename',
        label: labelRename,
        onClick: (): void => {
          setEditingGroupId(groupContextMenuState.group.id);
          setIsCreatingGroup(false);
          setCreatingGroupParentId(null);
          setGroupContextMenuState(null);
        },
      },
      {
        id: 'bookmark-group-create',
        label: labelCreateGroup,
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
          label: labelRemove,
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
  }, [groupContextMenuState, labelCreateGroup, labelRemove, labelRename, onRemoveBookmarkGroup]);

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
        icon={(
          <WorkspaceFileIcon
            filePath={item.note.path}
            name={item.entry.name}
            isDirectory={false}
            size={16}
          />
        )}
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
      >
        <InlineInput
          placeholder={labelNewBookmarkGroup}
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
        >
          {isEditing ? (
            <InlineInput
              initialValue={section.group.name}
              placeholder={labelRenameBookmarkGroup}
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
          title={labelBookmarkCurrentTab}
          aria-label={labelBookmarkCurrentTab}
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
          title={labelNewBookmarkGroup}
          aria-label={labelNewBookmarkGroup}
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
      </div>
      <CustomScrollbar className="bookmark-content" scrollbarWidth={10}>
        {renderCreateGroupInput(null, 0)}

        {!hasAnyBookmarkContent && !isCreatingGroup ? (
          <div className="bookmark-empty">{labelNoBookmarks}</div>
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
