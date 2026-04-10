import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../Icons';
import { SearchInput } from '../../../common/SearchInput';
import { loadInstalledPluginExtensions, subscribeInstalledPluginExtensions } from './installedPluginExtensions';
import { MOCK_LOCAL_EXTENSIONS } from './mockExtensions';
import type { LocalExtensionItem } from './types';
import './Extensions.scss';

interface ExtensionGroup {
  readonly id: string;
  readonly title: string;
  readonly emptyMessage: string;
  readonly items: readonly LocalExtensionItem[];
}

type ExtensionIconMode = 'large' | 'compact' | 'hidden';

const DEFAULT_EXPANDED_GROUPS = ['downloaded'] as const;
const LARGE_ICON_MIN_WIDTH = 280;
const COMPACT_ICON_MIN_WIDTH = 220;

function OfficialPublisherIcon(): React.ReactElement {
  return (
    <svg
      className="extensions-sidebar__item-author-icon"
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

function matchesSearch(item: LocalExtensionItem, query: string): boolean {
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

function mergeExtensions(
  installedItems: readonly LocalExtensionItem[],
): readonly LocalExtensionItem[] {
  const mergedItems = [...installedItems, ...MOCK_LOCAL_EXTENSIONS];
  const seenIds = new Set<string>();

  return mergedItems.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }

    seenIds.add(item.id);
    return true;
  });
}

function createGroups(items: readonly LocalExtensionItem[]): readonly ExtensionGroup[] {
  return [
    {
      id: 'downloaded',
      title: '已下载',
      emptyMessage: '没有匹配的已下载扩展。',
      items,
    },
  ];
}

function getExtensionTabPath(item: LocalExtensionItem): string {
  return `extension:/${item.id}`;
}

function getExtensionTabTitle(item: LocalExtensionItem): string {
  return `Extension：${item.displayName}`;
}

export const Extensions: React.FC = () => {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [installedPluginExtensions, setInstalledPluginExtensions] = useState<readonly LocalExtensionItem[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED_GROUPS),
  );
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

  useEffect(() => {
    let disposed = false;

    const refreshInstalledPluginExtensions = async (): Promise<void> => {
      try {
        const nextExtensions = await loadInstalledPluginExtensions();

        if (!disposed) {
          setInstalledPluginExtensions(nextExtensions);
        }
      } catch (error) {
        console.error('[Extensions] failed to load installed plugin extensions:', error);

        if (!disposed) {
          setInstalledPluginExtensions([]);
        }
      }
    };

    void refreshInstalledPluginExtensions();

    const unsubscribe = subscribeInstalledPluginExtensions(() => {
      void refreshInstalledPluginExtensions();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const filteredExtensions = mergeExtensions(installedPluginExtensions).filter(
    item => matchesSearch(item, searchQuery),
  );
  const groups = createGroups(filteredExtensions);

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

  const openExtension = (item: LocalExtensionItem): void => {
    setSelectedExtensionId(item.id);
    window.dispatchEvent(new CustomEvent('open-editor-tab', {
      detail: {
        path: getExtensionTabPath(item),
        title: getExtensionTabTitle(item),
        type: 'extension',
      },
    }));
  };

  return (
    <div
      ref={sidebarRef}
      className={`extensions-sidebar extensions-sidebar--icon-${iconMode}`}
    >
      <div className="extensions-sidebar__toolbar">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索扩展"
          alwaysExpanded={true}
          expandedWidth="100%"
          className="extensions-sidebar__search"
        />
      </div>

      <div className="extensions-sidebar__groups">
        {groups.map(group => {
          const isExpanded = expandedGroupIds.has(group.id);

          return (
            <section
              key={group.id}
              className="extensions-sidebar__section"
              aria-labelledby={`extensions-group-${group.id}`}
            >
              <button
                type="button"
                className="extensions-sidebar__section-toggle"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isExpanded}
                aria-controls={`extensions-group-panel-${group.id}`}
              >
                <span className="extensions-sidebar__section-toggle-main">
                  <Icon
                    name="chevron-right"
                    size={14}
                    className={`extensions-sidebar__section-chevron${isExpanded ? ' is-expanded' : ''}`}
                  />
                  <span
                    id={`extensions-group-${group.id}`}
                    className="extensions-sidebar__section-title"
                  >
                    {group.title}
                  </span>
                </span>
                <span className="extensions-sidebar__section-count">{group.items.length}</span>
              </button>

              {isExpanded && (
                <div
                  id={`extensions-group-panel-${group.id}`}
                  className="extensions-sidebar__section-body"
                >
                  {group.items.length > 0 ? (
                    <ul className="extensions-sidebar__list">
                      {group.items.map(item => {
                        const isSelected = item.id === selectedExtensionId;

                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`extensions-sidebar__item${isSelected ? ' is-selected' : ''}`}
                              onClick={() => openExtension(item)}
                              aria-pressed={isSelected}
                              title={item.displayName}
                            >
                              {iconMode !== 'hidden' && item.badgeImagePath && (
                                <img
                                  src={item.badgeImagePath}
                                  alt=""
                                  className="extensions-sidebar__item-icon-badge"
                                  aria-hidden="true"
                                />
                              )}
                              <div className="extensions-sidebar__item-icon">
                                {iconMode !== 'hidden' && (
                                  <>
                                    {item.iconPath ? (
                                      <img
                                        src={item.iconPath}
                                        alt=""
                                        className="extensions-sidebar__item-icon-image"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Icon name={item.iconName} size={iconSize} />
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="extensions-sidebar__item-body">
                                <div className="extensions-sidebar__item-header">
                                  <strong
                                    className="extensions-sidebar__item-name"
                                    title={item.displayName}
                                  >
                                    {item.displayName}
                                  </strong>
                                  <span
                                    className="extensions-sidebar__item-downloads"
                                    title={item.downloadCount}
                                  >
                                    {item.downloadCount}
                                  </span>
                                </div>

                                <p className="extensions-sidebar__item-description">
                                  {item.description}
                                </p>

                                <div
                                  className="extensions-sidebar__item-author"
                                  title={item.publisher}
                                >
                                  {item.isOfficialPublisher && <OfficialPublisherIcon />}
                                  <span className="extensions-sidebar__item-author-name">
                                    {item.publisher}
                                  </span>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="extensions-sidebar__empty">{group.emptyMessage}</div>
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
