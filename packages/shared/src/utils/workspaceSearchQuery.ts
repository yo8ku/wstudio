/**
 * Parses workspace search query syntax shared by main and renderer.
 * Supports `path:` / `path：`, `file:` / `file：`, `tag:` / `tag：`,
 * and `block:` / `block：` filters while preserving the remaining text query.
 */

export interface WorkspaceSearchParsedQuery {
  readonly textQuery: string;
  readonly pathFilters: readonly string[];
  readonly fileFilters: readonly string[];
  readonly tagFilters: readonly string[];
  readonly blockFilters: readonly string[];
}

const WORKSPACE_SEARCH_FILTER_PATTERN = /(^|\s)(path|file|tag|block)[:\uFF1A]\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/giu;

export const parseWorkspaceSearchQuery = (
  query: string,
): WorkspaceSearchParsedQuery => {
  if (query.trim().length === 0) {
    return {
      textQuery: '',
      pathFilters: [],
      fileFilters: [],
      tagFilters: [],
      blockFilters: [],
    };
  }

  const pathFilters: string[] = [];
  const fileFilters: string[] = [];
  const tagFilters: string[] = [];
  const blockFilters: string[] = [];
  let textQuery = '';
  let lastIndex = 0;

  for (const match of query.matchAll(WORKSPACE_SEARCH_FILTER_PATTERN)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) {
      continue;
    }

    textQuery += query.slice(lastIndex, matchIndex);
    lastIndex = matchIndex + match[0].length;

    const filterType = (match[2] ?? '').toLowerCase();
    const filterValue = (match[3] ?? match[4] ?? match[5] ?? '').trim();
    if (filterValue.length > 0) {
      if (filterType === 'path') {
        pathFilters.push(filterValue);
      }

      if (filterType === 'file') {
        fileFilters.push(filterValue);
      }

      if (filterType === 'tag') {
        tagFilters.push(filterValue);
      }

      if (filterType === 'block') {
        blockFilters.push(filterValue);
      }
    }
  }

  textQuery += query.slice(lastIndex);

  return {
    textQuery: textQuery.trim(),
    pathFilters,
    fileFilters,
    tagFilters,
    blockFilters,
  };
};
