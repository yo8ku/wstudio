import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseWorkspaceSearchQuery } from '@note-studio/shared/utils/workspaceSearchQuery';
import { noteDatabase } from '../note-system';
import { findWorkspaceSearchBlockLineMatches, type WorkspaceSearchBlockLineMatch } from './WorkspaceSearchBlocks';
import {
  findAllWorkspaceSearchTagMatches,
  findWorkspaceSearchTagMatch,
} from './WorkspaceSearchTags';

export const DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS = 20000;
export const WORKSPACE_SEARCH_SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.obsidian',
  '.wstudio',
  'node_modules',
]);
export const WORKSPACE_SEARCH_SKIPPED_FILE_EXTENSIONS = new Set([
  '.bash',
  '.c',
  '.cc',
  '.cjs',
  '.cpp',
  '.cs',
  '.cxx',
  '.dart',
  '.go',
  '.h',
  '.hpp',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.kts',
  '.lua',
  '.mjs',
  '.php',
  '.ps1',
  '.py',
  '.pyw',
  '.r',
  '.rb',
  '.rs',
  '.scala',
  '.sh',
  '.swift',
  '.ts',
  '.tsx',
  '.zsh',
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
  matchedText?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface WorkspaceTextReplaceTarget {
  absolutePath: string;
  line: number;
  column: number;
  source?: 'workspace-file' | 'note';
  noteId?: string;
}

export interface WorkspaceTextReplaceRequest extends WorkspaceTextSearchRequest {
  replace: string;
  replaceAll?: boolean;
  target?: WorkspaceTextReplaceTarget;
}

export interface WorkspaceTextReplaceUpdatedTarget {
  absolutePath: string;
  editorPath: string;
  relativePath: string;
  content: string;
  replacedCount: number;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
}

export interface WorkspaceTextReplaceResponse {
  replacedCount: number;
  fileCount: number;
  updatedTargets: WorkspaceTextReplaceUpdatedTarget[];
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

export interface WorkspaceTextSearchBatch {
  items: WorkspaceTextSearchMatch[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

export interface WorkspaceTextSearchTarget {
  absolutePath: string;
  editorPath?: string;
  relativePath: string;
  content: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

interface CompiledPathPattern {
  readonly matcher: RegExp;
  readonly matchBasename: boolean;
}

interface CompiledSearchRequest {
  readonly textQuery: string;
  readonly matcher: RegExp | null;
  readonly pathFilters: readonly string[];
  readonly fileFilters: readonly string[];
  readonly tagFilters: readonly string[];
  readonly blockFilters: readonly string[];
  readonly includePatterns: readonly CompiledPathPattern[];
  readonly excludePatterns: readonly CompiledPathPattern[];
  readonly caseSensitive: boolean;
  readonly maxResults: number;
}

interface SearchAccumulator {
  readonly items: WorkspaceTextSearchMatch[];
  readonly pendingItems: WorkspaceTextSearchMatch[];
  readonly groupCounts: Map<string, number>;
  readonly onItemsBatch?: (batch: WorkspaceTextSearchBatch) => void;
  readonly batchSize: number;
  totalCount: number;
  limitHit: boolean;
}

interface ResolvedWorkspaceTextMatch {
  index: number;
  line: number;
  column: number;
  matchText: string;
  preview?: string;
  captures: Array<string | undefined>;
  groups?: Record<string, string>;
}

interface TargetReplacementResult {
  content: string;
  replacedCount: number;
}

interface WorkspaceTextReplaceAccumulator {
  replacedCount: number;
  updatedTargets: WorkspaceTextReplaceUpdatedTarget[];
}

const WORD_BOUNDARY_PATTERN = '[\\p{L}\\p{N}_]';
const DEFAULT_WORKSPACE_SEARCH_BATCH_SIZE = 40;

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
  }) || WORKSPACE_SEARCH_SKIPPED_FILE_EXTENSIONS.has(
    path.extname(pathSegments[pathSegments.length - 1] ?? '').toLowerCase(),
  );
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

export const matchesWorkspaceSearchScope = (
  relativePath: string,
  includePattern?: string,
  excludePattern?: string,
): boolean => {
  const normalizedRelativePath = normalizePattern(relativePath);
  const pathSegments = normalizedRelativePath.split('/').filter(segment => segment.length > 0);
  const basename = pathSegments[pathSegments.length - 1] ?? '';
  const compiledIncludePatterns = compilePathPatterns(includePattern);
  const compiledExcludePatterns = compilePathPatterns(excludePattern);

  if (compiledExcludePatterns.length > 0 && matchesPathPatterns(
    normalizedRelativePath,
    basename,
    compiledExcludePatterns,
  )) {
    return false;
  }

  if (compiledIncludePatterns.length > 0 && !matchesPathPatterns(
    normalizedRelativePath,
    basename,
    compiledIncludePatterns,
  )) {
    return false;
  }

  return true;
};

const buildSearchMatcher = (
  query: string,
  request: WorkspaceTextSearchRequest,
): RegExp => {
  const baseSource = request.useRegex ? query : escapeRegExp(query);
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

const compileRequest = (request: WorkspaceTextSearchRequest): CompiledSearchRequest => {
  const parsedQuery = parseWorkspaceSearchQuery(request.query);

  return {
    textQuery: parsedQuery.textQuery,
    matcher: parsedQuery.textQuery.length > 0
      ? buildSearchMatcher(parsedQuery.textQuery, request)
      : null,
    pathFilters: parsedQuery.pathFilters,
    fileFilters: parsedQuery.fileFilters,
    tagFilters: parsedQuery.tagFilters,
    blockFilters: parsedQuery.blockFilters,
    includePatterns: compilePathPatterns(request.includePattern),
    excludePatterns: compilePathPatterns(request.excludePattern),
    caseSensitive: request.caseSensitive === true,
    maxResults: request.maxResults && request.maxResults > 0
      ? request.maxResults
      : DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS,
  };
};

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

export const listWorkspaceSearchRootDirectories = async (
  workspaceDirectory: string,
): Promise<string[]> => {
  const entries = await fs.readdir(workspaceDirectory, { withFileTypes: true });

  return entries
    .filter(entry => entry.isDirectory() && !shouldSkipEntry(entry.name, true))
    .map(entry => entry.name)
    .filter(entryName => !isWorkspaceSearchSkippedRelativePath(entryName))
    .sort((leftEntry, rightEntry) => leftEntry.localeCompare(rightEntry, 'zh-CN'));
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

const createWorkspaceTextSearchResponse = (
  accumulator: SearchAccumulator,
): WorkspaceTextSearchResponse => ({
  items: accumulator.items,
  limitHit: accumulator.limitHit,
  totalCount: accumulator.totalCount,
  totalFiles: accumulator.groupCounts.size,
  groupCounts: Array.from(accumulator.groupCounts.entries()).map(([groupKey, totalMatches]) => ({
    groupKey,
    totalMatches,
  })),
});

const createEmptyWorkspaceTextSearchResponse = (): WorkspaceTextSearchResponse => ({
  items: [],
  limitHit: false,
  totalCount: 0,
  totalFiles: 0,
  groupCounts: [],
});

const appendAccumulatorItem = (
  item: WorkspaceTextSearchMatch,
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
): void => {
  accumulator.totalCount += 1;

  const groupKey = createMatchGroupKey(item);
  const currentGroupCount = accumulator.groupCounts.get(groupKey) ?? 0;
  accumulator.groupCounts.set(groupKey, currentGroupCount + 1);

  if (accumulator.items.length < compiledRequest.maxResults) {
    accumulator.items.push(item);
    accumulator.pendingItems.push(item);
  }

  if (accumulator.totalCount >= compiledRequest.maxResults) {
    accumulator.limitHit = true;
  }

  if (accumulator.pendingItems.length >= accumulator.batchSize) {
    flushAccumulatorItems(accumulator);
  }
};

const flushAccumulatorItems = (accumulator: SearchAccumulator): void => {
  if (!accumulator.onItemsBatch || accumulator.pendingItems.length === 0) {
    return;
  }

  const items = accumulator.pendingItems.splice(0, accumulator.pendingItems.length);
  accumulator.onItemsBatch({
    items,
    limitHit: accumulator.limitHit,
    totalCount: accumulator.totalCount,
    totalFiles: accumulator.groupCounts.size,
  });
};

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
      createdAt: target.createdAt,
      updatedAt: target.updatedAt,
    },
  };
};

const createFilterOnlyMatch = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
): WorkspaceTextSearchMatch => ({
  ...((): WorkspaceTextSearchMatch => {
    if (compiledRequest.tagFilters.length > 0) {
      const tagMatch = findWorkspaceSearchTagMatch(
        target.content,
        compiledRequest.tagFilters,
        compiledRequest.caseSensitive,
      );

      if (tagMatch) {
        const lineStarts = getLineStarts(target.content);
        const nextMatch = createMatchFromIndex(target, lineStarts, tagMatch.index, 0);

        return {
          ...nextMatch.item,
          preview: target.relativePath.trim() || target.title?.trim() || target.absolutePath,
          matchedText: tagMatch.matchedText,
        };
      }
    }

    return {
      absolutePath: target.absolutePath,
      relativePath: target.relativePath,
      line: 1,
      column: 1,
      preview: target.relativePath.trim() || target.title?.trim() || target.absolutePath,
      source: target.source,
      noteId: target.noteId,
      title: target.title,
      createdAt: target.createdAt,
      updatedAt: target.updatedAt,
    };
  })(),
});

const normalizeWorkspaceSearchText = (
  value: string,
  caseSensitive: boolean,
): string => (caseSensitive ? value : value.toLowerCase());

const findWorkspaceSearchTextIndex = (
  content: string,
  searchText: string,
  fromIndex: number,
  caseSensitive: boolean,
): number => {
  if (searchText.length === 0) {
    return -1;
  }

  if (caseSensitive) {
    return content.indexOf(searchText, fromIndex);
  }

  return content.toLowerCase().indexOf(searchText.toLowerCase(), fromIndex);
};

const findMatchedBlockFilterText = (
  blockKeyword: string,
  blockFilters: readonly string[],
  caseSensitive: boolean,
): string | null => {
  const normalizedBlockKeyword = normalizeWorkspaceSearchText(blockKeyword, caseSensitive);

  for (const blockFilter of blockFilters) {
    const trimmedFilter = blockFilter.trim();
    const normalizedBlockFilter = normalizeWorkspaceSearchText(trimmedFilter, caseSensitive);
    if (normalizedBlockFilter.length === 0) {
      continue;
    }

    const matchIndex = normalizedBlockKeyword.indexOf(normalizedBlockFilter);
    if (matchIndex >= 0) {
      return blockKeyword.slice(matchIndex, matchIndex + trimmedFilter.length);
    }
  }

  return null;
};

const isFilterOnlySearchRequest = (
  compiledRequest: CompiledSearchRequest,
): boolean => (
  compiledRequest.blockFilters.length === 0
  && compiledRequest.matcher === null
  && (
    compiledRequest.pathFilters.length > 0
    || compiledRequest.fileFilters.length > 0
    || compiledRequest.tagFilters.length > 0
  )
);

const searchTargetText = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
): void => {
  if (
    accumulator.limitHit
    || compiledRequest.matcher === null
    || target.content.includes('\u0000')
  ) {
    return;
  }

  const lineStarts = getLineStarts(target.content);
  let lineCursor = 0;
  let lastMatchedLine = -1;
  let match = compiledRequest.matcher.exec(target.content);

  while (match) {
    const nextMatch = createMatchFromIndex(
      target,
      lineStarts,
      match.index,
      lineCursor,
    );

    lineCursor = nextMatch.lineCursor;
    if (nextMatch.item.line !== lastMatchedLine) {
      lastMatchedLine = nextMatch.item.line;
      appendAccumulatorItem(nextMatch.item, compiledRequest, accumulator);

      if (accumulator.limitHit) {
        break;
      }
    }

    const lineStart = lineStarts[nextMatch.lineCursor] ?? 0;
    const nextLineSearchIndex = Math.min(
      getLineEnd(target.content, lineStart) + 1,
      target.content.length,
    );
    if (nextLineSearchIndex > compiledRequest.matcher.lastIndex) {
      compiledRequest.matcher.lastIndex = nextLineSearchIndex;
    } else if (match[0].length === 0) {
      compiledRequest.matcher.lastIndex += 1;
    }
    match = compiledRequest.matcher.exec(target.content);
  }
};

const searchTargetBlocks = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
  accumulator: SearchAccumulator,
): void => {
  if (
    accumulator.limitHit
    || compiledRequest.blockFilters.length === 0
    || target.content.includes('\u0000')
  ) {
    return;
  }

  const blockLineMatches = findWorkspaceSearchBlockLineMatches(
    target.content,
    compiledRequest.blockFilters,
    compiledRequest.caseSensitive,
  );

  for (const blockLineMatch of blockLineMatches) {
    if (accumulator.limitHit) {
      return;
    }

    let matchedText = blockLineMatch.keyword;
    let matchColumn = blockLineMatch.column;
    if (compiledRequest.matcher !== null) {
      compiledRequest.matcher.lastIndex = 0;
      const match = compiledRequest.matcher.exec(blockLineMatch.preview);
      if (!match || match[0].length === 0) {
        continue;
      }

      matchedText = match[0];
      matchColumn = match.index + 1;
    } else {
      const blockFilterMatchText = findMatchedBlockFilterText(
        blockLineMatch.keyword,
        compiledRequest.blockFilters,
        compiledRequest.caseSensitive,
      );
      if (blockFilterMatchText) {
        matchedText = blockFilterMatchText;
      }
    }

    appendAccumulatorItem(
      {
        absolutePath: target.absolutePath,
        relativePath: target.relativePath,
        line: blockLineMatch.line,
        column: matchColumn,
        preview: blockLineMatch.preview,
        source: target.source,
        noteId: target.noteId,
        title: target.title,
        matchedText,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      },
      compiledRequest,
      accumulator,
    );
  }
};

const collectTargetTextMatches = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
): ResolvedWorkspaceTextMatch[] => {
  if (compiledRequest.matcher === null || target.content.includes('\u0000')) {
    return [];
  }

  const lineStarts = getLineStarts(target.content);
  const collectedMatches: ResolvedWorkspaceTextMatch[] = [];
  let lineCursor = 0;
  compiledRequest.matcher.lastIndex = 0;
  let match = compiledRequest.matcher.exec(target.content);

  while (match) {
    const nextMatch = createMatchFromIndex(target, lineStarts, match.index, lineCursor);
    lineCursor = nextMatch.lineCursor;
    collectedMatches.push({
      index: match.index,
      line: nextMatch.item.line,
      column: nextMatch.item.column,
      matchText: match[0],
      captures: match.slice(1).map(capture => capture),
      groups: match.groups,
    });

    if (match[0].length === 0) {
      compiledRequest.matcher.lastIndex = match.index + 1;
    }
    match = compiledRequest.matcher.exec(target.content);
  }

  return collectedMatches;
};

const collectTargetTagMatches = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
): ResolvedWorkspaceTextMatch[] => {
  if (compiledRequest.tagFilters.length === 0) {
    return [];
  }

  const tagMatches = findAllWorkspaceSearchTagMatches(
    target.content,
    compiledRequest.tagFilters,
    compiledRequest.caseSensitive,
  );
  if (tagMatches.length === 0) {
    return [];
  }

  const lineStarts = getLineStarts(target.content);
  let lineCursor = 0;

  return tagMatches.map((tagMatch) => {
    const nextMatch = createMatchFromIndex(target, lineStarts, tagMatch.index, lineCursor);
    lineCursor = nextMatch.lineCursor;

    return {
      index: tagMatch.index,
      line: nextMatch.item.line,
      column: nextMatch.item.column,
      matchText: tagMatch.matchedText,
      captures: [],
    };
  });
};

const buildReplacementText = (
  replacementTemplate: string,
  content: string,
  match: ResolvedWorkspaceTextMatch,
): string => {
  let nextText = '';

  for (let index = 0; index < replacementTemplate.length; index += 1) {
    const character = replacementTemplate[index];
    if (character !== '$' || index === replacementTemplate.length - 1) {
      nextText += character;
      continue;
    }

    const nextCharacter = replacementTemplate[index + 1];
    if (nextCharacter === '$') {
      nextText += '$';
      index += 1;
      continue;
    }

    if (nextCharacter === '&') {
      nextText += match.matchText;
      index += 1;
      continue;
    }

    if (nextCharacter === '`') {
      nextText += content.slice(0, match.index);
      index += 1;
      continue;
    }

    if (nextCharacter === '\'') {
      nextText += content.slice(match.index + match.matchText.length);
      index += 1;
      continue;
    }

    if (nextCharacter === '<') {
      const groupEndIndex = replacementTemplate.indexOf('>', index + 2);
      if (groupEndIndex >= 0) {
        const groupName = replacementTemplate.slice(index + 2, groupEndIndex);
        if (groupName.length > 0 && match.groups && groupName in match.groups) {
          nextText += match.groups[groupName] ?? '';
          index = groupEndIndex;
          continue;
        }

        nextText += replacementTemplate.slice(index, groupEndIndex + 1);
        index = groupEndIndex;
        continue;
      }
    }

    if (/\d/.test(nextCharacter)) {
      const secondDigit = replacementTemplate[index + 2];
      if (secondDigit && /\d/.test(secondDigit)) {
        const twoDigitIndex = Number(replacementTemplate.slice(index + 1, index + 3));
        if (twoDigitIndex > 0 && twoDigitIndex <= match.captures.length) {
          nextText += match.captures[twoDigitIndex - 1] ?? '';
          index += 2;
          continue;
        }
      }

      const captureIndex = Number(nextCharacter);
      if (captureIndex > 0 && captureIndex <= match.captures.length) {
        nextText += match.captures[captureIndex - 1] ?? '';
        index += 1;
        continue;
      }
    }

    nextText += `$${nextCharacter}`;
    index += 1;
  }

  return nextText;
};

const applyReplacementMatches = (
  content: string,
  matches: readonly ResolvedWorkspaceTextMatch[],
  replacementTemplate: string,
): string => {
  if (matches.length === 0) {
    return content;
  }

  let nextContent = '';
  let cursor = 0;

  for (const match of matches) {
    nextContent += content.slice(cursor, match.index);
    nextContent += buildReplacementText(replacementTemplate, content, match);
    cursor = match.index + match.matchText.length;
  }

  nextContent += content.slice(cursor);
  return nextContent;
};

const isReplacementTargetMatch = (
  target: WorkspaceTextSearchTarget,
  replacementTarget: WorkspaceTextReplaceTarget,
): boolean => {
  if (replacementTarget.noteId && target.noteId) {
    return replacementTarget.noteId === target.noteId;
  }

  return replacementTarget.absolutePath === target.absolutePath;
};

const replaceTargetText = (
  target: WorkspaceTextSearchTarget,
  compiledRequest: CompiledSearchRequest,
  request: WorkspaceTextReplaceRequest,
  maxReplacementCount: number,
): TargetReplacementResult | null => {
  if (maxReplacementCount <= 0) {
    return null;
  }

  const matches = compiledRequest.matcher !== null
    ? collectTargetTextMatches(target, compiledRequest)
    : collectTargetTagMatches(target, compiledRequest);
  if (matches.length === 0) {
    return null;
  }

  const matchesToReplace = (request.replaceAll === true
    ? matches
    : matches.filter((match) => (
      request.target !== undefined
      && isReplacementTargetMatch(target, request.target)
      && match.line === request.target.line
      && match.column === request.target.column
    )).slice(0, 1)).slice(0, maxReplacementCount);

  if (matchesToReplace.length === 0) {
    return null;
  }

  const nextContent = applyReplacementMatches(
    target.content,
    matchesToReplace,
    request.replace,
  );
  if (nextContent === target.content) {
    return null;
  }

  return {
    content: nextContent,
    replacedCount: matchesToReplace.length,
  };
};

const normalizeWorkspaceSearchPath = (
  value: string,
  caseSensitive: boolean,
): string => {
  const normalizedValue = value.replace(/\\/g, '/');
  return caseSensitive ? normalizedValue : normalizedValue.toLowerCase();
};

const matchesSearchPathFilters = (
  relativePath: string,
  absolutePath: string,
  pathFilters: readonly string[],
  caseSensitive: boolean,
): boolean => {
  if (pathFilters.length === 0) {
    return true;
  }

  const normalizedRelativePath = normalizeWorkspaceSearchPath(relativePath, caseSensitive);
  const normalizedAbsolutePath = normalizeWorkspaceSearchPath(absolutePath, caseSensitive);
  const canUseRelativePath = normalizedRelativePath.length > 0 && normalizedRelativePath !== '.';

  return pathFilters.every((pathFilter) => {
    const normalizedPathFilter = normalizeWorkspaceSearchPath(
      pathFilter.trim().replace(/^\/+|\/+$/g, ''),
      caseSensitive,
    );
    if (normalizedPathFilter.length === 0) {
      return true;
    }

    if (normalizedPathFilter.includes('/')) {
      if (canUseRelativePath) {
        return normalizedRelativePath === normalizedPathFilter
          || normalizedRelativePath.startsWith(`${normalizedPathFilter}/`);
      }

      return normalizedAbsolutePath.includes(normalizedPathFilter);
    }

    if (canUseRelativePath) {
      return normalizedRelativePath === normalizedPathFilter
        || normalizedRelativePath.startsWith(`${normalizedPathFilter}/`);
    }

    return normalizedAbsolutePath.endsWith(`/${normalizedPathFilter}`)
      || normalizedAbsolutePath.includes(`/${normalizedPathFilter}/`);
  });
};

const matchesSearchFileFilters = (
  basename: string,
  fileFilters: readonly string[],
  caseSensitive: boolean,
): boolean => {
  if (fileFilters.length === 0) {
    return true;
  }

  const normalizedBasename = normalizeWorkspaceSearchPath(basename, caseSensitive);
  return fileFilters.every((fileFilter) => {
    const normalizedFileFilter = normalizeWorkspaceSearchPath(
      fileFilter.trim().replace(/^[/\\]+|[/\\]+$/g, ''),
      caseSensitive,
    );
    if (normalizedFileFilter.length === 0) {
      return true;
    }

    return normalizedBasename.includes(normalizedFileFilter);
  });
};

const matchesSearchTagFilters = (
  tags: readonly string[] | undefined,
  tagFilters: readonly string[],
  caseSensitive: boolean,
): boolean => {
  if (tagFilters.length === 0) {
    return true;
  }

  if (!tags || tags.length === 0) {
    return false;
  }

  const normalizedTags = tags.map(tag => normalizeWorkspaceSearchPath(
    tag.trim().replace(/^#+/, ''),
    caseSensitive,
  ));
  return tagFilters.every((tagFilter) => {
    const normalizedTagFilter = normalizeWorkspaceSearchPath(
      tagFilter.trim().replace(/^#+/, ''),
      caseSensitive,
    );
    if (normalizedTagFilter.length === 0) {
      return true;
    }

    return normalizedTags.some(tag => tag.includes(normalizedTagFilter));
  });
};

const isTargetIncluded = (
  relativePath: string,
  absolutePath: string,
  basename: string,
  tags: readonly string[] | undefined,
  compiledRequest: CompiledSearchRequest,
): boolean => {
  if (isWorkspaceSearchSkippedRelativePath(relativePath)) {
    return false;
  }

  if (matchesPathPatterns(relativePath, basename, compiledRequest.excludePatterns)) {
    return false;
  }

  if (!matchesSearchPathFilters(
    relativePath,
    absolutePath,
    compiledRequest.pathFilters,
    compiledRequest.caseSensitive,
  )) {
    return false;
  }

  if (!matchesSearchFileFilters(basename, compiledRequest.fileFilters, compiledRequest.caseSensitive)) {
    return false;
  }

  if (!matchesSearchTagFilters(tags, compiledRequest.tagFilters, compiledRequest.caseSensitive)) {
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
  const filterOnlySearch = isFilterOnlySearchRequest(compiledRequest);
  const searchMatcher = compiledRequest.matcher;
  if (!filterOnlySearch && searchMatcher === null && compiledRequest.blockFilters.length === 0) {
    return;
  }

  for (const target of additionalTargets) {
    if (accumulator.limitHit) {
      return;
    }

    const normalizedRelativePath = target.relativePath.trim();
    const basename = path.basename(normalizedRelativePath || target.absolutePath);

    if (!isTargetIncluded(
      normalizedRelativePath,
      target.absolutePath,
      basename,
      target.tags,
      compiledRequest,
    )) {
      continue;
    }

    if (filterOnlySearch) {
      appendAccumulatorItem(createFilterOnlyMatch(target, compiledRequest), compiledRequest, accumulator);
      continue;
    }

    if (compiledRequest.blockFilters.length > 0) {
      searchTargetBlocks(target, compiledRequest, accumulator);
      continue;
    }

    if (searchMatcher === null) {
      continue;
    }

    searchMatcher.lastIndex = 0;
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
  if (accumulator.limitHit) {
    return;
  }

  const filterOnlySearch = isFilterOnlySearchRequest(compiledRequest);
  const searchMatcher = compiledRequest.matcher;
  if (!filterOnlySearch && searchMatcher === null && compiledRequest.blockFilters.length === 0) {
    return;
  }

  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (accumulator.limitHit) {
      return;
    }

    if (shouldSkipEntry(entry.name, entry.isDirectory())) {
      continue;
    }

    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = toWorkspaceRelativePath(workspaceDirectory, absolutePath);

    if (isWorkspaceSearchSkippedRelativePath(relativePath)) {
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

    if (!isTargetIncluded(relativePath, absolutePath, entry.name, undefined, compiledRequest)) {
      continue;
    }

    let fileCreatedAt = 0;
    let fileUpdatedAt = 0;

    try {
      const fileStats = await fs.stat(absolutePath);
      fileCreatedAt = Number.isFinite(fileStats.birthtimeMs) && fileStats.birthtimeMs > 0
        ? fileStats.birthtimeMs
        : fileStats.ctimeMs;
      fileUpdatedAt = fileStats.mtimeMs;
    } catch {
      continue;
    }

    if (filterOnlySearch) {
      appendAccumulatorItem(createFilterOnlyMatch({
        absolutePath,
        relativePath,
        content: '',
        source: 'workspace-file',
        createdAt: fileCreatedAt,
        updatedAt: fileUpdatedAt,
      }, compiledRequest), compiledRequest, accumulator);
      continue;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      const target: WorkspaceTextSearchTarget = {
        absolutePath,
        relativePath,
        content,
        source: 'workspace-file',
        createdAt: fileCreatedAt,
        updatedAt: fileUpdatedAt,
      };

      if (compiledRequest.blockFilters.length > 0) {
        searchTargetBlocks(
          target,
          compiledRequest,
          accumulator,
        );
        continue;
      }

      if (searchMatcher === null) {
        continue;
      }

      searchMatcher.lastIndex = 0;
      searchTargetText(
        target,
        compiledRequest,
        accumulator,
      );
    } catch {
      // Skip unreadable entries and non-text files.
    }
  }
};

const appendUpdatedReplacementTarget = (
  accumulator: WorkspaceTextReplaceAccumulator,
  target: WorkspaceTextSearchTarget,
  replacement: TargetReplacementResult,
): void => {
  accumulator.replacedCount += replacement.replacedCount;
  accumulator.updatedTargets.push({
    absolutePath: target.absolutePath,
    editorPath: target.editorPath?.trim() || target.absolutePath,
    relativePath: target.relativePath,
    content: replacement.content,
    replacedCount: replacement.replacedCount,
    source: target.source,
    noteId: target.noteId,
    title: target.title,
  });
};

const persistReplacedTarget = async (
  target: WorkspaceTextSearchTarget,
  replacement: TargetReplacementResult,
): Promise<void> => {
  if (target.source === 'note' && target.noteId) {
    await noteDatabase.initialize();
    const updated = await noteDatabase.updateNote(target.noteId, {
      content: replacement.content,
    });
    if (!updated) {
      throw new Error(`Failed to update note: ${target.noteId}`);
    }
    return;
  }

  await fs.writeFile(target.absolutePath, replacement.content, 'utf8');
};

const replaceAdditionalTargets = async (
  additionalTargets: readonly WorkspaceTextSearchTarget[],
  compiledRequest: CompiledSearchRequest,
  request: WorkspaceTextReplaceRequest,
  accumulator: WorkspaceTextReplaceAccumulator,
): Promise<boolean> => {
  for (const target of additionalTargets) {
    const remainingReplaceCount = request.replaceAll === true
      ? compiledRequest.maxResults - accumulator.replacedCount
      : 1;
    if (remainingReplaceCount <= 0) {
      return true;
    }

    const normalizedRelativePath = target.relativePath.trim();
    const basename = path.basename(normalizedRelativePath || target.absolutePath);

    if (!isTargetIncluded(
      normalizedRelativePath,
      target.absolutePath,
      basename,
      target.tags,
      compiledRequest,
    )) {
      continue;
    }

    const replacement = replaceTargetText(target, compiledRequest, request, remainingReplaceCount);
    if (!replacement) {
      continue;
    }

    await persistReplacedTarget(target, replacement);
    appendUpdatedReplacementTarget(accumulator, target, replacement);

    if (request.replaceAll !== true) {
      return true;
    }
  }

  return false;
};

const replaceWorkspaceDirectory = async (
  workspaceDirectory: string,
  currentDirectory: string,
  compiledRequest: CompiledSearchRequest,
  request: WorkspaceTextReplaceRequest,
  accumulator: WorkspaceTextReplaceAccumulator,
  skippedWorkspaceTargetPaths: ReadonlySet<string>,
): Promise<boolean> => {
  const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const remainingReplaceCount = request.replaceAll === true
      ? compiledRequest.maxResults - accumulator.replacedCount
      : 1;
    if (remainingReplaceCount <= 0) {
      return true;
    }

    if (shouldSkipEntry(entry.name, entry.isDirectory())) {
      continue;
    }

    const absolutePath = path.join(currentDirectory, entry.name);
    const relativePath = toWorkspaceRelativePath(workspaceDirectory, absolutePath);

    if (isWorkspaceSearchSkippedRelativePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const shouldStop = await replaceWorkspaceDirectory(
        workspaceDirectory,
        absolutePath,
        compiledRequest,
        request,
        accumulator,
        skippedWorkspaceTargetPaths,
      );
      if (shouldStop) {
        return true;
      }
      continue;
    }

    if (skippedWorkspaceTargetPaths.has(absolutePath)) {
      continue;
    }

    if (!isTargetIncluded(relativePath, absolutePath, entry.name, undefined, compiledRequest)) {
      continue;
    }

    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf8');
    } catch {
      continue;
    }

    const replacement = replaceTargetText({
      absolutePath,
      editorPath: absolutePath,
      relativePath,
      content,
      source: 'workspace-file',
    }, compiledRequest, request, remainingReplaceCount);
    if (!replacement) {
      continue;
    }

    await fs.writeFile(absolutePath, replacement.content, 'utf8');
    appendUpdatedReplacementTarget(accumulator, {
      absolutePath,
      editorPath: absolutePath,
      relativePath,
      content,
      source: 'workspace-file',
    }, replacement);

    if (request.replaceAll !== true) {
      return true;
    }
  }

  return false;
};

export const searchWorkspaceText = async (
  workspaceDirectory: string,
  request: WorkspaceTextSearchRequest,
  additionalTargets: readonly WorkspaceTextSearchTarget[] = [],
): Promise<WorkspaceTextSearchResponse> => {
  const compiledRequest = compileRequest(request);
  if (
    compiledRequest.matcher === null
    && compiledRequest.pathFilters.length === 0
    && compiledRequest.fileFilters.length === 0
    && compiledRequest.tagFilters.length === 0
    && compiledRequest.blockFilters.length === 0
  ) {
    return createEmptyWorkspaceTextSearchResponse();
  }

  const skippedWorkspaceTargetPaths = createSkippedWorkspaceTargetPaths(
    workspaceDirectory,
    additionalTargets,
  );
  const accumulator: SearchAccumulator = {
    items: [],
    pendingItems: [],
    groupCounts: new Map<string, number>(),
    batchSize: DEFAULT_WORKSPACE_SEARCH_BATCH_SIZE,
    totalCount: 0,
    limitHit: false,
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

  return createWorkspaceTextSearchResponse(accumulator);
};

export const streamWorkspaceTextSearch = async (
  workspaceDirectory: string,
  request: WorkspaceTextSearchRequest,
  additionalTargets: readonly WorkspaceTextSearchTarget[] = [],
  options?: {
    batchSize?: number;
    onItemsBatch?: (batch: WorkspaceTextSearchBatch) => void;
  },
): Promise<WorkspaceTextSearchResponse> => {
  const compiledRequest = compileRequest(request);
  if (
    compiledRequest.matcher === null
    && compiledRequest.pathFilters.length === 0
    && compiledRequest.fileFilters.length === 0
    && compiledRequest.tagFilters.length === 0
    && compiledRequest.blockFilters.length === 0
  ) {
    return createEmptyWorkspaceTextSearchResponse();
  }

  const skippedWorkspaceTargetPaths = createSkippedWorkspaceTargetPaths(
    workspaceDirectory,
    additionalTargets,
  );
  const accumulator: SearchAccumulator = {
    items: [],
    pendingItems: [],
    groupCounts: new Map<string, number>(),
    onItemsBatch: options?.onItemsBatch,
    batchSize: options?.batchSize && options.batchSize > 0
      ? options.batchSize
      : DEFAULT_WORKSPACE_SEARCH_BATCH_SIZE,
    totalCount: 0,
    limitHit: false,
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
  flushAccumulatorItems(accumulator);

  return createWorkspaceTextSearchResponse(accumulator);
};

export const replaceWorkspaceText = async (
  workspaceDirectory: string,
  request: WorkspaceTextReplaceRequest,
  additionalTargets: readonly WorkspaceTextSearchTarget[] = [],
): Promise<WorkspaceTextReplaceResponse> => {
  const compiledRequest = compileRequest(request);
  if (compiledRequest.blockFilters.length > 0) {
    throw new Error('Current search query does not support replace');
  }

  const supportsTagOnlyReplace = (
    compiledRequest.matcher === null
    && compiledRequest.tagFilters.length > 0
  );
  if (compiledRequest.matcher === null && !supportsTagOnlyReplace) {
    throw new Error('Current search query does not support replace');
  }

  if (request.replaceAll !== true && !request.target) {
    throw new Error('A target result is required for single replace');
  }

  const skippedWorkspaceTargetPaths = createSkippedWorkspaceTargetPaths(
    workspaceDirectory,
    additionalTargets,
  );
  const accumulator: WorkspaceTextReplaceAccumulator = {
    replacedCount: 0,
    updatedTargets: [],
  };

  const replacedAdditionalTarget = await replaceAdditionalTargets(
    additionalTargets,
    compiledRequest,
    request,
    accumulator,
  );
  if (!replacedAdditionalTarget || request.replaceAll === true) {
    await replaceWorkspaceDirectory(
      workspaceDirectory,
      workspaceDirectory,
      compiledRequest,
      request,
      accumulator,
      skippedWorkspaceTargetPaths,
    );
  }

  return {
    replacedCount: accumulator.replacedCount,
    fileCount: accumulator.updatedTargets.length,
    updatedTargets: accumulator.updatedTargets,
  };
};
