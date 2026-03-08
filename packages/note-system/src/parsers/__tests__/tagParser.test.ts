/**
 * tagParser.test.ts
 * 标签解析器属性测试
 * 使用 fast-check 进行属性测试
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseTagsFromContent,
  parseNestedTags,
  getParentTag,
  getLeafTagName,
  isValidTagName,
  extractUniqueTags
} from '../tagParser';

/**
 * 生成有效的标签名（不含 /）
 */
const simpleTagName = fc.stringOf(
  fc.oneof(
    fc.char().filter((c: string) => /[\w\u4e00-\u9fa5]/.test(c))
  ),
  { minLength: 1, maxLength: 20 }
).filter((s: string) => s.length > 0 && /^[\w\u4e00-\u9fa5]+$/.test(s));

/**
 * 生成嵌套标签名
 */
const nestedTagName = fc.array(simpleTagName, { minLength: 2, maxLength: 4 })
  .map((parts: string[]) => parts.join('/'));

/**
 * 生成标签（带 # 前缀）
 */
const tagWithPrefix = fc.oneof(
  simpleTagName.map((name: string) => `#${name}`),
  nestedTagName.map((name: string) => `#${name}`)
);

const nonTagText = fc.string({ minLength: 0, maxLength: 100 })
  .filter((s: string) => !s.includes('#'));

describe('TagParser Property Tests', () => {
  /**
   * **Feature: note-system, Property 1: 标签解析一致性**
   * **Validates: Requirements 3.2**
   * 
   * *For any* 笔记内容，解析出的 #标签名 列表应与内容中实际存在的标签语法完全匹配
   */
  describe('Property 1: 标签解析一致性', () => {
    it('解析出的标签数量应与内容中的标签数量一致', () => {
      fc.assert(
        fc.property(
          fc.array(tagWithPrefix, { minLength: 0, maxLength: 10 }),
          nonTagText,
          (tags: string[], filler: string) => {
            // 构建包含标签的内容
            const content = tags.join(` ${filler} `);
            
            // 解析标签
            const parsed = parseTagsFromContent(content);
            
            // 验证数量一致
            expect(parsed.length).toBe(tags.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('解析出的标签名应与原始标签名一致', () => {
      fc.assert(
        fc.property(
          simpleTagName,
          (tagName: string) => {
            const content = `这是一个 #${tagName} 标签`;
            const parsed = parseTagsFromContent(content);
            
            expect(parsed.length).toBe(1);
            expect(parsed[0].fullName).toBe(tagName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('标签位置信息应正确', () => {
      fc.assert(
        fc.property(
          simpleTagName,
          nonTagText.filter((s: string) => s.length <= 50),
          (tagName: string, prefix: string) => {
            const tag = `#${tagName}`;
            const content = `${prefix}${tag}`;
            const parsed = parseTagsFromContent(content);
            
            if (parsed.length > 0) {
              const expectedStart = prefix.length;
              expect(parsed[0].position.start).toBe(expectedStart);
              expect(parsed[0].position.end).toBe(expectedStart + tag.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: note-system, Property 2: 嵌套标签层级正确性**
   * **Validates: Requirements 3.3**
   * 
   * *For any* 嵌套标签 #父标签/子标签，解析后应正确建立父子关系
   */
  describe('Property 2: 嵌套标签层级正确性', () => {
    it('嵌套标签应正确解析父子关系', () => {
      fc.assert(
        fc.property(
          fc.array(simpleTagName, { minLength: 2, maxLength: 4 }),
          (parts: string[]) => {
            const fullName = parts.join('/');
            const content = `#${fullName}`;
            const parsed = parseTagsFromContent(content);
            
            expect(parsed.length).toBe(1);
            expect(parsed[0].isNested).toBe(true);
            expect(parsed[0].fullName).toBe(fullName);
            expect(parsed[0].name).toBe(parts[parts.length - 1]);
            expect(parsed[0].parent).toBe(parts.slice(0, -1).join('/'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('parseNestedTags 应返回所有层级', () => {
      fc.assert(
        fc.property(
          fc.array(simpleTagName, { minLength: 2, maxLength: 5 }),
          (parts: string[]) => {
            const fullName = parts.join('/');
            const allLevels = parseNestedTags(fullName);
            
            // 验证层级数量
            expect(allLevels.length).toBe(parts.length);
            
            // 验证每个层级
            for (let i = 0; i < parts.length; i++) {
              expect(allLevels[i]).toBe(parts.slice(0, i + 1).join('/'));
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getParentTag 应返回正确的父标签', () => {
      fc.assert(
        fc.property(
          fc.array(simpleTagName, { minLength: 2, maxLength: 4 }),
          (parts: string[]) => {
            const fullName = parts.join('/');
            const parent = getParentTag(fullName);
            
            expect(parent).toBe(parts.slice(0, -1).join('/'));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getLeafTagName 应返回最后一级标签名', () => {
      fc.assert(
        fc.property(
          fc.array(simpleTagName, { minLength: 1, maxLength: 4 }),
          (parts: string[]) => {
            const fullName = parts.join('/');
            const leaf = getLeafTagName(fullName);
            
            expect(leaf).toBe(parts[parts.length - 1]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 标签验证测试
   */
  describe('标签名验证', () => {
    it('有效标签名应通过验证', () => {
      fc.assert(
        fc.property(
          simpleTagName,
          (tagName: string) => {
            expect(isValidTagName(tagName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('嵌套标签名应通过验证', () => {
      fc.assert(
        fc.property(
          nestedTagName,
          (tagName: string) => {
            expect(isValidTagName(tagName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('空字符串应不通过验证', () => {
      expect(isValidTagName('')).toBe(false);
      expect(isValidTagName('   ')).toBe(false);
    });
  });

  /**
   * 唯一标签提取测试
   */
  describe('唯一标签提取', () => {
    it('extractUniqueTags 应返回唯一的标签', () => {
      fc.assert(
        fc.property(
          simpleTagName,
          fc.integer({ min: 2, max: 5 }),
          (tagName: string, repeatCount: number) => {
            // 创建重复标签的内容
            const tags = Array(repeatCount).fill(`#${tagName}`);
            const content = tags.join(' ');
            
            const uniqueTags = extractUniqueTags(content);
            
            // 应该只有一个唯一标签
            expect(uniqueTags.length).toBe(1);
            expect(uniqueTags[0]).toBe(tagName);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('嵌套标签应包含所有父级', () => {
      fc.assert(
        fc.property(
          fc.array(simpleTagName, { minLength: 2, maxLength: 3 }),
          (parts: string[]) => {
            const fullName = parts.join('/');
            const content = `#${fullName}`;
            
            const uniqueTags = extractUniqueTags(content);
            
            // 应该包含所有层级
            expect(uniqueTags.length).toBe(parts.length);
            for (let i = 0; i < parts.length; i++) {
              expect(uniqueTags).toContain(parts.slice(0, i + 1).join('/'));
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
