import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS,
  isWorkspaceSearchSkippedRelativePath,
  searchWorkspaceText,
} from './WorkspaceTextSearchService';

const workspaceDirectories: string[] = [];

const createWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'note-studio-workspace-search-'),
  );

  workspaceDirectories.push(workspaceDirectory);
  return workspaceDirectory;
};

const writeWorkspaceFile = async (
  workspaceDirectory: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const absolutePath = path.join(workspaceDirectory, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf8');
};

afterEach(async () => {
  await Promise.all(
    workspaceDirectories.splice(0).map(async (workspaceDirectory) => {
      await fs.rm(workspaceDirectory, { recursive: true, force: true });
    }),
  );
});

describe('searchWorkspaceText', () => {
  it('searches the entire workspace with line and column metadata', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/alpha.md', 'first line\nsearch target\n');
    await writeWorkspaceFile(workspaceDirectory, 'notes/beta.md', 'search target again\n');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'search target',
    });

    expect(result.limitHit).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/alpha.md',
      line: 2,
      column: 1,
      preview: 'search target',
    });
    expect(result.items[1]).toMatchObject({
      relativePath: 'notes/beta.md',
      line: 1,
      column: 1,
      preview: 'search target again',
    });
  });

  it('supports whole-word and regex search', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/query.md', 'cat scatter cat\nvalue-42\n');

    const wholeWordResult = await searchWorkspaceText(workspaceDirectory, {
      query: 'cat',
      wholeWord: true,
    });
    const regexResult = await searchWorkspaceText(workspaceDirectory, {
      query: 'value-\\d+',
      useRegex: true,
    });

    expect(wholeWordResult.items).toHaveLength(2);
    expect(wholeWordResult.items.map(item => item.column)).toEqual([1, 13]);
    expect(regexResult.items).toHaveLength(1);
    expect(regexResult.items[0]).toMatchObject({
      relativePath: 'notes/query.md',
      line: 2,
      column: 1,
    });
  });

  it('supports include and exclude patterns', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'src/keep.ts', 'needle');
    await writeWorkspaceFile(workspaceDirectory, 'src/skip.test.ts', 'needle');
    await writeWorkspaceFile(workspaceDirectory, 'docs/guide.md', 'needle');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle',
      includePattern: 'src/**/*.ts',
      excludePattern: '*.test.ts',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].relativePath).toBe('src/keep.ts');
  });

  it('marks .wstudio paths as skipped for workspace search', () => {
    expect(isWorkspaceSearchSkippedRelativePath('.wstudio/cache/index.json')).toBe(true);
    expect(isWorkspaceSearchSkippedRelativePath('notes/.wstudio/cache.md')).toBe(true);
    expect(isWorkspaceSearchSkippedRelativePath('node_modules/pkg/index.js')).toBe(true);
    expect(isWorkspaceSearchSkippedRelativePath('notes/keep.md')).toBe(false);
  });

  it('marks limitHit after reaching the configured result cap', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/limit.md',
      Array.from({ length: DEFAULT_WORKSPACE_SEARCH_MAX_RESULTS + 1 }, () => 'needle').join('\n'),
    );

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle',
      maxResults: 3,
    });

    expect(result.limitHit).toBe(true);
    expect(result.items).toHaveLength(3);
  });

  it('supports note-backed targets before filesystem targets', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/from-file.md', 'needle from file');

    const result = await searchWorkspaceText(
      workspaceDirectory,
      { query: 'needle' },
      [{
        absolutePath: 'note://1',
        relativePath: 'Inbox',
        content: 'needle from note',
        source: 'note',
        noteId: 'note-1',
        title: 'Inbox',
      }],
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      source: 'note',
      noteId: 'note-1',
      title: 'Inbox',
      relativePath: 'Inbox',
    });
  });
});
