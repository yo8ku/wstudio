/**
 * Standalone mock extensions panel UI.
 * It renders independent demo data so the visual panel can survive plugin API rewrites.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { SearchInput } from '../common/SearchInput';
import type { ExtensionPanelItem } from './types';
import './ExtensionPanel.scss';

interface ExtensionPanelGroup {
  readonly id: string;
  readonly title: string;
  readonly emptyMessage: string;
  readonly items: readonly ExtensionPanelItem[];
}

interface ExtensionPanelLabels {
  readonly searchPlaceholder: string;
  readonly downloadedTitle: string;
  readonly emptyDownloaded: string;
}

export interface ExtensionPanelProps {
  readonly items: readonly ExtensionPanelItem[];
  readonly labels?: Partial<ExtensionPanelLabels>;
  readonly selectedItemId?: string | null;
  readonly defaultSelectedItemId?: string | null;
  readonly onSelectItem?: (item: ExtensionPanelItem) => void;
}

type ExtensionIconMode = 'large' | 'compact' | 'hidden';

const DEFAULT_EXPANDED_GROUP_IDS = ['downloaded'] as const;
const LARGE_ICON_MIN_WIDTH = 280;
const COMPACT_ICON_MIN_WIDTH = 220;
const DEFAULT_LABELS: ExtensionPanelLabels = {
  searchPlaceholder: '搜索扩展',
  downloadedTitle: '已下载',
  emptyDownloaded: '没有匹配的已下载扩展。',
};

function OfficialPublisherIcon(): React.ReactElement {
  return (
    <svg
      className="extension-panel__item-author-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.335 2.06532L11.4114 2.21789L11.9879 3.75087C12.0332 3.87159 12.1284 3.96685 12.2492 4.01214L13.7292 4.56741C14.3787 4.81108 14.7278 5.50512 14.5547 6.16178L14.5131 6.29246L13.8245 7.81529C13.7712 7.93268 13.7712 8.06739 13.8245 8.18478L14.4784 9.62399C14.7654 10.2556 14.5214 10.9931 13.9347 11.3351L13.7822 11.4115L12.2492 11.9879C12.1284 12.0332 12.0332 12.1285 11.9879 12.2492L11.4326 13.7293C11.189 14.3788 10.4949 14.7278 9.83826 14.5547L9.70758 14.5131L8.18475 13.8245C8.06736 13.7712 7.93265 13.7712 7.81526 13.8245L6.37605 14.4785C5.74448 14.7654 5.00693 14.5215 4.66498 13.9347L4.58856 13.7822L4.01211 12.2492C3.96682 12.1285 3.87156 12.0332 3.75084 11.9879L2.27076 11.4327C1.62126 11.189 1.27224 10.4949 1.44531 9.83829L1.48695 9.70761L2.17552 8.18478C2.22886 8.06739 2.22886 7.93268 2.17552 7.81529L1.52159 6.37608C1.23462 5.74451 1.47858 5.00696 2.06529 4.66501L2.21786 4.58859L3.75084 4.01214C3.87156 3.96685 3.96682 3.87159 4.01211 3.75087L4.56738 2.27079C4.81105 1.62129 5.50509 1.27227 6.16175 1.44534L6.29243 1.48698L7.81526 2.17555C7.93265 2.22889 8.06736 2.22889 8.18475 2.17555L9.62396 1.52162C10.2555 1.23465 10.9931 1.47861 11.335 2.06532ZM10.1639 5.70595L6.97825 9.34669L5.8158 8.18424C5.64139 8.00983 5.35862 8.00983 5.18421 8.18424C5.0098 8.35865 5.0098 8.64142 5.18421 8.81583L6.68421 10.3158C6.86689 10.4985 7.16599 10.4885 7.33611 10.2941L10.8361 6.29412C10.9985 6.1085 10.9797 5.82635 10.7941 5.66393C10.6085 5.50151 10.3263 5.52032 10.1639 5.70595Z" />
    </svg>
  );
}

function getIconMode(sidebarWidth: number): ExtensionIconMode {
  if (sidebarWidth >= LARGE_ICON_MIN_WIDTH) {
    return 'large';
  }

  if (sidebarWidth >= COMPACT_ICON_MIN_WIDTH) {
    return 'compact';
  }

  return 'hidden';
}

function getIconSize(iconMode: ExtensionIconMode): number {
  if (iconMode === 'large') {
    return 22;
  }

  if (iconMode === 'compact') {
    return 16;
  }

  return 0;
}

function matchesSearch(item: ExtensionPanelItem, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    item.displayName,
    item.description,
    item.id,
    item.publisher,
  ].some(value => value.toLowerCase().includes(normalizedQuery));
}

function createGroups(
  items: readonly ExtensionPanelItem[],
  labels: ExtensionPanelLabels,
): readonly ExtensionPanelGroup[] {
  return [
    {
      id: 'downloaded',
      title: labels.downloadedTitle,
      emptyMessage: labels.emptyDownloaded,
      items,
    },
  ];
}

function handleKeyboardAction(
  event: React.KeyboardEvent<HTMLDivElement>,
  action: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export const ExtensionPanel: React.FC<ExtensionPanelProps> = ({
  items,
  labels,
  selectedItemId,
  defaultSelectedItemId = null,
  onSelectItem,
}) => {
  const resolvedLabels: ExtensionPanelLabels = { ...DEFAULT_LABELS, ...labels };
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const [internalSelectedItemId, setInternalSelectedItemId] = useState<string | null>(
    defaultSelectedItemId,
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED_GROUP_IDS),
  );
  const resolvedSelectedItemId = selectedItemId === undefined
    ? internalSelectedItemId
    : selectedItemId;
  const iconMode = getIconMode(sidebarWidth);
  const iconSize = getIconSize(iconMode);

  useEffect(() => {
    const sidebarElement = sidebarRef.current;
    if (!sidebarElement) {
      return;
    }

    const updateSidebarWidth = (): void => {
      setSidebarWidth(sidebarElement.getBoundingClientRect().width);
    };

    updateSidebarWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSidebarWidth);

      return () => {
        window.removeEventListener('resize', updateSidebarWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateSidebarWidth);
    });

    observer.observe(sidebarElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  const filteredItems = items.filter(item => matchesSearch(item, searchQuery));
  const groups = createGroups(filteredItems, resolvedLabels);

  const toggleGroup = (groupId: string): void => {
    setExpandedGroupIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  };

  const handleSelectItem = (item: ExtensionPanelItem): void => {
    if (selectedItemId === undefined) {
      setInternalSelectedItemId(item.id);
    }

    onSelectItem?.(item);
  };

  return (
    <div
      ref={sidebarRef}
      className={`extension-panel extension-panel--icon-${iconMode}`}
    >
      <div className="extension-panel__toolbar">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={resolvedLabels.searchPlaceholder}
          alwaysExpanded={true}
          expandedWidth="100%"
          className="extension-panel__search"
        />
      </div>

      <div className="extension-panel__groups">
        {groups.map(group => {
          const isExpanded = expandedGroupIds.has(group.id);

          return (
            <section
              key={group.id}
              className="extension-panel__section"
              aria-labelledby={`extension-panel-group-${group.id}`}
            >
              <div
                role="button"
                tabIndex={0}
                className="extension-panel__section-toggle"
                onClick={() => toggleGroup(group.id)}
                onKeyDown={(event) => handleKeyboardAction(event, () => toggleGroup(group.id))}
                aria-expanded={isExpanded}
                aria-controls={`extension-panel-group-panel-${group.id}`}
              >
                <span className="extension-panel__section-toggle-main">
                  <Icon
                    name="chevron-right"
                    size={14}
                    className={`extension-panel__section-chevron${isExpanded ? ' is-expanded' : ''}`}
                  />
                  <span
                    id={`extension-panel-group-${group.id}`}
                    className="extension-panel__section-title"
                  >
                    {group.title}
                  </span>
                </span>
                <span className="extension-panel__section-count">{group.items.length}</span>
              </div>

              {isExpanded && (
                <div
                  id={`extension-panel-group-panel-${group.id}`}
                  className="extension-panel__section-body"
                >
                  {group.items.length > 0 ? (
                    <ul className="extension-panel__list">
                      {group.items.map(item => {
                        const isSelected = item.id === resolvedSelectedItemId;

                        return (
                          <li key={item.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              className={`extension-panel__item${isSelected ? ' is-selected' : ''}`}
                              onClick={() => handleSelectItem(item)}
                              onKeyDown={(event) => handleKeyboardAction(event, () => handleSelectItem(item))}
                              aria-pressed={isSelected}
                              title={item.displayName}
                            >
                              <div className="extension-panel__item-icon">
                                {iconMode !== 'hidden' && (
                                  item.iconPath ? (
                                    <img
                                      src={item.iconPath}
                                      alt=""
                                      className="extension-panel__item-icon-image"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Icon name={item.iconName} size={iconSize} />
                                  )
                                )}
                              </div>
                              <div className="extension-panel__item-body">
                                <div className="extension-panel__item-header">
                                  <strong
                                    className="extension-panel__item-name"
                                    title={item.displayName}
                                  >
                                    {item.displayName}
                                  </strong>
                                  <span
                                    className="extension-panel__item-downloads"
                                    title={item.downloadCount}
                                  >
                                    {item.downloadCount}
                                  </span>
                                </div>

                                <p className="extension-panel__item-description">
                                  {item.description}
                                </p>

                                <div
                                  className="extension-panel__item-author"
                                  title={item.publisher}
                                >
                                  {item.isOfficialPublisher && <OfficialPublisherIcon />}
                                  <span className="extension-panel__item-author-name">
                                    {item.publisher}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="extension-panel__empty">{group.emptyMessage}</div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
