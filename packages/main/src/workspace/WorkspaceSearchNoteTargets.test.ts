/**
 * Verifies note filtering and priority rules for workspace tag search targets.
 */

import { describe, expect, it } from 'vitest';
import {
  compareWorkspaceSearchNotes,
  matchesWorkspaceSearchNoteScope,
  shouldIncludeWorkspaceSearchNote,
} from './WorkspaceSearchNoteTargets';

describe('shouldIncludeWorkspaceSearchNote', () => {
  it('filters out programming language files and keeps markdown or text notes', () => {
    expect(shouldIncludeWorkspaceSearchNote({ path: 'notes/doc.md' })).toBe(true);
    expect(shouldIncludeWorkspaceSearchNote({ path: 'notes/readme.txt' })).toBe(true);
    expect(shouldIncludeWorkspaceSearchNote({ path: 'notes/script.js' })).toBe(false);
    expect(shouldIncludeWorkspaceSearchNote({ path: 'notes/task.py' })).toBe(false);
  });
});

describe('compareWorkspaceSearchNotes', () => {
  it('prioritizes markdown and text notes ahead of other file types', () => {
    const notes = [
      { path: 'notes/data.json', title: 'data' },
      { path: 'notes/readme.txt', title: 'readme' },
      { path: 'notes/doc.md', title: 'doc' },
    ];

    const sortedNotes = [...notes].sort(compareWorkspaceSearchNotes);

    expect(sortedNotes.map(note => note.path)).toEqual([
      'notes/doc.md',
      'notes/readme.txt',
      'notes/data.json',
    ]);
  });
});

describe('matchesWorkspaceSearchNoteScope', () => {
  it('applies include and exclude patterns to note tag scope', () => {
    expect(matchesWorkspaceSearchNoteScope('docs/guide.md', {
      includePattern: 'docs/**/*.md',
    })).toBe(true);
    expect(matchesWorkspaceSearchNoteScope('notes/guide.md', {
      includePattern: 'docs/**/*.md',
    })).toBe(false);
    expect(matchesWorkspaceSearchNoteScope('docs/guide.test.md', {
      includePattern: 'docs/**/*.md',
      excludePattern: '*.test.md',
    })).toBe(false);
  });
});
