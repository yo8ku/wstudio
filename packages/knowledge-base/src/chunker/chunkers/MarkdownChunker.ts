/**
 * Markdown 分块器（基于标题层级）
 */

import { BaseChunker } from '../BaseChunker';
import { ChunkResult, ChunkerOptions, TextChunk } from '../types';

export class MarkdownChunker extends BaseChunker {
  constructor() {
    super({
      name: 'markdown',
      defaultChunkSize: 1500,
      defaultOverlap: 150,
    });
  }

  async chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult> {
    const opts = this.normalizeOptions(options);
    const sections = this.extractSections(text);
    const chunks: TextChunk[] = [];

    for (const section of sections) {
      if (section.content.length <= opts.chunkSize) {
        // 章节足够小，直接作为一个分块
        chunks.push({
          content: section.content,
          startIndex: section.startIndex,
          endIndex: section.endIndex,
          metadata: {
            heading: section.heading,
            level: section.level,
          },
        });
      } else {
        // 章节太大，进一步分割
        const subChunks = await this.splitLargeSection(section, opts);
        chunks.push(...subChunks);
      }
    }

    return {
      chunks,
      metadata: this.calculateMetadata(chunks),
    };
  }

  /**
   * 提取 Markdown 章节
   */
  private extractSections(text: string): Array<{
    heading: string;
    level: number;
    content: string;
    startIndex: number;
    endIndex: number;
  }> {
    const sections: any[] = [];
    const lines = text.split('\n');
    let currentSection: any = null;
    let currentContent: string[] = [];
    let currentIndex = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 保存上一个章节
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          currentSection.endIndex = currentIndex;
          sections.push(currentSection);
        }

        // 创建新章节
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        
        currentSection = {
          heading,
          level,
          content: line + '\n',
          startIndex: currentIndex,
          endIndex: currentIndex,
        };
        currentContent = [line];
      } else if (currentSection) {
        currentContent.push(line);
      }

      currentIndex += line.length + 1;
    }

    // 保存最后一个章节
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      currentSection.endIndex = currentIndex;
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 分割大章节
   */
  private async splitLargeSection(
    section: any,
    opts: Required<ChunkerOptions>
  ): Promise<TextChunk[]> {
    const chunks: TextChunk[] = [];
    const content = section.content;
    const chunkSize = opts.chunkSize;
    const overlap = opts.chunkOverlap;
    const step = chunkSize - overlap;

    for (let i = 0; i < content.length; i += step) {
      const end = Math.min(i + chunkSize, content.length);
      const chunkContent = content.slice(i, end).trim();

      chunks.push({
        content: chunkContent,
        startIndex: section.startIndex + i,
        endIndex: section.startIndex + end,
        metadata: {
          heading: section.heading,
          level: section.level,
          partIndex: chunks.length,
        },
      });

      if (end >= content.length) {
        break;
      }
    }

    return chunks;
  }
}




















