export interface WorkspaceSearchMatchOptions {
  readonly query: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly useRegex: boolean;
}

const WORKSPACE_SEARCH_WORD_BOUNDARY_PATTERN = '[\\p{L}\\p{N}_]';

const escapeSearchRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createWorkspaceSearchMatcher = (
  query: string,
  isCaseSensitive: boolean,
  isWholeWord: boolean,
  isRegex: boolean,
): RegExp | null => {
  if (query.length === 0) {
    return null;
  }

  const baseSource = isRegex ? query : escapeSearchRegExp(query);
  const source = isWholeWord
    ? `(?<!${WORKSPACE_SEARCH_WORD_BOUNDARY_PATTERN})(?:${baseSource})(?!${WORKSPACE_SEARCH_WORD_BOUNDARY_PATTERN})`
    : baseSource;
  const flags = `${isCaseSensitive ? 'g' : 'gi'}u`;

  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
};

export const findClosestWorkspaceSearchMatchRange = (
  text: string,
  matcher: RegExp | null,
  column: number,
): { start: number; end: number } | null => {
  if (!matcher || text.length === 0) {
    return null;
  }

  matcher.lastIndex = 0;
  const matchRanges: Array<{ start: number; end: number }> = [];
  let match = matcher.exec(text);

  while (match) {
    const matchStart = match.index;
    const matchText = match[0];
    const matchEnd = matchStart + matchText.length;

    if (matchText.length === 0) {
      matcher.lastIndex = matchStart + 1;
      match = matcher.exec(text);
      continue;
    }

    matchRanges.push({
      start: matchStart,
      end: matchEnd,
    });
    match = matcher.exec(text);
  }

  if (matchRanges.length === 0) {
    return null;
  }

  const targetColumnIndex = Math.max(column - 1, 0);
  let selectedRange = matchRanges[0];
  let smallestDistance = Math.abs(selectedRange.start - targetColumnIndex);

  for (const range of matchRanges.slice(1)) {
    const rangeDistance = Math.abs(range.start - targetColumnIndex);
    if (rangeDistance < smallestDistance) {
      selectedRange = range;
      smallestDistance = rangeDistance;
    }
  }

  return selectedRange;
};
