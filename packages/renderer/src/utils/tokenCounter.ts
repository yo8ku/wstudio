/**
 * Token 计数工具
 * 功能：估算文本的 token 数量
 * 描述：使用简单的启发式方法估算，1个token约为4个字符或0.75个单词
 */

/**
 * 估算文本的 token 数量
 * 对于英文：约 0.75 tokens/word
 * 对于中文：约 1 token/character
 * 这是一个近似值，实际 token 数量取决于具体的 tokenizer
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  // 分离中文和英文字符
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const nonChineseText = text.replace(/[\u4e00-\u9fa5]/g, '');
  
  // 中文字符：每个字符约 1 token
  const chineseTokens = chineseChars.length;
  
  // 英文和其他字符：每 4 个字符约 1 token
  const nonChineseTokens = Math.ceil(nonChineseText.length / 4);
  
  return chineseTokens + nonChineseTokens;
}

/**
 * 格式化 token 数量显示
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}








