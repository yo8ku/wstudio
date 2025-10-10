/**
 * 自定义分块器示例
 */

import { BaseChunker, ChunkResult, ChunkerOptions, TextChunk } from '../src';

/**
 * 固定大小分块器（不考虑单词边界）
 */
export class FixedSizeChunker extends BaseChunker {
  constructor() {
    super({
      name: 'fixed-size',
      defaultChunkSize: 500,
      defaultOverlap: 50,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const chunks: TextChunk[] = [];
    
    const chunkSize = opts.chunkSize;
    const overlap = opts.chunkOverlap;

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const end = Math.min(i + chunkSize, text.length);
      const content = text.slice(i, end);

      chunks.push({
        content,
        startIndex: i,
        endIndex: end,
        metadata: {
          index: chunks.length,
        },
      });

      if (end >= text.length) break;
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }
}

/**
 * 基于分隔符的分块器
 */
export class DelimiterChunker extends BaseChunker {
  constructor() {
    super({
      name: 'delimiter',
      defaultChunkSize: 1000,
      defaultOverlap: 0,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const delimiters = opts.customDelimiters || ['\n\n', '\n', '. ', ' '];
    
    const chunks: TextChunk[] = [];
    let currentChunk = '';
    let startIndex = 0;

    // 使用第一个有效的分隔符分割文本
    for (const delimiter of delimiters) {
      const parts = text.split(delimiter);
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (currentChunk.length + part.length > opts.chunkSize && currentChunk) {
          chunks.push({
            content: currentChunk.trim(),
            startIndex,
            endIndex: startIndex + currentChunk.length,
          });
          currentChunk = part;
          startIndex = startIndex + currentChunk.length;
        } else {
          currentChunk += (currentChunk ? delimiter : '') + part;
        }
      }

      if (chunks.length > 0) break; // 如果找到了合适的分隔符就停止
    }

    // 添加最后一个分块
    if (currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        startIndex,
        endIndex: startIndex + currentChunk.length,
      });
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }
}

/**
 * 使用示例
 */
async function example() {
  const { ChunkerRegistry } = await import('../src');
  
  const registry = ChunkerRegistry.getInstance();
  
  // 注册自定义分块器
  registry.register(new FixedSizeChunker());
  registry.register(new DelimiterChunker());

  const text = 'Your long text here...';
  
  // 使用固定大小分块器
  const result1 = await registry.chunk(text, 'fixed-size', {
    chunkSize: 500,
    chunkOverlap: 50,
  });
  console.log('Fixed size chunks:', result1.chunks.length);

  // 使用分隔符分块器
  const result2 = await registry.chunk(text, 'delimiter', {
    customDelimiters: ['\n\n', '\n'],
  });
  console.log('Delimiter chunks:', result2.chunks.length);
}

// example().catch(console.error);




























































