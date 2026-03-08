/**
 * LinkIndexingService.test.ts
 * Covers main-process wikilink indexing, dangling-link repair, and legacy schema migration.
 */

// @ts-nocheck - test file depends on runtime mocks
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import * as fs from 'fs';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-note-studio')
  }
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  };
});

import { NoteDatabase } from '../services/NoteDatabase';
import { LinkIndexingService } from '../services/LinkIndexingService';

describe('LinkIndexingService', () => {
  let db: NoteDatabase;
  let service: LinkIndexingService;

  beforeEach(async () => {
    db = new NoteDatabase();
    await db.initialize();
    service = new LinkIndexingService(db);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('应根据正文重建全部出链', async () => {
    const target = await db.createNote({
      title: `Target Link ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Source Link ${Date.now()}`,
      content: `first [[${target.title}]] and second [[${target.title}]]`
    });

    const createdLinks = await service.reindexNoteLinks(source.id);
    const outlinks = await db.getOutlinks(source.id);

    expect(createdLinks).toHaveLength(2);
    expect(outlinks).toHaveLength(2);
    expect(outlinks.every(link => link.targetId === target.id)).toBe(true);

    await db.updateNote(source.id, { content: 'content without wikilink' });
    const clearedLinks = await service.reindexNoteLinks(source.id);
    const nextOutlinks = await db.getOutlinks(source.id);

    expect(clearedLinks).toHaveLength(0);
    expect(nextOutlinks).toHaveLength(0);
  });

  it('应返回其它笔记中的未链接提及', async () => {
    const target = await db.createNote({
      title: `Alpha Project ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Mention Source ${Date.now()}`,
      content: `This note mentions [${target.title}] but does not link it.`
    });

    const mentions = await service.findUnlinkedMentions(target.id);

    expect(mentions).toHaveLength(1);
    expect(mentions[0].noteId).toBe(source.id);
    expect(mentions[0].noteTitle).toBe(source.title);
    expect(mentions[0].context).toContain(target.title);
  });

  it('应按原文件行保存出链上下文', async () => {
    const target = await db.createNote({
      title: `Line Context Target ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Line Context Source ${Date.now()}`,
      content: [
        '第一行',
        `第二行前缀 [[${target.title}]] 第二行后缀`,
        '第三行'
      ].join('\n')
    });

    const createdLinks = await service.reindexNoteLinks(source.id);

    expect(createdLinks).toHaveLength(1);
    expect(createdLinks[0].context).toBe(`第二行前缀 [[${target.title}]] 第二行后缀`);
  });

  it('应按原文件行返回未链接提及上下文', async () => {
    const target = await db.createNote({
      title: `Line Mention Target ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Line Mention Source ${Date.now()}`,
      content: [
        '第一行',
        `第二行提到了 ${target.title} 并继续说明`,
        '第三行'
      ].join('\n')
    });

    const mentions = await service.findUnlinkedMentions(target.id);

    expect(mentions).toHaveLength(1);
    expect(mentions[0].noteId).toBe(source.id);
    expect(mentions[0].context).toBe(`第二行提到了 ${target.title} 并继续说明`);
  });

  it('删除笔记并清理链接后，应移除其出链并清空其它笔记中的 targetId', async () => {
    const target = await db.createNote({
      title: `Cleanup Target ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Cleanup Source ${Date.now()}`
    });
    const downstream = await db.createNote({
      title: `Cleanup Downstream ${Date.now()}`
    });

    await db.createLink({
      sourceId: source.id,
      targetId: target.id,
      targetTitle: target.title
    });
    await db.createLink({
      sourceId: target.id,
      targetId: downstream.id,
      targetTitle: downstream.title
    });

    const success = await db.deleteNoteWithLinkCleanup(target.id);
    const sourceOutlinks = await db.getOutlinks(source.id);
    const removedNote = await db.getNote(target.id);

    expect(success).toBe(true);
    expect(removedNote).toBeNull();
    expect(await db.getOutlinks(target.id)).toHaveLength(0);
    expect(sourceOutlinks).toHaveLength(1);
    expect(sourceOutlinks[0].targetId).toBeUndefined();
  });

  it('应支持路径、别名和锚点解析', async () => {
    const target = await db.createNote({
      title: `Roadmap ${Date.now()}`,
      path: 'projects/roadmap.md',
      content: '# 实施阶段\n\n任务列表 ^task-block',
      metadata: JSON.stringify({ aliases: ['项目路线图'] })
    });
    const source = await db.createNote({
      title: `Source Anchors ${Date.now()}`,
      content: '[[projects/roadmap.md]] [[项目路线图#实施阶段]] [[项目路线图#^task-block|当前任务]]'
    });

    const links = await service.reindexNoteLinks(source.id);

    expect(links).toHaveLength(3);
    expect(links.every(link => link.targetId === target.id)).toBe(true);
    expect(links[0].targetTitle).toBe('projects/roadmap.md');
    expect(links[1].targetKind).toBe('heading');
    expect(links[1].targetAnchor).toBe('实施阶段');
    expect(links[2].targetKind).toBe('block');
    expect(links[2].targetAnchor).toBe('task-block');
    expect(links[2].displayText).toBe('当前任务');
  });

  it('应支持使用去扩展名的文件名解析笔记链接', async () => {
    const target = await db.createNote({
      title: '笔记B.md',
      path: 'C:/vault/notes/笔记B.md'
    });
    const source = await db.createNote({
      title: `Source Stem ${Date.now()}`,
      content: '[[笔记B]]'
    });

    const links = await service.reindexNoteLinks(source.id);

    expect(links).toHaveLength(1);
    expect(links[0].targetId).toBe(target.id);
    expect(links[0].targetTitle).toBe('笔记B');
    expect(links[0].isResolved).toBe(true);
  });

  it('重命名后应传播更新旧标题链接，并修复可恢复的 dangling links', async () => {
    const target = await db.createNote({
      title: `Old Title ${Date.now()}`,
      metadata: JSON.stringify({ aliases: ['旧别名'] })
    });
    const source = await db.createNote({
      title: `Rename Source ${Date.now()}`,
      content: `before [[${target.title}]] after`
    });

    await service.reindexNoteLinks(source.id);
    await db.updateNote(target.id, { title: 'Renamed Target' });

    const rewrittenSources = await service.propagateNoteRename(target.id, target.title, 'Renamed Target');
    const updatedSource = await db.getNote(source.id);

    expect(rewrittenSources).toBe(1);
    expect(updatedSource?.content).toContain('[[Renamed Target]]');

    await db.createLink({
      sourceId: source.id,
      targetTitle: '旧别名',
      context: 'dangling alias',
      isResolved: false
    });

    const repaired = await service.repairDanglingLinksForNote(target.id);
    const outlinks = await db.getOutlinks(source.id);
    const recoveredAliasLink = outlinks.find(link => link.targetTitle === '旧别名');

    expect(repaired).toBeGreaterThanOrEqual(1);
    expect(recoveredAliasLink?.targetId).toBe(target.id);
    expect(recoveredAliasLink?.isResolved).toBe(true);
  });

  it('应将未链接提及直接转换成双向链接', async () => {
    const target = await db.createNote({
      title: `Mention Target ${Date.now()}`
    });
    const source = await db.createNote({
      title: `Mention Convert ${Date.now()}`,
      content: `This note mentions [${target.title}] in plain text.`
    });

    const mentions = await service.findUnlinkedMentions(target.id);
    const rawMentionText = source.content.slice(mentions[0].position.start, mentions[0].position.end);
    const converted = await service.convertUnlinkedMention(
      source.id,
      target.id,
      mentions[0].position,
      mentions[0].matchedText
    );
    const updatedSource = await db.getNote(source.id);
    const outlinks = await db.getOutlinks(source.id);
    const backlinks = await db.getBacklinks(target.id);

    expect(rawMentionText).toBe(`[${target.title}]`);
    expect(converted).toBe(true);
    expect(updatedSource?.content).toContain(`[[${target.title}]]`);
    expect(outlinks).toHaveLength(1);
    expect(outlinks[0].targetTitle).toBe(target.title);
    expect(outlinks[0].targetId).toBe(target.id);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].sourceId).toBe(source.id);
  });

  it('应在旧 links 表缺少 target_kind 列时完成迁移', async () => {
    const legacyDbPath = '/tmp/test-note-studio/note-system.db';
    const SQL = await initSqlJs({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`)
    });
    const legacySqlDb = new SQL.Database();

    legacySqlDb.exec(`
      CREATE TABLE links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT,
        target_title TEXT NOT NULL,
        context TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    const legacyDbData = legacySqlDb.export();
    legacySqlDb.close();

    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => String(filePath) === legacyDbPath);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike) => {
      if (String(filePath) === legacyDbPath) {
        return legacyDbData;
      }

      throw new Error(`Unexpected readFileSync: ${String(filePath)}`);
    });

    const migratedDb = new NoteDatabase();
    await expect(migratedDb.initialize()).resolves.toBeUndefined();

    const columns = await migratedDb.db.query<{ name: string }>('PRAGMA table_info(links)');
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'display_text',
      'target_kind',
      'target_anchor',
      'source_start',
      'source_end',
      'is_resolved'
    ]));
  });
});
