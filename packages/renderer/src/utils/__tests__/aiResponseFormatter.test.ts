/**
 * AI 响应格式化器测试
 */

import { AIResponseFormatter, formatAIResponse, formatAIResponseToPlainText } from '../aiResponseFormatter';

describe('AIResponseFormatter', () => {
  let formatter: AIResponseFormatter;

  beforeEach(() => {
    formatter = new AIResponseFormatter();
  });

  describe('标题格式化', () => {
    it('应该正确格式化 H1 标题', () => {
      const input = '# 这是一个标题';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<h1');
      expect(output).toContain('这是一个标题');
    });

    it('应该正确格式化多级标题', () => {
      const input = `
# H1 标题
## H2 标题
### H3 标题
`;
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<h1');
      expect(output).toContain('<h2');
      expect(output).toContain('<h3');
    });
  });

  describe('文本格式化', () => {
    it('应该正确格式化粗体', () => {
      const input = '这是 **粗体** 文本';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<strong');
      expect(output).toContain('粗体');
    });

    it('应该正确格式化斜体', () => {
      const input = '这是 *斜体* 文本';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<em');
      expect(output).toContain('斜体');
    });

    it('应该正确格式化删除线', () => {
      const input = '这是 ~~删除线~~ 文本';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<del');
      expect(output).toContain('删除线');
    });
  });

  describe('代码格式化', () => {
    it('应该正确格式化行内代码', () => {
      const input = '使用 `console.log()` 输出';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<code');
      expect(output).toContain('console.log()');
    });

    it('应该正确格式化代码块', () => {
      const input = `
\`\`\`javascript
function hello() {
  console.log('Hello');
}
\`\`\`
`;
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<pre');
      expect(output).toContain('<code');
      expect(output).toContain('function hello()');
    });

    it('应该识别代码块语言', () => {
      const input = `
\`\`\`typescript
const x: number = 10;
\`\`\`
`;
      const output = formatter.formatToHTML(input);
      expect(output).toContain('language-typescript');
    });
  });

  describe('链接和图片', () => {
    it('应该正确格式化链接', () => {
      const input = '[点击这里](https://example.com)';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<a');
      expect(output).toContain('href="https://example.com"');
      expect(output).toContain('点击这里');
    });

    it('应该正确格式化图片', () => {
      const input = '![示例图片](https://example.com/image.png)';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<img');
      expect(output).toContain('src="https://example.com/image.png"');
      expect(output).toContain('alt="示例图片"');
    });
  });

  describe('列表格式化', () => {
    it('应该正确格式化无序列表', () => {
      const input = `
- 项目 1
- 项目 2
- 项目 3
`;
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<ul');
      expect(output).toContain('<li');
      expect(output).toContain('项目 1');
    });

    it('应该正确格式化有序列表', () => {
      const input = `
1. 第一项
2. 第二项
3. 第三项
`;
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<ol');
      expect(output).toContain('<li');
      expect(output).toContain('第一项');
    });
  });

  describe('其他格式', () => {
    it('应该正确格式化引用块', () => {
      const input = '> 这是一段引用';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<blockquote');
      expect(output).toContain('这是一段引用');
    });

    it('应该正确格式化分割线', () => {
      const input = '---';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('<hr');
    });
  });

  describe('安全性', () => {
    it('应该转义 HTML 特殊字符', () => {
      const input = '<script>alert("XSS")</script>';
      const output = formatter.formatToHTML(input);
      expect(output).not.toContain('<script>');
      expect(output).toContain('&lt;script&gt;');
    });

    it('应该清理危险的 HTML', () => {
      const input = '<img src=x onerror="alert(1)">';
      const output = formatter.formatToHTML(input);
      expect(output).not.toContain('onerror');
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      const output = formatter.formatToHTML('');
      expect(output).toBe('');
    });

    it('应该处理纯文本', () => {
      const input = '这是纯文本';
      const output = formatter.formatToHTML(input);
      expect(output).toContain('这是纯文本');
    });

    it('应该处理不完整的 Markdown', () => {
      const input = '**未闭合的粗体';
      const output = formatter.formatToHTML(input);
      expect(output).toBeTruthy();
    });
  });

  describe('纯文本转换', () => {
    it('应该移除所有 Markdown 格式', () => {
      const input = `
# 标题

这是 **粗体** 和 *斜体* 文本。

\`\`\`javascript
const x = 10;
\`\`\`

[链接](https://example.com)
`;
      const output = formatter.formatToPlainText(input);
      expect(output).not.toContain('#');
      expect(output).not.toContain('**');
      expect(output).not.toContain('*');
      expect(output).not.toContain('```');
      expect(output).not.toContain('[');
      expect(output).not.toContain(']');
    });
  });

  describe('自定义选项', () => {
    it('应该使用自定义类名前缀', () => {
      const customFormatter = new AIResponseFormatter({
        classPrefix: 'custom',
      });
      const input = '# 标题';
      const output = customFormatter.formatToHTML(input);
      expect(output).toContain('custom-heading');
    });

    it('应该支持禁用换行', () => {
      const noBreaksFormatter = new AIResponseFormatter({
        breaks: false,
      });
      const input = '第一行\n第二行';
      const output = noBreaksFormatter.formatToHTML(input);
      // 不应该包含 <br>
      expect(output.split('<br').length).toBe(1);
    });
  });
});

describe('快捷函数', () => {
  describe('formatAIResponse', () => {
    it('应该使用默认选项格式化', () => {
      const input = '# 标题\n\n这是 **粗体** 文本';
      const output = formatAIResponse(input);
      expect(output).toContain('<h1');
      expect(output).toContain('<strong');
    });

    it('应该支持自定义选项', () => {
      const input = '# 标题';
      const output = formatAIResponse(input, { classPrefix: 'test' });
      expect(output).toContain('test-heading');
    });
  });

  describe('formatAIResponseToPlainText', () => {
    it('应该转换为纯文本', () => {
      const input = '**粗体** *斜体* `代码`';
      const output = formatAIResponseToPlainText(input);
      expect(output).not.toContain('**');
      expect(output).not.toContain('*');
      expect(output).not.toContain('`');
    });
  });
});

describe('复杂场景', () => {
  it('应该处理嵌套格式', () => {
    const formatter = new AIResponseFormatter();
    const input = '这是 ***粗斜体*** 文本';
    const output = formatter.formatToHTML(input);
    expect(output).toContain('<strong');
    expect(output).toContain('<em');
  });

  it('应该处理混合内容', () => {
    const formatter = new AIResponseFormatter();
    const input = `
# 标题

这是一段包含 **粗体**、*斜体* 和 \`代码\` 的文本。

\`\`\`javascript
console.log('Hello');
\`\`\`

- 列表项 1
- 列表项 2

> 引用文本

[链接](https://example.com)

---
`;
    const output = formatter.formatToHTML(input);
    expect(output).toContain('<h1');
    expect(output).toContain('<strong');
    expect(output).toContain('<em');
    expect(output).toContain('<code');
    expect(output).toContain('<pre');
    expect(output).toContain('<ul');
    expect(output).toContain('<blockquote');
    expect(output).toContain('<a');
    expect(output).toContain('<hr');
  });

  it('应该处理代码块中的特殊字符', () => {
    const formatter = new AIResponseFormatter();
    const input = `
\`\`\`javascript
const html = '<div>Test</div>';
const regex = /[a-z]+/g;
\`\`\`
`;
    const output = formatter.formatToHTML(input);
    expect(output).toContain('&lt;div&gt;');
    expect(output).not.toContain('<div>Test</div>');
  });
});

