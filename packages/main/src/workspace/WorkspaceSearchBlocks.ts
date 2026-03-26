/**
 * Collects and matches workspace search block keywords declared with [!block:keyword] markers.
 */

export interface WorkspaceSearchBlockSource {
  readonly content: string;
}

export interface WorkspaceSearchBlockCandidate {
  readonly keyword: string;
  readonly preview: string;
}

export interface WorkspaceSearchBlockLineMatch {
  readonly line: number;
  readonly column: number;
  readonly keyword: string;
  readonly preview: string;
}

const WORKSPACE_SEARCH_BLOCK_MARKER_PATTERN = /\[!(?:block|blocck)\s*[:\uFF1A]\s*([^\]\r\n]+)\]/iu;

const compareWorkspaceSearchBlockKeywords = (leftKeyword: string, rightKeyword: string): number => (
  leftKeyword.localeCompare(rightKeyword, 'zh-Hans-CN')
);

const normalizeWorkspaceSearchBlockKeyword = (keyword: string): string => keyword.trim();

const normalizeWorkspaceSearchBlockFilter = (
  value: string,
  caseSensitive: boolean,
): string => {
  const trimmedValue = value.trim();
  return caseSensitive ? trimmedValue : trimmedValue.toLowerCase();
};

const matchesWorkspaceSearchBlockFilters = (
  blockKeyword: string,
  blockFilters: readonly string[],
  caseSensitive: boolean,
): boolean => {
  if (blockFilters.length === 0) {
    return true;
  }

  const normalizedBlockKeyword = normalizeWorkspaceSearchBlockFilter(blockKeyword, caseSensitive);
  return blockFilters.every((blockFilter) => {
    const normalizedBlockFilter = normalizeWorkspaceSearchBlockFilter(blockFilter, caseSensitive);
    if (normalizedBlockFilter.length === 0) {
      return true;
    }

    return normalizedBlockKeyword.includes(normalizedBlockFilter);
  });
};

export const listWorkspaceSearchBlockKeywordsFromContent = (content: string): string[] => {
  return collectWorkspaceSearchBlockCandidates([
    { content },
  ]).map(candidate => candidate.keyword);
};

export const collectWorkspaceSearchBlockCandidates = (
  blockSources: readonly WorkspaceSearchBlockSource[],
): WorkspaceSearchBlockCandidate[] => {
  const candidates = new Map<string, string>();

  for (const blockSource of blockSources) {
    const lines = blockSource.content.split('\n');

    for (const rawLine of lines) {
      const lineText = rawLine.replace(/\r$/, '');
      WORKSPACE_SEARCH_BLOCK_MARKER_PATTERN.lastIndex = 0;
      const markerMatch = WORKSPACE_SEARCH_BLOCK_MARKER_PATTERN.exec(lineText);
      if (!markerMatch) {
        continue;
      }

      const blockKeyword = normalizeWorkspaceSearchBlockKeyword(markerMatch[1] ?? '');
      if (blockKeyword.length === 0 || candidates.has(blockKeyword)) {
        continue;
      }

      const blockContent = lineText.slice((markerMatch.index ?? 0) + markerMatch[0].length).trim();
      candidates.set(blockKeyword, blockContent.length > 0 ? blockContent : lineText);
    }
  }

  return [...candidates.entries()]
    .sort(([leftKeyword], [rightKeyword]) => (
      compareWorkspaceSearchBlockKeywords(leftKeyword, rightKeyword)
    ))
    .map(([keyword, preview]) => ({
      keyword,
      preview,
    }));
};

export const collectWorkspaceSearchBlockKeywords = (
  blockSources: readonly WorkspaceSearchBlockSource[],
): string[] => {
  return collectWorkspaceSearchBlockCandidates(blockSources).map(candidate => candidate.keyword);
};

export const findWorkspaceSearchBlockLineMatches = (
  content: string,
  blockFilters: readonly string[],
  caseSensitive: boolean,
): readonly WorkspaceSearchBlockLineMatch[] => {
  if (content.trim().length === 0) {
    return [];
  }

  if (blockFilters.length === 0) {
    return [];
  }

  const lines = content.split('\n');
  const matches: WorkspaceSearchBlockLineMatch[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineText = (lines[lineIndex] ?? '').replace(/\r$/, '');
    WORKSPACE_SEARCH_BLOCK_MARKER_PATTERN.lastIndex = 0;
    const markerMatch = WORKSPACE_SEARCH_BLOCK_MARKER_PATTERN.exec(lineText);
    if (!markerMatch) {
      continue;
    }

    const blockKeyword = normalizeWorkspaceSearchBlockKeyword(markerMatch[1] ?? '');
    if (
      blockKeyword.length === 0
      || !matchesWorkspaceSearchBlockFilters(blockKeyword, blockFilters, caseSensitive)
    ) {
      continue;
    }

    const keywordIndexInMarker = markerMatch[0].indexOf(blockKeyword);
    if (keywordIndexInMarker < 0) {
      continue;
    }

    matches.push({
      line: lineIndex + 1,
      column: (markerMatch.index ?? 0) + keywordIndexInMarker + 1,
      keyword: blockKeyword,
      preview: lineText,
    });
  }

  return matches;
};
