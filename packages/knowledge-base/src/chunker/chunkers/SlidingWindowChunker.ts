/**
 * 滑动窗口分块器
 */

import { BaseChunker } from '../BaseChunker';
import { ChunkResult, ChunkerOptions, TextChunk } from '../types';

export class SlidingWindowChunker extends BaseChunker {
  constructor() {
    super({
      name: 'sliding-window',
      defaultChunkSize: 1000,
      defaultOverlap: 200,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const chunks: TextChunk[] = [];
    
    const chunkSize = opts.chunkSize;
    const overlap = opts.chunkOverlap;
    const step = chunkSize - overlap;

    for (let i = 0; i < text.length; i += step) {
      const end = Math.min(i + chunkSize, text.length);
      const content = text.slice(i, end).trim();

      if (content.length >= opts.minChunkSize) {
        chunks.push({
          content,
          startIndex: i,
          endIndex: end,
        });
      }

      if (end >= text.length) {
        break;
      }
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }
}




















