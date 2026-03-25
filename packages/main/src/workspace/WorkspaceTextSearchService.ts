import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS = 100;
export const WORKSPACE_SEARCH_SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.obsidian',
  '.wstudio',
  'node_modules',
]);

export interface WorkspaceTextSearchRequest {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  includePattern?: string;
  excludePattern?: string;
  maxResults?: number;
}

export interface WorkspaceTextSearchMatch {
  absolutePath: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
}

export interface WorkspaceTextSearchResponse {
  items: WorkspaceTextSearchMatch[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
  groupCounts: WorkspaceTextSearchGroupCount[];
}

export interface WorkspaceTextSearchGroupCount {
  groupKey: string;
  totalMatches: number;
}

export interface WorkspaceTextSearchTarget {
  absolutePath: string;
  relativePath: string;
  content: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
}

interface CompiledPathPattern {
  readonly matcher: RegExp;
  readonly matchBasename: boolean;
}

interface CompiledSearchRequest {
  readonly matcher: RegExp;
  readonly includePatterns: readonly CompiledPathPattern[];
  readonly excludePatterns: readonly CompiledPathPattern[];
  readonly maxResults: number;
}

interface SearchAccumulator {
  readonly items: WorkspaceTextSearchMatch[];
  readonly groupCounts: Map<string, number>;
  totalCount: number;
}

const WORD_BOUNDARY_PATTERN = '[\\p{L}\\p{N}_]';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const toWorkspaceRelativePath = (
  workspaceDirectory: string,
  absolutePath: string,
): string => path.relative(workspaceDirectory, absolutePath).replace(/\\/g, '/');

export const isWorkspaceSearchSkippedRelativePath = (relativePath: string): boolean => {
  const normalizedPath = relativePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalizedPath.length === 0) {
    return false;
  }

  const pathSegments = normalizedPath.split('/').filter(segment => segment.length > 0);
  return pathSegments.some((segment, index) => {
    const isLastSegment = index === pathSegments.length - 1;
    if (segment.startsWith('.') && segment !== '.vscode') {
      return true;
    }

    return !isLastSegment && WORKSPACE_SEARCH_SKIPPED_DIRECTORIES.has(segment);
  });
};

const normalizePattern = (pattern: string): string => (
  pattern
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
);

const globPatternToRegExp = (pattern: string): RegExp => {
  let source = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const trailingCharacter = pattern[index + 2];

    if (character === '*') {
      if (nextCharacter === '*') {
        if (trailingCharacter === '/') {
          source += '(?:.*/)?';
          index += 2;
          continue;
        }

        source += '.*';
        index += 1;
        continue;
      }

      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(character);
  }

  source += '$';
  return new RegExp(source, 'i');
};

const compilePathPatterns = (input?: string): CompiledPathPattern[] => {
  if (!input) {
    return [];
  }

  return input
    .split(',')
    .map(normalizePattern)
    .filter(pattern => pattern.length > 0)
    .map(pattern => ({
      matcher: globPatternToRegExp(pattern),
      matchBasename: !pattern.includes('/'),
    }));
};

const matchesPathPatterns = (
  relativePath: string,
  basename: string,
  patterns: readonly CompiledPathPattern[],
): boolean => patterns.some(({ matcher, matchBasename }) => {
  if (matchBasename && matcher.test(basename)) {
    return true;
  }

  return matcher.test(relativePath);
});

const buildSearchMatcher = (request: WorkspaceTextSearchRequest): RegExp => {
  const baseSource = request.useRegex ? request.query : escapeRegExp(request.query);
  const source = request.wholeWord
    ? `(?<!${WORD_BOUNDARY_PATTERN})(?:${baseSource})(?!${WORD_BOUNDARY_PATTERN})`
    : baseSource;
  const flags = `${request.caseSensitive ? 'g' : 'gi'}u`;

  try {
    return new RegExp(source, flags);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid search expression: ${error.message}`);
    }

    throw new Error('Invalid search expression');
  }
};

const compileRequest = (request: WorkspaceTextSearchRequest): CompiledSearchRequest => ({
  matcher: buildSearchMatcher(request),
  includePatterns: compilePathPatterns(request.includePattern),
  excludePatterns: compilePathPatterns(request.excludePattern),
  maxResults: request.maxResults && request.maxResults > 0
    ? request.maxResults
    : DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS,
});

const getLineStarts = (content: string): number[] => {
  const lineStarts = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
};

const getLineEnd = (content: string, lineStart: number): number => {
  const lineEnd = content.indexOf('\n', lineStart);
  return lineEnd === -1 ? content.length : lineEnd;
};

const shouldSkipEntry = (entryName: string, isDirectory: boolean): boolean => {
  if (entryName.startsWith('.') && entryName !== '.vscode') {
    return true;
  }

  return isDirectory && WORKSPACE_SEARCH_SKIPPED_DIRECTORIES.has(entryName);
};

const isPathWithinDirectory = (rootDirectory: string, targetPath: string): boolean => {
  const normalizedRootDirectory = path.resolve(rootDirectory);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedRootDirectory, normalizedTargetPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const createSkippedWorkspaceTargetPaths = (
  workspaceDirectory: string,
  additionalTargets: readonly WorkspaceTextSearchTarget[],
): ReadonlySet<string> => new Set(
  additionalTargets
    .map(target => target.absolutePath)
    .filter(absolutePath => isPathWithinDirectory(workspaceDirectory, absolutePath)),
);

const createMatchGroupKey = (item: WorkspaceTextSearchMatch): string => (
  item.noteId ? `note:${item.noteId}` : `file:${item.absolutePath}`
);

const createMatchFromIndex = (
  target: WorkspaceTextSearchTarget,
  lineStarts: readonly number[],
  matchIndex: number,
  lineCursor: number,
): { item: WorkspaceTextSearchMatch; lineCursor: number } => {
  let nextLineCursor = lineCursor;

  while (
    nextLineCursor + 1 < lineStarts.length
    && lineStarts[nextLineCursor + 1] <= matchIndex
  ) {
    nextLineCursor += 1;
  }

  const lineStart = lineStarts[nextLineCursor];
  const lineEnd = getLineEnd(target.content, lineStart);

  return {
    lineCursor: nextLineCursor,
    item: {
      absolutePath: target.absolutePath,
      relativePath: target.relativePath,
      line: nextLineCursor + 1,
      column: matchIndex - lineStart + 1,
      preview: target.content.slice(lineStart, lineEnd).replace(/\r$/, '').trim(),
      source: target.source,
      noteId: target.noteId,
      title: target.title,
    },
  };
};

const searchTargetText = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
): void => {
  if (target.content.includes('\u0000')) {
    return;
  }

  const lineStarts = getLineStarts(target.content);
  let lineCursor = 0;
  let match = compiledRequest.matcher.exec(target.content);

  while (match) {
    const nextMatch = createMatchFromIndex(
      target,
      lineStarts,
      match.index,
      lineCursor,
    );

    lineCursor = nextMatch.lineCursor;

    accumulator.totalCount += 1;

    const groupKey = createMatchGroupKey(nextMatch.item);
    const currentGroupCount = accumulator.groupCounts.get(groupKey) ?? 0;
    accumulator.groupCounts.set(groupKey, currentGroupCount + 1);

    if (accumulator.items.length < compiledRequest.maxResults) {
      accumulator.items.push(nextMatch.item);
    }

    if (match[0].length === 0) {
      compiledRequest.matcher.lastIndex += 1;
    }

    match = compiledRequest.matcher.exec(target.content);
  }
};

const isTargetIncluded = (
  relativePath: string,
  basename: string,
  compiledRequest: CompiledSearchRequest,
): boolean => {
  if (matchesPathPatterns(relativePath, basename, compiledRequest.excludePatterns)) {
    return false;
  }

  if (
    compiledRequest.includePatterns.length > 0
    && !matchesPathPatterns(relativePath, basename, compiledRequest.includePatterns)
  ) {
    return false;
  }

  return true;
};

const searchAdditionalTargets = (
  additionalTargets: readonly WorkspaceTextSearchTarget[],
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
): void => {
  for (const target of additionalTargets) {
    const normalizedRelativePath = target.relativePath.trim();
    const basename = path.basename(normalizedRelativePath || target.absolutePath);

    if (!isTargetIncluded(normalizedRelativePath, basename, compiledRequest)) {
      continue;
    }

    compiledRequest.matcher.lastIndex = 0;
    searchTargetText(target, compiledRequest, accumulator);
  }
};

const searchWorkspaceDirectory = async (
  workspaceDirectory: string,
  currentDirectory: string,
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
  skippedWorkspaceTargetPaths: ReadonlySet<string>,
): Promise<void> => {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name, entry.isDirectory())) {
      continue;
    }

    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = toWorkspaceRelativePath(workspaceDirectory, absolutePath);

    if (matchesPathPatterns(relativePath, entry.name, compiledRequest.excludePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      await searchWorkspaceDirectory(
        workspaceDirectory,
        absolutePath,
        compiledRequest,
        accumulator,
        skippedWorkspaceTargetPaths,
      );
      continue;
    }

    if (skippedWorkspaceTargetPaths.has(absolutePath)) {
      continue;
    }

    if (
      compiledRequest.includePatterns.length > 0
      && !matchesPathPatterns(relativePath, entry.name, compiledRequest.includePatterns)
    ) {
      continue;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      compiledRequest.matcher.lastIndex = 0;
      searchTargetText(
        {
          absolutePath,
          relativePath,
          content,
          source: 'workspace-file',
        },
        compiledRequest,
        accumulator,
      );
    } catch {
      // Skip unreadable entries and non-text files.
    }
  }
};

export const searchWorkspaceText = async (
  workspaceDirectory: string,
  request: WorkspaceTextSearchRequest,
  additionalTargets: readonly WorkspaceTextSearchTarget[] = [],
): Promise<WorkspaceTextSearchResponse> => {
  if (request.query.length === 0) {
    return {
      items: [],
      limitHit: false,
      totalCount: 0,
      totalFiles: 0,
      groupCounts: [],
    };
  }

  const compiledRequest = compileRequest(request);
  const skippedWorkspaceTargetPaths = createSkippedWorkspaceTargetPaths(
    workspaceDirectory,
    additionalTargets,
  );
  const accumulator: SearchAccumulator = {
    items: [],
    groupCounts: new Map<string, number>(),
    totalCount: 0,
  };

  searchAdditionalTargets(
    additionalTargets,
    compiledRequest,
    accumulator,
  );
  await searchWorkspaceDirectory(
    workspaceDirectory,
    workspaceDirectory,
    compiledRequest,
    accumulator,
    skippedWorkspaceTargetPaths,
  );

  return {
    items: accumulator.items,
    limitHit: accumulator.totalCount > accumulator.items.length,
    totalCount: accumulator.totalCount,
    totalFiles: accumulator.groupCounts.size,
    groupCounts: Array.from(accumulator.groupCounts.entries()).map(([groupKey, totalMatches]) => ({
      groupKey,
      totalMatches,
    })),
  };
};
