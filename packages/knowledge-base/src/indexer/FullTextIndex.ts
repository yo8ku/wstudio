/**
 * 全文索引
 */

export class FullTextIndex {
  private index: Map<string, string> = new Map();
  private invertedIndex: Map<string, Set<string>> = new Map();

  /**
   * 添加文档
   */
  async add(id: string, content: string): Promise<void> {
    this.index.set(id, content);

    // 构建倒排索引
    const words = this.tokenize(content);
    for (const word of words) {
      if (!this.invertedIndex.has(word)) {
        this.invertedIndex.set(word, new Set());
      }
      this.invertedIndex.get(word)!.add(id);
    }
  }

  /**
   * 搜索
   */
  async search(query: string, limit = 10): Promise<string[]> {
    const queryWords = this.tokenize(query);
    const candidates = new Map<string, number>();

    for (const word of queryWords) {
      const docIds = this.invertedIndex.get(word);
      if (docIds) {
        for (const docId of docIds) {
          candidates.set(docId, (candidates.get(docId) || 0) + 1);
        }
      }
    }

    return Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }

  /**
   * 删除文档
   */
  async delete(id: string): Promise<void> {
    const content = this.index.get(id);
    if (content) {
      const words = this.tokenize(content);
      for (const word of words) {
        this.invertedIndex.get(word)?.delete(id);
      }
      this.index.delete(id);
    }
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    this.index.clear();
    this.invertedIndex.clear();
  }

  /**
   * 分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2);
  }
}




























































