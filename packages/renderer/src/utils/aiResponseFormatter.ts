/**
 * AI 响应格式化工具
 * 用于处理 AI 返回的 Markdown 格式文本，包括：
 * - 粗体 **text**
 * - 分割线 ---
 * - 标题 # ## ###
 * - 代码块 ```language code ``` （带语法高亮）
 * - 行内代码 `code`
 * - 列表
 * - 链接和图片
 * 等等
 * 
 * 注意：现在使用 markdown-it 和 highlight.js 实现语法高亮
 */

import DOMPurify from 'dompurify';
import { MarkdownRenderer, type MarkdownRendererOptions } from './markdownRenderer';

/**
 * 格式化选项
 */
export interface FormatOptions {
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


/**
 * AI 响应格式化器类
 * 现在使用 markdown-it 和 highlight.js 进行渲染
 */
export class AIResponseFormatter {
  private options: Required<FormatOptions>;
  private markdownRenderer: MarkdownRenderer;

  constructor(options: FormatOptions = {}) {
    this.options = {
      enableSyntaxHighlight: options.enableSyntaxHighlight ?? true,
      allowHtml: options.allowHtml ?? false,
      enableGFM: options.enableGFM ?? true,
      breaks: options.breaks ?? true,
      classPrefix: options.classPrefix ?? 'ai-response',
    };

    // 初始化 markdown-it 渲染器
    const rendererOptions: MarkdownRendererOptions = {
      html: this.options.allowHtml,
      breaks: this.options.breaks,
      linkify: this.options.enableGFM,
      typographer: true,
      classPrefix: this.options.classPrefix,
    };
    
    this.markdownRenderer = new MarkdownRenderer(rendererOptions);
  }

  /**
   * 格式化 AI 响应文本为 HTML
   * @param text 原始 AI 响应文本
   * @returns 格式化后的 HTML 字符串
   */
  public formatToHTML(text: string): string {
    if (!text) return '';

    try {
      // 使用 markdown-it 渲染器进行渲染
      let html = this.markdownRenderer.render(text);
      
      // 清理和净化 HTML（防止 XSS 攻击）
      html = this.sanitizeHTML(html);
      
      return html;
    } catch (error) {
      console.error('[AIResponseFormatter] 格式化失败:', error);
      return `<p class="${this.options.classPrefix}-error">格式化失败</p>`;
    }
  }


  /**
   * 净化 HTML（防止 XSS 攻击）
   */
  private sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        // 标题和段落
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        // 文本格式
        'strong', 'em', 'del', 'code', 'pre',
        'b', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
        // 链接和媒体
        'a', 'img',
        // 列表
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',  // ✅ 添加定义列表标签
        // 引用
        'blockquote',
        // 表格
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
        // 容器
        'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside',
        // 按钮和 SVG
        'button', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
        // 其他语义化标签
        'details', 'summary', 'figure', 'figcaption',
      ],
      ALLOWED_ATTR: [
        // 通用属性
        'id', 'class', 'style',  // ✅ 添加 style 属性支持
        'title', 'alt',
        // 链接和媒体
        'href', 'src', 'target', 'rel',
        // 尺寸和位置
        'width', 'height', 'align',
        // 数据属性
        'data-target', 'data-*',
        // ARIA 属性
        'aria-expanded', 'aria-label', 'aria-hidden',
        // 表单相关
        'type', 'value', 'placeholder',
        // SVG 属性
        'viewBox', 'fill', 'stroke', 'stroke-width', 'd',
        'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
        'points', 'transform',
        // 表格属性
        'colspan', 'rowspan',
      ],
      // @ts-expect-error - ALLOWED_STYLES 在某些 DOMPurify 类型定义中可能不存在
      ALLOWED_STYLES: {
        // ✅ 允许安全的 CSS 属性
        '*': {
          // 颜色
          'color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^hsl\(/, /^hsla\(/],
          'background': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^url\(/],
          'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
          // 尺寸
          'width': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          'height': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          'min-width': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          'min-height': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          'max-width': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          'max-height': [/^\d+(?:px|em|rem|%|vw|vh)$/],
          // 边距和填充
          'margin': [/^[\d\s]+(?:px|em|rem|%)?$/],
          'margin-top': [/^\d+(?:px|em|rem|%)?$/],
          'margin-right': [/^\d+(?:px|em|rem|%)?$/],
          'margin-bottom': [/^\d+(?:px|em|rem|%)?$/],
          'margin-left': [/^\d+(?:px|em|rem|%)?$/],
          'padding': [/^[\d\s]+(?:px|em|rem|%)?$/],
          'padding-top': [/^\d+(?:px|em|rem|%)?$/],
          'padding-right': [/^\d+(?:px|em|rem|%)?$/],
          'padding-bottom': [/^\d+(?:px|em|rem|%)?$/],
          'padding-left': [/^\d+(?:px|em|rem|%)?$/],
          // 边框
          'border': [/^[\d\s]+(?:px)?\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-fA-F]{3,8}|rgb\(|rgba\()/],
          'border-width': [/^\d+(?:px)?$/],
          'border-style': [/^(?:solid|dashed|dotted|none)$/],
          'border-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
          'border-radius': [/^[\d\s]+(?:px|em|rem|%)?$/],
          // 字体
          'font-size': [/^\d+(?:px|em|rem|pt)$/],
          'font-weight': [/^\d{3}$/, /^(?:normal|bold|bolder|lighter)$/],
          'font-style': [/^(?:normal|italic|oblique)$/],
          'font-family': [/.*/],
          'line-height': [/^\d+(?:\.\d+)?(?:px|em|rem)?$/],
          'text-align': [/^(?:left|right|center|justify)$/],
          'text-decoration': [/^(?:none|underline|overline|line-through)$/],
          // 显示和定位
          'display': [/^(?:block|inline|inline-block|flex|grid|none)$/],
          'position': [/^(?:static|relative|absolute|fixed|sticky)$/],
          'top': [/^\d+(?:px|em|rem|%)?$/],
          'right': [/^\d+(?:px|em|rem|%)?$/],
          'bottom': [/^\d+(?:px|em|rem|%)?$/],
          'left': [/^\d+(?:px|em|rem|%)?$/],
          'z-index': [/^\d+$/],
          // 其他
          'opacity': [/^0\.\d+$/, /^1$/],
          'overflow': [/^(?:visible|hidden|scroll|auto)$/],
          'cursor': [/^(?:auto|pointer|default|text|move|not-allowed|help)$/],
        },
      },
      KEEP_CONTENT: true,
    });
  }

  /**
   * 格式化为纯文本（移除所有 Markdown 格式）
   */
  public formatToPlainText(text: string): string {
    if (!text) return '';

    let plain = text;

    // 移除代码块
    plain = plain.replace(/```[\s\S]*?```/g, '');

    // 移除行内代码
    plain = plain.replace(/`[^`]+`/g, '');

    // 移除标题标记
    plain = plain.replace(/^#{1,6}\s+/gm, '');

    // 移除粗体和斜体
    plain = plain.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1');

    // 移除删除线
    plain = plain.replace(/~~([^~]+)~~/g, '$1');

    // 移除链接，保留文本
    plain = plain.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 移除图片
    plain = plain.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

    // 移除列表标记
    plain = plain.replace(/^\s*[-*+]\s+/gm, '');
    plain = plain.replace(/^\s*\d+\.\s+/gm, '');

    // 移除引用标记
    plain = plain.replace(/^>\s+/gm, '');

    // 移除分割线
    plain = plain.replace(/^(?:---+|\*\*\*+|___+)\s*$/gm, '');

    return plain.trim();
  }
}

/**
 * 创建默认的格式化器实例
 */
export const defaultFormatter = new AIResponseFormatter();

/**
 * 快捷方法：格式化 AI 响应为 HTML
 */
export function formatAIResponse(text: string, options?: FormatOptions): string {
  const formatter = options ? new AIResponseFormatter(options) : defaultFormatter;
  return formatter.formatToHTML(text);
}

/**
 * 快捷方法：格式化 AI 响应为纯文本
 */
export function formatAIResponseToPlainText(text: string): string {
  return defaultFormatter.formatToPlainText(text);
}

