/**
 * Verifies workspace block keyword collection and block marker matching.
 */

import { describe, expect, it } from 'vitest';
import {
  collectWorkspaceSearchBlockCandidates,
  collectWorkspaceSearchBlockKeywords,
  findWorkspaceSearchBlockLineMatches,
} from './WorkspaceSearchBlocks';

describe('collectWorkspaceSearchBlockCandidates', () => {
  it('keeps the first block content preview for each keyword', () => {
    const candidates = collectWorkspaceSearchBlockCandidates([
      {
        content: '[!block:beta] first block content\n[!block:alpha] alpha block content\n',
      },
      {
        content: '[!blocck:beta] second block content\n',
      },
    ]);

    expect(candidates).toEqual([
      {
        keyword: 'alpha',
        preview: 'alpha block content',
      },
      {
        keyword: 'beta',
        preview: 'first block content',
      },
    ]);
  });
});

describe('collectWorkspaceSearchBlockKeywords', () => {
  it('deduplicates and sorts block keywords from block markers', () => {
    const keywords = collectWorkspaceSearchBlockKeywords([
      {
        content: '[!block:beta] content\n[!block:alpha] content\n',
      },
      {
        content: '[!blocck:beta] alias content\n[!block:gamma] content\n',
      },
    ]);

    expect(keywords).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });
});

describe('findWorkspaceSearchBlockLineMatches', () => {
  it('matches block markers by keyword and keeps the real line position', () => {
    const matches = findWorkspaceSearchBlockLineMatches(
      '[!block:alpha] first line\nnormal line\n[!blocck:beta] second line\n',
      ['bet'],
      false,
    );

    expect(matches).toEqual([
      {
        line: 3,
        column: 10,
        keyword: 'beta',
        preview: '[!blocck:beta] second line',
      },
    ]);
  });
});
