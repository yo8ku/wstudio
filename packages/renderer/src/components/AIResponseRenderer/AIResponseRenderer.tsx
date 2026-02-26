/**
 * AI 响应渲染器组件
 * 用于在聊天面板中渲染格式化的 AI 响应
 * 流式阶段直接显示纯文本（逐字追加效果），完成后渲染 Markdown
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { formatAIResponse } from '@/utils/aiResponseFormatter';
import '@/styles/aiResponseFormatter.scss';

export interface AIResponseRendererProps {
  /** AI 响应内容（Markdown 格式） */
  content: string;
  /** 是否正在加载（流式响应） */
  isStreaming?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 格式化选项 */
  formatOptions?: {
    enableSyntaxHighlight?: boolean;
    allowHtml?: boolean;
    enableGFM?: boolean;
    breaks?: boolean;
    classPrefix?: string;
  };
}

/**
 * AI 响应渲染器组件
 */
export const AIResponseRenderer: React.FC<AIResponseRendererProps> = ({
  content,
  isStreaming = false,
  className = '',
  formatOptions,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 流式阶段不解析 Markdown，直接显示纯文本；完成后才渲染
  const formattedHTML = useMemo(() => {
    if (!content || isStreaming) return '';
    return formatAIResponse(content, formatOptions);
  }, [content, isStreaming, formatOptions]);

  // 处理代码块折叠功能
  useEffect(() => {
    if (!containerRef.current) return;

    const handleToggleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const button = target.closest('.ai-response-code-block-toggle') as HTMLButtonElement;

      if (!button) return;

      const targetId = button.getAttribute('data-target');
      if (!targetId) return;

      const codeBlock = document.getElementById(targetId);
      if (!codeBlock) return;

      const isExpanded = button.getAttribute('aria-expanded') === 'true';

      if (isExpanded) {
        codeBlock.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
      } else {
        codeBlock.classList.remove('collapsed');
        button.setAttribute('aria-expanded', 'true');
      }
    };

    const container = containerRef.current;
    container.addEventListener('click', handleToggleClick);

    return () => {
      container.removeEventListener('click', handleToggleClick);
    };
  }, [formattedHTML]);

  return (
    <div
      ref={containerRef}
      className={`ai-response-container ${className}`}
      data-streaming={isStreaming}
    >
      {isStreaming ? (
        // 流式阶段：纯文本逐字显示，保留换行
        <div className="ai-response ai-response--streaming">
          {content}
        </div>
      ) : (
        // 完成后：渲染 Markdown
        <div
          className="ai-response"
          dangerouslySetInnerHTML={{ __html: formattedHTML }}
        />
      )}
    </div>
  );
};

/**
 * 内联样式（可选）
 */
const inlineStyles = `
.ai-response--streaming {
  white-space: pre-wrap;
  word-break: break-word;
}
`;

// 注入样式
if (typeof document !== 'undefined') {
  const styleId = 'ai-response-renderer-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = inlineStyles;
    document.head.appendChild(style);
  }
}

export default AIResponseRenderer;
