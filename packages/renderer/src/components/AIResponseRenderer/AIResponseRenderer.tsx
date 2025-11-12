/**
 * AI 响应渲染器组件
 * 用于在聊天面板中渲染格式化的 AI 响应
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

  // 格式化 AI 响应
  const formattedHTML = useMemo(() => {
    if (!content) return '';
    return formatAIResponse(content, formatOptions);
  }, [content, formatOptions]);

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
      <div 
        className="ai-response"
        dangerouslySetInnerHTML={{ __html: formattedHTML }}
      />
      
      {/* 流式响应加载指示器 */}
      {isStreaming && (
        <div className="ai-response-streaming-indicator">
          <span className="streaming-dot"></span>
          <span className="streaming-dot"></span>
          <span className="streaming-dot"></span>
        </div>
      )}
    </div>
  );
};

/**
 * 内联样式（可选）
 */
const inlineStyles = `
.ai-response-streaming-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
  align-items: center;
}

.streaming-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--ws-accent-color, #007acc);
  animation: streaming-pulse 1.4s infinite ease-in-out;
}

.streaming-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.streaming-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes streaming-pulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
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

