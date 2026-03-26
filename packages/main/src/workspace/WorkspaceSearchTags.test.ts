/**
 * Verifies workspace search tag collection from note content and persisted tags.
 */

import { describe, expect, it } from 'vitest';
import {
  collectWorkspaceSearchTags,
  mergeWorkspaceSearchTags,
} from './WorkspaceSearchTags';

describe('mergeWorkspaceSearchTags', () => {
  it('merges persisted tags with inline hashtags from note content', () => {
    const tags = mergeWorkspaceSearchTags(
      'intro #alpha and #project/docs',
      ['beta', '#alpha'],
    );

    expect(tags).toEqual([
      'alpha',
      'beta',
      'project',
      'project/docs',
    ]);
  });

  it('filters out tags whose first character is a special symbol', () => {
    const tags = mergeWorkspaceSearchTags(
      'ignore #`snippet #_private #-dash and keep #alpha',
      ['#`broken', '#_hidden', '#-flag', '#beta'],
    );

    expect(tags).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('filters out punctuation-only and whitespace-start tag candidates', () => {
    const tags = mergeWorkspaceSearchTags(
      'ignore #， #。 #@ #... #  and keep #abc123',
      ['#，', '#。', '#@', '#...', '# ', '#标签2'],
    );

    expect(tags).toEqual([
      '标签2',
      'abc123',
    ]);
  });
});

describe('collectWorkspaceSearchTags', () => {
  it('deduplicates and sorts tags across notes', () => {
    const tags = collectWorkspaceSearchTags([
      {
        content: 'note one #beta #alpha',
        persistedTags: ['gamma'],
      },
      {
        content: 'note two #alpha #project/plan',
        persistedTags: ['#beta'],
      },
    ]);

    expect(tags).toEqual([
      'alpha',
      'beta',
      'gamma',
      'project',
      'project/plan',
    ]);
  });

  it('keeps Chinese punctuation inside a tag until whitespace', () => {
    const tags = collectWorkspaceSearchTags([
      {
        content: '#边城匠人故事，发布时间：2025年11月02日 07:23',
      },
    ]);

    expect(tags).toEqual(['边城匠人故事，发布时间：2025年11月02日']);
  });
});
