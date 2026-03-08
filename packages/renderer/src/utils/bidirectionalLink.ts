/**
 * bidirectionalLink.ts
 * 双向链接文本工具
 * 功能：将编辑器选中文本规范化为可插入的 wikilink 文本，避免重复包裹方括号。
 */

const normalizeSelectedReference = (selection: string): string => {
  const trimmedSelection = selection.trim();
  if (!trimmedSelection) {
    return '';
  }

  const wikilinkMatch = trimmedSelection.match(/^\[\[([\s\S]+)\]\]$/);
  if (wikilinkMatch) {
    return wikilinkMatch[1].trim();
  }

  const mentionMatch = trimmedSelection.match(/^\[([^\]]+)\]$/);
  if (mentionMatch) {
    return mentionMatch[1].trim();
  }

  return trimmedSelection;
};

export const buildBidirectionalLinkText = (selection: string): string | null => {
  const normalizedReference = normalizeSelectedReference(selection);
  return normalizedReference ? `[[${normalizedReference}]]` : null;
};
