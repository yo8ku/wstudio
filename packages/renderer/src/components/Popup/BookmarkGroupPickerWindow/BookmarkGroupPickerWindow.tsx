/**
 * Detached bookmark group picker window.
 * Renders bookmark groups in a dedicated Electron popup so the picker is no longer constrained by the main window layout.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { BookmarkGroupItem } from '../../Explorer/Bookmark/types';
import { TreeChildren, TreeNodeRow } from '../../Explorer/Common/TreeNode';
import { Icon } from '../../Icons/Icon';
import { CustomScrollbar } from '../../common/CustomScrollbar/CustomScrollbar';
import type { BookmarkGroupPickerState, BookmarkGroupPickerThemeVariables } from '../../../types/bookmarkGroupPicker';
import './BookmarkGroupPickerWindow.scss';

const UNGROUPED_ROW_ID = '__bookmark-group-picker-ungrouped__';

const applyThemeVariables = (themeVariables: BookmarkGroupPickerThemeVariables): void => {
  for (const [variableName, value] of Object.entries(themeVariables)) {
    document.documentElement.style.setProperty(variableName, value);
  }
};

const collectDefaultCollapsedGroupIds = (groups: BookmarkGroupItem[]): string[] => {
  const parentGroupIdSet = new Set<string>();

  for (const group of groups) {
    if (group.parentId) {
      parentGroupIdSet.add(group.parentId);
    }
  }

  return groups
    .filter((group) => parentGroupIdSet.has(group.id))
    .map((group) => group.id);
};

export const BookmarkGroupPickerWindow: React.FC = () => {
  const [pickerState, setPickerState] = useState<BookmarkGroupPickerState | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;
    document.documentElement.dataset.popupView = 'bookmark-group-picker';
    document.body.dataset.popupView = 'bookmark-group-picker';

    const applyPickerState = (nextState: BookmarkGroupPickerState): void => {
      if (disposed) {
        return;
      }

      applyThemeVariables(nextState.themeVariables);
      document.title = nextState.ungroupedLabel;
      setPickerState(nextState);
      setCollapsedGroupIds(collectDefaultCollapsedGroupIds(nextState.groups));
      document.documentElement.dataset.popupBackgroundEffect = nextState.backgroundEffect;
      document.body.dataset.popupBackgroundEffect = nextState.backgroundEffect;
    };

    const loadPickerState = async (): Promise<void> => {
      const nextState = await window.electron?.bookmarkGroupPicker?.getState();
      if (!nextState) {
        return;
      }

      applyPickerState(nextState);
    };

    const handleWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      void window.electron?.bookmarkGroupPicker?.cancel();
    };

    const unsubscribeStateChanged = window.electron?.bookmarkGroupPicker?.onStateChanged?.((nextState) => {
      applyPickerState(nextState);
    });

    void loadPickerState();
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      disposed = true;
      if (typeof unsubscribeStateChanged === 'function') {
        unsubscribeStateChanged();
      }
      window.removeEventListener('keydown', handleWindowKeyDown);
      delete document.documentElement.dataset.popupView;
      delete document.body.dataset.popupView;
      delete document.documentElement.dataset.popupBackgroundEffect;
      delete document.body.dataset.popupBackgroundEffect;
    };
  }, []);

  const groupsByParentId = useMemo(() => {
    const nextMap = new Map<string | null, BookmarkGroupItem[]>();
    for (const group of pickerState?.groups ?? []) {
      const parentId = group.parentId ?? null;
      const existingGroups = nextMap.get(parentId) ?? [];
      existingGroups.push(group);
      nextMap.set(parentId, existingGroups);
    }
    return nextMap;
  }, [pickerState?.groups]);

  const collapsedGroupIdSet = useMemo(
    () => new Set<string>(collapsedGroupIds),
    [collapsedGroupIds],
  );

  const handleSelectGroup = (groupId: string | null): void => {
    void window.electron?.bookmarkGroupPicker?.select(groupId);
  };

  const handleToggleGroup = (groupId: string): void => {
    setCollapsedGroupIds((currentIds) => (
      currentIds.includes(groupId)
        ? currentIds.filter((currentId) => currentId !== groupId)
        : [...currentIds, groupId]
    ));
  };

  const renderTreeRows = (parentId: string | null, depth: number): React.ReactNode => {
    const childGroups = groupsByParentId.get(parentId) ?? [];
    return childGroups.map((group) => {
      const hasChildren = (groupsByParentId.get(group.id)?.length ?? 0) > 0;
      const isCollapsed = collapsedGroupIdSet.has(group.id);

      return (
        <React.Fragment key={group.id}>
          <TreeNodeRow
            depth={depth}
            parentDepth={depth > 0 ? depth - 1 : undefined}
            selected={pickerState?.selectedGroupId === group.id}
            nodeClassName="bookmark-group-picker-window__node"
            contentClassName="bookmark-group-picker-window__node-content"
            title={group.name}
            onClick={(): void => {
              handleSelectGroup(group.id);
            }}
            leading={(
              <span className="bookmark-group-picker-window__leading">
                {hasChildren ? (
                  <Icon
                    name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                    size={12}
                    className="bookmark-group-picker-window__chevron"
                    onClick={(event): void => {
                      event.stopPropagation();
                      handleToggleGroup(group.id);
                    }}
                  />
                ) : (
                  <span className="bookmark-group-picker-window__chevron-spacer" />
                )}
              </span>
            )}
            icon={<Icon name="folder" size={16} className="bookmark-group-picker-window__folder" />}
          >
            <span className="file-tree-name">{group.name}</span>
          </TreeNodeRow>
          {hasChildren && !isCollapsed ? (
            <TreeChildren
              parentDepth={depth}
              className="bookmark-group-picker-window__children"
            >
              {renderTreeRows(group.id, depth + 1)}
            </TreeChildren>
          ) : null}
        </React.Fragment>
      );
    });
  };

  if (!pickerState) {
    return (
      <div className="bookmark-group-picker-window">
        <div className="bookmark-group-picker-window__loading">{'\u52a0\u8f7d\u4e2d...'}</div>
      </div>
    );
  }

  return (
    <div className="bookmark-group-picker-window">
      <CustomScrollbar
        className="bookmark-group-picker-window__scrollbar"
        alwaysVisible
        defaultOpacity={0.72}
      >
        <TreeNodeRow
          depth={0}
          selected={pickerState.selectedGroupId === null}
          nodeClassName="bookmark-group-picker-window__node"
          contentClassName="bookmark-group-picker-window__node-content"
          title={pickerState.ungroupedLabel}
          onClick={(): void => {
            handleSelectGroup(null);
          }}
          dataFilePath={UNGROUPED_ROW_ID}
          leading={<span className="bookmark-group-picker-window__leading"><span className="bookmark-group-picker-window__chevron-spacer" /></span>}
          icon={<Icon name="folder" size={16} className="bookmark-group-picker-window__folder" />}
        >
          <span className="file-tree-name">{pickerState.ungroupedLabel}</span>
        </TreeNodeRow>
        {renderTreeRows(null, 0)}
      </CustomScrollbar>
    </div>
  );
};

export default BookmarkGroupPickerWindow;
