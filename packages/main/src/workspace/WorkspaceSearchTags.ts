/**
 * Collects workspace search tags from persisted note tags and inline hashtags.
 */

import { extractUniqueTags, isValidTagName, parseTagsFromContent } from '@note-studio/note-system';

export interface WorkspaceSearchTagSource {
  readonly content: string;
  readonly persistedTags?: readonly string[];
}

export interface WorkspaceSearchTagMatch {
  readonly index: number;
  readonly matchedText: string;
}

const normalizeWorkspaceSearchTag = (tagName: string): string => (
  tagName.trim().replace(/^#+/u, '')
);

const compareWorkspaceSearchTags = (leftTag: string, rightTag: string): number => (
  leftTag.localeCompare(rightTag, 'zh-Hans-CN')
);

export const mergeWorkspaceSearchTags = (
  content: string,
  persistedTags: readonly string[] = [],
): string[] => {
  const mergedTags = new Set<string>();

  for (const persistedTag of persistedTags) {
    const normalizedTag = normalizeWorkspaceSearchTag(persistedTag);
    if (normalizedTag.length > 0 && isValidTagName(normalizedTag)) {
      mergedTags.add(normalizedTag);
    }
  }

  for (const inlineTag of extractUniqueTags(content)) {
    const normalizedTag = normalizeWorkspaceSearchTag(inlineTag);
    if (normalizedTag.length > 0 && isValidTagName(normalizedTag)) {
      mergedTags.add(normalizedTag);
    }
  }

  return [...mergedTags].sort(compareWorkspaceSearchTags);
};

export const collectWorkspaceSearchTags = (
  tagSources: readonly WorkspaceSearchTagSource[],
): string[] => {
  const mergedTags = new Set<string>();

  for (const tagSource of tagSources) {
    for (const tagName of mergeWorkspaceSearchTags(
      tagSource.content,
      tagSource.persistedTags ?? [],
    )) {
      mergedTags.add(tagName);
    }
  }

  return [...mergedTags].sort(compareWorkspaceSearchTags);
};

export const findWorkspaceSearchTagMatch = (
  content: string,
  tagFilters: readonly string[],
  caseSensitive: boolean,
): WorkspaceSearchTagMatch | null => {
  if (content.trim().length === 0 || tagFilters.length === 0) {
    return null;
  }

  const normalizedTagFilters = tagFilters
    .map(tagFilter => normalizeWorkspaceSearchTag(tagFilter))
    .filter(tagFilter => tagFilter.length > 0)
    .map(tagFilter => (caseSensitive ? tagFilter : tagFilter.toLowerCase()));

  if (normalizedTagFilters.length === 0) {
    return null;
  }

  for (const parsedTag of parseTagsFromContent(content)) {
    const normalizedTagName = caseSensitive
      ? parsedTag.fullName
      : parsedTag.fullName.toLowerCase();
    const hasMatchedFilter = normalizedTagFilters.some(tagFilter => (
      normalizedTagName.includes(tagFilter)
    ));
    if (!hasMatchedFilter) {
      continue;
    }

    return {
      index: parsedTag.position.start,
      matchedText: content.slice(parsedTag.position.start, parsedTag.position.end),
    };
  }

  return null;
};

export const findAllWorkspaceSearchTagMatches = (
  content: string,
  tagFilters: readonly string[],
  caseSensitive: boolean,
): WorkspaceSearchTagMatch[] => {
  if (content.trim().length === 0 || tagFilters.length === 0) {
    return [];
  }

  const normalizedTagFilters = tagFilters
    .map(tagFilter => normalizeWorkspaceSearchTag(tagFilter))
    .filter(tagFilter => tagFilter.length > 0)
    .map(tagFilter => (caseSensitive ? tagFilter : tagFilter.toLowerCase()));

  if (normalizedTagFilters.length === 0) {
    return [];
  }

  const matches: WorkspaceSearchTagMatch[] = [];

  for (const parsedTag of parseTagsFromContent(content)) {
    const normalizedTagName = caseSensitive
      ? parsedTag.fullName
      : parsedTag.fullName.toLowerCase();
    const hasMatchedFilter = normalizedTagFilters.some(tagFilter => (
      normalizedTagName.includes(tagFilter)
    ));
    if (!hasMatchedFilter) {
      continue;
    }

    matches.push({
      index: parsedTag.position.start,
      matchedText: content.slice(parsedTag.position.start, parsedTag.position.end),
    });
  }

  return matches;
};
