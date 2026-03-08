import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import './LinkCollection.scss';

export type LinkCollectionSort = 'default' | 'title-asc' | 'title-desc' | 'context-desc';

export const LINK_COLLECTION_SORT_OPTIONS: Array<{ value: LinkCollectionSort; label: string }> = [
  { value: 'default', label: '榛樿鎺掑簭' },
  { value: 'title-asc', label: '鏍囬 A-Z' },
  { value: 'title-desc', label: '鏍囬 Z-A' },
  { value: 'context-desc', label: '上下文更多' }
];

export const getLinkCollectionSortLabel = (sortBy: LinkCollectionSort): string =>
  LINK_COLLECTION_SORT_OPTIONS.find(option => option.value === sortBy)?.label || LINK_COLLECTION_SORT_OPTIONS[0].label;

export const getNextLinkCollectionSort = (sortBy: LinkCollectionSort): LinkCollectionSort => {
  const currentIndex = LINK_COLLECTION_SORT_OPTIONS.findIndex(option => option.value === sortBy);
  return LINK_COLLECTION_SORT_OPTIONS[(currentIndex + 1) % LINK_COLLECTION_SORT_OPTIONS.length].value;
};

export interface LinkCollectionBadge {
  label: string;
  tone?: 'default' | 'warning';
}

export interface LinkCollectionAction {
  label: string;
  onTrigger: () => void | Promise<void>;
}

export interface LinkCollectionChildItem {
  id: string;
  title: string;
  context?: string;
  sourceNoteId?: string;
  lineNumber?: number;
  metaLines?: string[];
  badges?: LinkCollectionBadge[];
  onOpen?: () => void | Promise<void>;
  action?: LinkCollectionAction;
}

export interface LinkCollectionItem extends LinkCollectionChildItem {
  leadingIcon?: string;
  children?: LinkCollectionChildItem[];
  defaultExpanded?: boolean;
}

interface LinkCollectionProps {
  title: string;
  items: LinkCollectionItem[];
  emptyText: string;
  defaultCollapsed?: boolean;
  resetKey?: string;
  query?: string;
  sortBy?: LinkCollectionSort;
  showFullContext?: boolean;
}

type LinkCollectionEntry = LinkCollectionItem | LinkCollectionChildItem;
type ChildContextDirection = 'up' | 'down';
type ChildContextAction = ChildContextDirection | 'collapse';
type ChildContextPlacement = 'top' | 'bottom';

interface ChildContextState {
  revealed: boolean;
  before: number;
  after: number;
  placement: ChildContextPlacement;
}

type ChildContextIconMode = ChildContextDirection | 'both' | 'collapse';

interface LinkCollectionViewState {
  isCollapsed: boolean;
  expandedItems: Record<string, boolean>;
  expandedChildContexts: Record<string, ChildContextState>;
}

const linkCollectionStateCache: Record<string, LinkCollectionViewState> = {};

const CHILD_CONTEXT_LOAD_STEP = 1;

const normalizeSortText = (value: string): string => value.trim().toLocaleLowerCase();

const getSearchText = (entry: LinkCollectionEntry): string => (
  [
    entry.title,
    ...(entry.metaLines || []),
    ...(entry.badges || []).map(badge => badge.label),
    entry.context || ''
  ]
    .join(' ')
    .toLocaleLowerCase()
);

const getContextWeight = (entry: LinkCollectionEntry): number => entry.context?.length || 0;

const sortCollectionEntries = <T extends LinkCollectionEntry>(
  entries: T[],
  sortBy: LinkCollectionSort
): T[] => {
  const sortedEntries = [...entries];

  switch (sortBy) {
    case 'title-asc':
      sortedEntries.sort((left, right) => normalizeSortText(left.title).localeCompare(normalizeSortText(right.title), 'zh-CN'));
      return sortedEntries;
    case 'title-desc':
      sortedEntries.sort((left, right) => normalizeSortText(right.title).localeCompare(normalizeSortText(left.title), 'zh-CN'));
      return sortedEntries;
    case 'context-desc':
      sortedEntries.sort((left, right) => getContextWeight(right) - getContextWeight(left));
      return sortedEntries;
    case 'default':
    default:
      return sortedEntries;
  }
};

const getNestedContextWeight = (item: LinkCollectionItem): number => {
  const childWeight = item.children?.reduce((maxWeight, child) => Math.max(maxWeight, getContextWeight(child)), 0) || 0;
  return Math.max(getContextWeight(item), childWeight);
};

const sortCollectionItems = (
  items: LinkCollectionItem[],
  sortBy: LinkCollectionSort
): LinkCollectionItem[] => {
  const normalizedItems = items.map(item => ({
    ...item,
    children: item.children ? sortCollectionEntries(item.children, sortBy) : item.children
  }));

  switch (sortBy) {
    case 'title-asc':
      return sortCollectionEntries(normalizedItems, sortBy);
    case 'title-desc':
      return sortCollectionEntries(normalizedItems, sortBy);
    case 'context-desc':
      return [...normalizedItems].sort((left, right) => getNestedContextWeight(right) - getNestedContextWeight(left));
    case 'default':
    default:
      return normalizedItems;
  }
};

const filterCollectionItems = (
  items: LinkCollectionItem[],
  normalizedQuery: string,
  sortBy: LinkCollectionSort
): LinkCollectionItem[] => {
  if (!normalizedQuery) {
    return sortCollectionItems(items, sortBy);
  }

  const filteredItems = items.flatMap(item => {
    const matchesSelf = getSearchText(item).includes(normalizedQuery);

    if (!item.children?.length) {
      return matchesSelf ? [item] : [];
    }

    if (matchesSelf) {
      return [{
        ...item,
        children: sortCollectionEntries(item.children, sortBy)
      }];
    }

    const matchedChildren = sortCollectionEntries(
      item.children.filter(child => getSearchText(child).includes(normalizedQuery)),
      sortBy
    );

    return matchedChildren.length > 0
      ? [{ ...item, children: matchedChildren }]
      : [];
  });

  return sortCollectionItems(filteredItems, sortBy);
};

const renderBadges = (badges?: LinkCollectionBadge[], className?: string) => {
  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <div className={className || 'link-collection-badges'}>
      {badges.map(badge => (
        <span
          key={badge.label}
          className={`link-collection-badge ${badge.tone === 'warning' ? 'is-warning' : ''}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
};

// 上下箭头图标（chevrons-up-down）
const InlineContextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="m7 15 5 5 5-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m7 9 5-5 5 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 向下箭头图标（chevron-down）
const ExpandContextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="m6 9 6 6 6-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 向上箭头图标（chevron-up）
const CollapseContextIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="m18 15-6-6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const normalizeSourceContent = (content: string): string => content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const getSourceLines = (content: string): string[] => {
  const lines = normalizeSourceContent(content).split('\n');

  // Ignore the trailing split artifact created by a final newline.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }

  return lines;
};

const getChildContextState = (state?: ChildContextState): ChildContextState => ({
  revealed: state?.revealed ?? false,
  before: state?.before ?? 0,
  after: state?.after ?? 0,
  placement: state?.placement ?? 'bottom'
});

const getChildRemainingContext = (
  child: LinkCollectionChildItem,
  sourceContent: string | undefined,
  state?: ChildContextState
): { before: boolean; after: boolean } => {
  if (!sourceContent || !child.lineNumber) {
    return { before: false, after: false };
  }

  const sourceLines = getSourceLines(sourceContent);
  if (sourceLines.length <= 1) {
    return { before: false, after: false };
  }

  const normalizedState = getChildContextState(state);
  const safeLineNumber = Math.min(Math.max(child.lineNumber, 1), sourceLines.length);

  return {
    before: safeLineNumber - normalizedState.before > 1,
    after: safeLineNumber + normalizedState.after < sourceLines.length
  };
};

const getNextChildContextDirection = (
  child: LinkCollectionChildItem,
  sourceContent: string | undefined,
  state?: ChildContextState
): ChildContextDirection | null => {
  const remainingContext = getChildRemainingContext(child, sourceContent, state);
  const normalizedState = getChildContextState(state);

  if (remainingContext.before && remainingContext.after) {
    if (!normalizedState.revealed && normalizedState.before === 0 && normalizedState.after === 0) {
      return 'down';
    }

    return normalizedState.after > normalizedState.before ? 'up' : 'down';
  }

  if (remainingContext.after) {
    return 'down';
  }

  if (remainingContext.before) {
    return 'up';
  }

  return null;
};

const getChildVisibleContent = (
  child: LinkCollectionChildItem,
  sourceContent: string | undefined,
  state?: ChildContextState
): string => {
  if (!sourceContent || !child.lineNumber) {
    return child.context || child.title;
  }

  const sourceLines = getSourceLines(sourceContent);
  if (sourceLines.length === 0) {
    return child.context || child.title;
  }

  const normalizedState = getChildContextState(state);
  const safeLineNumber = Math.min(Math.max(child.lineNumber, 1), sourceLines.length);
  const start = Math.max(1, safeLineNumber - normalizedState.before);
  const end = Math.min(sourceLines.length, safeLineNumber + normalizedState.after);

  return sourceLines.slice(start - 1, end).join('\n');
};

const canToggleChildContext = (
  child: LinkCollectionChildItem,
  sourceContent: string | undefined
): boolean => {
  if (!child.sourceNoteId || !child.lineNumber) {
    return false;
  }

  if (!sourceContent) {
    return true;
  }

  return getSourceLines(sourceContent).length > 1;
};

const getChildContextIconMode = (
  child: LinkCollectionChildItem,
  sourceContent: string | undefined,
  state?: ChildContextState
): ChildContextIconMode | null => {
  if (!canToggleChildContext(child, sourceContent)) {
    return null;
  }

  if (!sourceContent) {
    return 'both';
  }

  const normalizedState = getChildContextState(state);
  const hasExpandedContext = normalizedState.revealed;

  if (!hasExpandedContext) {
    const remainingContext = getChildRemainingContext(child, sourceContent, normalizedState);

    if (remainingContext.before && remainingContext.after) {
      return 'both';
    }

    if (remainingContext.after) {
      return 'down';
    }

    if (remainingContext.before) {
      return 'up';
    }

    return null;
  }

  return getNextChildContextDirection(child, sourceContent, normalizedState) || 'collapse';
};

const renderChildContextIcon = (mode: ChildContextIconMode | null) => {
  switch (mode) {
    case 'down':
      return <ExpandContextIcon />;
    case 'up':
    case 'collapse':
      return <CollapseContextIcon />;
    case 'both':
      return <InlineContextIcon />;
    default:
      return null;
  }
};

export const LinkCollection: React.FC<LinkCollectionProps> = ({
  title,
  items,
  emptyText,
  defaultCollapsed = false,
  resetKey,
  query = '',
  sortBy = 'default',
  showFullContext = false
}) => {
  const initialViewState = resetKey ? linkCollectionStateCache[resetKey] : undefined;
  const [isCollapsed, setIsCollapsed] = useState(initialViewState?.isCollapsed ?? defaultCollapsed);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(initialViewState?.expandedItems ?? {});
  const [expandedChildContexts, setExpandedChildContexts] = useState<Record<string, ChildContextState>>(
    initialViewState?.expandedChildContexts ?? {}
  );
  const [sourceNoteContents, setSourceNoteContents] = useState<Record<string, string>>({});
  const [loadingSourceNotes, setLoadingSourceNotes] = useState<Record<string, boolean>>({});
  const sourceNoteContentRequestsRef = useRef<Record<string, Promise<string>>>({});
  const isRestoringStateRef = useRef(false);

  useEffect(() => {
    const cachedState = resetKey ? linkCollectionStateCache[resetKey] : undefined;
    isRestoringStateRef.current = true;

    if (cachedState) {
      setIsCollapsed(cachedState.isCollapsed);
      setExpandedItems(cachedState.expandedItems);
      setExpandedChildContexts(cachedState.expandedChildContexts);
    } else {
      setIsCollapsed(defaultCollapsed);
      setExpandedItems({});
      setExpandedChildContexts({});
    }
  }, [defaultCollapsed, resetKey]);

  useEffect(() => {
    if (isRestoringStateRef.current) {
      isRestoringStateRef.current = false;
      return;
    }

    if (!resetKey) {
      return;
    }

    linkCollectionStateCache[resetKey] = {
      isCollapsed,
      expandedItems,
      expandedChildContexts
    };
  }, [expandedChildContexts, expandedItems, isCollapsed, resetKey]);

  useEffect(() => () => {
    if (!resetKey) {
      return;
    }

    linkCollectionStateCache[resetKey] = {
      isCollapsed,
      expandedItems,
      expandedChildContexts
    };
  }, [expandedChildContexts, expandedItems, isCollapsed, resetKey]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shouldShowBody = !isCollapsed || normalizedQuery.length > 0;
  const matchedItems = filterCollectionItems(items, normalizedQuery, sortBy);
  const visibleCount = normalizedQuery ? `${matchedItems.length}/${items.length}` : `${items.length}`;

  const toggleNestedItem = (itemId: string) => {
    setExpandedItems(previous => ({
      ...previous,
      [itemId]: !(previous[itemId] ?? false)
    }));
  };

  const loadSourceNoteContent = async (sourceNoteId: string): Promise<string | undefined> => {
    if (sourceNoteContents[sourceNoteId] !== undefined) {
      return sourceNoteContents[sourceNoteId];
    }

    const existingRequest = sourceNoteContentRequestsRef.current[sourceNoteId];
    if (existingRequest) {
      return existingRequest;
    }

    setLoadingSourceNotes(previous => ({
      ...previous,
      [sourceNoteId]: true
    }));

    const request = (async () => {
      try {
        const note = await window.electron?.ipcRenderer.invoke('note:get', sourceNoteId) as { content?: string } | null;
        const content = note?.content || '';

        setSourceNoteContents(previous => ({
          ...previous,
          [sourceNoteId]: content
        }));

        return content;
      } finally {
        delete sourceNoteContentRequestsRef.current[sourceNoteId];
        setLoadingSourceNotes(previous => ({
          ...previous,
          [sourceNoteId]: false
        }));
      }
    })();

    sourceNoteContentRequestsRef.current[sourceNoteId] = request;
    return request;
  };

  const loadMoreChildContext = async (
    child: LinkCollectionChildItem,
    direction?: ChildContextAction
  ): Promise<void> => {
    if (!child.sourceNoteId || !child.lineNumber) {
      return;
    }

    const sourceContent = await loadSourceNoteContent(child.sourceNoteId);
    if (typeof sourceContent !== 'string') {
      return;
    }

    const sourceLines = getSourceLines(sourceContent);
    if (sourceLines.length <= 1) {
      return;
    }

    setExpandedChildContexts(previous => {
      const currentState = getChildContextState(previous[child.id]);
      const nextDirection = getNextChildContextDirection(child, sourceContent, currentState);
      const remainingContext = getChildRemainingContext(child, sourceContent, currentState);
      const targetDirection = direction || nextDirection;

      if (!currentState.revealed) {
        if (!targetDirection || targetDirection === 'collapse') {
          return previous;
        }

        const nextState: ChildContextState = {
          revealed: true,
          before: 0,
          after: 0,
          // Keep collapse actions anchored to the edge that initiated the last load.
          placement: targetDirection === 'down' ? 'bottom' : 'top'
        };

        if (targetDirection === 'down') {
          nextState.after += CHILD_CONTEXT_LOAD_STEP;
        } else {
          nextState.before += CHILD_CONTEXT_LOAD_STEP;
        }

        return {
          ...previous,
          [child.id]: nextState
        };
      }

      if (!targetDirection || targetDirection === 'collapse') {
        const nextState = { ...previous };
        delete nextState[child.id];
        return nextState;
      }

      const nextState: ChildContextState = {
        revealed: true,
        before: currentState.before,
        after: currentState.after,
        placement: targetDirection === 'down' ? 'bottom' : 'top'
      };

      if (targetDirection === 'down') {
        nextState.after += CHILD_CONTEXT_LOAD_STEP;
      } else {
        nextState.before += CHILD_CONTEXT_LOAD_STEP;
      }

      return {
        ...previous,
        [child.id]: nextState
      };
    });
  };

  const collapseChildContext = (childId: string): void => {
    setExpandedChildContexts(previous => {
      if (!(childId in previous)) {
        return previous;
      }

      const nextState = { ...previous };
      delete nextState[childId];
      return nextState;
    });
  };

  useEffect(() => {
    const sourceNoteIds = Array.from(new Set(
      matchedItems.flatMap(item => item.children?.map(child => child.sourceNoteId).filter(Boolean) || [])
    )) as string[];

    sourceNoteIds.forEach(sourceNoteId => {
      if (sourceNoteContents[sourceNoteId] === undefined && !loadingSourceNotes[sourceNoteId]) {
        void loadSourceNoteContent(sourceNoteId);
      }
    });
  }, [loadingSourceNotes, matchedItems, sourceNoteContents]);

  return (
    <section className={`link-collection ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div
        className="link-collection-header"
        role="button"
        tabIndex={0}
        onClick={() => setIsCollapsed(previous => !previous)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsCollapsed(previous => !previous);
          }
        }}
      >
        <span
          className={`link-collection-disclosure ${shouldShowBody ? 'is-open' : ''}`}
          aria-hidden="true"
        />
        <span className="link-collection-title">{title}</span>
        <span className="link-collection-count">{visibleCount}</span>
      </div>

      {shouldShowBody && (
        <div className="link-collection-body">
          {matchedItems.length > 0 ? (
            <div className="link-collection-list">
              {matchedItems.map(item => {
                if (item.children && item.children.length > 0) {
                  const isNestedExpanded = expandedItems[item.id] ?? item.defaultExpanded ?? false;
                  const shouldShowNestedBody = normalizedQuery.length > 0 || isNestedExpanded;

                  return (
                    <div key={item.id} className="link-collection-group">
                      <div
                        className="link-collection-group-header"
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleNestedItem(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleNestedItem(item.id);
                          }
                        }}
                      >
                        <span
                          className={`link-collection-disclosure ${shouldShowNestedBody ? 'is-open' : ''}`}
                          aria-hidden="true"
                        />
                        <div className="link-collection-group-title">{item.title}</div>
                        {renderBadges(item.badges, 'link-collection-group-badges')}
                      </div>

                      {shouldShowNestedBody && (
                        <div className="link-collection-group-body">
                          {item.children.map(child => {
                            const isClickable = typeof child.onOpen === 'function';
                            const sourceContent = child.sourceNoteId ? sourceNoteContents[child.sourceNoteId] : undefined;
                            const childContextState = expandedChildContexts[child.id];
                            const normalizedChildContextState = getChildContextState(childContextState);
                            const hasExpandedChildContext = normalizedChildContextState.revealed;
                            const canExpandChildContext = canToggleChildContext(child, sourceContent);
                            const displayPrimaryText = hasExpandedChildContext
                              ? getChildVisibleContent(
                                child,
                                sourceContent,
                                normalizedChildContextState
                              )
                              : child.title;
                            const childContextIconMode = getChildContextIconMode(
                              child,
                              sourceContent,
                              normalizedChildContextState
                            );
                            const childRemainingContext = hasExpandedChildContext
                              ? getChildRemainingContext(child, sourceContent, normalizedChildContextState)
                              : { before: false, after: false };
                            const shouldShowTopContextToggle = hasExpandedChildContext && childRemainingContext.before;
                            const shouldShowBottomContextToggle = hasExpandedChildContext && childRemainingContext.after;
                            const shouldShowTopCollapseToggle = hasExpandedChildContext
                              && !childRemainingContext.before
                              && !childRemainingContext.after
                              && normalizedChildContextState.placement === 'top'
                              && childContextIconMode === 'collapse';
                            const shouldShowBottomCollapseToggle = hasExpandedChildContext
                              && !childRemainingContext.before
                              && !childRemainingContext.after
                              && normalizedChildContextState.placement === 'bottom'
                              && childContextIconMode !== null;
                            const hasDualContextToggles = shouldShowTopContextToggle
                              && (shouldShowBottomContextToggle || shouldShowBottomCollapseToggle);
                            const shouldShowInlineContextToggle = childContextIconMode !== null
                              && !hasExpandedChildContext;
                            const shouldStabilizeActionPosition = Boolean(child.action && canExpandChildContext);
                            const isLoadingContext = child.sourceNoteId
                              ? loadingSourceNotes[child.sourceNoteId] ?? false
                              : false;

                            return (
                              <div
                                key={child.id}
                                className={[
                                  'link-collection-link-row',
                                  isClickable ? 'is-clickable' : '',
                                  shouldShowInlineContextToggle ? 'has-inline-context-toggle' : '',
                                  shouldShowTopContextToggle ? 'has-top-context-toggle' : '',
                                  (shouldShowBottomContextToggle || shouldShowBottomCollapseToggle) ? 'has-bottom-context-toggle' : '',
                                  shouldStabilizeActionPosition ? 'has-stable-action-slot' : '',
                                  hasDualContextToggles ? 'has-dual-context-toggle' : '',
                                  child.badges?.some(badge => badge.tone === 'warning') ? 'is-warning' : ''
                                ].filter(Boolean).join(' ')}
                                role={isClickable ? 'button' : undefined}
                                tabIndex={isClickable ? 0 : -1}
                                onDoubleClick={() => {
                                  if (child.onOpen) {
                                    void child.onOpen();
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (isClickable && (event.key === 'Enter' || event.key === ' ')) {
                                    event.preventDefault();
                                    void child.onOpen?.();
                                  }
                                }}
                              >
                                {(shouldShowTopContextToggle || shouldShowTopCollapseToggle) && (
                                  <div className="link-collection-link-row-toggle-header">
                                    <div
                                      className={`link-collection-link-row-toggle is-top ${isLoadingContext ? 'is-active' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      title={isLoadingContext ? '正在加载上下文' : shouldShowTopCollapseToggle ? '收起上下文' : '加载上方上下文'}
                                      aria-label={isLoadingContext ? '正在加载上下文' : shouldShowTopCollapseToggle ? '收起上下文' : '加载上方上下文'}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (!isLoadingContext) {
                                          if (shouldShowTopCollapseToggle) {
                                            collapseChildContext(child.id);
                                          } else {
                                            void loadMoreChildContext(child, 'up');
                                          }
                                        }
                                      }}
                                      onDoubleClick={(event) => {
                                        event.stopPropagation();
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (!isLoadingContext) {
                                            if (shouldShowTopCollapseToggle) {
                                              collapseChildContext(child.id);
                                            } else {
                                              void loadMoreChildContext(child, 'up');
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      {renderChildContextIcon('up')}
                                    </div>
                                  </div>
                                )}

                                <div className="link-collection-link-row-main">
                                  <div
                                    className={`link-collection-link-row-title ${hasExpandedChildContext ? 'is-source-line' : ''}`}
                                  >
                                    {displayPrimaryText}
                                  </div>
                                  {!hasExpandedChildContext && renderBadges(child.badges, 'link-collection-link-row-badges')}
                                  {child.action && (
                                    <div className="link-collection-link-row-actions">
                                      <div
                                        className="link-collection-item-text-action"
                                        role="button"
                                        tabIndex={0}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void child.action?.onTrigger();
                                        }}
                                        onDoubleClick={(event) => {
                                          event.stopPropagation();
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void child.action?.onTrigger();
                                          }
                                        }}
                                      >
                                        {child.action.label}
                                      </div>

                                      {shouldStabilizeActionPosition && (
                                        <span
                                          className="link-collection-link-row-toggle-placeholder"
                                          aria-hidden="true"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>

                                {shouldShowInlineContextToggle && (
                                  <div className="link-collection-link-row-toggle-inline">
                                    <div
                                      className={`link-collection-link-row-toggle ${isLoadingContext ? 'is-active' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      title={isLoadingContext ? '正在加载上下文' : '更多上下文'}
                                      aria-label={isLoadingContext ? '正在加载上下文' : '更多上下文'}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (!isLoadingContext) {
                                          void loadMoreChildContext(child);
                                        }
                                      }}
                                      onDoubleClick={(event) => {
                                        event.stopPropagation();
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (!isLoadingContext) {
                                            void loadMoreChildContext(child);
                                          }
                                        }
                                      }}
                                    >
                                      {renderChildContextIcon(childContextIconMode)}
                                    </div>
                                  </div>
                                )}

                                {hasExpandedChildContext && child.metaLines && child.metaLines.length > 0 && (
                                  <div className="link-collection-link-row-meta">
                                    {child.metaLines.map(metaLine => (
                                      <div key={`${child.id}-${metaLine}`} className="link-collection-link-row-meta-line">
                                        {metaLine}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {(shouldShowBottomContextToggle || shouldShowBottomCollapseToggle) && (
                                  <div className="link-collection-link-row-toggle-footer">
                                    <div
                                      className={`link-collection-link-row-toggle is-bottom ${isLoadingContext ? 'is-active' : ''}`}
                                      role="button"
                                      tabIndex={0}
                                      title={isLoadingContext ? '正在加载上下文' : '更多上下文'}
                                      aria-label={isLoadingContext ? '正在加载上下文' : '更多上下文'}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (!isLoadingContext) {
                                          if (shouldShowBottomCollapseToggle) {
                                            collapseChildContext(child.id);
                                          } else {
                                            void loadMoreChildContext(child, 'down');
                                          }
                                        }
                                      }}
                                      onDoubleClick={(event) => {
                                        event.stopPropagation();
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          if (!isLoadingContext) {
                                            if (shouldShowBottomCollapseToggle) {
                                              collapseChildContext(child.id);
                                            } else {
                                              void loadMoreChildContext(child, 'down');
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      {renderChildContextIcon(shouldShowBottomContextToggle ? 'down' : childContextIconMode)}
                                    </div>
                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const isClickable = typeof item.onOpen === 'function';

                return (
                  <div
                    key={item.id}
                    className={[
                      'link-collection-item',
                      isClickable ? 'is-clickable' : '',
                      item.badges?.some(badge => badge.tone === 'warning') ? 'is-warning' : ''
                    ].filter(Boolean).join(' ')}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : -1}
                    onClick={() => {
                      if (item.onOpen) {
                        void item.onOpen();
                      }
                    }}
                    onKeyDown={(event) => {
                      if (isClickable && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        void item.onOpen?.();
                      }
                    }}
                  >
                    <div className="link-collection-item-main">
                      <div className="link-collection-item-top">
                        <div className="link-collection-item-title-group">
                          <Icon name={item.leadingIcon || 'file'} size={14} />
                          <div className="link-collection-item-title">{item.title}</div>
                        </div>
                        {renderBadges(item.badges)}
                      </div>

                      {item.metaLines && item.metaLines.length > 0 && (
                        <div className="link-collection-item-meta">
                          {item.metaLines.map(metaLine => (
                            <div key={`${item.id}-${metaLine}`} className="link-collection-item-meta-line">
                              {metaLine}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.context && (
                        <div className={`link-collection-item-context ${showFullContext ? 'is-expanded' : ''}`}>
                          {item.context}
                        </div>
                      )}
                    </div>

                    {item.action && (
                      <div className="link-collection-item-footer">
                        <div />
                        <div
                          className="link-collection-item-text-action"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            void item.action?.onTrigger();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              void item.action?.onTrigger();
                            }
                          }}
                        >
                          {item.action.label}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="link-collection-empty">
              {normalizedQuery ? '娌℃湁鍖归厤缁撴灉' : emptyText}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
