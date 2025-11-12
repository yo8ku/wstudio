/**
 * Markdown 预览组件
 * 功能：在标签页中显示 Markdown 的渲染结果
 * 描述：使用 markdown-it 进行渲染，支持语法高亮和完整的美化样式
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { formatAIResponse } from '../../utils/aiResponseFormatter';
import '../../styles/aiResponseFormatter.scss';

interface MarkdownPreviewProps {
  content: string;
  title?: string;
  sourceTabId?: string;  // 源文档标签页 ID，用于滚动同步
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content, title, sourceTabId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 markdown-it 渲染 Markdown HTML（与 AI 响应使用相同的渲染器和样式）
  const htmlContent = useMemo(() => {
    try {
      const defaultContent = '# 空白文档\n\n开始编写您的 Markdown...';
      return formatAIResponse(content || defaultContent, {
        enableSyntaxHighlight: true,
        allowHtml: true,  // ✅ 启用 HTML 标签渲染
        enableGFM: true,
        breaks: true,
        // 使用默认的 'ai-response' 类名前缀，复用已有的样式
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
      console.log('[MarkdownPreview] 无法设置编辑器滚动监听', { sourceTabId });
      return;
    }

    console.log('[MarkdownPreview] 设置编辑器滚动监听', { sourceTabId });

    const handleEditorScroll = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        sourceTabId: string;
        scrollPercentage: number;
      }>;
      const { sourceTabId: eventSourceTabId, scrollPercentage } = customEvent.detail;

      console.log('[MarkdownPreview] 收到编辑器滚动事', { eventSourceTabId, currentSourceTabId: sourceTabId, match: eventSourceTabId === sourceTabId });

      // 只处理与当前预览对应的滚动同步      if (eventSourceTabId !== sourceTabId) return;

      const container = containerRef.current;
      if (!container) return;

      const scrollHeight = container.scrollHeight - container.clientHeight;
      const targetScrollTop = scrollHeight * scrollPercentage;

      console.log('[MarkdownPreview] 接收编辑器滚动同步', { sourceTabId, scrollPercentage, targetScrollTop, scrollHeight });

      // 设置同步标志，防止循环触      isSyncingScrollRef.current = true;

      // 滚动到目标位      container.scrollTop = targetScrollTop;

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

  // 图片点击放大功能
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleImageClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // 检查是否点击了图片
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgb(0 0 0 / 31%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          cursor: zoom-out;
        `;

        // 创建放大的图片
        const enlargedImg = document.createElement('img');
        enlargedImg.src = img.src;
        enlargedImg.alt = img.alt;
        enlargedImg.style.cssText = `
          max-width: 90vw;
          max-height: 90vh;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        `;

        overlay.appendChild(enlargedImg);
        document.body.appendChild(overlay);

        // 点击遮罩层关闭
        overlay.addEventListener('click', () => {
          document.body.removeChild(overlay);
        });

        // ESC 键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            if (document.body.contains(overlay)) {
              document.body.removeChild(overlay);
            }
            document.removeEventListener('keydown', handleKeyDown);
          }
        };
        document.addEventListener('keydown', handleKeyDown);
      }
    };

    container.addEventListener('click', handleImageClick);

    return () => {
      container.removeEventListener('click', handleImageClick);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="markdown-preview-container"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px 40px',
        backgroundColor: 'var(--ws-editor-background)',
        color: 'var(--ws-editor-foreground)',
      }}
    >
      {/* 
        使用 ai-response 类名，复用 aiResponseFormatter.scss 中的所有美化样式
      */}
      <div 
        className="ai-response"
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </div>
  );
};


