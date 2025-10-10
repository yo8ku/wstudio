/**
 * 句子分块器
 */

import { BaseChunker } from '../BaseChunker';
import { ChunkResult, ChunkerOptions, TextChunk } from '../types';

export class SentenceChunker extends BaseChunker {
  constructor() {
    super({
      name: 'sentence',
      defaultChunkSize: 500,
      defaultOverlap: 50,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const sentences = this.splitIntoSentences(text);
    const chunks: TextChunk[] = [];
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;

      if (currentLength + sentenceLength > opts.chunkSize && currentChunk.length > 0) {
        // 创建分块
        const chunkText = currentChunk.join(' ');
        chunks.push({
          content: chunkText,
          startIndex,
          endIndex: startIndex + chunkText.length,
        });

        // 准备下一个分块，包含重叠
        const overlapSentences = this.getOverlapSentences(
          currentChunk,
          opts.chunkOverlap
        );
        currentChunk = [...overlapSentences, sentence];
        currentLength = currentChunk.join(' ').length;
        startIndex = startIndex + chunkText.length - overlapSentences.join(' ').length;
      } else {
        currentChunk.push(sentence);
        currentLength += sentenceLength + 1; // +1 for space
      }
    }

    // 添加最后一个分块
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ');
      chunks.push({
        content: chunkText,
        startIndex,
        endIndex: startIndex + chunkText.length,
      });
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }

  /**
   * 将文本分割成句子
   */
  private splitIntoSentences(text: string): string[] {
    // 使用正则表达式分割句子
    const sentencePattern = /[^.!?。！？]+[.!?。！？]+/g;
    const matches = text.match(sentencePattern);
    const sentences: string[] = matches ? Array.from(matches) : [];
    
    // 处理剩余文本（没有句子终止符的部分）
    const lastSentenceEnd = sentences.join('').length;
    const remaining = text.slice(lastSentenceEnd).trim();
    if (remaining) {
      sentences.push(remaining);
    }

    return sentences.map((s) => s.trim()).filter(Boolean);
  }

  /**
   * 获取重叠的句子
   */
  private getOverlapSentences(sentences: string[], overlapSize: number): string[] {
    const overlap: string[] = [];
    let length = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      if (length + sentence.length > overlapSize) {
        break;
      }
      overlap.unshift(sentence);
      length += sentence.length + 1;
    }

    return overlap;
  }
}




















