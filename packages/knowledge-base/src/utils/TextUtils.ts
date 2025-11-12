/**
 * 文本工具类
 */

export class TextUtils {
  /**
   * 清理文本
   */
  static clean(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * 截断文本
   */
  static truncate(text: string, maxLength: number, suffix = '...'): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - suffix.length) + suffix;
  }

  /**
   * 计算词数
   */
  static wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  /**
   * 提取关键词（简单版本）
   */
  static extractKeywords(text: string, topK = 10): string[] {
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3);

    const frequency = new Map<string, number>();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([word]) => word);
  }

  /**
   * 计算文本相似度（简单版本）
   */
  static similarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}




































































