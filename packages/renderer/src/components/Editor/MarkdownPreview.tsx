/**
 * Markdown 预览组件
 * 用于在标签页中显示 Markdown 的渲染结果
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownPreviewProps {
  content: string;
  title?: string;
  sourceTabId?: string;  // 源文档标签页 ID，用于滚动同步
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, title, sourceTabId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 调试日志
  console.log('[MarkdownPreview] 组件初始化/更新:', { title, sourceTabId });

  // 配置 marked 选项
  useEffect(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }, []);

  // 渲染 Markdown 为 HTML
  const htmlContent = useMemo(() => {
    try {
      const rawHtml = marked(content || '# 空白文档\n\n开始编写您的 Markdown...') as string;
      // 使用 DOMPurify 清理 HTML 防止 XSS
      return DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'hr',
          'strong', 'em', 'del', 'code', 'pre',
          'a', 'img',
          'ul', 'ol', 'li',
          'blockquote',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'input',
          'div', 'span'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'type', 'checked', 'disabled', 'class', 'id']
      });
    } catch (error) {
      console.error('[MarkdownPreview] 渲染失败:', error);
      return '<p style="color: red;">Markdown 渲染失败</p>';
    }
  }, [content]);

  // 监听预览容器滚动，同步到编辑器
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sourceTabId) {
      console.log('[MarkdownPreview] 无法设置预览滚动监听:', { hasContainer: !!container, sourceTabId });
      return;
    }

    console.log('[MarkdownPreview] 设置预览滚动监听:', { sourceTabId });

    const handleScroll = () => {
      if (isSyncingScrollRef.current) return;

      // 清除之前的定时器
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // 防抖处理
      scrollTimeoutRef.current = setTimeout(() => {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight - container.clientHeight;
        const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

        console.log('[MarkdownPreview] 预览滚动:', { scrollTop, scrollHeight, scrollPercentage, sourceTabId });

        // 广播滚动事件到对应的编辑器
        const customEvent = new CustomEvent('preview-scroll', {
          detail: {
            sourceTabId: sourceTabId,
            scrollPercentage: scrollPercentage
          }
        });
        console.log('[MarkdownPreview] 触发 preview-scroll 事件:', customEvent.detail);
        window.dispatchEvent(customEvent);
      }, 50); // 50ms 防抖
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [sourceTabId]);

  // 监听来自编辑器的滚动同步请求
  useEffect(() => {
    if (!sourceTabId) {
      console.log('[MarkdownPreview] 无法设置编辑器滚动监听:', { sourceTabId });
      return;
    }

    console.log('[MarkdownPreview] 设置编辑器滚动监听:', { sourceTabId });

    const handleEditorScroll = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        sourceTabId: string;
        scrollPercentage: number;
      }>;
      const { sourceTabId: eventSourceTabId, scrollPercentage } = customEvent.detail;

      console.log('[MarkdownPreview] 收到编辑器滚动事件:', { eventSourceTabId, currentSourceTabId: sourceTabId, match: eventSourceTabId === sourceTabId });

      // 只处理与当前预览对应的滚动同步
      if (eventSourceTabId !== sourceTabId) return;

      const container = containerRef.current;
      if (!container) return;

      const scrollHeight = container.scrollHeight - container.clientHeight;
      const targetScrollTop = scrollHeight * scrollPercentage;

      console.log('[MarkdownPreview] 接收编辑器滚动同步:', { sourceTabId, scrollPercentage, targetScrollTop, scrollHeight });

      // 设置同步标志，防止循环触发
      isSyncingScrollRef.current = true;

      // 滚动到目标位置
      container.scrollTop = targetScrollTop;

      // 重置同步标志
      setTimeout(() => {
        isSyncingScrollRef.current = false;
      }, 100);
    };

    window.addEventListener('editor-scroll', handleEditorScroll);

    return () => {
      window.removeEventListener('editor-scroll', handleEditorScroll);
    };
  }, [sourceTabId]);

  return (
    <div 
      ref={containerRef}
      className="markdown-preview-container"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 40px',
        backgroundColor: 'var(--editor-bg)',
        color: 'var(--editor-fg)',
      }}
    >
      <style>{`
        .markdown-preview-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
          font-size: 16px;
          line-height: 1.6;
        }

        .markdown-preview-container h1,
        .markdown-preview-container h2,
        .markdown-preview-container h3,
        .markdown-preview-container h4,
        .markdown-preview-container h5,
        .markdown-preview-container h6 {
          margin-top: 24px;
          margin-bottom: 16px;
          font-weight: 600;
          line-height: 1.25;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.3em;
        }

        .markdown-preview-container h1 { font-size: 2em; }
        .markdown-preview-container h2 { font-size: 1.5em; }
        .markdown-preview-container h3 { font-size: 1.25em; }
        .markdown-preview-container h4 { font-size: 1em; }
        .markdown-preview-container h5 { font-size: 0.875em; }
        .markdown-preview-container h6 { font-size: 0.85em; }

        .markdown-preview-container p {
          margin-top: 0;
          margin-bottom: 16px;
        }

        .markdown-preview-container code {
          background-color: var(--input-bg, rgba(110, 118, 129, 0.4));
          padding: 0.2em 0.4em;
          margin: 0;
          font-size: 85%;
          border-radius: 6px;
          font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace;
        }

        .markdown-preview-container pre {
          background-color: var(--input-bg, rgba(110, 118, 129, 0.4));
          padding: 16px;
          overflow: visible;
          font-size: 85%;
          line-height: 1.45;
          border-radius: 6px;
          margin-bottom: 16px;
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-word;
        }

        .markdown-preview-container pre code {
          background-color: transparent;
          padding: 0;
          margin: 0;
          font-size: 100%;
          border-radius: 0;
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-word;
        }

        .markdown-preview-container blockquote {
          margin: 0;
          padding: 0 1em;
          color: var(--sidebar-fg, #8b949e);
          border-left: 0.25em solid var(--border-color, #30363d);
          margin-bottom: 16px;
        }

        .markdown-preview-container ul,
        .markdown-preview-container ol {
          margin-top: 0;
          margin-bottom: 16px;
          padding-left: 2em;
        }

        .markdown-preview-container li {
          margin-top: 0.25em;
        }

        .markdown-preview-container table {
          border-spacing: 0;
          border-collapse: collapse;
          margin-bottom: 16px;
          width: 100%;
          overflow: auto;
        }

        .markdown-preview-container table th,
        .markdown-preview-container table td {
          padding: 6px 13px;
          border: 1px solid var(--border-color, #30363d);
        }

        .markdown-preview-container table th {
          font-weight: 600;
          background-color: var(--input-bg, rgba(110, 118, 129, 0.2));
        }

        .markdown-preview-container table tr:nth-child(2n) {
          background-color: var(--input-bg, rgba(110, 118, 129, 0.1));
        }

        .markdown-preview-container img {
          max-width: 100%;
          box-sizing: content-box;
          background-color: var(--editor-bg);
        }

        .markdown-preview-container a {
          color: var(--link-fg, #58a6ff);
          text-decoration: none;
        }

        .markdown-preview-container a:hover {
          text-decoration: underline;
        }

        .markdown-preview-container hr {
          height: 0.25em;
          padding: 0;
          margin: 24px 0;
          background-color: var(--border-color, #30363d);
          border: 0;
        }

        .markdown-preview-container strong {
          font-weight: 600;
        }

        .markdown-preview-container em {
          font-style: italic;
        }

        .markdown-preview-container del {
          text-decoration: line-through;
        }

        /* 任务列表样式 */
        .markdown-preview-container input[type="checkbox"] {
          margin-right: 0.5em;
          cursor: pointer;
        }
      `}</style>
      
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
};


