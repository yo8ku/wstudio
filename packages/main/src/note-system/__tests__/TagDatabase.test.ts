/**
 * TagDatabase.test.ts
 * 标签数据库服务属性测试
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
import { TagItem, NoteItem } from '../types';

/**
 * 生成有效的标签名
 */
const tagName = fc.stringOf(
  fc.oneof(
    fc.char().filter((c: string) => /[\w\u4e00-\u9fa5]/.test(c))
  ),
  { minLength: 1, maxLength: 30 }
).filter((s: string) => s.length > 0 && /^[\w\u4e00-\u9fa5]+$/.test(s));

/**
 * 生成有效的笔记标题
 */
const noteTitle = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s: string) => s.trim().length > 0);

/**
 * 生成有效的笔记内容
 */
const noteContent = fc.string({ minLength: 0, maxLength: 1000 });

describe('TagDatabase Property Tests', () => {
  let db: NoteDatabase;

  beforeEach(async () => {
    db = new NoteDatabase();
    await db.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Feature: note-system, Property 3: 标签筛选完整性**
   * **Validates: Requirements 3.4**
   * 
   * *For any* 标签，点击后返回的笔记列表应包含所有关联该标签的笔记，且不包含未关联的笔记
   */
  describe('Property 3: 标签筛选完整性', () => {
    it('根据标签获取的笔记应包含所有关联笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          fc.array(noteTitle, { minLength: 1, maxLength: 5 }),
          async (name: string, titles: string[]) => {
            // 创建标签
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });

            // 创建笔记并关联标签
            const createdNotes: NoteItem[] = [];
            for (const title of titles) {
              const note = await db.createNote({ title: `${title}_${Date.now()}` });
              await db.addNoteTag(note.id, tag.id);
              createdNotes.push(note);
            }

            // 根据标签获取笔记
            const notesByTag = await db.getNotesByTag(tag.id);

            // 验证所有关联笔记都被返回
            expect(notesByTag.length).toBe(createdNotes.length);
            for (const note of createdNotes) {
              const found = notesByTag.some((n: NoteItem) => n.id === note.id);
              expect(found).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('未关联标签的笔记不应出现在结果中', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          noteTitle,
          noteTitle,
          async (name: string, title1: string, title2: string) => {
            // 创建标签
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });

            // 创建两个笔记，只关联一个
            const note1 = await db.createNote({ title: `${title1}_${Date.now()}` });
            const note2 = await db.createNote({ title: `${title2}_${Date.now()}` });
            await db.addNoteTag(note1.id, tag.id);

            // 根据标签获取笔记
            const notesByTag = await db.getNotesByTag(tag.id);

            // 验证只返回关联的笔记
            expect(notesByTag.length).toBe(1);
            expect(notesByTag[0].id).toBe(note1.id);
            expect(notesByTag.some((n: NoteItem) => n.id === note2.id)).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 4: 标签删除数据完整性**
   * **Validates: Requirements 3.6**
   * 
   * *For any* 被删除的标签，删除后所有关联笔记的内容应保持不变，仅移除标签关联
   */
  describe('Property 4: 标签删除数据完整性', () => {
    it('删除标签后笔记内容应保持不变', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          noteTitle,
          noteContent,
          async (name: string, title: string, content: string) => {
            // 创建标签和笔记
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });
            const note = await db.createNote({ 
              title: `${title}_${Date.now()}`, 
              content 
            });
            await db.addNoteTag(note.id, tag.id);

            // 删除标签
            await db.deleteTag(tag.id);

            // 验证笔记内容不变
            const retrievedNote = await db.getNote(note.id);
            expect(retrievedNote).not.toBeNull();
            expect(retrievedNote!.content).toBe(content);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('删除标签后笔记的标签关联应被移除', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          noteTitle,
          async (name: string, title: string) => {
            // 创建标签和笔记
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });
            const note = await db.createNote({ title: `${title}_${Date.now()}` });
            await db.addNoteTag(note.id, tag.id);

            // 验证关联存在
            let tags = await db.getTagsByNote(note.id);
            expect(tags.some((t: TagItem) => t.id === tag.id)).toBe(true);

            // 删除标签
            await db.deleteTag(tag.id);

            // 验证关联被移除
            tags = await db.getTagsByNote(note.id);
            expect(tags.some((t: TagItem) => t.id === tag.id)).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 标签 CRUD 测试
   */
  describe('标签 CRUD 操作', () => {
    it('创建标签后应能正确读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          async (name: string) => {
            const uniqueName = `test_${name}_${Date.now()}`;
            const tag = await db.createTag({ name: uniqueName });

            const retrieved = await db.getTagByName(uniqueName);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.name).toBe(uniqueName);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('更新标签名后应能正确读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          tagName,
          async (name1: string, name2: string) => {
            const uniqueName1 = `test_${name1}_${Date.now()}`;
            const uniqueName2 = `test_${name2}_${Date.now()}_new`;
            
            const tag = await db.createTag({ name: uniqueName1 });
            await db.updateTag(tag.id, { name: uniqueName2 });

            const retrieved = await db.getTagByName(uniqueName2);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(tag.id);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('删除标签后应无法读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          async (name: string) => {
            const uniqueName = `test_${name}_${Date.now()}`;
            const tag = await db.createTag({ name: uniqueName });

            await db.deleteTag(tag.id);

            const retrieved = await db.getTagByName(uniqueName);
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * 笔记-标签关联测试
   */
  describe('笔记-标签关联', () => {
    it('添加关联后应能通过笔记获取标签', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          noteTitle,
          async (name: string, title: string) => {
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });
            const note = await db.createNote({ title: `${title}_${Date.now()}` });

            await db.addNoteTag(note.id, tag.id);

            const tags = await db.getTagsByNote(note.id);
            expect(tags.some((t: TagItem) => t.id === tag.id)).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('移除关联后应无法通过笔记获取标签', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          noteTitle,
          async (name: string, title: string) => {
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });
            const note = await db.createNote({ title: `${title}_${Date.now()}` });

            await db.addNoteTag(note.id, tag.id);
            await db.removeNoteTag(note.id, tag.id);

            const tags = await db.getTagsByNote(note.id);
            expect(tags.some((t: TagItem) => t.id === tag.id)).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('标签计数应正确更新', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagName,
          fc.array(noteTitle, { minLength: 1, maxLength: 5 }),
          async (name: string, titles: string[]) => {
            const tag = await db.createTag({ name: `test_${name}_${Date.now()}` });

            // 添加多个笔记关联
            for (const title of titles) {
              const note = await db.createNote({ title: `${title}_${Date.now()}` });
              await db.addNoteTag(note.id, tag.id);
            }

            // 获取标签并验证计数
            const allTags = await db.getAllTags();
            const updatedTag = allTags.find((t: TagItem) => t.id === tag.id);
            expect(updatedTag).not.toBeUndefined();
            expect(updatedTag!.noteCount).toBe(titles.length);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
