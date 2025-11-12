# AI 响应格式化工具

一个专门用于处理 AI 返回的 Markdown 格式文本的工具库，支持将 Markdown 转换为美观的 HTML。

## 功能特性

### 支持的 Markdown 格式

- ✅ **标题** (`#` `##` `###` ...)
- ✅ **粗体** (`**text**` 或 `__text__`)
- ✅ **斜体** (`*text*` 或 `_text_`)
- ✅ **删除线** (`~~text~~`)
- ✅ **行内代码** (`` `code` ``)
- ✅ **代码块** (` ```language code ``` `)
- ✅ **链接** (`[text](url)`)
- ✅ **图片** (`![alt](url)`)
- ✅ **无序列表** (`-` `*` `+`)
- ✅ **有序列表** (`1.` `2.` ...)
- ✅ **引用块** (`> text`)
- ✅ **表格** (GFM 风格)
- ✅ **分割线** (`---` `***` `___`)
- ✅ **换行** (可配置)

### 安全特性

- 🔒 **XSS 防护**：使用 DOMPurify 清理 HTML
- 🔒 **HTML 转义**：可选择性转义 HTML 特殊字符
- 🔒 **白名单标签**：只允许安全的 HTML 标签

### 性能特性

- ⚡ **高效解析**：优化的正则表达式匹配
- ⚡ **流式支持**：支持实时格式化流式响应
- ⚡ **缓存友好**：可复用格式化器实例

## 安装

```bash
# 已包含在项目中，无需额外安装
```

## 快速开始

### 基本使用

```typescript
import { formatAIResponse } from '@/utils/aiResponseFormatter';

// AI 返回的原始文本
const aiResponse = `
# 欢迎使用

这是一个 **AI 响应**示例，包含 *各种* Markdown 格式。

\`\`\`javascript
console.log('Hello, World!');
\`\`\`
`;

// 格式化为 HTML
const html = formatAIResponse(aiResponse);

// 在 React 组件中使用
<div dangerouslySetInnerHTML={{ __html: html }} />
```

### 自定义选项

```typescript
import { AIResponseFormatter } from '@/utils/aiResponseFormatter';

const formatter = new AIResponseFormatter({
  enableSyntaxHighlight: true,  // 启用语法高亮
  allowHtml: false,              // 不允许原始 HTML
  enableGFM: true,               // 启用 GitHub Flavored Markdown
  breaks: true,                  // 单换行符转换为 <br>
  classPrefix: 'ai-response',    // CSS 类名前缀
});

const html = formatter.formatToHTML(aiResponse);
```

### 转换为纯文本

```typescript
import { formatAIResponseToPlainText } from '@/utils/aiResponseFormatter';

const plainText = formatAIResponseToPlainText(aiResponse);
console.log(plainText); // 移除所有 Markdown 格式
```

## 使用场景

### 1. AI 聊天面板

在聊天面板中显示格式化的 AI 响应：

```typescript
import { formatAIResponse } from '@/utils/aiResponseFormatter';
import '@/styles/aiResponseFormatter.scss';

function ChatMessage({ content }: { content: string }) {
  const html = formatAIResponse(content);
  
  return (
    <div className="ai-response-container">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

### 2. 流式响应

处理流式 AI 响应：

```typescript
import { AIResponseFormatter } from '@/utils/aiResponseFormatter';

class StreamHandler {
  private formatter = new AIResponseFormatter();
  private accumulated = '';

  onChunk(chunk: string) {
    this.accumulated += chunk;
    const html = this.formatter.formatToHTML(this.accumulated);
    this.updateUI(html);
  }

  onComplete() {
    const html = this.formatter.formatToHTML(this.accumulated);
    this.updateUI(html);
  }

  private updateUI(html: string) {
    // 更新界面
  }
}
```

### 3. 编辑器集成

在 Monaco 编辑器中显示 AI 生成的内容：

```typescript
import { formatAIResponseToPlainText } from '@/utils/aiResponseFormatter';

function insertAIResponse(editor: monaco.editor.IStandaloneCodeEditor, response: string) {
  // 转换为纯文本（移除 Markdown 格式）
  const plainText = formatAIResponseToPlainText(response);
  
  // 插入到编辑器
  editor.executeEdits('ai-insert', [{
    range: editor.getSelection()!,
    text: plainText,
  }]);
}
```

### 4. Ghost Text Widget

在内联编辑中显示格式化的建议：

```typescript
import { formatAIResponse } from '@/utils/aiResponseFormatter';

class GhostTextWidget {
  show(position: Position, text: string) {
    const html = formatAIResponse(text);
    // 显示格式化后的建议
  }
}
```

## 样式定制

### 使用默认样式

```typescript
import '@/styles/aiResponseFormatter.scss';
```

### 自定义样式

```scss
// 覆盖默认样式
.ai-response {
  &-heading-1 {
    color: #ff6b6b;
    font-size: 2.5em;
  }

  &-code-block {
    background-color: #282c34;
    border-left: 4px solid #61dafb;
  }

  &-link {
    color: #61dafb;
    
    &:hover {
      color: #21a1f1;
    }
  }
}
```

### 主题适配

样式文件已支持 CSS 变量，自动适配应用主题：

```scss
.ai-response {
  color: var(--ws-editor-foreground);
  background-color: var(--ws-editor-background);
  
  &-code-block {
    background-color: var(--ws-input-background);
    border-color: var(--ws-contrast-border);
  }
}
```

## API 参考

### `AIResponseFormatter`

主要的格式化器类。

#### 构造函数

```typescript
constructor(options?: FormatOptions)
```

#### 方法

##### `formatToHTML(text: string): string`

将 Markdown 文本格式化为 HTML。

**参数：**
- `text`: 原始 Markdown 文本

**返回：**
- 格式化后的 HTML 字符串

##### `formatToPlainText(text: string): string`

将 Markdown 文本转换为纯文本（移除所有格式）。

**参数：**
- `text`: 原始 Markdown 文本

**返回：**
- 纯文本字符串

### `FormatOptions`

格式化选项接口。

```typescript
interface FormatOptions {
  /** 是否启用语法高亮（代码块） */
  enableSyntaxHighlight?: boolean;
  
  /** 是否允许 HTML 标签 */
  allowHtml?: boolean;
  
  /** 是否启用 GFM（GitHub Flavored Markdown） */
  enableGFM?: boolean;
  
  /** 是否自动换行 */
  breaks?: boolean;
  
  /** 自定义 CSS 类名前缀 */
  classPrefix?: string;
}
```

### 快捷函数

#### `formatAIResponse(text: string, options?: FormatOptions): string`

快捷方法：使用默认或自定义选项格式化文本。

#### `formatAIResponseToPlainText(text: string): string`

快捷方法：将文本转换为纯文本。

## 性能优化建议

### 1. 复用格式化器实例

```typescript
// ✅ 好的做法
const formatter = new AIResponseFormatter();

function formatMultiple(texts: string[]) {
  return texts.map(text => formatter.formatToHTML(text));
}

// ❌ 避免这样做
function formatMultiple(texts: string[]) {
  return texts.map(text => {
    const formatter = new AIResponseFormatter(); // 每次都创建新实例
    return formatter.formatToHTML(text);
  });
}
```

### 2. 流式响应优化

```typescript
// 对于流式响应，使用单个格式化器实例
class StreamHandler {
  private formatter = new AIResponseFormatter();
  
  // 使用防抖减少格式化频率
  private debounceFormat = debounce((text: string) => {
    const html = this.formatter.formatToHTML(text);
    this.updateUI(html);
  }, 100);
}
```

### 3. 大文本处理

```typescript
// 对于超大文本，考虑分块处理
function formatLargeText(text: string) {
  const chunks = splitIntoChunks(text, 10000);
  const formatter = new AIResponseFormatter();
  
  return chunks.map(chunk => formatter.formatToHTML(chunk)).join('');
}
```

## 安全性

### XSS 防护

格式化器使用 DOMPurify 清理所有 HTML 输出，防止 XSS 攻击：

```typescript
// 即使输入包含恶意脚本，也会被清理
const malicious = '<script>alert("XSS")</script>';
const safe = formatAIResponse(malicious);
// 输出: &lt;script&gt;alert("XSS")&lt;/script&gt;
```

### 白名单标签

只允许以下安全的 HTML 标签：

- 标题: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- 文本: `p`, `br`, `hr`, `strong`, `em`, `del`
- 代码: `code`, `pre`
- 链接: `a`, `img`
- 列表: `ul`, `ol`, `li`
- 其他: `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`

## 常见问题

### Q: 如何处理代码块的语法高亮？

A: 当前版本使用简单的样式区分不同语言。如需完整语法高亮，可集成 Prism.js 或 highlight.js：

```typescript
import Prism from 'prismjs';

// 在格式化后手动高亮代码块
const html = formatAIResponse(text);
// 然后使用 Prism.highlightAll()
```

### Q: 如何自定义代码块样式？

A: 通过覆盖 `.ai-response-code-block` 类：

```scss
.ai-response-code-block {
  background-color: #1e1e1e;
  color: #d4d4d4;
  
  &.language-javascript {
    border-left: 3px solid #f7df1e;
  }
}
```

### Q: 支持数学公式吗？

A: 当前版本不直接支持 LaTeX 数学公式。如需支持，可集成 KaTeX 或 MathJax。

### Q: 如何处理表情符号？

A: 表情符号会被原样保留。如需转换 `:emoji:` 语法，可使用额外的库如 `emoji-mart`。

## 更新日志

### v1.0.0 (2024-11-01)

- ✨ 初始版本
- ✅ 支持所有基本 Markdown 格式
- 🔒 XSS 防护
- 🎨 完整的样式系统
- 📚 详细的文档和示例

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

