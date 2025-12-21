/**
 * linkParser.test.ts
 * 链接解析器属性测试
 * 使用 fast-check 进行属性测试
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseWikilinksFromContent,
  findUnlinkedMentions,
  extractUniqueLinks,
  createWikilink,
  hasLinkTo,
  getLinkContext
} from '../linkParser';

/**
 * 生成有效的笔记标题
 */
const noteTitle = fc.stringOf(
  fc.oneof(
    fc.char().filter((c: string) => /[\w\u4e00-\u9fa5\s]/.test(c) && c !== '[' && c !== ']' && c !== '|')
  ),
  { minLength: 1, maxLength: 30 }
).filter((s: string) => s.trim().length > 0);

/**
 * 生成 Wikilink
 */
const wikilink = noteTitle.map((title: string) => `[[${title}]]`);

/**
 * 生成带显示文本的 Wikilink
 */
const wikilinkWithDisplay = fc.tuple(noteTitle, noteTitle)
  .map(([title, display]: [string, string]) => `[[${title}|${display}]]`);

describe('LinkParser Property Tests', () => {
  /**
   * **Feature: note-system, Property 5: 双向链接解析一致性**
   * **Validates: Requirements 4.1**
   * 
   * *For any* 笔记内容，解析出的 [[笔记名]] 列表应与内容中实际存在的链接语法完全匹配
   */
  describe('Property 5: 双向链接解析一致性', () => {
    it('解析出的链接数量应与内容中的链接数量一致', () => {
      fc.assert(
        fc.property(
          fc.array(wikilink, { minLength: 0, maxLength: 10 }),
          fc.string({ minLength: 0, maxLength: 50 }).filter((s: string) => !s.includes('[[') && !s.includes(']]')),
          (links: string[], filler: string) => {
            const content = links.join(` ${filler} `);
            const parsed = parseWikilinksFromContent(content);
            
            expect(parsed.length).toBe(links.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('解析出的链接目标应与原始链接一致', () => {
      fc.assert(
        fc.property(
          noteTitle,
          (title: string) => {
            const content = `这是一个 [[${title}]] 链接`;
            const parsed = parseWikilinksFromContent(content);
            
            expect(parsed.length).toBe(1);
            expect(parsed[0].targetTitle).toBe(title);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('带显示文本的链接应正确解析', () => {
      fc.assert(
        fc.property(
          noteTitle,
          noteTitle,
          (title: string, display: string) => {
            const content = `[[${title}|${display}]]`;
            const parsed = parseWikilinksFromContent(content);
            
            expect(parsed.length).toBe(1);
            expect(parsed[0].targetTitle).toBe(title);
            expect(parsed[0].displayText).toBe(display);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('链接位置信息应正确', () => {
      fc.assert(
        fc.property(
          noteTitle,
          fc.string({ minLength: 0, maxLength: 50 }).filter((s: string) => !s.includes('[[') && !s.includes(']]')),
          (title: string, prefix: string) => {
            const link = `[[${title}]]`;
            const content = `${prefix}${link}`;
            const parsed = parseWikilinksFromContent(content);
            
            if (parsed.length > 0) {
              expect(parsed[0].position.start).toBe(prefix.length);
              expect(parsed[0].position.end).toBe(prefix.length + link.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 8: 未链接提及识别准确性**
   * **Validates: Requirements 5.4**
   * 
   * *For any* 笔记标题，未链接提及列表应包含所有提到该标题但未使用 [[]] 语法的笔记
   */
  describe('Property 8: 未链接提及识别准确性', () => {
    it('未链接提及应被正确识别', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.char().filter((c: string) => /[a-zA-Z]/.test(c)), { minLength: 3, maxLength: 15 }),
          (title: string) => {
            // 内容中包含标题但不是链接
            const content = `这是关于 ${title} 的内容`;
            const mentions = findUnlinkedMentions(content, [title]);
            
            expect(mentions.length).toBe(1);
            expect(mentions[0].noteTitle).toBe(title);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('已链接的标题不应出现在未链接提及中', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.char().filter((c: string) => /[a-zA-Z]/.test(c)), { minLength: 3, maxLength: 15 }),
          (title: string) => {
            // 内容中包含链接
            const content = `这是关于 [[${title}]] 的内容`;
            const mentions = findUnlinkedMentions(content, [title]);
            
            expect(mentions.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('当前笔记标题应被排除', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.char().filter((c: string) => /[a-zA-Z]/.test(c)), { minLength: 3, maxLength: 15 }),
          (title: string) => {
            const content = `这是 ${title} 笔记的内容`;
            const mentions = findUnlinkedMentions(content, [title], title);
            
            expect(mentions.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 唯一链接提取测试
   */
  describe('唯一链接提取', () => {
    it('extractUniqueLinks 应返回唯一的链接目标', () => {
      fc.assert(
        fc.property(
          noteTitle,
          fc.integer({ min: 2, max: 5 }),
          (title: string, repeatCount: number) => {
            const links = Array(repeatCount).fill(`[[${title}]]`);
            const content = links.join(' ');
            
            const uniqueLinks = extractUniqueLinks(content);
            
            expect(uniqueLinks.length).toBe(1);
            expect(uniqueLinks[0]).toBe(title);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Wikilink 创建测试
   */
  describe('Wikilink 创建', () => {
    it('createWikilink 应创建正确格式的链接', () => {
      fc.assert(
        fc.property(
          noteTitle,
          (title: string) => {
            const link = createWikilink(title);
            expect(link).toBe(`[[${title}]]`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('带显示文本的 createWikilink 应创建正确格式', () => {
      fc.assert(
        fc.property(
          noteTitle,
          noteTitle,
          (title: string, display: string) => {
            fc.pre(title !== display);
            
            const link = createWikilink(title, display);
            expect(link).toBe(`[[${title}|${display}]]`);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * hasLinkTo 测试
   */
  describe('hasLinkTo', () => {
    it('应正确检测链接存在', () => {
      fc.assert(
        fc.property(
          noteTitle,
          (title: string) => {
            const content = `这是 [[${title}]] 的链接`;
            expect(hasLinkTo(content, title)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('应正确检测链接不存在', () => {
      fc.assert(
        fc.property(
          noteTitle,
          noteTitle,
          (title1: string, title2: string) => {
            fc.pre(title1 !== title2);
            
            const content = `这是 [[${title1}]] 的链接`;
            expect(hasLinkTo(content, title2)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * getLinkContext 测试
   */
  describe('getLinkContext', () => {
    it('应返回正确的上下文', () => {
      fc.assert(
        fc.property(
          noteTitle,
          fc.string({ minLength: 10, maxLength: 100 }).filter((s: string) => !s.includes('[[') && !s.includes(']]')),
          fc.string({ minLength: 10, maxLength: 100 }).filter((s: string) => !s.includes('[[') && !s.includes(']]')),
          (title: string, before: string, after: string) => {
            const link = `[[${title}]]`;
            const content = `${before}${link}${after}`;
            const parsed = parseWikilinksFromContent(content);
            
            if (parsed.length > 0) {
              const context = getLinkContext(content, parsed[0].position, 20);
              expect(context).toContain(link);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
