/**
 * AI 会话标题工具。
 * 从首条用户消息提取会话标题，并负责标准化与截断。
 */

export const DEFAULT_CHAT_SESSION_TITLE = '新对话';

export function normalizeChatSessionTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized || DEFAULT_CHAT_SESSION_TITLE;
}

export function truncateChatSessionTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) {
    return title;
  }

  return `${title.slice(0, maxLength)}...`;
}

export function getChatSessionTitle(content: string): string {
  return normalizeChatSessionTitle(content);
}

export function getChatSessionTitleFromMessages<T extends { role: string; content: string }>(
  messages: readonly T[]
): string {
  const firstUserMessage = messages.find(
    (message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim().length > 0
  );

  return firstUserMessage ? getChatSessionTitle(firstUserMessage.content) : DEFAULT_CHAT_SESSION_TITLE;
}
