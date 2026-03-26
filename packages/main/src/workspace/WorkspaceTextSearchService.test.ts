import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isWorkspaceSearchSkippedRelativePath,
  listWorkspaceSearchRootDirectories,
  replaceWorkspaceText,
  searchWorkspaceText,
  streamWorkspaceTextSearch,
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

const readWorkspaceFile = async (
  workspaceDirectory: string,
  relativePath: string,
): Promise<string> => fs.readFile(path.join(workspaceDirectory, relativePath), 'utf8');

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
    expect(result.totalCount).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/alpha.md',
      line: 2,
      column: 1,
      preview: 'search target',
    });
    expect(result.items[0]?.createdAt).toBeGreaterThan(0);
    expect(result.items[0]?.updatedAt).toBeGreaterThan(0);
    expect(result.items[1]).toMatchObject({
      relativePath: 'notes/beta.md',
      line: 1,
      column: 1,
      preview: 'search target again',
    });
  });

  it('preserves note target timestamps in search results', async () => {
    const workspaceDirectory = await createWorkspace();

    const result = await searchWorkspaceText(
      workspaceDirectory,
      { query: 'search target' },
      [{
        absolutePath: 'note://alpha',
        relativePath: 'notes/alpha.md',
        content: 'search target',
        source: 'note',
        noteId: 'note-alpha',
        title: 'alpha',
        createdAt: 100,
        updatedAt: 200,
      }],
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      noteId: 'note-alpha',
      createdAt: 100,
      updatedAt: 200,
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

    expect(wholeWordResult.totalCount).toBe(1);
    expect(wholeWordResult.items).toHaveLength(1);
    expect(wholeWordResult.items.map(item => item.column)).toEqual([1]);
    expect(regexResult.items).toHaveLength(1);
    expect(regexResult.items[0]).toMatchObject({
      relativePath: 'notes/query.md',
      line: 2,
      column: 1,
    });
  });

  it('defaults to case-insensitive search', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/case.md', 'A\na\nAlpha\n');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'a',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.items.map(item => item.preview)).toEqual([
      'A',
      'a',
      'Alpha',
    ]);
  });

  it('returns one result per matching line for dense queries', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/dense.md', 'aaa\nbbb a a\n');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'a',
      maxResults: 10,
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(2);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        relativePath: 'notes/dense.md',
        line: 1,
        column: 1,
        preview: 'aaa',
      }),
      expect.objectContaining({
        relativePath: 'notes/dense.md',
        line: 2,
        column: 5,
        preview: 'bbb a a',
      }),
    ]);
  });

  it('supports include and exclude patterns', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'src/keep.md', 'needle');
    await writeWorkspaceFile(workspaceDirectory, 'src/skip.test.md', 'needle');
    await writeWorkspaceFile(workspaceDirectory, 'docs/guide.md', 'needle');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle',
      includePattern: 'src/**/*.md',
      excludePattern: '*.test.md',
    });

    expect(result.items).toHaveLength(1);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items[0].relativePath).toBe('src/keep.md');
  });

  it('supports path filters embedded in the search query', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/alpha.md', 'needle in notes');
    await writeWorkspaceFile(workspaceDirectory, 'docs/alpha.md', 'needle in docs');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle path\uff1anotes',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/alpha.md',
      preview: 'needle in notes',
    });
  });

  it('supports quoted path filters with spaces', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'My Folder/alpha.md', 'needle in folder');
    await writeWorkspaceFile(workspaceDirectory, 'Other/alpha.md', 'needle elsewhere');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle path\uff1a"My Folder"',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.relativePath).toBe('My Folder/alpha.md');
  });

  it('supports file filters embedded in the search query', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/alpha.md', 'needle in alpha');
    await writeWorkspaceFile(workspaceDirectory, 'notes/beta.md', 'needle in beta');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle file\uFF1Aalpha',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/alpha.md',
      preview: 'needle in alpha',
    });
  });

  it('supports tag filters embedded in the search query for note-backed targets', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/plain.md', 'needle in plain file');

    const result = await searchWorkspaceText(
      workspaceDirectory,
      {
        query: 'needle tag\uFF1Aalpha',
      },
      [
        {
          absolutePath: 'note://tagged',
          relativePath: 'Tagged note',
          content: 'needle in tagged note',
          source: 'note',
          noteId: 'note-tagged',
          title: 'Tagged note',
          tags: ['alpha', 'beta'],
        },
        {
          absolutePath: 'note://other',
          relativePath: 'Other note',
          content: 'needle in other note',
          source: 'note',
          noteId: 'note-other',
          title: 'Other note',
          tags: ['beta'],
        },
      ],
    );

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'Tagged note',
      preview: 'needle in tagged note',
      noteId: 'note-tagged',
    });
  });

  it('returns files under the selected path filter without requiring text content', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'A/b/xxx.md', 'first');
    await writeWorkspaceFile(workspaceDirectory, 'A/x1.md', 'second');
    await writeWorkspaceFile(workspaceDirectory, 'A/A1/A2/c.md', 'third');
    await writeWorkspaceFile(workspaceDirectory, 'B/skip.md', 'fourth');
    await writeWorkspaceFile(workspaceDirectory, 'B/A/inner.md', 'fifth');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'path\uff1a A',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(3);
    expect(result.totalFiles).toBe(3);
    expect([...result.items.map(item => item.relativePath)].sort()).toEqual([
      'A/A1/A2/c.md',
      'A/b/xxx.md',
      'A/x1.md',
    ]);
    expect([...result.items.map(item => item.preview)].sort()).toEqual([
      'A/A1/A2/c.md',
      'A/b/xxx.md',
      'A/x1.md',
    ]);
  });

  it('returns files whose filenames match the selected filter without requiring text content', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'A/match-me.md', 'first');
    await writeWorkspaceFile(workspaceDirectory, 'A/skip.md', 'second');
    await writeWorkspaceFile(workspaceDirectory, 'B/match-me.txt', 'third');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'file\uFF1Amatch-me',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect([...result.items.map(item => item.relativePath)].sort()).toEqual([
      'A/match-me.md',
      'B/match-me.txt',
    ]);
    expect([...result.items.map(item => item.preview)].sort()).toEqual([
      'A/match-me.md',
      'B/match-me.txt',
    ]);
  });

  it('returns tagged notes without requiring text content', async () => {
    const workspaceDirectory = await createWorkspace();

    const result = await searchWorkspaceText(
      workspaceDirectory,
      {
        query: 'tag\uFF1Aproject',
      },
      [
        {
          absolutePath: 'note://project-plan',
          relativePath: '椤圭洰璁″垝',
          content: 'intro\n#project plan\ncontent',
          source: 'note',
          noteId: 'note-project',
          title: '椤圭洰璁″垝',
          tags: ['project', 'planning'],
        },
        {
          absolutePath: 'note://reading',
          relativePath: '璇讳功璁板綍',
          content: 'content',
          source: 'note',
          noteId: 'note-reading',
          title: '璇讳功璁板綍',
          tags: ['reading'],
        },
      ],
    );

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        relativePath: '椤圭洰璁″垝',
        preview: '椤圭洰璁″垝',
        line: 2,
        column: 1,
        matchedText: '#project',
        noteId: 'note-project',
      }),
    ]);
  });

  it('skips programming language files during workspace search', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/keep.md', 'needle in markdown');
    await writeWorkspaceFile(workspaceDirectory, 'notes/script.js', 'needle in javascript');
    await writeWorkspaceFile(workspaceDirectory, 'notes/task.py', 'needle in python');

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle',
      maxResults: 10,
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.relativePath).toBe('notes/keep.md');
  });

  it('skips note-backed targets that point to programming language files', async () => {
    const workspaceDirectory = await createWorkspace();

    const result = await searchWorkspaceText(
      workspaceDirectory,
      {
        query: 'needle',
        maxResults: 10,
      },
      [
        {
          absolutePath: path.join(workspaceDirectory, 'notes/doc.md'),
          relativePath: 'notes/doc.md',
          content: 'needle in markdown note',
          source: 'note',
          noteId: 'note-doc',
          title: 'Doc',
        },
        {
          absolutePath: path.join(workspaceDirectory, 'notes/script.js'),
          relativePath: 'notes/script.js',
          content: 'needle in javascript note',
          source: 'note',
          noteId: 'note-js',
          title: 'Script',
        },
      ],
    );

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/doc.md',
      noteId: 'note-doc',
    });
  });

  it('stops counting after reaching the configured result cap', async () => {
    const workspaceDirectory = await createWorkspace();
    const totalMatchCount = 5;
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/limit.md',
      Array.from({ length: totalMatchCount }, () => 'needle').join('\n'),
    );

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle',
      maxResults: 3,
    });

    expect(result.limitHit).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.totalCount).toBe(3);
    expect(result.totalFiles).toBe(1);
    expect(result.groupCounts).toEqual([{
      groupKey: `file:${path.join(workspaceDirectory, 'notes/limit.md')}`,
      totalMatches: 3,
    }]);
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
    expect(result.totalCount).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect(result.items[0]).toMatchObject({
      source: 'note',
      noteId: 'note-1',
      title: 'Inbox',
      relativePath: 'Inbox',
    });
  });

  it('skips duplicate workspace files when the same path is already provided as a note target', async () => {
    const workspaceDirectory = await createWorkspace();
    const absolutePath = path.join(workspaceDirectory, 'notes/shared.md');
    await writeWorkspaceFile(workspaceDirectory, 'notes/shared.md', 'needle from shared note');

    const result = await searchWorkspaceText(
      workspaceDirectory,
      { query: 'needle' },
      [{
        absolutePath,
        relativePath: 'notes/shared.md',
        content: 'needle from shared note',
        source: 'note',
        noteId: 'note-shared',
        title: 'Shared',
      }],
    );

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.groupCounts).toEqual([{
      groupKey: 'note:note-shared',
      totalMatches: 1,
    }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: 'note',
      noteId: 'note-shared',
      absolutePath,
      relativePath: 'notes/shared.md',
    });
  });

  it('streams result batches before returning final totals', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/stream.md',
      'needle one\nneedle two\nneedle three\nneedle four\n',
    );
    const streamedBatches: Array<{
      totalCount: number;
      totalFiles: number;
      items: string[];
    }> = [];

    const result = await streamWorkspaceTextSearch(
      workspaceDirectory,
      {
        query: 'needle',
        maxResults: 4,
      },
      [],
      {
        batchSize: 2,
        onItemsBatch: (batch) => {
          streamedBatches.push({
            totalCount: batch.totalCount,
            totalFiles: batch.totalFiles,
            items: batch.items.map(item => item.preview),
          });
        },
      },
    );

    expect(streamedBatches).toEqual([
      {
        totalCount: 2,
        totalFiles: 1,
        items: ['needle one', 'needle two'],
      },
      {
        totalCount: 4,
        totalFiles: 1,
        items: ['needle three', 'needle four'],
      },
    ]);
    expect(result.totalCount).toBe(4);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(4);
  });

  it('replaces only the selected search result for single replace', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/replace.md', 'needle one\nneedle two\n');

    const result = await replaceWorkspaceText(workspaceDirectory, {
      query: 'needle',
      replace: 'found',
      target: {
        absolutePath: path.join(workspaceDirectory, 'notes/replace.md'),
        line: 2,
        column: 1,
        source: 'workspace-file',
      },
    });

    expect(result.replacedCount).toBe(1);
    expect(result.fileCount).toBe(1);
    expect(result.updatedTargets).toEqual([
      expect.objectContaining({
        absolutePath: path.join(workspaceDirectory, 'notes/replace.md'),
        editorPath: path.join(workspaceDirectory, 'notes/replace.md'),
        relativePath: 'notes/replace.md',
        replacedCount: 1,
      }),
    ]);
    await expect(readWorkspaceFile(workspaceDirectory, 'notes/replace.md')).resolves.toBe(
      'needle one\nfound two\n',
    );
  });

  it('replaces all matches across workspace files', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/file.md', 'needle in file\n');
    await writeWorkspaceFile(workspaceDirectory, 'docs/other.md', 'needle in other\nneedle again');

    const result = await replaceWorkspaceText(workspaceDirectory, {
      query: 'needle',
      replace: 'found',
      replaceAll: true,
    });

    expect(result.replacedCount).toBe(3);
    expect(result.fileCount).toBe(2);
    expect(result.updatedTargets).toHaveLength(2);
    expect(result.updatedTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        absolutePath: path.join(workspaceDirectory, 'notes/file.md'),
        editorPath: path.join(workspaceDirectory, 'notes/file.md'),
        relativePath: 'notes/file.md',
        replacedCount: 1,
        content: 'found in file\n',
      }),
      expect.objectContaining({
        absolutePath: path.join(workspaceDirectory, 'docs/other.md'),
        editorPath: path.join(workspaceDirectory, 'docs/other.md'),
        relativePath: 'docs/other.md',
        replacedCount: 2,
        content: 'found in other\nfound again',
      }),
    ]));
    await expect(readWorkspaceFile(workspaceDirectory, 'notes/file.md')).resolves.toBe('found in file\n');
    await expect(readWorkspaceFile(workspaceDirectory, 'docs/other.md')).resolves.toBe(
      'found in other\nfound again',
    );
  });

  it('limits replace all to the current search maxResults cap', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/capped.md', 'needle one\nneedle two\nneedle three\n');

    const result = await replaceWorkspaceText(workspaceDirectory, {
      query: 'needle',
      replace: 'found',
      replaceAll: true,
      maxResults: 2,
    });

    expect(result.replacedCount).toBe(2);
    expect(result.fileCount).toBe(1);
    expect(result.updatedTargets).toHaveLength(1);
    expect(result.updatedTargets[0]).toEqual(expect.objectContaining({
      absolutePath: path.join(workspaceDirectory, 'notes/capped.md'),
      replacedCount: 2,
      content: 'found one\nfound two\nneedle three\n',
    }));
    await expect(readWorkspaceFile(workspaceDirectory, 'notes/capped.md')).resolves.toBe(
      'found one\nfound two\nneedle three\n',
    );
  });

  it('replaces matched tags for tag-only searches', async () => {
    const workspaceDirectory = await createWorkspace();
    const tagsContent = '#foo first\n#foo second\n#bar keep\n';
    await writeWorkspaceFile(workspaceDirectory, 'notes/tags.md', tagsContent);

    const result = await replaceWorkspaceText(workspaceDirectory, {
      query: 'tag\uFF1Afoo',
      replace: '#baz',
      replaceAll: true,
    }, [{
      absolutePath: path.join(workspaceDirectory, 'notes/tags.md'),
      editorPath: path.join(workspaceDirectory, 'notes/tags.md'),
      relativePath: 'notes/tags.md',
      content: tagsContent,
      source: 'workspace-file',
      tags: ['foo', 'bar'],
    }]);

    expect(result.replacedCount).toBe(2);
    expect(result.fileCount).toBe(1);
    expect(result.updatedTargets).toHaveLength(1);
    expect(result.updatedTargets[0]).toEqual(expect.objectContaining({
      absolutePath: path.join(workspaceDirectory, 'notes/tags.md'),
      relativePath: 'notes/tags.md',
      replacedCount: 2,
      content: '#baz first\n#baz second\n#bar keep\n',
    }));
    await expect(readWorkspaceFile(workspaceDirectory, 'notes/tags.md')).resolves.toBe(
      '#baz first\n#baz second\n#bar keep\n',
    );
  });

  it('supports regex replacement groups', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'notes/regex.md', 'value-42\nvalue-108\n');

    const result = await replaceWorkspaceText(workspaceDirectory, {
      query: 'value-(\\d+)',
      replace: 'item:$1',
      useRegex: true,
      replaceAll: true,
    });

    expect(result.replacedCount).toBe(2);
    await expect(readWorkspaceFile(workspaceDirectory, 'notes/regex.md')).resolves.toBe(
      'item:42\nitem:108\n',
    );
  });

  it('lists available workspace root directories for path suggestions', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(workspaceDirectory, 'A/one.md', 'alpha');
    await writeWorkspaceFile(workspaceDirectory, 'B/two.md', 'beta');
    await writeWorkspaceFile(workspaceDirectory, '.wstudio/cache.md', 'skip');

    const result = await listWorkspaceSearchRootDirectories(workspaceDirectory);

    expect(result).toEqual(['A', 'B']);
  });
});

