/**
 * 语义分块器（基于主题相似度）
 */

import { BaseChunker } from '../BaseChunker';
import { ChunkResult, ChunkerOptions, TextChunk } from '../types';

export class SemanticChunker extends BaseChunker {
  constructor() {
    super({
      name: 'semantic',
      defaultChunkSize: 800,
      defaultOverlap: 100,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    
    // 首先按句子分割
    const sentences = this.splitIntoSentences(text);
    
    // 使用启发式方法进行语义分组
    const semanticGroups = this.groupBySemantic(sentences, opts);
    
    // 转换为分块
    const chunks: TextChunk[] = [];
    let currentIndex = 0;

    for (const group of semanticGroups) {
      const content = group.join(' ');
      chunks.push({
        content,
        startIndex: currentIndex,
        endIndex: currentIndex + content.length,
      });
      currentIndex += content.length + 1;
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }

  /**
   * 分割成句子
   */
  private splitIntoSentences(text: string): string[] {
    const sentencePattern = /[^.!?。！？]+[.!?。！？]+/g;
    const matches = text.match(sentencePattern);
    const sentences: string[] = matches ? Array.from(matches) : [];
    
    const lastSentenceEnd = sentences.join('').length;
    const remaining = text.slice(lastSentenceEnd).trim();
    if (remaining) {
      sentences.push(remaining);
    }

    return sentences.map((s) => s.trim()).filter(Boolean);
  }

  /**
   * 基于语义进行分组（启发式方法）
   */
  private groupBySemantic(
    sentences: string[],
    opts: Required<ChunkerOptions>
  ): string[][] {
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const nextSentence = sentences[i + 1];

      currentGroup.push(sentence);
      currentLength += sentence.length;

      // 检查是否需要分组
      const shouldSplit = 
        currentLength >= opts.chunkSize ||
        (nextSentence && this.detectTopicChange(sentence, nextSentence));

      if (shouldSplit && currentGroup.length > 0) {
        groups.push([...currentGroup]);
        
        // 添加重叠
        const overlapSentences = this.getLastNSentences(
          currentGroup,
          opts.chunkOverlap
        );
        currentGroup = overlapSentences;
        currentLength = overlapSentences.join(' ').length;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 检测主题变化（简单的启发式方法）
   */
  private detectTopicChange(sentence1: string, sentence2: string): boolean {
    // 检测过渡词
    const transitionWords = [
      '然而', '但是', '不过', '相反', '另一方面',
      'however', 'but', 'on the other hand', 'nevertheless',
      '此外', '另外', '同时', '接下来',
      'moreover', 'additionally', 'furthermore', 'next',
    ];

    const sentence2Lower = sentence2.toLowerCase();
    for (const word of transitionWords) {
      if (sentence2Lower.startsWith(word.toLowerCase())) {
        return true;
      }
    }

    // 检测新段落标记
    if (sentence2.match(/^第[一二三四五六七八九十\d]+[章节部分]/)) {
      return true;
    }

    return false;
  }

  /**
   * 获取最后 N 个句子以实现重叠
   */
  private getLastNSentences(sentences: string[], targetLength: number): string[] {
    const result: string[] = [];
    let length = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      if (length + sentence.length > targetLength) {
        break;
      }
      result.unshift(sentence);
      length += sentence.length;
    }

    return result;
  }
}




















