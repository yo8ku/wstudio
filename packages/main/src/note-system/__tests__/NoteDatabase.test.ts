/**
 * NoteDatabase.test.ts
 * 笔记数据库服务属性测试
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
import { NoteItem, NoteType } from '../types';

/**
 * 生成有效的笔记标题
 */
const noteTitle = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s: string) => s.trim().length > 0);

/**
 * 生成有效的笔记内容
 */
const noteContent = fc.string({ minLength: 0, maxLength: 10000 });

/**
 * 生成有效的笔记类型
 */
const noteType = fc.constantFrom<NoteType>('daily', 'quick', 'normal');

/**
 * 生成有效的日期字符串 (YYYY-MM-DD)
 */
const dateString = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31')
}).map((d: Date) => d.toISOString().split('T')[0]);

describe('NoteDatabase Property Tests', () => {
  let db: NoteDatabase;

  beforeEach(async () => {
    db = new NoteDatabase();
    await db.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Feature: note-system, Property 15: 笔记自动保存一致性**
   * **Validates: Requirements 2.3, 10.2**
   * 
   * *For any* 笔记编辑操作，保存后重新加载的内容应与编辑后的内容完全一致
   */
  describe('Property 15: 笔记自动保存一致性', () => {
    it('创建笔记后读取应返回相同内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteContent,
          noteType,
          async (title: string, content: string, type: NoteType) => {
            // 创建笔记
            const created = await db.createNote({
              title,
              content,
              type
            });

            // 读取笔记
            const retrieved = await db.getNote(created.id);

            // 验证内容一致
            expect(retrieved).not.toBeNull();
            expect(retrieved!.title).toBe(title);
            expect(retrieved!.content).toBe(content);
            expect(retrieved!.type).toBe(type);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('更新笔记后读取应返回更新后的内容', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteContent,
          noteTitle,
          noteContent,
          async (title1: string, content1: string, title2: string, content2: string) => {
            // 创建笔记
            const created = await db.createNote({
              title: title1,
              content: content1
            });

            // 更新笔记
            await db.updateNote(created.id, {
              title: title2,
              content: content2
            });

            // 读取笔记
            const retrieved = await db.getNote(created.id);

            // 验证内容已更新
            expect(retrieved).not.toBeNull();
            expect(retrieved!.title).toBe(title2);
            expect(retrieved!.content).toBe(content2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 20: 每日笔记日期唯一性**
   * **Validates: Requirements 1.2**
   * 
   * *For any* 日期，最多只能存在一个对应的每日笔记
   */
  describe('Property 20: 每日笔记日期唯一性', () => {
    it('同一日期多次创建每日笔记应返回相同笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          dateString,
          async (date: string) => {
            // 第一次创建
            const first = await db.createDailyNote(date);

            // 第二次创建（应返回已存在的笔记）
            const second = await db.createDailyNote(date);

            // 验证是同一个笔记
            expect(first.id).toBe(second.id);
            expect(first.title).toBe(date);
            expect(second.title).toBe(date);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不同日期应创建不同的每日笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          dateString,
          dateString,
          async (date1: string, date2: string) => {
            // 跳过相同日期
            fc.pre(date1 !== date2);

            const note1 = await db.createDailyNote(date1);
            const note2 = await db.createDailyNote(date2);

            // 验证是不同的笔记
            expect(note1.id).not.toBe(note2.id);
            expect(note1.title).toBe(date1);
            expect(note2.title).toBe(date2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 搜索功能测试
   */
  describe('搜索功能', () => {
    it('搜索应返回包含关键词的笔记', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          fc.string({ minLength: 3, maxLength: 20 }).filter((s: string) => /^[a-zA-Z]+$/.test(s)),
          async (title: string, keyword: string) => {
            // 创建包含关键词的笔记
            const contentWithKeyword = `This is a note about ${keyword} and more content`;
            await db.createNote({
              title,
              content: contentWithKeyword
            });

            // 搜索
            const results = await db.searchNotes(keyword);

            // 验证搜索结果包含该笔记
            const found = results.some((n: NoteItem) => n.content.includes(keyword));
            expect(found).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 删除功能测试
   */
  describe('删除功能', () => {
    it('删除笔记后应无法读取', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteContent,
          async (title: string, content: string) => {
            // 创建笔记
            const created = await db.createNote({ title, content });

            // 删除笔记
            const deleted = await db.deleteNote(created.id);
            expect(deleted).toBe(true);

            // 尝试读取
            const retrieved = await db.getNote(created.id);
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 收藏功能测试
   */
  describe('收藏功能', () => {
    it('切换收藏状态应正确更新', async () => {
      await fc.assert(
        fc.asyncProperty(
          noteTitle,
          noteContent,
          async (title: string, content: string) => {
            // 创建笔记（默认未收藏）
            const created = await db.createNote({ title, content });
            expect(created.isFavorite).toBe(false);

            // 切换收藏
            const newStatus = await db.toggleFavorite(created.id);
            expect(newStatus).toBe(true);

            // 验证状态
            const retrieved = await db.getNote(created.id);
            expect(retrieved!.isFavorite).toBe(true);

            // 再次切换
            const finalStatus = await db.toggleFavorite(created.id);
            expect(finalStatus).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
