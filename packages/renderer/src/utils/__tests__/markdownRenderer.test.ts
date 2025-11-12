/**
 * Markdown 渲染器测试
 */

import { describe, it, expect } from 'vitest';
import { MarkdownRenderer } from '../markdownRenderer';

describe('MarkdownRenderer', () => {
  const renderer = new MarkdownRenderer();

  it('应该正确渲染简单文本', () => {
    const markdown = 'Hello World';
    const html = renderer.render(markdown);
    expect(html).toContain('Hello World');
  });

  it('应该正确渲染代码块', () => {
    const markdown = '```javascript\nconst x = 10;\nconsole.log(x);\n```';
    const html = renderer.render(markdown);
    expect(html).toContain('code-block');
    expect(html).toContain('JavaScript');
  });

  it('应该正确渲染行内代码', () => {
    const markdown = '这是一个 `inline code` 示例';
    const html = renderer.render(markdown);
    expect(html).toContain('ai-response-inline-code');
    expect(html).toContain('inline code');
  });

  it('应该正确渲染标题', () => {
    const markdown = '# 一级标题\n## 二级标题';
    const html = renderer.render(markdown);
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
  });

  it('应该正确渲染链接', () => {
    const markdown = '[GitHub](https://github.com)';
    const html = renderer.render(markdown);
    expect(html).toContain('href="https://github.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('应该正确渲染列表', () => {
    const markdown = '- 项目1\n- 项目2\n- 项目3';
    const html = renderer.render(markdown);
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('项目1');
  });

  it('应该正确处理多语言代码块', () => {
    const languages = ['python', 'typescript', 'java', 'rust'];
    
    languages.forEach(lang => {
      const markdown = `\`\`\`${lang}\ncode here\n\`\`\``;
      const html = renderer.render(markdown);
      expect(html).toContain('code-block');
    });
  });

  it('应该处理空输入', () => {
    const html = renderer.render('');
    expect(html).toBe('');
  });

  it('应该正确转义 HTML', () => {
    const markdown = '`<script>alert("xss")</script>`';
    const html = renderer.render(markdown);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});





