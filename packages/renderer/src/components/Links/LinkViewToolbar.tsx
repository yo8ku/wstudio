/**
 * LinkViewToolbar.tsx
 * Unified toolbar for link collections.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '../common/SearchInput';
import {
  type LinkCollectionSort,
  getNextLinkCollectionSort,
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
  <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none'>
    <g stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M4 6h9' />
      <path d='M4 12h7' />
      <path d='M4 18h7' />
      <path d='M15 15l3 3l3-3' />
      <path d='M18 6v12' />
    </g>
  </svg>
);

const ContextToolbarIcon: React.FC = () => (
  <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none'>
    <path d='M12 2v20' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
    <path d='m8 18 4 4 4-4' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
    <path d='m8 6 4-4 4 4' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
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
  onToggleContext,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));
  const currentSortLabel = (() => {
    switch (sortBy) {
      case 'title-asc':
        return translateText('linksPanel.sort.titleAsc', '标题 A-Z');
      case 'title-desc':
        return translateText('linksPanel.sort.titleDesc', '标题 Z-A');
      case 'context-desc':
        return translateText('linksPanel.sort.contextDesc', '上下文更多');
      case 'default':
      default:
        return translateText('linksPanel.sort.default', '默认');
    }
  })();

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

  const sortTitle = translateText('linksPanel.toolbar.sortTitle', '排序: {{label}}').replace('{{label}}', currentSortLabel);
  const contextTitle = showFullContext
    ? translateText('linksPanel.toolbar.showLessContext', '收起更多上下文')
    : translateText('linksPanel.toolbar.showMoreContext', '显示更多上下文');

  return (
    <div className='link-view-toolbar'>
      {stats.length > 0 && (
        <div className='link-view-toolbar-summary'>
          {stats.map((stat) => (
            <div key={stat.label} className='link-view-toolbar-summary-item'>
              <span className='link-view-toolbar-summary-label'>{`${stat.label}:`}</span>
              <span className='link-view-toolbar-summary-count'>{stat.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className='link-view-toolbar-actions'>
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder={searchPlaceholder}
          className='link-view-toolbar-search-control'
          expandedWidth={220}
          iconSize={14}
          expanded={isSearchVisible}
          onExpandedChange={handleExpandedChange}
          collapseOnBlur='always'
          clearOnCollapse={false}
          hideIconWhenExpanded
        />

        <div
          className={`link-view-toolbar-action ${sortBy !== 'default' ? 'is-active' : ''}`}
          role='button'
          tabIndex={0}
          title={sortTitle}
          aria-label={sortTitle}
          onClick={() => onSortChange(getNextLinkCollectionSort(sortBy))}
          onKeyDown={handleActionKeyDown(() => onSortChange(getNextLinkCollectionSort(sortBy)))}
        >
          <SortToolbarIcon />
        </div>

        <div
          className={`link-view-toolbar-action link-view-toolbar-action--context ${showFullContext ? 'is-active' : ''}`}
          role='button'
          tabIndex={0}
          title={contextTitle}
          aria-label={contextTitle}
          onClick={onToggleContext}
          onKeyDown={handleActionKeyDown(onToggleContext)}
        >
          <ContextToolbarIcon />
        </div>
      </div>
    </div>
  );
};
