/**
 * LinkViewToolbar.tsx
 * 统一的链接视图工具栏。
 * 功能：显示链接统计、搜索、排序和上下文展开控制。
 */

import React from 'react';
import { SearchInput } from '../common/SearchInput';
import {
  type LinkCollectionSort,
  getLinkCollectionSortLabel,
  getNextLinkCollectionSort
} from './LinkCollection';
import './LinkViewToolbar.scss';

export interface LinkViewToolbarStat {
  label: string;
  count: number;
}

export interface LinkViewToolbarProps {
  query: string;
  sortBy: LinkCollectionSort;
  isSearchVisible: boolean;
  showFullContext: boolean;
  searchPlaceholder: string;
  stats?: LinkViewToolbarStat[];
  onQueryChange: (query: string) => void;
  onToggleSearch: () => void;
  onSortChange: (sortBy: LinkCollectionSort) => void;
  onToggleContext: () => void;
}

const SortToolbarIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h9" />
      <path d="M4 12h7" />
      <path d="M4 18h7" />
      <path d="M15 15l3 3l3-3" />
      <path d="M18 6v12" />
    </g>
  </svg>
);

const ContextToolbarIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m8 18 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m8 6 4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LinkViewToolbar: React.FC<LinkViewToolbarProps> = ({
  query,
  sortBy,
  isSearchVisible,
  showFullContext,
  searchPlaceholder,
  stats = [],
  onQueryChange,
  onToggleSearch,
  onSortChange,
  onToggleContext
}) => {
  const currentSortLabel = getLinkCollectionSortLabel(sortBy);

  const handleActionKeyDown =
    (callback: () => void) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        callback();
      }
    };

  const openSearch = () => {
    if (!isSearchVisible) {
      onToggleSearch();
    }
  };

  const closeSearch = () => {
    if (!isSearchVisible) {
      return;
    }

    onQueryChange('');
    onToggleSearch();
  };

  const handleExpandedChange = (expanded: boolean) => {
    if (expanded) {
      openSearch();
      return;
    }

    closeSearch();
  };

  return (
    <div className="link-view-toolbar">
      {stats.length > 0 && (
        <div className="link-view-toolbar-summary">
          {stats.map((stat) => (
            <div key={stat.label} className="link-view-toolbar-summary-item">
              <span className="link-view-toolbar-summary-label">{stat.label}：</span>
              <span className="link-view-toolbar-summary-count">{stat.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="link-view-toolbar-actions">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder={searchPlaceholder}
          className="link-view-toolbar-search-control"
          expandedWidth={220}
          iconSize={14}
          expanded={isSearchVisible}
          onExpandedChange={handleExpandedChange}
          collapseOnBlur="always"
          clearOnCollapse={false}
          hideIconWhenExpanded
        />

        <div
          className={`link-view-toolbar-action ${sortBy !== 'default' ? 'is-active' : ''}`}
          role="button"
          tabIndex={0}
          title={`排序：${currentSortLabel}`}
          aria-label={`排序：${currentSortLabel}`}
          onClick={() => onSortChange(getNextLinkCollectionSort(sortBy))}
          onKeyDown={handleActionKeyDown(() => onSortChange(getNextLinkCollectionSort(sortBy)))}
        >
          <SortToolbarIcon />
        </div>

        <div
          className={`link-view-toolbar-action link-view-toolbar-action--context ${showFullContext ? 'is-active' : ''}`}
          role="button"
          tabIndex={0}
          title={showFullContext ? '收起更多上下文' : '更多上下文'}
          aria-label={showFullContext ? '收起更多上下文' : '更多上下文'}
          onClick={onToggleContext}
          onKeyDown={handleActionKeyDown(onToggleContext)}
        >
          <ContextToolbarIcon />
        </div>
      </div>
    </div>
  );
};
