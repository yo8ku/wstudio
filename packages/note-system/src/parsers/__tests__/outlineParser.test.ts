/**
 * outlineParser.test.ts
 * 大纲解析器属性测试
 * 使用 fast-check 进行属性测试
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseOutlineFromContent,
  buildOutlineTree,
  parseOutlineTree,
  getHeadingsByLevel,
  getDocumentTitle,
  hasOutline,
  generateTableOfContents
} from '../outlineParser';

/**
 * 生成有效的标题文本
 */
const headingText = fc.stringOf(
  fc.oneof(
    fc.char().filter((c: string) => /[\w\u4e00-\u9fa5\s]/.test(c) && c !== '#' && c !== '\n')
  ),
  { minLength: 1, maxLength: 50 }
).filter((s: string) => s.trim().length > 0);

/**
 * 生成标题级别 (1-6)
 */
const headingLevel = fc.integer({ min: 1, max: 6 });

/**
 * 生成 Markdown 标题
 */
const markdownHeading = fc.tuple(headingLevel, headingText)
  .map(([level, text]: [number, string]) => `${'#'.repeat(level)} ${text}`);

describe('OutlineParser Property Tests', () => {
  /**
   * **Feature: note-system, Property 19: 章节大纲解析正确性**
   * **Validates: Requirements 9.2**
   * 
   * *For any* Markdown 内容，大纲应正确解析所有标题（#、##、### 等）并保持层级结构
   */
  describe('Property 19: 章节大纲解析正确性', () => {
    it('解析出的标题数量应与内容中的标题数量一致', () => {
      fc.assert(
        fc.property(
          fc.array(markdownHeading, { minLength: 0, maxLength: 10 }),
          (headings: string[]) => {
            const content = headings.join('\n\n');
            const parsed = parseOutlineFromContent(content);
            
            expect(parsed.length).toBe(headings.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('解析出的标题级别应正确', () => {
      fc.assert(
        fc.property(
          headingLevel,
          headingText,
          (level: number, text: string) => {
            const content = `${'#'.repeat(level)} ${text}`;
            const parsed = parseOutlineFromContent(content);
            
            expect(parsed.length).toBe(1);
            expect(parsed[0].level).toBe(level);
            expect(parsed[0].title).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('标题位置信息应正确', () => {
      fc.assert(
        fc.property(
          headingLevel,
          headingText,
          fc.string({ minLength: 0, maxLength: 50 }).filter((s: string) => !s.includes('#')),
          (level: number, text: string, prefix: string) => {
            const heading = `${'#'.repeat(level)} ${text}`;
            const content = `${prefix}\n${heading}`;
            const parsed = parseOutlineFromContent(content);
            
            if (parsed.length > 0) {
              expect(parsed[0].position.line).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('树形结构应正确构建', () => {
      // 测试固定的层级结构
      const content = `# 一级标题
## 二级标题1
### 三级标题
## 二级标题2`;
      
      const tree = parseOutlineTree(content);
      
      expect(tree.length).toBe(1);
      expect(tree[0].level).toBe(1);
      expect(tree[0].children.length).toBe(2);
      expect(tree[0].children[0].level).toBe(2);
      expect(tree[0].children[0].children.length).toBe(1);
      expect(tree[0].children[0].children[0].level).toBe(3);
    });
  });

  /**
   * 按级别获取标题测试
   */
  describe('按级别获取标题', () => {
    it('getHeadingsByLevel 应返回指定级别的标题', () => {
      fc.assert(
        fc.property(
          headingLevel,
          fc.array(headingText, { minLength: 1, maxLength: 5 }),
          (level: number, texts: string[]) => {
            const headings = texts.map((text: string) => `${'#'.repeat(level)} ${text}`);
            const content = headings.join('\n');
            
            const result = getHeadingsByLevel(content, level);
            
            expect(result.length).toBe(texts.length);
            result.forEach((item, index) => {
              expect(item.level).toBe(level);
              expect(item.title).toBe(texts[index]);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('不同级别的标题应被正确过滤', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 4, max: 6 }),
          headingText,
          headingText,
          (level1: number, level2: number, text1: string, text2: string) => {
            const content = `${'#'.repeat(level1)} ${text1}\n${'#'.repeat(level2)} ${text2}`;
            
            const result1 = getHeadingsByLevel(content, level1);
            const result2 = getHeadingsByLevel(content, level2);
            
            expect(result1.length).toBe(1);
            expect(result2.length).toBe(1);
            expect(result1[0].title).toBe(text1);
            expect(result2[0].title).toBe(text2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 文档标题测试
   */
  describe('文档标题', () => {
    it('getDocumentTitle 应返回第一个标题', () => {
      fc.assert(
        fc.property(
          headingLevel,
          headingText,
          fc.array(markdownHeading, { minLength: 0, maxLength: 5 }),
          (level: number, firstTitle: string, otherHeadings: string[]) => {
            const firstHeading = `${'#'.repeat(level)} ${firstTitle}`;
            const content = [firstHeading, ...otherHeadings].join('\n');
            
            const title = getDocumentTitle(content);
            
            expect(title).toBe(firstTitle);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('无标题内容应返回 undefined', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter((s: string) => !s.includes('#')),
          (content: string) => {
            const title = getDocumentTitle(content);
            expect(title).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * hasOutline 测试
   */
  describe('hasOutline', () => {
    it('有标题的内容应返回 true', () => {
      fc.assert(
        fc.property(
          markdownHeading,
          (heading: string) => {
            expect(hasOutline(heading)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('无标题的内容应返回 false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter((s: string) => !/^#{1,6}\s+.+$/m.test(s)),
          (content: string) => {
            expect(hasOutline(content)).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * 目录生成测试
   */
  describe('目录生成', () => {
    it('generateTableOfContents 应生成正确格式的目录', () => {
      const content = `# 标题一
## 标题二
### 标题三`;
      
      const toc = generateTableOfContents(content);
      
      expect(toc).toContain('- [标题一]');
      expect(toc).toContain('- [标题二]');
      expect(toc).toContain('- [标题三]');
    });

    it('maxLevel 应限制目录深度', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          (maxLevel: number) => {
            const content = `# 一级
## 二级
### 三级
#### 四级
##### 五级`;
            
            const toc = generateTableOfContents(content, maxLevel);
            const lines = toc.split('\n').filter((l: string) => l.trim());
            
            // 目录行数应该等于 maxLevel
            expect(lines.length).toBe(maxLevel);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('空内容应返回空字符串', () => {
      const toc = generateTableOfContents('');
      expect(toc).toBe('');
    });
  });

  /**
   * 树形结构构建测试
   */
  describe('树形结构构建', () => {
    it('buildOutlineTree 应正确处理空数组', () => {
      const tree = buildOutlineTree([]);
      expect(tree).toEqual([]);
    });

    it('同级标题应在同一层', () => {
      const content = `## 标题1
## 标题2
## 标题3`;
      
      const tree = parseOutlineTree(content);
      
      expect(tree.length).toBe(3);
      tree.forEach(item => {
        expect(item.level).toBe(2);
        expect(item.children.length).toBe(0);
      });
    });

    it('子标题应嵌套在父标题下', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          headingText,
          headingText,
          (parentLevel: number, parentText: string, childText: string) => {
            const childLevel = parentLevel + 1;
            if (childLevel > 6) return; // 跳过无效级别
            
            const content = `${'#'.repeat(parentLevel)} ${parentText}\n${'#'.repeat(childLevel)} ${childText}`;
            const tree = parseOutlineTree(content);
            
            expect(tree.length).toBe(1);
            expect(tree[0].title).toBe(parentText);
            expect(tree[0].children.length).toBe(1);
            expect(tree[0].children[0].title).toBe(childText);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
