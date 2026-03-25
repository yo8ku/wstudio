/**
 * Search panel component.
 * Executes workspace-wide text search from the sidebar without using button elements.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TreeChildren, TreeNodeRow } from '../../../Explorer/Common/TreeNode';
import { TreeView } from '../../../Explorer/Common/TreeView';
import { Icon } from '../../../Icons/Icon';
import { Tooltip } from '../../../Tooltip/Tooltip';
import { PressableControl } from '../../../common/PressableControl';
import { SearchToolbarIcon } from '../../../common/SearchToolbarIcon';
import { SearchToolbarField } from '../../../common/SearchToolbarField';
import { openNoteInEditor } from '../../../../utils/noteLinking';
import {
  createWorkspaceSearchMatcher,
  findClosestWorkspaceSearchMatchRange,
  type WorkspaceSearchMatchOptions,
} from '../../../../utils/workspaceSearchMatch';
import './Search.scss';

interface SearchResult {
  absolutePath: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
}

interface SearchResultGroup {
  key: string;
  label: string;
  title: string;
  results: SearchResult[];
}

const SEARCH_INPUT_MAX_HEIGHT = 120;
const SEARCH_RESULT_TOOLTIP_MAX_LENGTH = 360;
const SEARCH_RESULT_PREVIEW_MAX_LENGTH = 56;

const getSearchResultGroupKey = (result: SearchResult): string => (
  result.noteId ? `note:${result.noteId}` : `file:${result.absolutePath}`
);

const getSearchResultKey = (result: SearchResult): string => (
  `${getSearchResultGroupKey(result)}:${result.line}:${result.column}:${result.preview}`
);

const getSearchResultGroupLabel = (result: SearchResult): string => {
  if (result.title && result.title.trim().length > 0) {
    return result.title.trim();
  }

  const sourcePath = result.relativePath || result.absolutePath;
  const normalizedPath = sourcePath.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/');
  return pathSegments[pathSegments.length - 1] || sourcePath;
};

const getSearchResultTooltipContent = (preview: string): string => {
  const normalizedPreview = preview.trim();

  if (normalizedPreview.length <= SEARCH_RESULT_TOOLTIP_MAX_LENGTH) {
    return normalizedPreview;
  }

  return `${normalizedPreview.slice(0, SEARCH_RESULT_TOOLTIP_MAX_LENGTH - 1)}…`;
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
): string => {
  const normalizedPreview = preview.trim();
  if (normalizedPreview.length <= SEARCH_RESULT_PREVIEW_MAX_LENGTH) {
    return normalizedPreview;
  }

  const matchedRange = getMatchedPreviewRange(normalizedPreview, matcher, column);
  if (!matchedRange) {
    return `${normalizedPreview.slice(0, SEARCH_RESULT_PREVIEW_MAX_LENGTH - 3)}...`;
  }

  const previewBudget = SEARCH_RESULT_PREVIEW_MAX_LENGTH - 6;
  const matchLength = matchedRange.end - matchedRange.start;
  const availableContext = Math.max(previewBudget - matchLength, 0);
  let start = Math.max(
    matchedRange.start - Math.floor(availableContext / 2),
    0,
  );
  let end = Math.min(start + previewBudget, normalizedPreview.length);

  if (end - start < previewBudget) {
    start = Math.max(end - previewBudget, 0);
  }

  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedPreview.length ? '...' : '';
  return `${prefix}${normalizedPreview.slice(start, end)}${suffix}`;
};

const groupSearchResults = (results: SearchResult[]): SearchResultGroup[] => {
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
      results: [result],
    });
  }

  return Array.from(groups.values());
};

export const Search: React.FC = () => {
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
  const [searchError, setSearchError] = useState('');
  const [limitHit, setLimitHit] = useState(false);
  const [collapsedResultGroupKeys, setCollapsedResultGroupKeys] = useState<string[]>([]);
  const [selectedResultKey, setSelectedResultKey] = useState('');
  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const searchRequestIdRef = useRef(0);

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

  useEffect(() => {
    const activeGroupKeys = new Set<string>();
    const activeResultKeys = new Set<string>();

    for (const result of results) {
      activeGroupKeys.add(getSearchResultGroupKey(result));
      activeResultKeys.add(getSearchResultKey(result));
    }

    setCollapsedResultGroupKeys((currentKeys) => (
      currentKeys.filter((groupKey) => activeGroupKeys.has(groupKey))
    ));
    setSelectedResultKey((currentKey) => (
      currentKey && activeResultKeys.has(currentKey) ? currentKey : ''
    ));
  }, [results]);

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

    if (nextSearchQuery.length === 0) {
      searchRequestIdRef.current += 1;
      setResults([]);
      setSearchError('');
      setLimitHit(false);
      setIsSearching(false);
      return;
    }

    if (!window.electron?.workspace?.searchText) {
      setSearchError('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5de5\u4f5c\u533a\u641c\u7d22');
      setResults([]);
      setLimitHit(false);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setIsSearching(true);
    setSearchError('');

    try {
      const response = await window.electron.workspace.searchText({
        query: nextSearchQuery,
        caseSensitive: nextCaseSensitive,
        wholeWord: nextWholeWord,
        useRegex: nextUseRegex,
        includePattern: nextIncludePattern,
        excludePattern: nextExcludePattern,
      });

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      if (!response.success || !response.data) {
        setResults([]);
        setLimitHit(false);
        setSearchError(response.error || '\u5de5\u4f5c\u533a\u641c\u7d22\u5931\u8d25');
        return;
      }

      setResults(response.data.items);
      setLimitHit(response.data.limitHit);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setResults([]);
      setLimitHit(false);
      setSearchError(
        error instanceof Error
          ? error.message
          : '\u5de5\u4f5c\u533a\u641c\u7d22\u5931\u8d25',
      );
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleSearch = (): void => {
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

  const handleSearchRangeBlur = (): void => {
    if (searchQuery.length === 0) {
      return;
    }

    void executeSearch();
  };

  const currentSearchMatch: WorkspaceSearchMatchOptions = {
    query: searchQuery,
    caseSensitive,
    wholeWord,
    useRegex,
  };

  const handleResultOpen = async (result: SearchResult): Promise<void> => {
    if (result.noteId) {
      await openNoteInEditor(result.noteId, {
        lineNumber: result.line,
        column: result.column,
        searchMatch: currentSearchMatch,
      });
      return;
    }

    if (!window.electron?.file?.read) {
      return;
    }

    const fileResult = await window.electron.file.read(result.absolutePath);
    if (!fileResult?.success || !fileResult.data) {
      setSearchError(fileResult?.error || '\u65e0\u6cd5\u6253\u5f00\u641c\u7d22\u7ed3\u679c');
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
        searchMatch: currentSearchMatch,
      },
    }));
  };

  const handleToggleResultGroup = (groupKey: string): void => {
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

  const resultGroups = groupSearchResults(results);
  const previewMatcher = createSearchPreviewMatcher(
    searchQuery,
    caseSensitive,
    wholeWord,
    useRegex,
  );

  return (
    <div className="search-panel">
      <div className="search-input-section">
        <SearchToolbarField
          className="search-input-wrapper"
          actions={(
            <>
              <PressableControl
                className={`search-toolbar-field__option ${caseSensitive ? 'is-active' : ''}`}
                onPress={handleToggleCaseSensitive}
                aria-label={'\u5339\u914d\u5927\u5c0f\u5199'}
                aria-pressed={caseSensitive}
                title={'\u5339\u914d\u5927\u5c0f\u5199'}
              >
                <SearchToolbarIcon
                  name="caseSensitive"
                  className="search-toolbar-field__option-icon"
                />
              </PressableControl>
              <PressableControl
                className={`search-toolbar-field__option ${wholeWord ? 'is-active' : ''}`}
                onPress={handleToggleWholeWord}
                aria-label={'\u5168\u5b57\u5339\u914d'}
                aria-pressed={wholeWord}
                title={'\u5168\u5b57\u5339\u914d'}
              >
                <SearchToolbarIcon
                  name="wholeWord"
                  className="search-toolbar-field__option-icon"
                />
              </PressableControl>
              <PressableControl
                className={`search-toolbar-field__option ${useRegex ? 'is-active' : ''}`}
                onPress={handleToggleRegex}
                aria-label={'\u4f7f\u7528\u6b63\u5219\u8868\u8fbe\u5f0f'}
                aria-pressed={useRegex}
                title={'\u4f7f\u7528\u6b63\u5219\u8868\u8fbe\u5f0f'}
              >
                <SearchToolbarIcon
                  name="regex"
                  className="search-toolbar-field__option-icon"
                />
              </PressableControl>
            </>
          )}
        >
          <textarea
            ref={searchInputRef}
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            placeholder={'\u641c\u7d22'}
            className="search-input"
            rows={1}
            spellCheck={false}
          />
        </SearchToolbarField>

        <PressableControl
          onPress={() => setShowReplace(!showReplace)}
          className="toggle-replace-button"
          aria-expanded={showReplace}
          title={'\u5207\u6362\u66ff\u6362\u533a\u57df'}
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
          {'\u66ff\u6362'}
        </PressableControl>
      </div>

      {showReplace && (
        <div className="replace-input-section">
          <div className="replace-input-wrapper">
            <input
              type="text"
              value={replaceQuery}
              onChange={event => setReplaceQuery(event.target.value)}
              placeholder={'\u66ff\u6362'}
              className="replace-input"
            />
          </div>
          <div className="replace-actions">
            <PressableControl
              className="replace-button"
              onPress={() => undefined}
              disabled
              title={'\u66ff\u6362\u529f\u80fd\u6682\u672a\u5b9e\u73b0'}
            >
              {'\u66ff\u6362'}
            </PressableControl>
            <PressableControl
              className="replace-button"
              onPress={() => undefined}
              disabled
              title={'\u5168\u90e8\u66ff\u6362\u529f\u80fd\u6682\u672a\u5b9e\u73b0'}
            >
              {'\u5168\u90e8\u66ff\u6362'}
            </PressableControl>
          </div>
        </div>
      )}

      <div className="search-options-section">
        <details>
          <summary>{'\u641c\u7d22\u8303\u56f4'}</summary>
          <div className="options-content">
            <div className="option-input-wrapper">
              <input
                type="text"
                value={includePattern}
                onChange={event => setIncludePattern(event.target.value)}
                onKeyDown={handleSearchRangeKeyDown}
                onBlur={handleSearchRangeBlur}
                placeholder={'\u8981\u5305\u542b\u7684\u6587\u4ef6\uff0c\u4f8b\u5982 src/**/*.ts,*.md'}
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
                placeholder={'\u8981\u6392\u9664\u7684\u6587\u4ef6\uff0c\u4f8b\u5982 node_modules/**,*.test.ts'}
                className="option-input"
              />
            </div>
          </div>
        </details>
      </div>

      <div className="search-results">
        {isSearching ? (
          <div className="empty-state">
            {'\u6b63\u5728\u641c\u7d22\u6574\u4e2a\u5de5\u4f5c\u533a...'}
          </div>
        ) : searchError ? (
          <div className="empty-state empty-state--error">{searchError}</div>
        ) : searchQuery.length === 0 ? (
          <div className="empty-state">
            {'\u8f93\u5165\u5185\u5bb9\u540e\u6309 Enter \u641c\u7d22\u6574\u4e2a\u5de5\u4f5c\u533a'}
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">{'\u6ca1\u6709\u641c\u7d22\u7ed3\u679c'}</div>
        ) : (
          <div className="results-list">
            <div className="results-summary">
              {'\u627e\u5230 '}
              {results.length}
              {' \u4e2a\u7ed3\u679c\uff0c\u6765\u81ea '}
              {resultGroups.length}
              {' \u4e2a\u6587\u4ef6'}
              {limitHit ? '\uff0c\u5df2\u8fbe\u5230\u7ed3\u679c\u4e0a\u9650' : ''}
            </div>
            <TreeView className="search-results-tree">
              {resultGroups.map((group) => {
                const isExpanded = !collapsedResultGroupKeys.includes(group.key);

                return (
                  <React.Fragment key={group.key}>
                    <TreeNodeRow
                      depth={0}
                      role="treeitem"
                      tabIndex={0}
                      ariaExpanded={isExpanded}
                      title={`${group.title} (${group.results.length})`}
                      contentClassName="search-result-group-row"
                      onClick={() => handleToggleResultGroup(group.key)}
                      onKeyDown={(event) => handleResultGroupKeyDown(event, group.key)}
                      leading={(
                        <Icon
                          iconSet="ui"
                          name={isExpanded ? 'chevron-down' : 'chevron-right'}
                          size={14}
                          className="file-tree-chevron"
                        />
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
                        {group.label}
                      </span>
                      <span className="search-result-group-count">
                        {group.results.length}
                      </span>
                    </TreeNodeRow>
                    {isExpanded && (
                      <TreeChildren
                        parentDepth={0}
                        className="search-result-group-children"
                      >
                        {group.results.map((result) => {
                          const resultKey = getSearchResultKey(result);
                          const displayPreview = getSearchResultDisplayPreview(
                            result.preview,
                            previewMatcher,
                            result.column,
                          );

                          return (
                            <Tooltip
                              key={resultKey}
                              content={getSearchResultTooltipContent(result.preview)}
                            >
                              <TreeNodeRow
                                depth={1}
                                parentDepth={0}
                                role="treeitem"
                                tabIndex={0}
                                selected={selectedResultKey === resultKey}
                                ariaSelected={selectedResultKey === resultKey}
                                contentClassName="search-result-match-row"
                                onClick={() => {
                                  void openSearchResult(result);
                                }}
                                onKeyDown={(event) => handleResultItemKeyDown(event, result)}
                                leading={<span className="file-tree-chevron" />}
                              >
                                <span className="file-tree-name search-result-match-text">
                                  {renderHighlightedSearchPreview(displayPreview, previewMatcher)}
                                </span>
                              </TreeNodeRow>
                            </Tooltip>
                          );
                        })}
                      </TreeChildren>
                    )}
                  </React.Fragment>
                );
              })}
            </TreeView>
          </div>
        )}
      </div>
    </div>
  );
};
