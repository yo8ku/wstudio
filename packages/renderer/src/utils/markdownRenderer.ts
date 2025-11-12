/**
 * Markdown 渲染器（使用 markdown-it 和 highlight.js）
 * 用于将 Markdown 文本转换为带语法高亮的 HTML
 */

import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

/**
 * Markdown 渲染器配置选项
 */
export interface MarkdownRendererOptions {
  /** 是否启用 HTML 标签 */
  html?: boolean;
  /** 是否将换行符转换为 <br> */
  breaks?: boolean;
  /** 是否启用链接自动识别 */
  linkify?: boolean;
  /** 是否启用排版优化 */
  typographer?: boolean;
  /** CSS 类名前缀 */
  classPrefix?: string;
}

/**
 * Markdown 渲染器类
 */
export class MarkdownRenderer {
  private md: MarkdownIt;
  private classPrefix: string;

  constructor(options: MarkdownRendererOptions = {}) {
    this.classPrefix = options.classPrefix ?? 'ai-response';

    // 初始化 markdown-it
    this.md = new MarkdownIt({
      html: options.html ?? false,
      breaks: options.breaks ?? true,
      linkify: options.linkify ?? true,
      typographer: options.typographer ?? true,
      // 自定义高亮函数
      highlight: (code: string, lang: string) => {
        return this.highlightCode(code, lang);
      },
    });

    // 自定义渲染规则
    this.customizeRenderer();
  }

  /**
   * 代码高亮函数
   */
  private highlightCode(code: string, language: string): string {
    // 如果指定了语言且 highlight.js 支持该语言
    if (language && hljs.getLanguage(language)) {
      try {
        const highlighted = hljs.highlight(code, { 
          language, 
          ignoreIllegals: true 
        }).value;
        
        // 格式化语言名称显示
        const displayLanguage = this.formatLanguageName(language);
        
        // 生成唯一ID用于折叠功能
        const blockId = `code-block-${Math.random().toString(36).substring(2, 9)}`;
        
        // 返回带有语言标签和折叠按钮的代码块
        return `<div class="${this.classPrefix}-code-block-wrapper">
<div class="${this.classPrefix}-code-block-header">
<span class="${this.classPrefix}-code-block-language">${displayLanguage}</span>
<button class="${this.classPrefix}-code-block-toggle" data-target="${blockId}" aria-expanded="true" type="button">
<svg class="${this.classPrefix}-code-block-icon" viewBox="0 0 16 16" width="16" height="16">
<path fill="currentColor" d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/>
</svg>
</button>
</div>
<pre id="${blockId}" class="${this.classPrefix}-code-block language-${language}"><code class="hljs language-${language}">${highlighted}</code></pre>
</div>`;
      } catch (error) {
        console.error('[MarkdownRenderer] 代码高亮失败:', error);
      }
    }

    // 如果没有指定语言或高亮失败，使用纯文本显示
    const escapedCode = this.escapeHtml(code);
    const displayLanguage = this.formatLanguageName(language || 'plaintext');
    const blockId = `code-block-${Math.random().toString(36).substring(2, 9)}`;
    
    return `<div class="${this.classPrefix}-code-block-wrapper">
<div class="${this.classPrefix}-code-block-header">
<span class="${this.classPrefix}-code-block-language">${displayLanguage}</span>
<button class="${this.classPrefix}-code-block-toggle" data-target="${blockId}" aria-expanded="true" type="button">
<svg class="${this.classPrefix}-code-block-icon" viewBox="0 0 16 16" width="16" height="16">
<path fill="currentColor" d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/>
</svg>
</button>
</div>
<pre id="${blockId}" class="${this.classPrefix}-code-block"><code>${escapedCode}</code></pre>
</div>`;
  }

  /**
   * 格式化语言名称显示
   */
  private formatLanguageName(language: string): string {
    // 语言名称映射表（特殊情况）
    const languageMap: Record<string, string> = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'python': 'Python',
      'java': 'Java',
      'cpp': 'C++',
      'c++': 'C++',
      'csharp': 'C#',
      'c#': 'C#',
      'cs': 'C#',
      'go': 'Go',
      'rust': 'Rust',
      'php': 'PHP',
      'ruby': 'Ruby',
      'swift': 'Swift',
      'kotlin': 'Kotlin',
      'scala': 'Scala',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'SASS',
      'less': 'LESS',
      'json': 'JSON',
      'xml': 'XML',
      'yaml': 'YAML',
      'yml': 'YAML',
      'sql': 'SQL',
      'bash': 'Bash',
      'sh': 'Shell',
      'shell': 'Shell',
      'powershell': 'PowerShell',
      'markdown': 'Markdown',
      'md': 'Markdown',
      'plaintext': 'Plain Text',
      'text': 'Plain Text',
      'jsx': 'JSX',
      'tsx': 'TSX',
      'vue': 'Vue',
      'svelte': 'Svelte',
      'dart': 'Dart',
      'r': 'R',
      'matlab': 'MATLAB',
      'lua': 'Lua',
      'perl': 'Perl',
      'haskell': 'Haskell',
      'elixir': 'Elixir',
      'clojure': 'Clojure',
      'groovy': 'Groovy',
      'dockerfile': 'Dockerfile',
      'makefile': 'Makefile',
      'ini': 'INI',
      'toml': 'TOML',
      'graphql': 'GraphQL',
      'proto': 'Protocol Buffers',
      'solidity': 'Solidity',
    };

    const lowerLang = language.toLowerCase();
    
    // 如果在映射表中找到，返回格式化的名称
    if (languageMap[lowerLang]) {
      return languageMap[lowerLang];
    }
    
    // 否则，首字母大写
    return language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  }

  /**
   * 自定义渲染器规则
   */
  private customizeRenderer(): void {
    // 保存默认的 fence 渲染器
    const defaultFence = this.md.renderer.rules.fence;

    // 覆盖 fence（代码块）渲染规则
    this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const code = token.content;
      const lang = token.info || '';

      // 使用自定义高亮函数
      return this.highlightCode(code, lang);
    };

    // 自定义行内代码渲染
    const defaultCodeInline = this.md.renderer.rules.code_inline;
    this.md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const code = this.escapeHtml(token.content);
      return `<code class="${this.classPrefix}-inline-code">${code}</code>`;
    };

    // 自定义链接渲染（添加 target="_blank" 和 rel="noopener noreferrer"）
    const defaultLinkOpen = this.md.renderer.rules.link_open || 
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const hrefIndex = token.attrIndex('href');
      
      if (hrefIndex >= 0) {
        // 添加 target 和 rel 属性
        token.attrPush(['target', '_blank']);
        token.attrPush(['rel', 'noopener noreferrer']);
        token.attrPush(['class', `${this.classPrefix}-link`]);
      }
      
      return defaultLinkOpen(tokens, idx, options, env, self);
    };

    // 自定义标题渲染（添加自定义类名）
    const defaultHeadingOpen = this.md.renderer.rules.heading_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const level = token.tag.substring(1); // 从 'h1', 'h2' 等获取数字
      token.attrPush(['class', `${this.classPrefix}-heading-${level}`]);
      return defaultHeadingOpen(tokens, idx, options, env, self);
    };

    // 自定义段落渲染
    const defaultParagraphOpen = this.md.renderer.rules.paragraph_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-paragraph`]);
      return defaultParagraphOpen(tokens, idx, options, env, self);
    };

    // 自定义粗体渲染
    const defaultStrongOpen = this.md.renderer.rules.strong_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.strong_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-bold`]);
      return defaultStrongOpen(tokens, idx, options, env, self);
    };

    // 自定义斜体渲染
    const defaultEmOpen = this.md.renderer.rules.em_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.em_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-italic`]);
      return defaultEmOpen(tokens, idx, options, env, self);
    };

    // 自定义删除线渲染
    const defaultSOpen = this.md.renderer.rules.s_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.s_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-strikethrough`]);
      return defaultSOpen(tokens, idx, options, env, self);
    };

    // 自定义无序列表渲染
    const defaultBulletListOpen = this.md.renderer.rules.bullet_list_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.bullet_list_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-list`]);
      return defaultBulletListOpen(tokens, idx, options, env, self);
    };

    // 自定义有序列表渲染
    const defaultOrderedListOpen = this.md.renderer.rules.ordered_list_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-list`]);
      return defaultOrderedListOpen(tokens, idx, options, env, self);
    };

    // 自定义列表项渲染
    const defaultListItemOpen = this.md.renderer.rules.list_item_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-list-item`]);
      return defaultListItemOpen(tokens, idx, options, env, self);
    };

    // 自定义引用块渲染
    const defaultBlockquoteOpen = this.md.renderer.rules.blockquote_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-blockquote`]);
      return defaultBlockquoteOpen(tokens, idx, options, env, self);
    };

    // 自定义分割线渲染
    const defaultHr = this.md.renderer.rules.hr ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.hr = (tokens, idx, options, env, self) => {
      return `<hr class="${this.classPrefix}-hr" />\n`;
    };

    // 自定义表格渲染
    const defaultTableOpen = this.md.renderer.rules.table_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table`]);
      return defaultTableOpen(tokens, idx, options, env, self);
    };

    const defaultTheadOpen = this.md.renderer.rules.thead_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.thead_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table-head`]);
      return defaultTheadOpen(tokens, idx, options, env, self);
    };

    const defaultTbodyOpen = this.md.renderer.rules.tbody_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.tbody_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table-body`]);
      return defaultTbodyOpen(tokens, idx, options, env, self);
    };

    const defaultTrOpen = this.md.renderer.rules.tr_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.tr_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table-row`]);
      return defaultTrOpen(tokens, idx, options, env, self);
    };

    const defaultThOpen = this.md.renderer.rules.th_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table-header`]);
      return defaultThOpen(tokens, idx, options, env, self);
    };

    const defaultTdOpen = this.md.renderer.rules.td_open ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-table-cell`]);
      return defaultTdOpen(tokens, idx, options, env, self);
    };

    // 自定义图片渲染
    const defaultImage = this.md.renderer.rules.image ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
    this.md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      token.attrPush(['class', `${this.classPrefix}-image`]);
      return defaultImage(tokens, idx, options, env, self);
    };
  }

  /**
   * 转义 HTML 特殊字符
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, char => map[char]);
  }

  /**
   * 渲染 Markdown 为 HTML
   */
  public render(markdown: string): string {
    if (!markdown) return '';
    
    try {
      return this.md.render(markdown);
    } catch (error) {
      console.error('[MarkdownRenderer] 渲染失败:', error);
      return `<p class="${this.classPrefix}-error">Markdown 渲染失败</p>`;
    }
  }

  /**
   * 渲染行内 Markdown
   */
  public renderInline(markdown: string): string {
    if (!markdown) return '';
    
    try {
      return this.md.renderInline(markdown);
    } catch (error) {
      console.error('[MarkdownRenderer] 行内渲染失败:', error);
      return '';
    }
  }
}

/**
 * 创建默认的渲染器实例
 */
export const defaultMarkdownRenderer = new MarkdownRenderer();

/**
 * 快捷方法：渲染 Markdown 为 HTML
 */
export function renderMarkdown(markdown: string, options?: MarkdownRendererOptions): string {
  const renderer = options ? new MarkdownRenderer(options) : defaultMarkdownRenderer;
  return renderer.render(markdown);
}

/**
 * 快捷方法：渲染行内 Markdown
 */
export function renderMarkdownInline(markdown: string, options?: MarkdownRendererOptions): string {
  const renderer = options ? new MarkdownRenderer(options) : defaultMarkdownRenderer;
  return renderer.renderInline(markdown);
}


