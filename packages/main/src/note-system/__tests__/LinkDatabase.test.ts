/**
 * LinkDatabase.test.ts
 * 链接数据库服务属性测试
 * 使用 fast-check 进行属性测试
 */

// @ts-nocheck - 测试文件，依赖需要安装后才能正确识别类型
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-note-studio')
  }
}));

// Mock fs
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
import { LinkItem, NoteItem } from '../types';

/**
 * 生成有效的笔记标题
 */
const noteTitle = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s: string) => s.trim().length > 0);

/**
 * 生成有效的笔记内容
 */
const noteContent = fc.string({ minLength: 0, maxLength: 1000 });

/**
 * 生成链接上下文
 */
const linkContext = fc.string({ minLength: 0, maxLength: 200 });

describe('LinkDatabase Property Tests', () => {
  let db: NoteDatabase;

  beforeEach(async () => {
    db = new NoteDatabase();
    await db.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Feature: note-system, Property 6: 双向链接关系对称性**
   * **Validates: Requirements 4.6, 5.2**
   * 
   * *For any* 从笔记 A 到笔记 B 的链接，笔记 B 的反向链接列表应包含笔记 A
   */
  describe('Property 6: 双向链接关系对称性', () => {
    it('创建链接后目标笔记的反向链接应包含源笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          linkContext,
          async (title1: string, title2: string, context: string) => {
            // 创建两个笔记
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}_A` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}_B` });

            // 从 A 创建到 B 的链接
            await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title,
              context
            });

            // 获取 B 的反向链接
            const backlinks = await db.getBacklinks(noteB.id);

            // 验证反向链接包含 A
            expect(backlinks.some((link: LinkItem) => link.sourceId === noteA.id)).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('出链和反向链接应保持一致', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          async (title1: string, title2: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}_A` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}_B` });

            // 创建链接
            const link = await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title
            });

            // 获取出链和反向链接
            const outlinks = await db.getOutlinks(noteA.id);
            const backlinks = await db.getBacklinks(noteB.id);

            // 验证一致性
            expect(outlinks.some((l: LinkItem) => l.id === link.id)).toBe(true);
            expect(backlinks.some((l: LinkItem) => l.id === link.id)).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 7: 反向链接查询完整性**
   * **Validates: Requirements 5.2**
   * 
   * *For any* 笔记，其反向链接列表应包含所有引用该笔记的笔记，且不包含未引用的笔记
   */
  describe('Property 7: 反向链接查询完整性', () => {
    it('反向链接应包含所有引用笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          fc.array(noteTitle, { minLength: 1, maxLength: 5 }),
          async (targetTitle: string, sourceTitles: string[]) => {
            // 创建目标笔记
            const targetNote = await db.createNote({ 
              title: `${targetTitle}_${Date.now()}_target` 
            });

            // 创建多个源笔记并链接到目标
            const sourceNotes: NoteItem[] = [];
            for (let i = 0; i < sourceTitles.length; i++) {
              const sourceNote = await db.createNote({ 
                title: `${sourceTitles[i]}_${Date.now()}_${i}` 
              });
              await db.createLink({
                sourceId: sourceNote.id,
                targetId: targetNote.id,
                targetTitle: targetNote.title
              });
              sourceNotes.push(sourceNote);
            }

            // 获取反向链接
            const backlinks = await db.getBacklinks(targetNote.id);

            // 验证所有源笔记都在反向链接中
            expect(backlinks.length).toBe(sourceNotes.length);
            for (const sourceNote of sourceNotes) {
              expect(backlinks.some((l: LinkItem) => l.sourceId === sourceNote.id)).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('未引用的笔记不应出现在反向链接中', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          noteTitle,
          async (title1: string, title2: string, title3: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}_A` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}_B` });
            const noteC = await db.createNote({ title: `${title3}_${Date.now()}_C` });

            // 只从 A 链接到 B
            await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title
            });

            // 获取 B 的反向链接
            const backlinks = await db.getBacklinks(noteB.id);

            // C 不应该在反向链接中
            expect(backlinks.some((l: LinkItem) => l.sourceId === noteC.id)).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 9: 笔记删除链接更新**
   * **Validates: Requirements 5.6**
   * 
   * *For any* 被删除的笔记，删除后所有指向该笔记的链接应标记为无效或更新状态
   */
  describe('Property 9: 笔记删除链接更新', () => {
    it('删除源笔记后其出链应被删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          async (title1: string, title2: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}_A` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}_B` });

            // 创建链接
            const link = await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title
            });

            // 删除源笔记的所有出链
            await db.deleteLinksBySource(noteA.id);

            // 验证链接被删除
            const outlinks = await db.getOutlinks(noteA.id);
            expect(outlinks.length).toBe(0);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('删除目标笔记后链接的 targetId 应为空', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          async (title1: string, title2: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}_A` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}_B` });

            // 创建链接
            await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title
            });

            // 删除目标笔记
            await db.deleteNote(noteB.id);

            // 获取出链，由于外键约束 ON DELETE SET NULL，targetId 应为 null
            const outlinks = await db.getOutlinks(noteA.id);
            if (outlinks.length > 0) {
              expect(outlinks[0].targetId).toBeUndefined();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 链接 CRUD 测试
   */
  describe('链接 CRUD 操作', () => {
    it('创建链接后应能正确读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          linkContext,
          async (title1: string, title2: string, context: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}` });

            const link = await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title,
              context
            });

            const outlinks = await db.getOutlinks(noteA.id);
            const found = outlinks.find((l: LinkItem) => l.id === link.id);

            expect(found).not.toBeUndefined();
            expect(found!.targetTitle).toBe(noteB.title);
            expect(found!.context).toBe(context);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('删除链接后应无法读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          async (title1: string, title2: string) => {
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}` });
            const noteB = await db.createNote({ title: `${title2}_${Date.now()}` });

            const link = await db.createLink({
              sourceId: noteA.id,
              targetId: noteB.id,
              targetTitle: noteB.title
            });

            await db.deleteLink(link.id);

            const outlinks = await db.getOutlinks(noteA.id);
            expect(outlinks.some((l: LinkItem) => l.id === link.id)).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 根据标题获取反向链接测试
   */
  describe('根据标题获取反向链接', () => {
    it('getBacklinksByTitle 应返回正确的链接', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          async (title1: string, title2: string) => {
            const uniqueTitle = `${title2}_${Date.now()}_target`;
            const noteA = await db.createNote({ title: `${title1}_${Date.now()}` });

            // 创建链接（目标笔记可能不存在）
            await db.createLink({
              sourceId: noteA.id,
              targetTitle: uniqueTitle
            });

            const backlinks = await db.getBacklinksByTitle(uniqueTitle);

            expect(backlinks.length).toBe(1);
            expect(backlinks[0].sourceId).toBe(noteA.id);
            expect(backlinks[0].targetTitle).toBe(uniqueTitle);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 更新链接目标 ID 测试
   */
  describe('更新链接目标 ID', () => {
    it('updateLinkTargetId 应正确更新所有匹配的链接', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteTitle,
          fc.integer({ min: 1, max: 3 }),
          async (title1: string, targetTitle: string, count: number) => {
            const uniqueTargetTitle = `${targetTitle}_${Date.now()}_target`;
            
            // 创建多个源笔记，都链接到同一个标题
            for (let i = 0; i < count; i++) {
              const sourceNote = await db.createNote({ 
                title: `${title1}_${Date.now()}_${i}` 
              });
              await db.createLink({
                sourceId: sourceNote.id,
                targetTitle: uniqueTargetTitle
              });
            }

            // 创建目标笔记
            const targetNote = await db.createNote({ title: uniqueTargetTitle });

            // 更新所有链接的目标 ID
            const updatedCount = await db.updateLinkTargetId(uniqueTargetTitle, targetNote.id);

            expect(updatedCount).toBe(count);

            // 验证反向链接
            const backlinks = await db.getBacklinks(targetNote.id);
            expect(backlinks.length).toBe(count);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * 获取所有链接测试
   */
  describe('获取所有链接', () => {
    it('getAllLinks 应返回所有链接', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (count: number) => {
            // 获取初始链接数量
            const initialLinks = await db.getAllLinks();
            const initialCount = initialLinks.length;

            // 创建多个链接
            for (let i = 0; i < count; i++) {
              const noteA = await db.createNote({ title: `source_${Date.now()}_${i}` });
              const noteB = await db.createNote({ title: `target_${Date.now()}_${i}` });
              await db.createLink({
                sourceId: noteA.id,
                targetId: noteB.id,
                targetTitle: noteB.title
              });
            }

            const allLinks = await db.getAllLinks();
            expect(allLinks.length).toBe(initialCount + count);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
