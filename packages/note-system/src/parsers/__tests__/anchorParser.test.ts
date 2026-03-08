/**
 * anchorParser.test.ts
 * 锚点解析器测试
 * 功能：验证标题锚点和块级锚点解析结果
 */

import { describe, expect, it } from 'vitest';
import {
  findNoteAnchor,
  normalizeBlockReference,
  normalizeHeadingReference,
  parseBlockAnchors,
  parseHeadingAnchors,
  parseNoteAnchors
} from '../anchorParser';

describe('anchorParser', () => {
  it('应解析标题锚点', () => {
    const content = '# 总览\n\n## 第二部分';
    const anchors = parseHeadingAnchors(content);

    expect(anchors).toHaveLength(2);
    expect(anchors[0].reference).toBe('总览');
    expect(anchors[0].normalizedReference).toBe('总览');
    expect(anchors[1].reference).toBe('第二部分');
  });

  it('应解析块级锚点', () => {
    const content = '第一段 ^block-a\n\n- 列表项 ^block-b';
    const anchors = parseBlockAnchors(content);

    expect(anchors).toHaveLength(2);
    expect(anchors[0].reference).toBe('^block-a');
    expect(anchors[1].reference).toBe('^block-b');
  });

  it('应合并全部锚点', () => {
    const content = '# 总览\n第一段 ^block-a';
    const anchors = parseNoteAnchors(content);

    expect(anchors).toHaveLength(2);
    expect(anchors.map(anchor => anchor.kind)).toEqual(['heading', 'block']);
  });

  it('应根据锚点类型查找目标', () => {
    const content = '# 版本计划\n正文内容 ^block-a';

    expect(findNoteAnchor(content, 'heading', '版本计划')?.reference).toBe('版本计划');
    expect(findNoteAnchor(content, 'block', '^block-a')?.reference).toBe('^block-a');
  });

  it('应规范化标题和块引用', () => {
    expect(normalizeHeadingReference('  Road Map 2026  ')).toBe('road-map-2026');
    expect(normalizeBlockReference('^Block-A')).toBe('block-a');
  });
});
