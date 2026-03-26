import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchWorkspaceText } from './WorkspaceTextSearchService';

const workspaceDirectories: string[] = [];

const createWorkspace = async (): Promise<string> => {
  const workspaceDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'note-studio-workspace-search-block-'),
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

describe('workspace block search', () => {
  it('matches block keyword markers using [!block:keyword] syntax', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/blocks.md',
      '[!block:\u4F60\u597D]123456AAAAAA123213213\n\u6211\u662F\u65B0\u7684\u4E00\u884C\u5185\u5BB9\u3002\n[!block:\u4E16\u754C]another block line\n',
    );

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'block\uFF1A\u4F60\u597D',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/blocks.md',
      preview: '[!block:\u4F60\u597D]123456AAAAAA123213213',
      line: 1,
      column: 9,
      matchedText: '\u4F60\u597D',
    });
  });

  it('restricts text search to blocks whose keyword marker matches the block filter', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/block-scope.md',
      '[!block:\u4F60\u597D]needle in block\nneedle outside block scope\n[!block:\u4E16\u754C]needle in other block\n',
    );

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'needle block\uFF1A\u4F60\u597D',
    });

    expect(result.limitHit).toBe(false);
    expect(result.totalCount).toBe(1);
    expect(result.totalFiles).toBe(1);
    expect(result.items).toEqual([
      expect.objectContaining({
        relativePath: 'notes/block-scope.md',
        preview: '[!block:\u4F60\u597D]needle in block',
        line: 1,
        column: 12,
        matchedText: 'needle',
      }),
    ]);
  });

  it('accepts the historical [!blocck:keyword] spelling as an alias', async () => {
    const workspaceDirectory = await createWorkspace();
    await writeWorkspaceFile(
      workspaceDirectory,
      'notes/block-alias.md',
      '[!blocck:\u4F60\u597D]alias block line\n',
    );

    const result = await searchWorkspaceText(workspaceDirectory, {
      query: 'block\uFF1A\u4F60\u597D',
    });

    expect(result.totalCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      relativePath: 'notes/block-alias.md',
      preview: '[!blocck:\u4F60\u597D]alias block line',
      matchedText: '\u4F60\u597D',
    });
  });
});
