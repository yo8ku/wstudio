/**
 * Search panel component.
 * Executes workspace-wide text search from the sidebar without using button elements.
 */

import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseWorkspaceSearchQuery } from '@note-studio/shared';
import { LuChevronsUpDown, LuX } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { TreeNodeRow } from '../../../Explorer/Common/TreeNode';
import { TreeView } from '../../../Explorer/Common/TreeView';
import { Icon } from '../../../Icons/Icon';
import { Tooltip } from '../../../Tooltip/Tooltip';
import { CustomScrollbar, type CustomScrollbarRef } from '../../../common/CustomScrollbar';
import { PressableControl } from '../../../common/PressableControl';
import { SearchToolbarIcon } from '../../../common/SearchToolbarIcon';
import { SearchToolbarField } from '../../../common/SearchToolbarField';
import { SidebarHeaderMenu, type SidebarHeaderMenuItem } from '../SidebarHeaderMenu';
import { openNoteInEditor } from '../../../../utils/noteLinking';
import { electronStore } from '../../../../services/ElectronStoreService';
import type {
  WorkspaceSearchBlockCandidate,
  WorkspaceTextReplaceUpdatedTarget,
} from '../../../../types/electron';
import {
  createWorkspaceSearchMatcher,
  findClosestWorkspaceSearchMatchRange,
  type WorkspaceSearchMatchOptions,
} from '../../../../utils/workspaceSearchMatch';
import './Search.scss';

export interface SearchProps {
  refreshActionId?: number;
  clearActionId?: number;
  collapseAllActionId?: number;
}

export type SearchSortMode =
  | 'fileNameAsc'
  | 'fileNameDesc'
  | 'updatedAtDesc'
  | 'updatedAtAsc'
  | 'createdAtDesc'
  | 'createdAtAsc';

interface SearchHistoryEntry {
  query: string;
  timestamp: number;
}

interface SearchAssistOption {
  token: string;
  translationKey: string;
  defaultDescription: string;
}

interface ActivePathAssistState {
  kind: 'path' | 'tag' | 'block';
  token: string;
  tokenStart: number;
  value: string;
}

interface SearchResult {
  absolutePath: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
  matchedText?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface SearchResultGroupCount {
  groupKey: string;
  totalMatches: number;
}

interface SearchBatchEvent {
  sessionId: string;
  items: SearchResult[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

interface SearchCompleteEvent {
  sessionId: string;
  groupCounts: SearchResultGroupCount[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

interface SearchErrorEvent {
  sessionId: string;
  error: string;
}

interface SearchResultGroup {
  key: string;
  label: string;
  title: string;
  totalCount: number;
  results: SearchResult[];
  isFilterOnly: boolean;
  sortFileName: string;
  createdAt: number;
  updatedAt: number;
}

interface SearchVirtualGroupRow {
  type: 'group';
  key: string;
  rowIndex: number;
  group: SearchResultGroup;
  isExpanded: boolean;
}

interface SearchVirtualResultRow {
  type: 'result';
  key: string;
  rowIndex: number;
  result: SearchResult;
}

type SearchVirtualRow = SearchVirtualGroupRow | SearchVirtualResultRow;

type SearchResultGroupCountMap = Record<string, number>;

interface BufferedSearchBatchSummary {
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

interface BufferedSearchSessionEvents {
  items: SearchResult[];
  summary: BufferedSearchBatchSummary;
  completePayload: SearchCompleteEvent | null;
  errorPayload: SearchErrorEvent | null;
}

interface SearchHighlightRange {
  start: number;
  end: number;
}

interface SearchAssistPanelLayout {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface ReplaceActiveTabContentDetail {
  content: string;
  path?: string;
  name?: string;
  markDirty?: boolean;
  skipCreate?: boolean;
  skipDirty?: boolean;
}

const SEARCH_INPUT_MAX_HEIGHT = 120;
const SEARCH_RESULT_TOOLTIP_MAX_LENGTH = 360;
const SEARCH_RESULT_PREVIEW_MAX_LENGTH = 240;
const SEARCH_RESULT_PREVIEW_LEADING_CONTEXT = 18;
const SEARCH_PANEL_MAX_RESULTS = 20000;
const SEARCH_RESULT_ROW_HEIGHT = 22;
const SEARCH_RESULT_OVERSCAN_ROWS = 10;
const SEARCH_RESULT_BATCH_FLUSH_DELAY = 32;
const SEARCH_HISTORY_STORE_KEY = 'workspace-search-history';
const SEARCH_HISTORY_MAX_ITEMS = 8;
const SEARCH_ASSIST_PANEL_OFFSET = 6;
const SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN = 12;
const SEARCH_ASSIST_PANEL_MIN_WIDTH = 280;
const SEARCH_ASSIST_PANEL_EXTRA_WIDTH = 72;
const SEARCH_FILTER_ASSIST_PANEL_WIDTH = 245;
const INCOMPLETE_PATH_SEARCH_QUERY_PATTERN = /^\s*path(?:\s*[:\uFF1A]\s*["']?\s*)?$/iu;
const INCOMPLETE_PATH_ASSIST_KEYWORD_PATTERN = /(^|[\s])(p|pa|pat|path)$/iu;
const INCOMPLETE_TAG_SEARCH_QUERY_PATTERN = /^\s*tag(?:\s*[:\uFF1A]\s*["']?\s*)?$/iu;
const INCOMPLETE_TAG_ASSIST_KEYWORD_PATTERN = /(^|[\s])(ta|tag)$/iu;
const INCOMPLETE_BLOCK_SEARCH_QUERY_PATTERN = /^\s*block(?:\s*[:\uFF1A]\s*["']?\s*)?$/iu;
const INCOMPLETE_BLOCK_ASSIST_KEYWORD_PATTERN = /(^|[\s])(bloc|block)$/iu;
const SEARCH_ASSIST_QUERY_TOKEN_PATTERNS: readonly RegExp[] = [
  /(^|[\s])path[:\uFF1A]/iu,
  /(^|[\s])file[:\uFF1A]/iu,
  /(^|[\s])tag[:\uFF1A]/iu,
  /(^|[\s])block[:\uFF1A]/iu,
];
/*
const PATH_SEARCH_TOKEN = 'path锛?;
const BLOCK_SEARCH_TOKEN = 'block锛?;
const SEARCH_ASSIST_OPTIONS: readonly SearchAssistOption[] = [
  { token: PATH_SEARCH_TOKEN, description: '鍖归厤鏂囦欢璺緞' },
  { token: 'file锛?, description: '鍖归厤鏂囦欢鍚? },
  { token: 'tag锛?, description: '鎼滅储鏍囩' },
  { token: BLOCK_SEARCH_TOKEN, description: '鎼滅储鍧楀叧閿瘝' },
];
const TAG_SEARCH_TOKEN = 'tag锛?;
*/
const PATH_SEARCH_TOKEN = 'path\uFF1A';
const BLOCK_SEARCH_TOKEN = 'block\uFF1A';
const SEARCH_ASSIST_OPTIONS: readonly SearchAssistOption[] = [
  { token: PATH_SEARCH_TOKEN, translationKey: 'searchPanel.assist.options.path', defaultDescription: 'Match file path' },
  { token: 'file\uFF1A', translationKey: 'searchPanel.assist.options.file', defaultDescription: 'Match file name' },
  { token: 'tag\uFF1A', translationKey: 'searchPanel.assist.options.tag', defaultDescription: 'Search tags' },
  { token: BLOCK_SEARCH_TOKEN, translationKey: 'searchPanel.assist.options.block', defaultDescription: 'Search block keywords' },
];
const TAG_SEARCH_TOKEN = 'tag\uFF1A';
const SEARCH_SORT_MENU_OPTIONS: readonly {
  readonly mode: SearchSortMode;
  readonly translationKey: string;
  readonly defaultLabel: string;
}[] = [
  { mode: 'fileNameAsc', translationKey: 'sidebar.searchSort.fileNameAsc', defaultLabel: 'File Name (A-Z)' },
  { mode: 'fileNameDesc', translationKey: 'sidebar.searchSort.fileNameDesc', defaultLabel: 'File Name (Z-A)' },
  { mode: 'updatedAtDesc', translationKey: 'sidebar.searchSort.updatedAtDesc', defaultLabel: 'Updated Time (Newest First)' },
  { mode: 'updatedAtAsc', translationKey: 'sidebar.searchSort.updatedAtAsc', defaultLabel: 'Updated Time (Oldest First)' },
  { mode: 'createdAtDesc', translationKey: 'sidebar.searchSort.createdAtDesc', defaultLabel: 'Created Time (Newest First)' },
  { mode: 'createdAtAsc', translationKey: 'sidebar.searchSort.createdAtAsc', defaultLabel: 'Created Time (Oldest First)' },
];

const createBufferedSearchSessionEvents = (): BufferedSearchSessionEvents => ({
  items: [],
  summary: {
    limitHit: false,
    totalCount: 0,
    totalFiles: 0,
  },
  completePayload: null,
  errorPayload: null,
});

const getSearchResultGroupKey = (result: SearchResult): string => (
  result.noteId ? `note:${result.noteId}` : `file:${result.absolutePath}`
);

const getSearchResultKey = (result: SearchResult): string => (
  `${getSearchResultGroupKey(result)}:${result.line}:${result.column}:${result.preview}`
);

const getSearchResultGroupLabel = (result: SearchResult): string => {
  if (result.preview === result.relativePath && result.relativePath.trim().length > 0) {
    return result.relativePath;
  }

  if (result.title && result.title.trim().length > 0) {
    return result.title.trim();
  }

  const sourcePath = result.relativePath || result.absolutePath;
  const normalizedPath = sourcePath.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/');
  return pathSegments[pathSegments.length - 1] || sourcePath;
};

const getSearchResultSortFileName = (result: SearchResult): string => {
  const sourcePath = (result.relativePath || result.title || result.absolutePath).trim();
  if (sourcePath.length === 0) {
    return '';
  }

  const normalizedPath = sourcePath.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(segment => segment.length > 0);
  return pathSegments[pathSegments.length - 1] || normalizedPath;
};

const getFileNameFromPath = (value: string): string => {
  const normalizedPath = value.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(segment => segment.length > 0);
  return pathSegments[pathSegments.length - 1] || value;
};

const compareSearchResultGroupFileName = (
  leftGroup: SearchResultGroup,
  rightGroup: SearchResultGroup,
  isAscending: boolean,
): number => {
  const direction = isAscending ? 1 : -1;
  const fileNameDifference = leftGroup.sortFileName.localeCompare(
    rightGroup.sortFileName,
    'zh-Hans-CN',
  );
  if (fileNameDifference !== 0) {
    return fileNameDifference * direction;
  }

  return leftGroup.title.localeCompare(rightGroup.title, 'zh-Hans-CN') * direction;
};

const compareSearchResultGroupTimestamp = (
  leftGroup: SearchResultGroup,
  rightGroup: SearchResultGroup,
  field: 'createdAt' | 'updatedAt',
  isDescending: boolean,
): number => {
  const leftTimestamp = leftGroup[field];
  const rightTimestamp = rightGroup[field];
  const timestampDifference = isDescending
    ? rightTimestamp - leftTimestamp
    : leftTimestamp - rightTimestamp;
  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return compareSearchResultGroupFileName(leftGroup, rightGroup, true);
};

const sortSearchResultGroups = (
  groups: readonly SearchResultGroup[],
  sortMode: SearchSortMode,
): SearchResultGroup[] => {
  const nextGroups = [...groups];

  nextGroups.sort((leftGroup, rightGroup) => {
    switch (sortMode) {
      case 'fileNameDesc':
        return compareSearchResultGroupFileName(leftGroup, rightGroup, false);
      case 'updatedAtDesc':
        return compareSearchResultGroupTimestamp(leftGroup, rightGroup, 'updatedAt', true);
      case 'updatedAtAsc':
        return compareSearchResultGroupTimestamp(leftGroup, rightGroup, 'updatedAt', false);
      case 'createdAtDesc':
        return compareSearchResultGroupTimestamp(leftGroup, rightGroup, 'createdAt', true);
      case 'createdAtAsc':
        return compareSearchResultGroupTimestamp(leftGroup, rightGroup, 'createdAt', false);
      case 'fileNameAsc':
      default:
        return compareSearchResultGroupFileName(leftGroup, rightGroup, true);
    }
  });

  return nextGroups;
};

const getSearchTooltipContent = (content: string): string => {
  const normalizedPreview = content.trim();

  if (normalizedPreview.length <= SEARCH_RESULT_TOOLTIP_MAX_LENGTH) {
    return normalizedPreview;
  }

  return `${normalizedPreview.slice(0, SEARCH_RESULT_TOOLTIP_MAX_LENGTH - 3)}...`;
};

const createSearchResultGroupCountMap = (
  groupCounts: readonly SearchResultGroupCount[],
): SearchResultGroupCountMap => {
  const nextGroupCountMap: SearchResultGroupCountMap = {};

  for (const groupCount of groupCounts) {
    nextGroupCountMap[groupCount.groupKey] = groupCount.totalMatches;
  }

  return nextGroupCountMap;
};

const getSafeSearchResultItems = (items: SearchResult[] | undefined): SearchResult[] => (
  Array.isArray(items) ? items : []
);

const getSafeSearchResultGroupCounts = (
  groupCounts: readonly SearchResultGroupCount[] | undefined,
): readonly SearchResultGroupCount[] => (
  Array.isArray(groupCounts) ? groupCounts : []
);

const normalizeSearchHistoryEntries = (
  entries: readonly SearchHistoryEntry[] | undefined,
): SearchHistoryEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry.query.trim().length > 0 && Number.isFinite(entry.timestamp))
    .sort((leftEntry, rightEntry) => rightEntry.timestamp - leftEntry.timestamp)
    .slice(0, SEARCH_HISTORY_MAX_ITEMS);
};

const buildNextSearchHistoryEntries = (
  currentEntries: readonly SearchHistoryEntry[],
  query: string,
): SearchHistoryEntry[] => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return [...currentEntries];
  }

  const nextTimestamp = Date.now();
  const deduplicatedEntries = currentEntries.filter((entry) => entry.query !== normalizedQuery);
  return [
    {
      query: normalizedQuery,
      timestamp: nextTimestamp,
    },
    ...deduplicatedEntries,
  ].slice(0, SEARCH_HISTORY_MAX_ITEMS);
};


const ACTIVE_PATH_ASSIST_PATTERN = (
  /(^|[\s])((path|tag|block)[:\uFF1A])\s*(?:"([^"]*)"?|'([^']*)'?|([^\s]*))?$/iu
);

const getActivePathAssistState = (query: string): ActivePathAssistState | null => {
  const match = ACTIVE_PATH_ASSIST_PATTERN.exec(query);
  if (!match) {
    return null;
  }

  const matchIndex = match.index ?? 0;
  const leadingSegment = match[1] ?? '';
  const tokenKind = (match[3] ?? '').toLowerCase();
  return {
    kind: tokenKind === 'tag' ? 'tag' : tokenKind === 'block' ? 'block' : 'path',
    token: match[2],
    tokenStart: matchIndex + leadingSegment.length,
    value: (match[4] ?? match[5] ?? match[6] ?? '').trim(),
  };
};

const applyPathSuggestionToQuery = (
  currentQuery: string,
  activePathAssist: ActivePathAssistState,
  suggestion: string,
): string => {
  const prefix = currentQuery.slice(0, activePathAssist.tokenStart);
  const formattedSuggestion = /\s/.test(suggestion) ? `"${suggestion}"` : suggestion;
  return `${prefix}${activePathAssist.token} ${formattedSuggestion}`;
};

const isIncompletePathSearchQuery = (query: string): boolean => (
  query.trim().length > 0
  && (
    INCOMPLETE_PATH_SEARCH_QUERY_PATTERN.test(query)
    || INCOMPLETE_TAG_SEARCH_QUERY_PATTERN.test(query)
    || INCOMPLETE_BLOCK_SEARCH_QUERY_PATTERN.test(query)
  )
);

const hasIncompletePathAssistKeyword = (query: string): boolean => (
  INCOMPLETE_PATH_ASSIST_KEYWORD_PATTERN.test(query)
  || INCOMPLETE_TAG_ASSIST_KEYWORD_PATTERN.test(query)
  || INCOMPLETE_BLOCK_ASSIST_KEYWORD_PATTERN.test(query)
);

const hasSearchAssistQueryTokens = (query: string): boolean => (
  SEARCH_ASSIST_QUERY_TOKEN_PATTERNS.some(pattern => pattern.test(query))
);

const calculateSearchAssistPanelLayout = (
  anchorRect: DOMRect,
  preferredWidthOverride?: number,
): SearchAssistPanelLayout => {
  const maxWidth = Math.max(window.innerWidth - SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN * 2, 0);
  const preferredWidth = preferredWidthOverride ?? Math.max(
    anchorRect.width + SEARCH_ASSIST_PANEL_EXTRA_WIDTH,
    SEARCH_ASSIST_PANEL_MIN_WIDTH,
  );
  const width = Math.min(preferredWidth, maxWidth);
  let left = anchorRect.left;
  if (left + width > window.innerWidth - SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN) {
    left = window.innerWidth - SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN - width;
  }
  if (left < SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN) {
    left = SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN;
  }

  let top = anchorRect.bottom + SEARCH_ASSIST_PANEL_OFFSET;
  if (top < SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN) {
    top = SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN;
  }
  const availableHeight = window.innerHeight - top - SEARCH_ASSIST_PANEL_VIEWPORT_MARGIN;
  const maxHeight = Math.max(availableHeight, 0);

  return {
    top,
    left,
    width,
    maxHeight,
  };
};

const createSearchPreviewMatcher = (
  query: string,
  isCaseSensitive: boolean,
  isWholeWord: boolean,
  isRegex: boolean,
): RegExp | null => createWorkspaceSearchMatcher(
  query,
  isCaseSensitive,
  isWholeWord,
  isRegex,
);

const normalizePathHighlightValue = (
  value: string,
  caseSensitive: boolean,
): string => {
  const normalizedValue = value.replace(/\\/g, '/');
  return caseSensitive ? normalizedValue : normalizedValue.toLowerCase();
};

const mergeSearchHighlightRanges = (
  ranges: readonly SearchHighlightRange[],
): SearchHighlightRange[] => {
  if (ranges.length === 0) {
    return [];
  }

  const sortedRanges = [...ranges].sort((leftRange, rightRange) => (
    leftRange.start - rightRange.start || leftRange.end - rightRange.end
  ));
  const mergedRanges: SearchHighlightRange[] = [];
  let currentRange: SearchHighlightRange = {
    start: sortedRanges[0].start,
    end: sortedRanges[0].end,
  };

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const nextRange = sortedRanges[index];
    if (nextRange.start <= currentRange.end) {
      currentRange = {
        start: currentRange.start,
        end: Math.max(currentRange.end, nextRange.end),
      };
      continue;
    }

    mergedRanges.push(currentRange);
    currentRange = {
      start: nextRange.start,
      end: nextRange.end,
    };
  }

  mergedRanges.push(currentRange);
  return mergedRanges;
};

const renderSearchHighlights = (
  value: string,
  ranges: readonly SearchHighlightRange[],
): React.ReactNode => {
  if (value.length === 0 || ranges.length === 0) {
    return value;
  }

  const fragments: React.ReactNode[] = [];
  let cursor = 0;

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (cursor < range.start) {
      fragments.push(value.slice(cursor, range.start));
    }

    fragments.push(
      <span
        key={`highlight-${range.start}-${index}`}
        className="search-result-highlight"
      >
        {value.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  }

  if (cursor < value.length) {
    fragments.push(value.slice(cursor));
  }

  return fragments;
};

const getPathHighlightRanges = (
  value: string,
  pathFilters: readonly string[],
  caseSensitive: boolean,
): SearchHighlightRange[] => {
  if (value.length === 0 || pathFilters.length === 0) {
    return [];
  }

  const normalizedValue = normalizePathHighlightValue(value, caseSensitive);
  const ranges: SearchHighlightRange[] = [];

  for (const pathFilter of pathFilters) {
    const normalizedFilter = normalizePathHighlightValue(
      pathFilter.trim().replace(/^\/+|\/+$/g, ''),
      caseSensitive,
    );
    if (normalizedFilter.length === 0) {
      continue;
    }

    let matchIndex = normalizedValue.indexOf(normalizedFilter);
    while (matchIndex >= 0) {
      ranges.push({
        start: matchIndex,
        end: matchIndex + normalizedFilter.length,
      });
      matchIndex = normalizedValue.indexOf(normalizedFilter, matchIndex + normalizedFilter.length);
    }
  }

  return mergeSearchHighlightRanges(ranges);
};

const getFileHighlightRanges = (
  value: string,
  fileFilters: readonly string[],
  caseSensitive: boolean,
): SearchHighlightRange[] => {
  if (value.length === 0 || fileFilters.length === 0) {
    return [];
  }

  const normalizedValue = value.replace(/\\/g, '/');
  const basenameStart = normalizedValue.lastIndexOf('/') + 1;
  const basename = normalizedValue.slice(basenameStart);
  const normalizedBasename = normalizePathHighlightValue(basename, caseSensitive);
  const ranges: SearchHighlightRange[] = [];

  for (const fileFilter of fileFilters) {
    const normalizedFilter = normalizePathHighlightValue(
      fileFilter.trim().replace(/^[/\\]+|[/\\]+$/g, ''),
      caseSensitive,
    );
    if (normalizedFilter.length === 0) {
      continue;
    }

    let matchIndex = normalizedBasename.indexOf(normalizedFilter);
    while (matchIndex >= 0) {
      ranges.push({
        start: basenameStart + matchIndex,
        end: basenameStart + matchIndex + normalizedFilter.length,
      });
      matchIndex = normalizedBasename.indexOf(normalizedFilter, matchIndex + normalizedFilter.length);
    }
  }

  return mergeSearchHighlightRanges(ranges);
};

const renderHighlightedSearchPreview = (
  preview: string,
  matcher: RegExp | null,
): React.ReactNode => {
  if (!matcher || preview.length === 0) {
    return preview;
  }

  matcher.lastIndex = 0;
  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  let highlightIndex = 0;
  let match = matcher.exec(preview);

  while (match) {
    const matchStart = match.index;
    const matchText = match[0];
    const matchEnd = matchStart + matchText.length;

    if (matchText.length === 0) {
      matcher.lastIndex = matchStart + 1;
      match = matcher.exec(preview);
      continue;
    }

    if (cursor < matchStart) {
      fragments.push(preview.slice(cursor, matchStart));
    }

    fragments.push(
      <span
        key={`highlight-${matchStart}-${highlightIndex}`}
        className="search-result-highlight"
      >
        {preview.slice(matchStart, matchEnd)}
      </span>,
    );
    cursor = matchEnd;
    highlightIndex += 1;
    match = matcher.exec(preview);
  }

  if (fragments.length === 0) {
    return preview;
  }

  if (cursor < preview.length) {
    fragments.push(preview.slice(cursor));
  }

  return fragments;
};

const getMatchedPreviewRange = (
  preview: string,
  matcher: RegExp | null,
  column: number,
): { start: number; end: number } | null => findClosestWorkspaceSearchMatchRange(
  preview,
  matcher,
  column,
);

const getSearchResultDisplayPreview = (
  preview: string,
  matcher: RegExp | null,
  column: number,
  maxLength: number,
): string => {
  const normalizedPreview = preview.trim();
  if (normalizedPreview.length <= maxLength) {
    return normalizedPreview;
  }

  const matchedRange = getMatchedPreviewRange(normalizedPreview, matcher, column);
  if (!matchedRange) {
    return `${normalizedPreview.slice(0, maxLength - 3)}...`;
  }

  const start = Math.max(matchedRange.start - SEARCH_RESULT_PREVIEW_LEADING_CONTEXT, 0);
  const prefix = start > 0 ? '...' : '';
  const prefixLength = prefix.length;
  const minimumContentLength = matchedRange.end - start;
  const baseContentBudget = Math.max(maxLength - prefixLength - 3, 0);
  const contentBudget = Math.max(baseContentBudget, minimumContentLength);
  const end = Math.min(start + contentBudget, normalizedPreview.length);
  const suffix = end < normalizedPreview.length ? '...' : '';
  return `${prefix}${normalizedPreview.slice(start, end)}${suffix}`;
};

const getSearchPreviewMatchColumn = (
  preview: string,
  matchedText: string,
  caseSensitive: boolean,
): number => {
  const normalizedPreview = caseSensitive ? preview : preview.toLowerCase();
  const normalizedMatchedText = caseSensitive ? matchedText : matchedText.toLowerCase();
  const matchIndex = normalizedPreview.indexOf(normalizedMatchedText);
  return matchIndex >= 0 ? matchIndex + 1 : 1;
};

const renderHighlightedFilterLabel = (
  label: string,
  pathFilters: readonly string[],
  fileFilters: readonly string[],
  caseSensitive: boolean,
): React.ReactNode => renderSearchHighlights(
  label,
  mergeSearchHighlightRanges([
    ...getPathHighlightRanges(label, pathFilters, caseSensitive),
    ...getFileHighlightRanges(label, fileFilters, caseSensitive),
  ]),
);

const groupSearchResults = (
  results: SearchResult[],
  groupCountMap: SearchResultGroupCountMap,
  isFilterOnlySearchMode: boolean,
): SearchResultGroup[] => {
  const groups = new Map<string, SearchResultGroup>();

  for (const result of results) {
    const groupKey = getSearchResultGroupKey(result);
    const existingGroup = groups.get(groupKey);

    if (existingGroup) {
      existingGroup.results.push(result);
      continue;
    }

    groups.set(groupKey, {
      key: groupKey,
      label: getSearchResultGroupLabel(result),
      title: result.relativePath || result.title || result.absolutePath,
      totalCount: groupCountMap[groupKey] ?? 1,
      results: [result],
      isFilterOnly: isFilterOnlySearchMode,
      sortFileName: getSearchResultSortFileName(result),
      createdAt: result.createdAt ?? 0,
      updatedAt: result.updatedAt ?? 0,
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    totalCount: groupCountMap[group.key] ?? group.results.length,
  }));
};

const buildSearchVirtualRows = (
  resultGroups: readonly SearchResultGroup[],
  collapsedResultGroupKeys: readonly string[],
): SearchVirtualRow[] => {
  const collapsedGroupKeySet = new Set(collapsedResultGroupKeys);
  const virtualRows: SearchVirtualRow[] = [];
  let rowIndex = 0;

  for (const group of resultGroups) {
    const isExpanded = !collapsedGroupKeySet.has(group.key);
    virtualRows.push({
      type: 'group',
      key: `group:${group.key}`,
      rowIndex,
      group,
      isExpanded,
    });
    rowIndex += 1;

    if (!isExpanded || group.isFilterOnly) {
      continue;
    }

    for (const result of group.results) {
      virtualRows.push({
        type: 'result',
        key: `result:${getSearchResultKey(result)}`,
        rowIndex,
        result,
      });
      rowIndex += 1;
    }
  }

  return virtualRows;
};

export const Search: React.FC<SearchProps> = ({
  refreshActionId = 0,
  clearActionId = 0,
  collapseAllActionId = 0,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [limitHit, setLimitHit] = useState(false);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [totalResultFiles, setTotalResultFiles] = useState(0);
  const [groupCountMap, setGroupCountMap] = useState<SearchResultGroupCountMap>({});
  const [collapsedResultGroupKeys, setCollapsedResultGroupKeys] = useState<string[]>([]);
  const [selectedResultKey, setSelectedResultKey] = useState('');
  const [sortMode, setSortMode] = useState<SearchSortMode>('fileNameAsc');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortMenuPosition, setSortMenuPosition] = useState({ x: 0, y: 0 });
  const [isSearchAssistOpen, setIsSearchAssistOpen] = useState(false);
  const [searchHistoryEntries, setSearchHistoryEntries] = useState<SearchHistoryEntry[]>([]);
  const [workspaceRootDirectories, setWorkspaceRootDirectories] = useState<string[]>([]);
  const [availableBlockKeywords, setAvailableBlockKeywords] = useState<WorkspaceSearchBlockCandidate[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isBlockAssistLoading, setIsBlockAssistLoading] = useState(false);
  const [isTagAssistLoading, setIsTagAssistLoading] = useState(false);
  const [loadedBlockAssistScopeKey, setLoadedBlockAssistScopeKey] = useState('');
  const [loadedTagAssistScopeKey, setLoadedTagAssistScopeKey] = useState('');
  const [searchAssistPanelLayout, setSearchAssistPanelLayout] = useState<SearchAssistPanelLayout | null>(null);
  const searchInputAnchorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const searchAssistPanelRef = useRef<HTMLDivElement>(null);
  const searchSortButtonRef = useRef<HTMLDivElement>(null);
  const searchResultsScrollbarRef = useRef<CustomScrollbarRef>(null);
  const searchRequestIdRef = useRef(0);
  const searchSessionIdRef = useRef('');
  const searchHistoryEntriesRef = useRef<SearchHistoryEntry[]>([]);
  const awaitingSearchSessionStartRef = useRef(false);
  const shouldAutoCollapseGroupsRef = useRef(true);
  const blockAssistRequestIdRef = useRef(0);
  const tagAssistRequestIdRef = useRef(0);
  const seenResultGroupKeysRef = useRef<Set<string>>(new Set());
  const pendingBatchItemsRef = useRef<SearchResult[]>([]);
  const pendingBatchSummaryRef = useRef<BufferedSearchBatchSummary>({
    limitHit: false,
    totalCount: 0,
    totalFiles: 0,
  });
  const bufferedSearchSessionEventsRef = useRef<Record<string, BufferedSearchSessionEvents>>({});
  const pendingBatchFlushTimerRef = useRef<number | null>(null);
  const [resultsScrollTop, setResultsScrollTop] = useState(0);
  const [resultsViewportHeight, setResultsViewportHeight] = useState(0);
  const translateText = (key: string, defaultValue: string): string => String(t(key, { defaultValue }));

  const updateSearchAssistPanelLayout = (): void => {
    const anchorElement = searchInputAnchorRef.current;
    if (!anchorElement) {
      setSearchAssistPanelLayout(null);
      return;
    }

    const currentActiveAssist = getActivePathAssistState(searchQuery);

    setSearchAssistPanelLayout(calculateSearchAssistPanelLayout(
      anchorElement.getBoundingClientRect(),
      currentActiveAssist !== null ? SEARCH_FILTER_ASSIST_PANEL_WIDTH : undefined,
    ));
  };

  const openSearchAssist = (): void => {
    updateSearchAssistPanelLayout();
    setIsSearchAssistOpen(true);
  };

  const clearPendingBatchFlushTimer = (): void => {
    if (pendingBatchFlushTimerRef.current === null) {
      return;
    }

    window.clearTimeout(pendingBatchFlushTimerRef.current);
    pendingBatchFlushTimerRef.current = null;
  };

  const resetPendingBatchState = (): void => {
    clearPendingBatchFlushTimer();
    pendingBatchItemsRef.current = [];
    pendingBatchSummaryRef.current = {
      limitHit: false,
      totalCount: 0,
      totalFiles: 0,
    };
  };

  const resetBufferedSearchSessionEvents = (): void => {
    awaitingSearchSessionStartRef.current = false;
    bufferedSearchSessionEventsRef.current = {};
  };

  const getBufferedSearchSessionEvents = (
    sessionId: string,
  ): BufferedSearchSessionEvents => {
    const existingEvents = bufferedSearchSessionEventsRef.current[sessionId];
    if (existingEvents) {
      return existingEvents;
    }

    const nextEvents = createBufferedSearchSessionEvents();
    bufferedSearchSessionEventsRef.current[sessionId] = nextEvents;
    return nextEvents;
  };

  const clearBufferedSearchSessionEvents = (sessionId: string): void => {
    const nextBufferedEvents = { ...bufferedSearchSessionEventsRef.current };
    delete nextBufferedEvents[sessionId];
    bufferedSearchSessionEventsRef.current = nextBufferedEvents;
  };

  const flushPendingBatchState = (): void => {
    clearPendingBatchFlushTimer();

    const nextItems = pendingBatchItemsRef.current;
    if (nextItems.length === 0) {
      return;
    }

    const nextSummary = pendingBatchSummaryRef.current;
    pendingBatchItemsRef.current = [];

    startTransition(() => {
      setResults((currentResults) => [...currentResults, ...nextItems]);
      setLimitHit(nextSummary.limitHit);
      setTotalResultCount(nextSummary.totalCount);
      setTotalResultFiles(nextSummary.totalFiles);
    });
  };

  const schedulePendingBatchFlush = (): void => {
    if (pendingBatchFlushTimerRef.current !== null) {
      return;
    }

    pendingBatchFlushTimerRef.current = window.setTimeout(() => {
      flushPendingBatchState();
    }, SEARCH_RESULT_BATCH_FLUSH_DELAY);
  };

  const applySearchBatchPayload = (payload: SearchBatchEvent): void => {
    const batchItems = getSafeSearchResultItems(payload.items);
    pendingBatchItemsRef.current.push(...batchItems);
    pendingBatchSummaryRef.current = {
      limitHit: payload.limitHit,
      totalCount: payload.totalCount,
      totalFiles: payload.totalFiles,
    };
    schedulePendingBatchFlush();
  };

  const applySearchCompletePayload = (payload: SearchCompleteEvent): void => {
    flushPendingBatchState();
    searchSessionIdRef.current = '';
    awaitingSearchSessionStartRef.current = false;
    clearBufferedSearchSessionEvents(payload.sessionId);
    startTransition(() => {
      setLimitHit(payload.limitHit);
      setTotalResultCount(payload.totalCount);
      setTotalResultFiles(payload.totalFiles);
      setGroupCountMap(createSearchResultGroupCountMap(
        getSafeSearchResultGroupCounts(payload.groupCounts),
      ));
      setIsSearching(false);
    });
  };

  const applySearchErrorPayload = (payload: SearchErrorEvent): void => {
    resetPendingBatchState();
    searchSessionIdRef.current = '';
    awaitingSearchSessionStartRef.current = false;
    clearBufferedSearchSessionEvents(payload.sessionId);
    setSearchError(payload.error);
    setIsSearching(false);
  };

  const flushBufferedSearchSessionEvents = (sessionId: string): void => {
    const bufferedEvents = bufferedSearchSessionEventsRef.current[sessionId];
    if (!bufferedEvents) {
      return;
    }

    clearBufferedSearchSessionEvents(sessionId);

    if (bufferedEvents.items.length > 0) {
      pendingBatchItemsRef.current.push(...bufferedEvents.items);
      pendingBatchSummaryRef.current = bufferedEvents.summary;
      flushPendingBatchState();
    }

    if (bufferedEvents.errorPayload) {
      applySearchErrorPayload(bufferedEvents.errorPayload);
      return;
    }

    if (bufferedEvents.completePayload) {
      applySearchCompletePayload(bufferedEvents.completePayload);
    }
  };

  const resetSearchResultsState = (): void => {
    resetPendingBatchState();
    resetBufferedSearchSessionEvents();
    setResults([]);
    setLimitHit(false);
    setTotalResultCount(0);
    setTotalResultFiles(0);
    setGroupCountMap({});
    setResultsScrollTop(0);
    setCollapsedResultGroupKeys([]);
    shouldAutoCollapseGroupsRef.current = true;
    seenResultGroupKeysRef.current = new Set();
    searchResultsScrollbarRef.current?.setScrollTop(0);
  };

  const cancelActiveSearchSession = async (): Promise<void> => {
    const activeSessionId = searchSessionIdRef.current;
    searchSessionIdRef.current = '';

    if (!activeSessionId || !window.electron?.workspace?.cancelSearchSession) {
      return;
    }

    try {
      await window.electron.workspace.cancelSearchSession(activeSessionId);
    } catch {
      // Ignore cancellation failures because a completed search may already be gone.
    }
  };

  const updateSearchHistoryState = (entries: SearchHistoryEntry[]): void => {
    searchHistoryEntriesRef.current = entries;
    setSearchHistoryEntries(entries);
  };

  const persistSearchHistory = async (query: string): Promise<void> => {
    const nextEntries = buildNextSearchHistoryEntries(searchHistoryEntriesRef.current, query);
    updateSearchHistoryState(nextEntries);
    await electronStore.set(SEARCH_HISTORY_STORE_KEY, nextEntries);
  };

  const clearSearchHistory = async (): Promise<void> => {
    updateSearchHistoryState([]);
    await electronStore.set(SEARCH_HISTORY_STORE_KEY, []);
  };

  const focusSearchInputAt = (cursor: number): void => {
    window.requestAnimationFrame(() => {
      const textarea = searchInputRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const syncSearchInputHeight = (): void => {
    const textarea = searchInputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, SEARCH_INPUT_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > SEARCH_INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  };

  useLayoutEffect(() => {
    syncSearchInputHeight();
  }, [searchQuery]);

  useLayoutEffect(() => {
    const contentElement = searchResultsScrollbarRef.current?.getContentElement();
    if (!contentElement) {
      setResultsViewportHeight(0);
      return;
    }

    const updateViewportMetrics = (): void => {
      const nextViewportHeight = contentElement.clientHeight;
      const nextScrollTop = Math.round(contentElement.scrollTop);

      setResultsViewportHeight((currentHeight) => (
        currentHeight === nextViewportHeight ? currentHeight : nextViewportHeight
      ));
      setResultsScrollTop((currentScrollTop) => (
        currentScrollTop === nextScrollTop ? currentScrollTop : nextScrollTop
      ));
    };

    updateViewportMetrics();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(updateViewportMetrics);
    });

    observer.observe(contentElement);
    return () => {
      observer.disconnect();
    };
  }, [results.length, searchError, searchQuery.length]);

  useEffect(() => {
    let isActive = true;

    const loadSearchHistory = async (): Promise<void> => {
      const storedEntries = await electronStore.get(SEARCH_HISTORY_STORE_KEY);
      if (!isActive) {
        return;
      }

      updateSearchHistoryState(normalizeSearchHistoryEntries(storedEntries));
    };

    void loadSearchHistory();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadWorkspaceRootDirectories = async (): Promise<void> => {
      if (!window.electron?.workspace?.getRootDirectories) {
        return;
      }

      const response = await window.electron.workspace.getRootDirectories();
      if (!isActive || !response.success || !Array.isArray(response.data)) {
        return;
      }

      setWorkspaceRootDirectories(response.data);
    };

    void loadWorkspaceRootDirectories();

    return () => {
      isActive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!isSearchAssistOpen) {
      setSearchAssistPanelLayout(null);
      return undefined;
    }

    const anchorElement = searchInputAnchorRef.current;
    if (!anchorElement) {
      setSearchAssistPanelLayout(null);
      return undefined;
    }

    updateSearchAssistPanelLayout();

    const schedulePanelLayoutUpdate = (): void => {
      window.requestAnimationFrame(updateSearchAssistPanelLayout);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        schedulePanelLayoutUpdate();
      });

    resizeObserver?.observe(anchorElement);
    window.addEventListener('resize', schedulePanelLayoutUpdate);
    window.addEventListener('scroll', schedulePanelLayoutUpdate, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedulePanelLayoutUpdate);
      window.removeEventListener('scroll', schedulePanelLayoutUpdate, true);
    };
  }, [isSearchAssistOpen, searchQuery]);

  useEffect(() => {
    if (!isSearchAssistOpen) {
      return undefined;
    }

    const handlePointerDownOutside = (event: MouseEvent): void => {
      const targetNode = event.target;
      if (!(targetNode instanceof Node)) {
        return;
      }

      if (searchInputAnchorRef.current?.contains(targetNode)) {
        return;
      }

      if (searchAssistPanelRef.current?.contains(targetNode)) {
        return;
      }

      setIsSearchAssistOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
    };
  }, [isSearchAssistOpen]);

  useEffect(() => {
    const activeGroupKeys: string[] = [];
    const activeGroupKeySet = new Set<string>();
    const activeResultKeys = new Set<string>();

    for (const result of results) {
      const groupKey = getSearchResultGroupKey(result);
      if (!activeGroupKeySet.has(groupKey)) {
        activeGroupKeySet.add(groupKey);
        activeGroupKeys.push(groupKey);
      }
      activeResultKeys.add(getSearchResultKey(result));
    }

    setCollapsedResultGroupKeys((currentKeys) => {
      if (shouldAutoCollapseGroupsRef.current) {
        seenResultGroupKeysRef.current = new Set(activeGroupKeys);
        return [];
      }

      const nextCollapsedKeys = currentKeys.filter((groupKey) => activeGroupKeySet.has(groupKey));
      const nextCollapsedKeySet = new Set(nextCollapsedKeys);

      for (const groupKey of activeGroupKeys) {
        if (!seenResultGroupKeysRef.current.has(groupKey) && !nextCollapsedKeySet.has(groupKey)) {
          nextCollapsedKeys.push(groupKey);
        }
      }

      seenResultGroupKeysRef.current = new Set(activeGroupKeys);
      return nextCollapsedKeys;
    });
    setSelectedResultKey((currentKey) => {
      if (currentKey && activeResultKeys.has(currentKey)) {
        return currentKey;
      }

      return results.length > 0 ? getSearchResultKey(results[0]) : '';
    });
  }, [results]);

  useEffect(() => {
    if (
      !window.electron?.workspace?.onSearchBatch
      || !window.electron.workspace.onSearchComplete
      || !window.electron.workspace.onSearchError
    ) {
      return undefined;
    }

    const unsubscribeBatch = window.electron.workspace.onSearchBatch((payload: SearchBatchEvent) => {
      if (payload.sessionId === searchSessionIdRef.current) {
        applySearchBatchPayload(payload);
        return;
      }

      if (!awaitingSearchSessionStartRef.current || searchSessionIdRef.current.length > 0) {
        return;
      }

      const bufferedEvents = getBufferedSearchSessionEvents(payload.sessionId);
      bufferedEvents.items.push(...getSafeSearchResultItems(payload.items));
      bufferedEvents.summary = {
        limitHit: payload.limitHit,
        totalCount: payload.totalCount,
        totalFiles: payload.totalFiles,
      };
    });
    const unsubscribeComplete = window.electron.workspace.onSearchComplete((
      payload: SearchCompleteEvent,
    ) => {
      if (payload.sessionId === searchSessionIdRef.current) {
        applySearchCompletePayload(payload);
        return;
      }

      if (!awaitingSearchSessionStartRef.current || searchSessionIdRef.current.length > 0) {
        return;
      }

      const bufferedEvents = getBufferedSearchSessionEvents(payload.sessionId);
      bufferedEvents.completePayload = payload;
    });
    const unsubscribeError = window.electron.workspace.onSearchError((payload: SearchErrorEvent) => {
      if (payload.sessionId === searchSessionIdRef.current) {
        applySearchErrorPayload(payload);
        return;
      }

      if (!awaitingSearchSessionStartRef.current || searchSessionIdRef.current.length > 0) {
        return;
      }

      const bufferedEvents = getBufferedSearchSessionEvents(payload.sessionId);
      bufferedEvents.errorPayload = payload;
    });

    return () => {
      unsubscribeBatch();
      unsubscribeComplete();
      unsubscribeError();
      resetPendingBatchState();
      void cancelActiveSearchSession();
    };
  }, []);

  const executeLegacySearch = async (overrides?: {
    searchQuery?: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    includePattern?: string;
    excludePattern?: string;
  }): Promise<void> => {
    const nextSearchQuery = overrides?.searchQuery ?? searchQuery;
    const nextCaseSensitive = overrides?.caseSensitive ?? caseSensitive;
    const nextWholeWord = overrides?.wholeWord ?? wholeWord;
    const nextUseRegex = overrides?.useRegex ?? useRegex;
    const nextIncludePattern = overrides?.includePattern ?? includePattern;
    const nextExcludePattern = overrides?.excludePattern ?? excludePattern;

    if (!window.electron?.workspace?.searchText) {
      setSearchError(translateText('searchPanel.errors.workspaceSearchUnsupported', 'Current environment does not support workspace search'));
      resetSearchResultsState();
      return;
    }

    try {
      const response = await window.electron.workspace.searchText({
        query: nextSearchQuery,
        caseSensitive: nextCaseSensitive,
        wholeWord: nextWholeWord,
        useRegex: nextUseRegex,
        includePattern: nextIncludePattern,
        excludePattern: nextExcludePattern,
        maxResults: SEARCH_PANEL_MAX_RESULTS,
      });

      if (!response.success || !response.data) {
        resetSearchResultsState();
        setSearchError(
          typeof response.error === 'string'
            ? response.error
            : translateText('searchPanel.errors.workspaceSearchFailed', 'Workspace search failed')
        );
        return;
      }

      const responseItems = getSafeSearchResultItems(response.data.items);
      const responseGroupCounts = getSafeSearchResultGroupCounts(response.data.groupCounts);
      const fallbackGroupCountMap = createSearchResultGroupCountMap(responseGroupCounts);
      const fallbackParsedQuery = parseWorkspaceSearchQuery(nextSearchQuery);
      const fallbackGroups = groupSearchResults(
        responseItems,
        fallbackGroupCountMap,
        fallbackParsedQuery.textQuery.length === 0
          && (
            fallbackParsedQuery.pathFilters.length > 0
            || fallbackParsedQuery.fileFilters.length > 0
          ),
      );

      setResults(responseItems);
      setLimitHit(response.data.limitHit);
      setTotalResultCount(
        typeof response.data.totalCount === 'number'
          ? response.data.totalCount
          : responseItems.length,
      );
      setTotalResultFiles(
        typeof response.data.totalFiles === 'number'
          ? response.data.totalFiles
          : fallbackGroups.length,
      );
      setGroupCountMap(fallbackGroupCountMap);
    } catch (error) {
      resetSearchResultsState();
      setSearchError(
        error instanceof Error
          ? error.message
          : '\u5de5\u4f5c\u533a\u641c\u7d22\u5931\u8d25',
      );
    }
  };

  const executeSearch = async (overrides?: {
    searchQuery?: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    includePattern?: string;
    excludePattern?: string;
  }): Promise<void> => {
    const nextSearchQuery = overrides?.searchQuery ?? searchQuery;
    const nextCaseSensitive = overrides?.caseSensitive ?? caseSensitive;
    const nextWholeWord = overrides?.wholeWord ?? wholeWord;
    const nextUseRegex = overrides?.useRegex ?? useRegex;
    const nextIncludePattern = overrides?.includePattern ?? includePattern;
    const nextExcludePattern = overrides?.excludePattern ?? excludePattern;
    const requestId = searchRequestIdRef.current + 1;
    const searchRequest = {
      query: nextSearchQuery,
      caseSensitive: nextCaseSensitive,
      wholeWord: nextWholeWord,
      useRegex: nextUseRegex,
      includePattern: nextIncludePattern,
      excludePattern: nextExcludePattern,
      maxResults: SEARCH_PANEL_MAX_RESULTS,
    };

    searchRequestIdRef.current = requestId;
    await cancelActiveSearchSession();

    if (nextSearchQuery.length === 0 || isIncompletePathSearchQuery(nextSearchQuery)) {
      resetSearchResultsState();
      setSearchError('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError('');
    resetSearchResultsState();

    if (!window.electron?.workspace?.startSearchSession) {
      await executeLegacySearch(overrides);
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
      return;
    }

    try {
      awaitingSearchSessionStartRef.current = true;
      const response = await window.electron.workspace.startSearchSession(searchRequest);

      if (requestId !== searchRequestIdRef.current) {
        if (response.success && response.data?.sessionId) {
          if (window.electron.workspace.cancelSearchSession) {
            await window.electron.workspace.cancelSearchSession(response.data.sessionId);
          }
          clearBufferedSearchSessionEvents(response.data.sessionId);
        }
        return;
      }

      if (!response.success || !response.data) {
        awaitingSearchSessionStartRef.current = false;
        resetSearchResultsState();
        setSearchError(
          typeof response.error === 'string'
            ? response.error
            : translateText('searchPanel.errors.workspaceSearchFailed', 'Workspace search failed')
        );
        setIsSearching(false);
        return;
      }

      searchSessionIdRef.current = response.data.sessionId;
      awaitingSearchSessionStartRef.current = false;
      flushBufferedSearchSessionEvents(response.data.sessionId);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      awaitingSearchSessionStartRef.current = false;
      resetSearchResultsState();
      setSearchError(
        error instanceof Error
          ? error.message
          : '\u5de5\u4f5c\u533a\u641c\u7d22\u5931\u8d25',
      );
      setIsSearching(false);
    }
  };

  const clearSearchResults = async (): Promise<void> => {
    searchRequestIdRef.current += 1;
    await cancelActiveSearchSession();
    resetSearchResultsState();
    setSearchError('');
    setIsSearching(false);
  };

  const clearSearchAssistQuery = async (): Promise<void> => {
    setSearchQuery('');
    await clearSearchResults();
    openSearchAssist();
    focusSearchInputAt(0);
  };

  const syncUpdatedTargetsInEditor = (
    updatedTargets: readonly WorkspaceTextReplaceUpdatedTarget[],
  ): void => {
    for (const updatedTarget of updatedTargets) {
      const targetPath = updatedTarget.editorPath.trim();
      if (targetPath.length === 0) {
        continue;
      }

      window.dispatchEvent(new CustomEvent<ReplaceActiveTabContentDetail>(
        'editor:replace-active-tab-content',
        {
          detail: {
            path: targetPath,
            name: updatedTarget.title?.trim() || getFileNameFromPath(targetPath),
            content: updatedTarget.content,
            markDirty: false,
            skipCreate: true,
            skipDirty: true,
          },
        },
      ));
    }
  };

  const executeReplace = async (replaceAll: boolean): Promise<void> => {
    if (!window.electron?.workspace?.replaceText) {
      setSearchError(translateText('searchPanel.errors.workspaceReplaceUnsupported', 'Current environment does not support workspace replace'));
      return;
    }

    if (parsedSearchQuery.blockFilters.length > 0) {
      setSearchError(translateText('searchPanel.errors.replaceUnsupported', 'Current search conditions do not support replace'));
      /*
      setSearchError('褰撳墠鎼滅储鏉′欢涓嶆敮鎸佹浛鎹?);
      return;
      */
      return;
    }

    const supportsTagOnlyReplace = (
      parsedSearchQuery.textQuery.length === 0
      && parsedSearchQuery.tagFilters.length > 0
    );
    if (parsedSearchQuery.textQuery.length === 0 && !supportsTagOnlyReplace) {
      setSearchError(translateText('searchPanel.errors.replaceUnsupported', 'Current search conditions do not support replace'));
      return;
    }

    if (!replaceAll && selectedResult === null) {
      return;
    }

    try {
      setIsReplacing(true);
      setSearchError('');
      const response = await window.electron.workspace.replaceText({
        query: searchQuery,
        replace: replaceQuery,
        replaceAll,
        caseSensitive,
        wholeWord,
        useRegex,
        includePattern,
        excludePattern,
        target: !replaceAll && selectedResult
          ? {
              absolutePath: selectedResult.absolutePath,
              line: selectedResult.line,
              column: selectedResult.column,
              source: selectedResult.source,
              noteId: selectedResult.noteId,
            }
          : undefined,
      });

      if (!response.success || !response.data) {
        setSearchError(
          typeof response.error === 'string'
            ? response.error
            : translateText('searchPanel.errors.workspaceReplaceFailed', 'Workspace replace failed')
        );
        return;
      }

      syncUpdatedTargetsInEditor(response.data.updatedTargets);
      await executeSearch();
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : '\u5de5\u4f5c\u533a\u66ff\u6362\u5931\u8d25',
      );
    } finally {
      setIsReplacing(false);
    }
  };

  useEffect(() => {
    if (refreshActionId <= 0) {
      return;
    }

    if (searchQuery.length === 0) {
      return;
    }

    void executeSearch();
  }, [refreshActionId]);

  useEffect(() => {
    if (clearActionId <= 0) {
      return;
    }

    void clearSearchResults();
  }, [clearActionId]);

  const handleSearch = (): void => {
    if (searchQuery.trim().length > 0 && !isIncompletePathSearchQuery(searchQuery)) {
      void persistSearchHistory(searchQuery);
    }

    setIsSearchAssistOpen(false);
    void executeSearch();
  };

  const handleToggleCaseSensitive = (): void => {
    const nextValue = !caseSensitive;
    setCaseSensitive(nextValue);

    if (searchQuery.length > 0) {
      void executeSearch({ caseSensitive: nextValue });
    }
  };

  const handleToggleWholeWord = (): void => {
    const nextValue = !wholeWord;
    setWholeWord(nextValue);

    if (searchQuery.length > 0) {
      void executeSearch({ wholeWord: nextValue });
    }
  };

  const handleToggleRegex = (): void => {
    const nextValue = !useRegex;
    setUseRegex(nextValue);

    if (searchQuery.length > 0) {
      void executeSearch({ useRegex: nextValue });
    }
  };

  const handleSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape' && isSearchAssistOpen) {
      event.preventDefault();
      setIsSearchAssistOpen(false);
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSearch();
    }
  };

  const handleSearchRangeKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void executeSearch();
  };

  const handleReplaceInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void executeReplace(event.ctrlKey || event.metaKey);
  };

  const handleSearchRangeBlur = (): void => {
    if (searchQuery.length === 0) {
      return;
    }

    void executeSearch();
  };

  const parsedSearchQuery = parseWorkspaceSearchQuery(searchQuery);
  const selectedResult = results.find(result => getSearchResultKey(result) === selectedResultKey) ?? null;
  const activeFilterAssist = getActivePathAssistState(searchQuery);
  const activePathAssist = activeFilterAssist?.kind === 'path' ? activeFilterAssist : null;
  const activeBlockAssist = activeFilterAssist?.kind === 'block' ? activeFilterAssist : null;
  const activeTagAssist = activeFilterAssist?.kind === 'tag' ? activeFilterAssist : null;
  const hasSearchAssistTokensInQuery = hasSearchAssistQueryTokens(searchQuery);
  const hasIncompletePathKeyword = hasIncompletePathAssistKeyword(searchQuery);
  const hasCompletedPathAssistValue = (
    activeFilterAssist !== null
    && activeFilterAssist.value.length > 0
  );
  const shouldSuppressSearchAssistOpen = (
    hasCompletedPathAssistValue
    || hasIncompletePathKeyword
    || (hasSearchAssistTokensInQuery && activeFilterAssist === null)
  );
  const showPathAssistPanel = isSearchAssistOpen && activeFilterAssist !== null;
  const showSearchAssistPanel = (
    isSearchAssistOpen
    && activeFilterAssist === null
    && !hasIncompletePathKeyword
    && !hasSearchAssistTokensInQuery
  );
  const shouldRenderSearchAssistPanel = showSearchAssistPanel || showPathAssistPanel;
  const isFilterOnlySearchMode = (
    parsedSearchQuery.textQuery.length === 0
    && (
      parsedSearchQuery.pathFilters.length > 0
      || parsedSearchQuery.fileFilters.length > 0
      || parsedSearchQuery.tagFilters.length > 0
    )
  );
  const canExecuteReplace = !isReplacing
    && searchQuery.trim().length > 0
    && !isIncompletePathSearchQuery(searchQuery);
  const canReplaceSelectedResult = canExecuteReplace && selectedResult !== null;
  const canReplaceAllResults = canExecuteReplace && (totalResultCount > 0 || results.length > 0);
  const filteredWorkspaceRootDirectories = activePathAssist
    ? workspaceRootDirectories.filter((rootDirectory) => (
      activePathAssist.value.length === 0
      || rootDirectory.toLowerCase().includes(activePathAssist.value.toLowerCase())
    ))
    : [];
  const filteredAvailableBlockKeywords = activeBlockAssist
    ? availableBlockKeywords.filter((blockCandidate) => (
      activeBlockAssist.value.length === 0
      || blockCandidate.keyword.toLowerCase().includes(activeBlockAssist.value.toLowerCase())
    ))
    : [];
  const filteredAvailableTags = activeTagAssist
    ? availableTags.filter((tagName) => {
      const normalizedFilterValue = activeTagAssist.value.trim().replace(/^#/, '').toLowerCase();
      return (
        normalizedFilterValue.length === 0
        || tagName.toLowerCase().includes(normalizedFilterValue)
      );
    })
    : [];
  const isBlockAssistPanelVisible = isSearchAssistOpen && activeBlockAssist !== null;
  const isTagAssistPanelVisible = isSearchAssistOpen && activeTagAssist !== null;
  const currentAssistScopeKey = `${includePattern}\u0000${excludePattern}`;

  useEffect(() => {
    const electronApi = window.electron;
    const workspaceApi = electronApi?.workspace;

    if (!isTagAssistPanelVisible) {
      return;
    }

    if (loadedTagAssistScopeKey === currentAssistScopeKey || !workspaceApi?.getSearchTags) {
      return;
    }

    const requestId = tagAssistRequestIdRef.current + 1;
    tagAssistRequestIdRef.current = requestId;

    const loadAvailableTags = async (): Promise<void> => {
      setIsTagAssistLoading(true);
      setAvailableTags([]);

      try {
        const response = await Promise.race([
          workspaceApi.getSearchTags({
            includePattern,
            excludePattern,
          }),
          new Promise<undefined>((resolve) => {
            window.setTimeout(() => resolve(undefined), 2000);
          }),
        ]);

        if (requestId !== tagAssistRequestIdRef.current) {
          return;
        }

        if (response === undefined || !response.success || !Array.isArray(response.data)) {
          setLoadedTagAssistScopeKey('');
          return;
        }

        const nextTags = [...response.data].sort((leftTag, rightTag) => (
          leftTag.localeCompare(rightTag, 'zh-Hans-CN')
        ));
        setAvailableTags(nextTags);
        setLoadedTagAssistScopeKey(currentAssistScopeKey);
      } catch (error) {
        console.error('[Search] 鍔犺浇鏍囩鍊欓€夊け璐?', error);
      } finally {
        if (requestId === tagAssistRequestIdRef.current) {
          setIsTagAssistLoading(false);
        }
      }
    };

    void loadAvailableTags();
  }, [
    currentAssistScopeKey,
    isTagAssistPanelVisible,
    loadedTagAssistScopeKey,
  ]);

  useEffect(() => {
    const electronApi = window.electron;
    const workspaceApi = electronApi?.workspace;

    if (!isBlockAssistPanelVisible) {
      return;
    }

    if (
      loadedBlockAssistScopeKey === currentAssistScopeKey
      || !workspaceApi?.getSearchBlockKeywords
    ) {
      return;
    }

    const requestId = blockAssistRequestIdRef.current + 1;
    blockAssistRequestIdRef.current = requestId;

    const loadAvailableBlockKeywords = async (): Promise<void> => {
      setIsBlockAssistLoading(true);
      setAvailableBlockKeywords([]);

      try {
        const response = await Promise.race([
          workspaceApi.getSearchBlockKeywords({
            includePattern,
            excludePattern,
          }),
          new Promise<undefined>((resolve) => {
            window.setTimeout(() => resolve(undefined), 2000);
          }),
        ]);

        if (requestId !== blockAssistRequestIdRef.current) {
          return;
        }

        if (response === undefined || !response.success || !Array.isArray(response.data)) {
          setLoadedBlockAssistScopeKey('');
          return;
        }

        const nextBlockKeywords = [...response.data].sort((leftCandidate, rightCandidate) => (
          leftCandidate.keyword.localeCompare(rightCandidate.keyword, 'zh-Hans-CN')
        ));
        setAvailableBlockKeywords(nextBlockKeywords);
        setLoadedBlockAssistScopeKey(currentAssistScopeKey);
      } catch (error) {
        console.error('[Search] Failed to load block keyword suggestions:', error);
      } finally {
        if (requestId === blockAssistRequestIdRef.current) {
          setIsBlockAssistLoading(false);
        }
      }
    };

    void loadAvailableBlockKeywords();
  }, [
    currentAssistScopeKey,
    isBlockAssistPanelVisible,
    loadedBlockAssistScopeKey,
  ]);

  useEffect(() => {
    const handleFileSaved = (): void => {
      setLoadedBlockAssistScopeKey('');
      setAvailableBlockKeywords([]);
      setLoadedTagAssistScopeKey('');
      setAvailableTags([]);
    };

    window.addEventListener('file-saved', handleFileSaved);
    return () => {
      window.removeEventListener('file-saved', handleFileSaved);
    };
  }, []);

  const currentSearchMatch: WorkspaceSearchMatchOptions = {
    query: parsedSearchQuery.textQuery,
    caseSensitive,
    wholeWord,
    useRegex,
  };

  const getResultSearchMatch = (
    result: SearchResult,
  ): WorkspaceSearchMatchOptions | undefined => {
    if (parsedSearchQuery.textQuery.length > 0) {
      return currentSearchMatch;
    }

    if (result.matchedText && result.matchedText.length > 0) {
      return {
        query: result.matchedText,
        caseSensitive,
        wholeWord: false,
        useRegex: false,
      };
    }

    return undefined;
  };

  const handleResultOpen = async (result: SearchResult): Promise<void> => {
    const resultSearchMatch = getResultSearchMatch(result);

    if (result.noteId) {
      await openNoteInEditor(result.noteId, {
        lineNumber: result.line,
        column: result.column,
        searchMatch: resultSearchMatch,
      });
      return;
    }

    if (!window.electron?.file?.read) {
      return;
    }

    const fileResult = await window.electron.file.read(result.absolutePath);
    if (!fileResult?.success || !fileResult.data) {
      setSearchError(
        typeof fileResult?.error === 'string'
          ? fileResult.error
          : translateText('searchPanel.errors.openResultFailed', 'Unable to open the search result')
      );
      return;
    }

    window.dispatchEvent(new CustomEvent('open-file', {
      detail: {
        path: result.absolutePath,
        name: fileResult.data.name,
        content: fileResult.data.content ?? '',
        language: fileResult.data.language,
        activateIfExists: true,
        isPreview: false,
        lineNumber: result.line,
        column: result.column,
        searchMatch: resultSearchMatch,
      },
    }));
  };

  const handleToggleResultGroup = (groupKey: string): void => {
    shouldAutoCollapseGroupsRef.current = false;
    setCollapsedResultGroupKeys((currentKeys) => (
      currentKeys.includes(groupKey)
        ? currentKeys.filter((currentKey) => currentKey !== groupKey)
        : [...currentKeys, groupKey]
    ));
  };

  const handleResultGroupKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    groupKey: string,
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleToggleResultGroup(groupKey);
  };

  const openSearchResult = async (result: SearchResult): Promise<void> => {
    setSelectedResultKey(getSearchResultKey(result));
    await handleResultOpen(result);
  };

  const handleResultItemKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    result: SearchResult,
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    void openSearchResult(result);
  };

  const resultGroups = sortSearchResultGroups(
    groupSearchResults(results, groupCountMap, isFilterOnlySearchMode),
    sortMode,
  );
  const virtualRows = buildSearchVirtualRows(resultGroups, collapsedResultGroupKeys);
  const effectiveViewportHeight = resultsViewportHeight > 0
    ? resultsViewportHeight
    : SEARCH_RESULT_ROW_HEIGHT * 12;
  const virtualStartIndex = Math.max(
    Math.floor(resultsScrollTop / SEARCH_RESULT_ROW_HEIGHT) - SEARCH_RESULT_OVERSCAN_ROWS,
    0,
  );
  const virtualVisibleRowCount = Math.max(
    Math.ceil(effectiveViewportHeight / SEARCH_RESULT_ROW_HEIGHT) + SEARCH_RESULT_OVERSCAN_ROWS * 2,
    1,
  );
  const virtualEndIndex = Math.min(
    virtualStartIndex + virtualVisibleRowCount,
    virtualRows.length,
  );
  const visibleVirtualRows = virtualRows.slice(virtualStartIndex, virtualEndIndex);
  const virtualContentHeight = Math.max(
    virtualRows.length * SEARCH_RESULT_ROW_HEIGHT,
    effectiveViewportHeight,
  );
  const previewMatcher = createSearchPreviewMatcher(
    parsedSearchQuery.textQuery,
    caseSensitive,
    wholeWord,
    useRegex,
  );
  const searchAssistPanelStyle = searchAssistPanelLayout
    ? {
      top: `${searchAssistPanelLayout.top}px`,
      left: `${searchAssistPanelLayout.left}px`,
      width: `${searchAssistPanelLayout.width}px`,
      maxHeight: `${searchAssistPanelLayout.maxHeight}px`,
    }
    : undefined;

  useEffect(() => {
    if (collapseAllActionId <= 0) {
      return;
    }

    const collapsedGroupKeys: string[] = [];
    const collapsedGroupKeySet = new Set<string>();

    for (const result of results) {
      const groupKey = getSearchResultGroupKey(result);
      if (collapsedGroupKeySet.has(groupKey)) {
        continue;
      }

      collapsedGroupKeySet.add(groupKey);
      collapsedGroupKeys.push(groupKey);
    }

    shouldAutoCollapseGroupsRef.current = false;
    setCollapsedResultGroupKeys(collapsedGroupKeys);
  }, [collapseAllActionId, results]);

  const handleSearchInputFocus = (): void => {
    if (shouldSuppressSearchAssistOpen) {
      setIsSearchAssistOpen(false);
      return;
    }

    openSearchAssist();
  };

  const handleSearchInputClick = (): void => {
    if (shouldSuppressSearchAssistOpen) {
      setIsSearchAssistOpen(false);
      return;
    }

    openSearchAssist();
  };

  const handleSearchInputChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ): void => {
    const nextQuery = event.target.value;
    setSearchQuery(nextQuery);

    const hasSearchOutput = isSearching
      || searchError.length > 0
      || results.length > 0
      || totalResultCount > 0
      || totalResultFiles > 0;
    if (!hasSearchOutput) {
      return;
    }

    if (!isIncompletePathSearchQuery(nextQuery)) {
      return;
    }

    void clearSearchResults();
  };

  const handleClearSearchHistory = (): void => {
    void clearSearchHistory();
  };

  const handleSortMenuClose = (): void => {
    setIsSortMenuOpen(false);
  };

  const handleSortMenuOpen = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    event.stopPropagation();

    if (!searchSortButtonRef.current) {
      return;
    }

    if (isSortMenuOpen) {
      setIsSortMenuOpen(false);
      return;
    }

    const rect = searchSortButtonRef.current.getBoundingClientRect();
    setSortMenuPosition({
      x: rect.right,
      y: rect.bottom + 4,
    });
    setIsSortMenuOpen(true);
  };

  const searchSortMenuItems: SidebarHeaderMenuItem[] = SEARCH_SORT_MENU_OPTIONS.map((option) => ({
    id: option.mode,
    label: translateText(option.translationKey, option.defaultLabel),
    checked: sortMode === option.mode,
    onClick: () => {
      setSortMode(option.mode);
      setIsSortMenuOpen(false);
    },
  }));
  const activeSortLabel = (() => {
    const matchedOption = SEARCH_SORT_MENU_OPTIONS.find((option) => option.mode === sortMode)
      ?? SEARCH_SORT_MENU_OPTIONS[0];
    return translateText(matchedOption.translationKey, matchedOption.defaultLabel);
  })();

  useEffect(() => {
    if (searchQuery.length === 0) {
      setIsSortMenuOpen(false);
    }
  }, [searchQuery]);

  const handleInsertSearchOption = (token: string): void => {
    const nextQuery = token.endsWith(' ') ? token : `${token} `;
    setSearchQuery(nextQuery);
    setIsSearchAssistOpen(
      token === PATH_SEARCH_TOKEN || token === TAG_SEARCH_TOKEN || token === BLOCK_SEARCH_TOKEN,
    );
    void clearSearchResults();
    focusSearchInputAt(nextQuery.length);
  };

  const handleSelectPathSuggestion = (rootDirectory: string): void => {
    if (!activePathAssist) {
      return;
    }

    const nextQuery = applyPathSuggestionToQuery(searchQuery, activePathAssist, rootDirectory);
    setSearchQuery(nextQuery);
    setIsSearchAssistOpen(false);
    focusSearchInputAt(nextQuery.length);
    void persistSearchHistory(nextQuery);
    void executeSearch({ searchQuery: nextQuery });
  };

  const handleSelectTagSuggestion = (tagName: string): void => {
    if (!activeTagAssist) {
      return;
    }

    const nextQuery = applyPathSuggestionToQuery(searchQuery, activeTagAssist, `#${tagName}`);
    setSearchQuery(nextQuery);
    setIsSearchAssistOpen(false);
    focusSearchInputAt(nextQuery.length);
    void persistSearchHistory(nextQuery);
    void executeSearch({ searchQuery: nextQuery });
  };

  const handleSelectBlockSuggestion = (blockKeyword: string): void => {
    if (!activeBlockAssist) {
      return;
    }

    const nextQuery = applyPathSuggestionToQuery(searchQuery, activeBlockAssist, blockKeyword);
    setSearchQuery(nextQuery);
    setIsSearchAssistOpen(false);
    focusSearchInputAt(nextQuery.length);
    void persistSearchHistory(nextQuery);
    void executeSearch({ searchQuery: nextQuery });
  };

  const handleSelectSearchHistory = (query: string): void => {
    setSearchQuery(query);
    setIsSearchAssistOpen(false);
    focusSearchInputAt(query.length);
    void persistSearchHistory(query);
    void executeSearch({ searchQuery: query });
  };

  return (
    <div className="search-panel">
      <div className="search-input-section">
        <div ref={searchInputAnchorRef} className="search-input-anchor">
          <SearchToolbarField
            className="search-input-wrapper"
            actions={(
              hasSearchAssistTokensInQuery ? (
                <PressableControl
                  className="search-toolbar-field__option"
                  onPress={() => {
                    void clearSearchAssistQuery();
                  }}
                  aria-label={translateText('searchPanel.toolbar.clearSearchOptions', 'Clear Search Filters')}
                  title={translateText('searchPanel.toolbar.clearSearchOptions', 'Clear Search Filters')}
                >
                  <LuX size={14} />
                </PressableControl>
              ) : (
                <>
                  <PressableControl
                    className={`search-toolbar-field__option ${caseSensitive ? 'is-active' : ''}`}
                    onPress={handleToggleCaseSensitive}
                    aria-label={translateText('searchPanel.toolbar.caseSensitive', 'Match Case')}
                    aria-pressed={caseSensitive}
                    title={translateText('searchPanel.toolbar.caseSensitive', 'Match Case')}
                  >
                    <SearchToolbarIcon
                      name="caseSensitive"
                      className="search-toolbar-field__option-icon"
                    />
                  </PressableControl>
                  <PressableControl
                    className={`search-toolbar-field__option ${wholeWord ? 'is-active' : ''}`}
                    onPress={handleToggleWholeWord}
                    aria-label={translateText('searchPanel.toolbar.wholeWord', 'Match Whole Word')}
                    aria-pressed={wholeWord}
                    title={translateText('searchPanel.toolbar.wholeWord', 'Match Whole Word')}
                  >
                    <SearchToolbarIcon
                      name="wholeWord"
                      className="search-toolbar-field__option-icon"
                    />
                  </PressableControl>
                  <PressableControl
                    className={`search-toolbar-field__option ${useRegex ? 'is-active' : ''}`}
                    onPress={handleToggleRegex}
                    aria-label={translateText('searchPanel.toolbar.regex', 'Use Regular Expression')}
                    aria-pressed={useRegex}
                    title={translateText('searchPanel.toolbar.regex', 'Use Regular Expression')}
                  >
                    <SearchToolbarIcon
                      name="regex"
                      className="search-toolbar-field__option-icon"
                    />
                  </PressableControl>
                </>
              )
            )}
          >
            <textarea
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearchInputChange}
              onFocus={handleSearchInputFocus}
              onClick={handleSearchInputClick}
              onKeyDown={handleSearchInputKeyDown}
              placeholder={translateText('searchPanel.toolbar.searchPlaceholder', 'Search')}
              className="search-input"
              rows={1}
              spellCheck={false}
            />
          </SearchToolbarField>

        </div>

        {shouldRenderSearchAssistPanel && searchAssistPanelStyle && createPortal(
          showSearchAssistPanel ? (
            <div
              ref={searchAssistPanelRef}
              className="search-assist-panel"
              role="dialog"
              aria-label={translateText('searchPanel.assist.dialogLabel', 'Search Assistance')}
              style={searchAssistPanelStyle}
            >
              <div className="search-assist-group">
                <div className="search-assist-group-title">
                  {translateText('searchPanel.assist.optionsTitle', 'Search Filters')}
                </div>
                {SEARCH_ASSIST_OPTIONS.map((option) => (
                  <PressableControl
                    key={option.token}
                    className="search-assist-item"
                    onMouseDown={event => event.preventDefault()}
                    onPress={() => handleInsertSearchOption(option.token)}
                    title={translateText(option.translationKey, option.defaultDescription)}
                    aria-label={`${option.token} ${translateText(option.translationKey, option.defaultDescription)}`}
                  >
                    <span className="search-assist-item-token">{option.token}</span>
                    <span className="search-assist-item-description">
                      {translateText(option.translationKey, option.defaultDescription)}
                    </span>
                  </PressableControl>
                ))}
              </div>
              <div className="search-assist-group search-assist-group--history">
                <div className="search-assist-group-title search-assist-group-title--with-action">
                  <span>{translateText('searchPanel.assist.historyTitle', 'Search History')}</span>
                  <PressableControl
                    className="search-assist-close"
                    onMouseDown={event => event.preventDefault()}
                    onPress={handleClearSearchHistory}
                    title={translateText('searchPanel.assist.clearHistory', 'Clear Search History')}
                    aria-label={translateText('searchPanel.assist.clearHistory', 'Clear Search History')}
                  >
                    <LuX size={12} />
                  </PressableControl>
                </div>
                <div className="search-assist-history-list">
                  {searchHistoryEntries.length > 0 ? (
                    searchHistoryEntries.map((entry) => (
                      <PressableControl
                        key={`${entry.query}-${entry.timestamp}`}
                        className="search-assist-item search-assist-item--history"
                        onMouseDown={event => event.preventDefault()}
                        onPress={() => handleSelectSearchHistory(entry.query)}
                        title={entry.query}
                        aria-label={String(t('searchPanel.assist.useHistory', {
                          defaultValue: 'Use Search History {{query}}',
                          query: entry.query,
                        }))}
                      >
                        <span className="search-assist-history-query">{entry.query}</span>
                      </PressableControl>
                    ))
                  ) : (
                    <div className="search-assist-empty">
                      {translateText('searchPanel.assist.emptyHistory', 'No search history yet')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={searchAssistPanelRef}
              className="search-path-assist-panel"
              role="dialog"
              aria-label={activeTagAssist
                ? translateText('searchPanel.assist.filterDialogLabels.tag', 'Tag Selection')
                : activeBlockAssist
                  ? translateText('searchPanel.assist.filterDialogLabels.block', 'Block Keyword Selection')
                  : translateText('searchPanel.assist.filterDialogLabels.path', 'Path Selection')}
              style={searchAssistPanelStyle}
            >
              <div className="search-path-assist-list">
                {activeTagAssist ? (
                  isTagAssistLoading ? (
                    <div className="search-assist-empty">
                      {translateText('searchPanel.assist.loadingTags', 'Loading tags...')}
                    </div>
                  ) : filteredAvailableTags.length > 0 ? (
                    filteredAvailableTags.map((tagName) => (
                      <Tooltip
                        key={tagName}
                        content={getSearchTooltipContent(`#${tagName}`)}
                      >
                        <PressableControl
                          className="search-assist-item search-assist-item--history"
                          onMouseDown={event => event.preventDefault()}
                          onPress={() => handleSelectTagSuggestion(tagName)}
                          aria-label={String(t('searchPanel.assist.selectTag', {
                            defaultValue: 'Select tag {{tag}}',
                            tag: `#${tagName}`,
                          }))}
                        >
                          <span className="search-assist-history-query">#{tagName}</span>
                        </PressableControl>
                      </Tooltip>
                    ))
                  ) : (
                    <div className="search-assist-empty">
                      {translateText('searchPanel.assist.emptyTags', 'No tags available')}
                    </div>
                  )
                ) : activeBlockAssist ? (
                  isBlockAssistLoading ? (
                    <div className="search-assist-empty">
                      {translateText('searchPanel.assist.loadingBlocks', 'Loading block keywords...')}
                    </div>
                  ) : filteredAvailableBlockKeywords.length > 0 ? (
                    filteredAvailableBlockKeywords.map((blockCandidate) => (
                      <Tooltip
                        key={blockCandidate.keyword}
                        content={getSearchTooltipContent(blockCandidate.preview)}
                      >
                        <PressableControl
                          className="search-assist-item search-assist-item--history"
                          onMouseDown={event => event.preventDefault()}
                          onPress={() => handleSelectBlockSuggestion(blockCandidate.keyword)}
                          aria-label={String(t('searchPanel.assist.selectBlock', {
                            defaultValue: 'Select block keyword {{keyword}}',
                            keyword: blockCandidate.keyword,
                          }))}
                        >
                          <span className="search-assist-history-query">{blockCandidate.keyword}</span>
                        </PressableControl>
                      </Tooltip>
                    ))
                  ) : (
                    <div className="search-assist-empty">
                      {translateText('searchPanel.assist.emptyBlocks', 'No block keywords available')}
                    </div>
                  )
                ) : filteredWorkspaceRootDirectories.length > 0 ? (
                  filteredWorkspaceRootDirectories.map((rootDirectory) => (
                    <PressableControl
                      key={rootDirectory}
                      className="search-assist-item search-assist-item--history"
                      onMouseDown={event => event.preventDefault()}
                      onPress={() => handleSelectPathSuggestion(rootDirectory)}
                      title={rootDirectory}
                      aria-label={String(t('searchPanel.assist.selectRootDirectory', {
                        defaultValue: 'Select root directory {{path}}',
                        path: rootDirectory,
                      }))}
                    >
                      <span className="search-assist-history-query">{rootDirectory}</span>
                    </PressableControl>
                  ))
                ) : (
                  <div className="search-assist-empty">
                    {translateText('searchPanel.assist.emptyRootDirectories', 'No root directories available')}
                  </div>
                )}
              </div>
            </div>
          ),
          document.body,
        )}

        <PressableControl
          onPress={() => setShowReplace(!showReplace)}
          className="toggle-replace-button"
          aria-expanded={showReplace}
          title={translateText('searchPanel.toolbar.toggleReplace', 'Toggle Replace Panel')}
        >
          <svg
            className={`chevron-icon ${showReplace ? 'expanded' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 20 20"
          >
            <path d="m8 6 4 4-4 4" />
          </svg>
          {translateText('searchPanel.toolbar.replace', 'Replace')}
        </PressableControl>
      </div>

      {showReplace && (
        <div className="replace-input-section">
          <div className="replace-input-wrapper">
            <input
              type="text"
              value={replaceQuery}
              onChange={event => setReplaceQuery(event.target.value)}
              onKeyDown={handleReplaceInputKeyDown}
              placeholder={translateText('searchPanel.replace.inputPlaceholder', 'Replace')}
              className="replace-input"
            />
          </div>
          <div className="replace-actions">
            <PressableControl
              className="replace-button"
              onPress={() => {
                void executeReplace(false);
              }}
              disabled={!canReplaceSelectedResult}
              title={canReplaceSelectedResult
                ? translateText('searchPanel.replace.replaceSelectedTitle', 'Replace the currently selected search result')
                : translateText('searchPanel.replace.replaceSelectedDisabled', 'Select a search result first')}
            >
              {translateText('searchPanel.replace.replaceSelected', 'Replace')}
            </PressableControl>
            <PressableControl
              className="replace-button"
              onPress={() => {
                void executeReplace(true);
              }}
              disabled={!canReplaceAllResults}
              title={canReplaceAllResults
                ? translateText('searchPanel.replace.replaceAllTitle', 'Replace all matches in the current search results')
                : translateText('searchPanel.replace.replaceAllDisabled', 'There are no replaceable search results')}
            >
              {translateText('searchPanel.replace.replaceAll', 'Replace All')}
            </PressableControl>
          </div>
        </div>
      )}

      <div className="search-options-section">
        <details>
          <summary>{translateText('searchPanel.scope.title', 'Search Scope')}</summary>
          <div className="options-content">
            <div className="option-input-wrapper">
              <input
                type="text"
                value={includePattern}
                onChange={event => setIncludePattern(event.target.value)}
                onKeyDown={handleSearchRangeKeyDown}
                onBlur={handleSearchRangeBlur}
                placeholder={translateText('searchPanel.scope.includePlaceholder', 'Files to include, for example src/**/*.ts,*.md')}
                className="option-input"
              />
            </div>
            <div className="option-input-wrapper">
              <input
                type="text"
                value={excludePattern}
                onChange={event => setExcludePattern(event.target.value)}
                onKeyDown={handleSearchRangeKeyDown}
                onBlur={handleSearchRangeBlur}
                placeholder={translateText('searchPanel.scope.excludePlaceholder', 'Files to exclude, for example node_modules/**,*.test.ts')}
                className="option-input"
              />
            </div>
          </div>
        </details>
      </div>

      <div className="search-results">
        {searchError ? (
          <div className="empty-state empty-state--error">{searchError}</div>
        ) : searchQuery.length === 0 ? null : (
          <div className="results-list">
            <div className="results-summary">
              <span className="results-summary-text">
                {limitHit
                  ? String(t('searchPanel.results.summaryWithLimit', {
                    defaultValue: 'Found {{count}} results, reached the limit of {{limit}}',
                    count: totalResultCount,
                    limit: SEARCH_PANEL_MAX_RESULTS,
                  }))
                  : String(t('searchPanel.results.summary', {
                    defaultValue: 'Found {{count}} results',
                    count: totalResultCount,
                  }))}
              </span>
              <PressableControl
                ref={searchSortButtonRef}
                className="results-summary-sort"
                onPress={handleSortMenuOpen}
                aria-label={String(t('searchPanel.results.sort', {
                  defaultValue: 'Sort, current: {{label}}',
                  label: activeSortLabel,
                }))}
                title={activeSortLabel}
              >
                <span className="results-summary-sort-label">{activeSortLabel}</span>
                <LuChevronsUpDown size={16} />
              </PressableControl>
            </div>
            {results.length > 0 && (
              <CustomScrollbar
                ref={searchResultsScrollbarRef}
                className="search-results-scrollbar"
                scrollbarWidth={10}
                onScroll={(scrollTop) => {
                  setResultsScrollTop(Math.round(scrollTop));
                }}
              >
                <TreeView className="search-results-tree search-results-tree--virtualized">
                  <div
                    className="search-results-virtual-spacer"
                    style={{ height: `${virtualContentHeight}px` }}
                  >
                    {visibleVirtualRows.map((row) => {
                      const rowStyle: React.CSSProperties = {
                        top: `${row.rowIndex * SEARCH_RESULT_ROW_HEIGHT}px`,
                      };

                      if (row.type === 'group') {
                        const filterOnlyResult = row.group.isFilterOnly ? row.group.results[0] : null;
                        const filterOnlyResultKey = filterOnlyResult
                          ? getSearchResultKey(filterOnlyResult)
                          : '';
                        const usePlainGroupCount = row.group.totalCount >= 100;

                        return (
                          <div
                            key={row.key}
                            className="search-results-virtual-row search-results-virtual-row--group"
                            style={rowStyle}
                          >
                            <TreeNodeRow
                              depth={0}
                              role="treeitem"
                              tabIndex={0}
                              ariaExpanded={row.group.isFilterOnly ? undefined : row.isExpanded}
                              selected={filterOnlyResultKey.length > 0 && selectedResultKey === filterOnlyResultKey}
                              ariaSelected={filterOnlyResultKey.length > 0 && selectedResultKey === filterOnlyResultKey}
                              title={row.group.isFilterOnly
                                ? row.group.title
                                : `${row.group.title} (${row.group.totalCount})`}
                              contentClassName="search-result-group-row"
                              onClick={() => {
                                if (filterOnlyResult) {
                                  void openSearchResult(filterOnlyResult);
                                  return;
                                }

                                handleToggleResultGroup(row.group.key);
                              }}
                              onKeyDown={(event) => {
                                if (filterOnlyResult) {
                                  handleResultItemKeyDown(event, filterOnlyResult);
                                  return;
                                }

                                handleResultGroupKeyDown(event, row.group.key);
                              }}
                              leading={(
                                filterOnlyResult ? (
                                  <span className="file-tree-chevron search-result-group-spacer" />
                                ) : (
                                  <Icon
                                    iconSet="ui"
                                    name={row.isExpanded ? 'chevron-down' : 'chevron-right'}
                                    size={14}
                                    className="file-tree-chevron"
                                  />
                                )
                              )}
                              icon={(
                                <Icon
                                  iconSet="ui"
                                  name="file"
                                  size={16}
                                  className="file-tree-icon"
                                />
                              )}
                            >
                              <span className="file-tree-name search-result-group-label">
                                {row.group.isFilterOnly
                                  ? renderHighlightedFilterLabel(
                                    row.group.label,
                                    parsedSearchQuery.pathFilters,
                                    parsedSearchQuery.fileFilters,
                                    caseSensitive,
                                  )
                                  : row.group.label}
                              </span>
                              {!row.group.isFilterOnly && (
                                <div className="group-count-wrapper">
                                  <span
                                    className={`search-result-group-count ${usePlainGroupCount ? 'search-result-group-count--plain' : ''}`}
                                  >
                                    {row.group.totalCount}
                                  </span>
                                </div>
                              )}
                            </TreeNodeRow>
                          </div>
                        );
                      }

                      const resultKey = getSearchResultKey(row.result);
                      const rowPreviewMatcher = (
                        previewMatcher
                        ?? (
                          row.result.matchedText && row.result.matchedText.length > 0
                            ? createSearchPreviewMatcher(
                              row.result.matchedText,
                              caseSensitive,
                              false,
                              false,
                            )
                            : null
                        )
                      );
                      const previewColumn = (
                        parsedSearchQuery.textQuery.length === 0
                        && row.result.matchedText
                        && row.result.matchedText.length > 0
                      )
                        ? getSearchPreviewMatchColumn(
                          row.result.preview,
                          row.result.matchedText,
                          caseSensitive,
                        )
                        : row.result.column;
                      const displayPreview = getSearchResultDisplayPreview(
                        row.result.preview,
                        rowPreviewMatcher,
                        previewColumn,
                        SEARCH_RESULT_PREVIEW_MAX_LENGTH,
                      );

                      return (
                        <div
                          key={row.key}
                          className="search-results-virtual-row search-results-virtual-row--match"
                          style={rowStyle}
                        >
                          <Tooltip content={getSearchTooltipContent(row.result.preview)}>
                            <TreeNodeRow
                              depth={1}
                              parentDepth={0}
                              role="treeitem"
                              tabIndex={0}
                              selected={selectedResultKey === resultKey}
                              ariaSelected={selectedResultKey === resultKey}
                              contentClassName="search-result-match-row search-result-match-row--virtualized"
                              onClick={() => {
                                void openSearchResult(row.result);
                              }}
                              onKeyDown={(event) => handleResultItemKeyDown(event, row.result)}
                              leading={<span className="file-tree-chevron" />}
                            >
                              <span className="file-tree-name search-result-match-text">
                                {renderHighlightedSearchPreview(displayPreview, rowPreviewMatcher)}
                              </span>
                            </TreeNodeRow>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                </TreeView>
              </CustomScrollbar>
            )}
          </div>
        )}
      </div>
      <SidebarHeaderMenu
        isOpen={isSortMenuOpen}
        position={sortMenuPosition}
        horizontalAlign="end"
        onClose={handleSortMenuClose}
        items={searchSortMenuItems}
      />
    </div>
  );
};
