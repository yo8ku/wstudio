/**
 * 段落分块器
 */

import { BaseChunker } from '../BaseChunker';
import { ChunkResult, ChunkerOptions, TextChunk } from '../types';

export class ParagraphChunker extends BaseChunker {
  constructor() {
    super({
      name: 'paragraph',
      defaultChunkSize: 1000,
      defaultOverlap: 100,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const paragraphs = this.splitIntoParagraphs(text);
    const chunks: TextChunk[] = [];
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let startIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphLength = paragraph.length;

      if (currentLength + paragraphLength > opts.chunkSize && currentChunk.length > 0) {
        // 创建分块
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          content: chunkText,
          startIndex,
          endIndex: startIndex + chunkText.length,
        });

        // 准备下一个分块，包含重叠
        const overlapParagraphs = this.getOverlapParagraphs(
          currentChunk,
          opts.chunkOverlap
        );
        currentChunk = [...overlapParagraphs, paragraph];
        currentLength = currentChunk.join('\n\n').length;
        startIndex = startIndex + chunkText.length - overlapParagraphs.join('\n\n').length;
      } else {
        currentChunk.push(paragraph);
        currentLength += paragraphLength + 2; // +2 for \n\n
      }
    }

    // 添加最后一个分块
    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n\n');
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
   * 将文本分割成段落
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /**
   * 获取重叠的段落
   */
  private getOverlapParagraphs(paragraphs: string[], overlapSize: number): string[] {
    const overlap: string[] = [];
    let length = 0;

    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const paragraph = paragraphs[i];
      if (length + paragraph.length > overlapSize) {
        break;
      }
      overlap.unshift(paragraph);
      length += paragraph.length + 2;
    }

    return overlap;
  }
}




















