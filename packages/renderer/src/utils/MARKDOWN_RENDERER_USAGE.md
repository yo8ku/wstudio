# Markdown 渲染器使用指南

本文档介绍如何使用新的 Markdown 渲染器（支持代码高亮功能）。

## 概述

我们已经将原有的 `AIResponseFormatter` 升级为使用 `markdown-it` 和 `highlight.js`，提供了更强大的 Markdown 渲染和代码高亮功能。

## 核心组件

### 1. MarkdownRenderer

位置：`packages/renderer/src/utils/markdownRenderer.ts`

这是核心渲染器，基于 `markdown-it` 和 `highlight.js` 实现。

### 2. AIResponseFormatter

位置：`packages/renderer/src/utils/aiResponseFormatter.ts`

保持了原有的接口，但内部使用 `MarkdownRenderer` 进行渲染。

## 使用方法

### 方法 1: 使用 AIResponseFormatter（推荐）

```typescript
import { formatAIResponse } from '@/utils/aiResponseFormatter';

// 格式化 AI 响应
const markdown = `
# 示例代码

这是一个 JavaScript 示例：

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}

hello('World');
\`\`\`

行内代码：\`const x = 10;\`
`;

const html = formatAIResponse(markdown);
```

### 方法 2: 直接使用 MarkdownRenderer

```typescript
import { renderMarkdown, MarkdownRenderer } from '@/utils/markdownRenderer';

// 快捷方法
const html = renderMarkdown(markdown);

// 或创建自定义实例
const renderer = new MarkdownRenderer({
  html: false,  // 是否允许 HTML
  breaks: true, // 是否将换行符转换为 <br>
  linkify: true, // 是否自动识别链接
  classPrefix: 'custom-prefix' // CSS 类名前缀
});

const html = renderer.render(markdown);
```

## 支持的语言

代码高亮支持以下语言（部分列表）：

- JavaScript / TypeScript
- Python
- Java
- C / C++ / C#
- Go
- Rust
- PHP
- Ruby
- Swift
- Kotlin
- HTML / CSS / SCSS
- JSON / XML / YAML
- SQL
- Bash / Shell
- 以及 highlight.js 支持的所有其他语言

## 代码块功能

### 语法高亮

所有代码块都会自动应用语法高亮：

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
};
\`\`\`

### 代码块折叠

每个代码块都包含一个折叠按钮，用户可以点击来展开/折叠代码。

### 语言标签

每个代码块顶部会显示语言名称（例如：JavaScript、Python 等）。

## 样式

### Highlight.js 样式

位置：`packages/renderer/src/styles/highlightjs.scss`

这个文件包含了所有代码高亮的样式，使用 CSS 变量与主题系统集成。

### AI 响应格式化样式

位置：`packages/renderer/src/styles/aiResponseFormatter.scss`

包含了所有 Markdown 元素的样式（标题、列表、链接等）。

## 主题集成

所有颜色都使用 CSS 变量，自动适配当前主题：

- `--ws-syntax-keyword` - 关键字颜色
- `--ws-syntax-string` - 字符串颜色
- `--ws-syntax-function` - 函数颜色
- `--ws-syntax-comment` - 注释颜色
- 等等...

## 安全性

### XSS 防护

所有渲染的 HTML 都会通过 `DOMPurify` 进行净化，防止 XSS 攻击。

### HTML 标签

默认情况下，不允许在 Markdown 中使用 HTML 标签。如果需要启用：

```typescript
const html = formatAIResponse(markdown, {
  allowHtml: true
});
```

## 性能优化

- 使用单例模式避免重复创建渲染器实例
- 代码高亮在客户端进行，不影响服务器性能
- 样式使用 CSS 变量，避免重复计算

## 测试

运行测试：

```bash
cd packages/renderer
pnpm test markdownRenderer
```

## 示例

完整示例请参考：
- `packages/renderer/src/utils/__tests__/markdownRenderer.test.ts`
- `packages/renderer/src/components/Layout/AIChatPanel/ChatMessage.tsx`（实际使用）

## 迁移指南

如果你之前使用的是旧版 `AIResponseFormatter`，不需要修改代码。新版本保持了完全兼容的 API。

唯一的变化是内部实现，现在使用 `markdown-it` 和 `highlight.js`，提供了更好的渲染质量和代码高亮效果。

## 常见问题

### Q: 为什么代码没有高亮？

A: 请确保：
1. 代码块使用了正确的语言标识符（例如：\`\`\`javascript）
2. highlight.js 已正确安装（`pnpm install`）
3. 样式文件已正确导入（`packages/renderer/src/styles/index.css`）

### Q: 如何自定义代码高亮样式？

A: 编辑 `packages/renderer/src/styles/highlightjs.scss`，修改相应的 CSS 变量。

### Q: 如何添加新的编程语言支持？

A: highlight.js 默认支持大多数常见语言。如果需要额外的语言，可以在 `markdownRenderer.ts` 中导入：

```typescript
import hljs from 'highlight.js';
import someLanguage from 'highlight.js/lib/languages/some-language';

hljs.registerLanguage('some-language', someLanguage);
```

## 相关文件

- `packages/renderer/src/utils/markdownRenderer.ts` - 核心渲染器
- `packages/renderer/src/utils/aiResponseFormatter.ts` - AI 响应格式化器
- `packages/renderer/src/styles/highlightjs.scss` - 代码高亮样式
- `packages/renderer/src/styles/aiResponseFormatter.scss` - Markdown 样式
- `packages/renderer/src/utils/__tests__/markdownRenderer.test.ts` - 测试文件





