/**
 * 父子索引切分器
 * 功能：实现父子索引切分策略，创建父块（大块）和子块（小块）的层级关系
 * 描述：
 * 1. 父块切分规则（优先级从高到低）：
 *    a. 语义切分：遇到以下符号时切分
 *       - 中文序号：一、二、三...十、十一、十二...（格式：中文数字 + 、或.）
 *       - Markdown 标题：#、##、###、####、#####、######
 *    b. 固定字符数切分：500字符，重叠125字符（当没有语义切分点时使用）
 * 2. 如果文档内容 ≤ 父块字符数（500），则只生成一个父块
 * 3. 切分后使用重叠规则，后续父块会重叠前一个父块的部分内容（125字符）
 * 4. 将每个父块进一步切分成多个微小的子块，使用递归切分策略
 * 5. 建立父子关系，记录子块属于哪个父块
 * 6. 只对子块进行向量化，父块作为原始文本存储
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { generateUUID } from '../utils/uuid.js';
import { ChunkOptions, Chunk } from '../types.js';

/**
 * 父块接口
 */
export interface ParentChunk {
  id: string;
  content: string;
  chunkIndex: number;
  metadata: {
    chunk_index: number;
    chunk_size: number;
    chunk_type: 'parent';
    /** 父块的标签列表（如果使用标签标识切分） */
    tags?: string[];
    /** 切分方式：'tag' 表示基于标签，'token' 表示基于 tokens，'semantic' 表示基于语义（中文序号/Markdown标题） */
    chunk_method?: 'tag' | 'token' | 'semantic';
    [key: string]: unknown;
  };
}

/**
 * 子块接口（继承 Chunk，增加父块ID）
 */
export interface ChildChunk extends Chunk {
  parentId: string;
  metadata: {
    chunk_index: number;
    chunk_size: number;
    chunk_type: 'child';
    parent_chunk_index: number;
    parent_chunk_id: string;
    [key: string]: unknown;
  };
}

/**
 * 父子索引切分结果
 */
export interface ParentChildChunkResult {
  parentChunks: ParentChunk[];
  childChunks: ChildChunk[];
  totalParentChunks: number;
  totalChildChunks: number;
}

/**
 * 标签标识匹配结果
 */
interface TagMatch {
  /** 匹配位置 */
  index: number;
  /** 标签列表 */
  tags: string[];
  /** 完整匹配文本 */
  fullMatch: string;
}

/**
 * 父子索引切分器配置
 */
export interface ParentChildChunkerConfig {
  /** 父块大小（字符数，内置固定值1500） */
  parentChunkSize?: number;
  /** 父块重叠大小（字符数，内置固定值100） */
  parentChunkOverlap?: number;
  /** 子块最大大小（字符数，内置固定值200，实际大小由递归优先级决定） */
  childChunkSize?: number;
  /** 子块重叠大小（字符数，内置固定值30） */
  childChunkOverlap?: number;
  /** 子块切分分隔符（按优先级从高到低排序） */
  childSeparators?: string[];
  /** 是否启用标签标识切分（默认 true） */
  enableTagBasedChunking?: boolean;
}

/**
 * 父子索引切分器
 */
export class ParentChildChunker {
  // 内置固定配置（不允许用户自定义）
  private static readonly PARENT_CHUNK_SIZE = 500; // 父块大小（字符数）
  private static readonly PARENT_CHUNK_OVERLAP = 125; // 父块重叠大小（字符数，100-150之间）
  private static readonly CHILD_CHUNK_SIZE = 200; // 子块最大大小（字符数），实际大小由递归优先级决定
  private static readonly CHILD_CHUNK_OVERLAP = 30; // 子块重叠大小（字符数）
  
  private enableTagBasedChunking: boolean;
  private initialized: boolean = false;

  /**
   * 开始标识正则表达式：[~S#标签，#标签2，....]
   * 匹配格式：[~S#标签1，#标签2，#标签3]
   */
  private static readonly START_TAG_REGEX = /\[~S([^\]]+)\]/g;

  /**
   * 结束标识正则表达式：[~E#标签，#标签2，....]
   * 匹配格式：[~E#标签1，#标签2，#标签3]
   */
  private static readonly END_TAG_REGEX = /\[~E([^\]]+)\]/g;

  /**
   * 默认子块切分分隔符（按优先级从高到低）
   * 切分规则：
   * 1. 段落换行 (\n\n, \r\n\r\n)
   * 2. 强制换行 (\n, \r)
   * 3. 中文句子结束符："。" (句号), "！" (感叹号), "？" (问号)
   * 4. 英文句子结束符：".", "!", "?"
   * 5. 次级分隔符：";", "，" (逗号 - 仅在句子太长不得不切断时使用)
   */
  private static readonly DEFAULT_CHILD_SEPARATORS = [
    '\n\n',      // 段落换行（最高优先级）
    '\r\n\r\n',  // Windows 段落换行
    '\n',        // 强制换行
    '\r',        // 强制换行（Mac）
    '。',        // 中文句号
    '！',        // 中文感叹号
    '？',        // 中文问号
    '.',         // 英文句号
    '!',         // 英文感叹号
    '?',         // 英文问号
    ';',         // 分号（次级分隔符）
    '，',        // 中文逗号（次级分隔符，仅在句子太长时使用）
  ];

  constructor(config?: ParentChildChunkerConfig) {
    // 是否启用标签标识切分（默认启用）
    // 注意：父块和子块的配置都是内置固定的，不允许用户自定义
    this.enableTagBasedChunking = config?.enableTagBasedChunking ?? true;
  }

  /**
   * 初始化切分器
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * 解析标签标识
   * @param tagString 标签字符串，例如："#标签1，#标签2，#标签3"
   * @returns 标签数组
   */
  private parseTags(tagString: string): string[] {
    return tagString
      .split(/[，#,]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.startsWith('#'))
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`);
  }

  /**
   * 查找所有开始标识
   * @param text 文本内容
   * @returns 开始标识匹配结果数组
   */
  private findStartTags(text: string): TagMatch[] {
    const matches: TagMatch[] = [];
    let match: RegExpExecArray | null;

    // 重置正则表达式
    ParentChildChunker.START_TAG_REGEX.lastIndex = 0;

    while ((match = ParentChildChunker.START_TAG_REGEX.exec(text)) !== null) {
      const tags = this.parseTags(match[1]);
      if (tags.length > 0) {
        matches.push({
          index: match.index,
          tags,
          fullMatch: match[0],
        });
      }
    }

    return matches.sort((a, b) => a.index - b.index);
  }

  /**
   * 查找所有结束标识
   * @param text 文本内容
   * @returns 结束标识匹配结果数组
   */
  private findEndTags(text: string): TagMatch[] {
    const matches: TagMatch[] = [];
    let match: RegExpExecArray | null;

    // 重置正则表达式
    ParentChildChunker.END_TAG_REGEX.lastIndex = 0;

    while ((match = ParentChildChunker.END_TAG_REGEX.exec(text)) !== null) {
      const tags = this.parseTags(match[1]);
      if (tags.length > 0) {
        matches.push({
          index: match.index,
          tags,
          fullMatch: match[0],
        });
      }
    }

    return matches.sort((a, b) => a.index - b.index);
  }

  /**
   * 基于标签标识切分父块
   * @param text 文本内容
   * @returns 父块数组
   */
  private async chunkByTags(text: string): Promise<ParentChunk[]> {
    const startTags = this.findStartTags(text);
    const endTags = this.findEndTags(text);

    // 如果没有找到任何标签标识，返回空数组（将使用默认的 token 切分）
    if (startTags.length === 0 && endTags.length === 0) {
      return [];
    }

    const parentChunks: ParentChunk[] = [];
    let currentIndex = 0;
    let chunkIndex = 0;

    // 处理开始标识和结束标识的配对
    let startTagIndex = 0;
    let endTagIndex = 0;

    while (startTagIndex < startTags.length || endTagIndex < endTags.length) {
      // 找到下一个开始标识
      const nextStart = startTagIndex < startTags.length ? startTags[startTagIndex] : null;
      const nextEnd = endTagIndex < endTags.length ? endTags[endTagIndex] : null;

      // 如果还有未处理的内容在当前索引之前，先处理它（使用默认 token 切分）
      if (nextStart && currentIndex < nextStart.index) {
        const contentBefore = text.substring(currentIndex, nextStart.index).trim();
        if (contentBefore.length > 0) {
          // 对这部分内容使用默认 token 切分
          const tokenChunks = await this.chunkByTokens(contentBefore);
          tokenChunks.forEach(chunk => {
            parentChunks.push({
              ...chunk,
              chunkIndex: chunkIndex++,
            });
          });
        }
        currentIndex = nextStart.index;
      }

      // 处理标签标识块
      if (nextStart) {
        // 找到对应的结束标识（在开始标识之后）
        let matchingEnd: TagMatch | null = null;
        for (let i = endTagIndex; i < endTags.length; i++) {
          if (endTags[i].index > nextStart.index) {
            // 检查标签是否匹配（至少有一个标签相同）
            const hasMatchingTag = nextStart.tags.some(tag => endTags[i].tags.includes(tag));
            if (hasMatchingTag) {
              matchingEnd = endTags[i];
              endTagIndex = i + 1;
              break;
            }
          }
        }

        if (matchingEnd) {
          // 找到匹配的结束标识，提取父块内容
          const startPos = nextStart.index + nextStart.fullMatch.length;
          const endPos = matchingEnd.index;
          const content = text.substring(startPos, endPos).trim();

          if (content.length > 0) {
            // 合并开始和结束标识的标签
            const allTags = [...new Set([...nextStart.tags, ...matchingEnd.tags])];

            parentChunks.push({
              id: generateUUID(),
              content,
              chunkIndex: chunkIndex++,
              metadata: {
                chunk_index: chunkIndex - 1,
                chunk_size: content.length,
                chunk_type: 'parent',
                tags: allTags,
                chunk_method: 'tag',
              },
            });
          }

          currentIndex = matchingEnd.index + matchingEnd.fullMatch.length;
        } else {
          // 没有找到匹配的结束标识，回退到 token 切分
          // 从开始标识到文本末尾或下一个开始标识，使用 token 切分
          const startPos = nextStart.index + nextStart.fullMatch.length;
          const endPos = startTagIndex + 1 < startTags.length 
            ? startTags[startTagIndex + 1].index 
            : text.length;
          const content = text.substring(startPos, endPos).trim();

          if (content.length > 0) {
            // 使用 token 切分处理这部分内容
            const tokenChunks = await this.chunkByTokens(content);
            tokenChunks.forEach(chunk => {
              parentChunks.push({
                ...chunk,
                chunkIndex: chunkIndex++,
                metadata: {
                  ...chunk.metadata,
                  tags: nextStart.tags, // 保留开始标识的标签信息
                },
              });
            });
          }

          currentIndex = endPos;
        }

        startTagIndex++;
      } else if (nextEnd) {
        // 只有结束标识，没有对应的开始标识，回退到 token 切分
        // 从当前索引到结束标识，使用 token 切分
        const content = text.substring(currentIndex, nextEnd.index).trim();
        if (content.length > 0) {
          // 使用 token 切分处理这部分内容
          const tokenChunks = await this.chunkByTokens(content);
          tokenChunks.forEach(chunk => {
            parentChunks.push({
              ...chunk,
              chunkIndex: chunkIndex++,
              metadata: {
                ...chunk.metadata,
                tags: nextEnd.tags, // 保留结束标识的标签信息
              },
            });
          });
        }
        currentIndex = nextEnd.index + nextEnd.fullMatch.length;
        endTagIndex++;
      }
    }

    // 处理剩余的内容（在最后一个标识之后）
    if (currentIndex < text.length) {
      const remainingContent = text.substring(currentIndex).trim();
      if (remainingContent.length > 0) {
        // 对剩余内容使用默认 token 切分
        const tokenChunks = await this.chunkByTokens(remainingContent);
        tokenChunks.forEach(chunk => {
          parentChunks.push({
            ...chunk,
            chunkIndex: chunkIndex++,
          });
        });
      }
    }

    return parentChunks;
  }

  /**
   * 父块语义切分正则表达式
   * 匹配：
   * 1. 中文序号：一、二、三...十、十一、十二...（格式：中文数字 + 、或.）
   * 2. Markdown 标题：#、##、###、####、#####、######（必须在行首）
   */
  private static readonly PARENT_SEMANTIC_SPLIT_REGEX = /(?:^|\n)(?:#{1,6}\s|[一二三四五六七八九十]+[、.])/g;

  /**
   * 查找所有父块语义切分点
   * @param text 文本内容
   * @returns 切分点位置数组（每个位置是切分符的起始位置）
   */
  private findParentSplitPoints(text: string): number[] {
    const splitPoints: number[] = [];
    
    // 重置正则表达式
    ParentChildChunker.PARENT_SEMANTIC_SPLIT_REGEX.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = ParentChildChunker.PARENT_SEMANTIC_SPLIT_REGEX.exec(text)) !== null) {
      // 如果匹配以换行符开头，切分点应该在换行符之后
      const matchStart = match[0].startsWith('\n') ? match.index + 1 : match.index;
      splitPoints.push(matchStart);
    }
    
    return splitPoints;
  }

  /**
   * 基于语义切分父块
   * 切分规则：
   * 1. 从文件开头（位置0）开始
   * 2. 遇到中文序号（一、二、三...）或 Markdown 标题（#）时，停止当前块
   * 3. 下一个块从切分符位置开始，并重叠前一个块末尾的部分内容
   * 
   * 示例：
   * 文本："开头内容...一、第一章内容...二、第二章内容..."
   * 切分结果：
   * - 第1个父块：从0到"一、"之前
   * - 第2个父块：从"一、"开始（含重叠）到"二、"之前
   * - 第3个父块：从"二、"开始（含重叠）到末尾
   * 
   * @param text 文本内容
   * @returns 父块数组
   */
  private chunkBySemanticSplit(text: string): ParentChunk[] {
    const trimmedText = text.trim();
    
    if (trimmedText.length === 0) {
      return [];
    }
    
    // 查找所有切分点
    const splitPoints = this.findParentSplitPoints(trimmedText);
    
    // 如果没有找到切分点，返回空数组（将使用默认的 token 切分）
    if (splitPoints.length === 0) {
      return [];
    }
    
    const parentChunks: ParentChunk[] = [];
    const overlap = ParentChildChunker.PARENT_CHUNK_OVERLAP;
    
    // 构建切分区间：[0, 第一个切分点), [第一个切分点, 第二个切分点), ..., [最后一个切分点, 末尾]
    // 如果第一个切分点不是0，需要先处理开头到第一个切分点的内容
    const firstSplitPoint = splitPoints[0];
    
    // 第1个父块：从文件开头到第一个切分符之前
    if (firstSplitPoint > 0) {
      const content = trimmedText.substring(0, firstSplitPoint).trim();
      if (content.length > 0) {
        parentChunks.push({
          id: generateUUID(),
          content,
          chunkIndex: parentChunks.length,
          metadata: {
            chunk_index: parentChunks.length,
            chunk_size: content.length,
            chunk_type: 'parent' as const,
            chunk_method: 'semantic' as const,
          },
        });
      }
    }
    
    // 处理每个切分点到下一个切分点的内容
    for (let i = 0; i < splitPoints.length; i++) {
      const currentSplitPoint = splitPoints[i];
      const nextSplitPoint = i + 1 < splitPoints.length ? splitPoints[i + 1] : trimmedText.length;
      
      // 计算重叠起始位置：从前一个块末尾往前取 overlap 个字符
      // 但不能超过当前切分点
      let overlapStart = currentSplitPoint;
      if (parentChunks.length > 0 && currentSplitPoint > overlap) {
        overlapStart = currentSplitPoint - overlap;
      }
      
      // 提取内容：从重叠起始位置到下一个切分点
      const content = trimmedText.substring(overlapStart, nextSplitPoint).trim();
      
      if (content.length > 0) {
        parentChunks.push({
          id: generateUUID(),
          content,
          chunkIndex: parentChunks.length,
          metadata: {
            chunk_index: parentChunks.length,
            chunk_size: content.length,
            chunk_type: 'parent' as const,
            chunk_method: 'semantic' as const,
          },
        });
      }
    }
    
    return parentChunks;
  }

  /**
   * 基于 tokens 切分父块（默认切分方式）
   * 切分规则：
   * 1. 优先使用语义切分（中文序号、Markdown 标题）
   * 2. 如果没有语义切分点，使用固定字符数切分（500 字符，125 字符重叠）
   * 3. 如果文档内容 ≤ 父块字符数，则只生成一个父块
   * @param text 文本内容
   * @returns 父块数组
   */
  private async chunkByTokens(text: string): Promise<ParentChunk[]> {
    const trimmedText = text.trim();
    
    // 如果文档内容为空，返回空数组
    if (trimmedText.length === 0) {
      return [];
    }
    
    // 优先尝试语义切分
    const semanticChunks = this.chunkBySemanticSplit(trimmedText);
    if (semanticChunks.length > 0) {
      return semanticChunks;
    }
    
    // 如果文档内容 ≤ 父块字符数，直接作为一个父块返回
    if (trimmedText.length <= ParentChildChunker.PARENT_CHUNK_SIZE) {
      return [{
        id: generateUUID(),
        content: trimmedText,
        chunkIndex: 0,
        metadata: {
          chunk_index: 0,
          chunk_size: trimmedText.length,
          chunk_type: 'parent' as const,
          chunk_method: 'token' as const,
        },
      }];
    }

    // 计算有效的切分大小（确保能产生多个块）
    // 重叠不能超过块大小的一半，否则会导致切分异常
    const effectiveOverlap = Math.min(
      ParentChildChunker.PARENT_CHUNK_OVERLAP,
      Math.floor(ParentChildChunker.PARENT_CHUNK_SIZE / 2)
    );

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: ParentChildChunker.PARENT_CHUNK_SIZE,
      chunkOverlap: effectiveOverlap,
      // 父块只使用段落分隔符，避免按行切分导致父块过小
      // 如果没有段落分隔符，则按字符数强制切分
      separators: ['\n\n'],
    });

    // 使用 LangChain 的异步方法创建文档
    const documents = await splitter.createDocuments([trimmedText]);

    // 如果 splitter 只返回一个块但内容超过阈值，手动切分
    if (documents.length === 1 && trimmedText.length > ParentChildChunker.PARENT_CHUNK_SIZE) {
      const manualChunks: ParentChunk[] = [];
      const chunkSize = ParentChildChunker.PARENT_CHUNK_SIZE;
      const overlap = effectiveOverlap;
      let startIndex = 0;
      let chunkIndex = 0;

      while (startIndex < trimmedText.length) {
        const endIndex = Math.min(startIndex + chunkSize, trimmedText.length);
        const content = trimmedText.substring(startIndex, endIndex);
        
        manualChunks.push({
          id: generateUUID(),
          content,
          chunkIndex,
          metadata: {
            chunk_index: chunkIndex,
            chunk_size: content.length,
            chunk_type: 'parent' as const,
            chunk_method: 'token' as const,
          },
        });

        // 下一个块的起始位置（考虑重叠）
        startIndex = endIndex - overlap;
        chunkIndex++;

        // 如果剩余内容小于重叠大小，停止
        if (trimmedText.length - startIndex <= overlap) {
          break;
        }
      }

      return manualChunks;
    }

    return documents.map((doc, index): ParentChunk => ({
      id: generateUUID(),
      content: doc.pageContent,
      chunkIndex: index,
      metadata: {
        chunk_index: index,
        chunk_size: doc.pageContent.length,
        chunk_type: 'parent' as const,
        chunk_method: 'token' as const,
        ...(doc.metadata || {}),
      },
    })).filter(chunk => chunk.content.length > 0);
  }

  /**
   * 创建父块切分器（已废弃，使用 chunkByTags 和 chunkByTokens 替代）
   * @deprecated 使用 chunkByTags 和 chunkByTokens 方法替代
   */
  private createParentSplitter(): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      chunkSize: ParentChildChunker.PARENT_CHUNK_SIZE,
      chunkOverlap: ParentChildChunker.PARENT_CHUNK_OVERLAP,
      // 父块使用简单的分隔符，优先按段落切分
      separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?'],
    });
  }

  /**
   * 创建子块切分器
   * 使用内置固定的配置：500 字符，100 字符重叠，内置分隔符
   */
  private createChildSplitter(): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      chunkSize: ParentChildChunker.CHILD_CHUNK_SIZE,
      chunkOverlap: ParentChildChunker.CHILD_CHUNK_OVERLAP,
      separators: ParentChildChunker.DEFAULT_CHILD_SEPARATORS,
    });
  }

  /**
   * 对文本进行父子索引切分
   * @param text 要切分的文本
   * @param options 切分选项（可选，会覆盖默认配置）
   * @returns 父子索引切分结果
   */
  async chunkText(
    text: string,
    options?: Partial<ParentChildChunkerConfig> & ChunkOptions
  ): Promise<ParentChildChunkResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      return {
        parentChunks: [],
        childChunks: [],
        totalParentChunks: 0,
        totalChildChunks: 0,
      };
    }

    // 使用内置固定配置（不允许用户自定义）
    const enableTagBasedChunking = options?.enableTagBasedChunking ?? this.enableTagBasedChunking;

    // 步骤1：创建父块（大块）
    let parentChunks: ParentChunk[] = [];

    if (enableTagBasedChunking) {
      // 优先使用标签标识切分
      const tagChunks = await this.chunkByTags(text);
      
      if (tagChunks.length > 0) {
        // 使用标签切分的结果
        parentChunks = tagChunks.map((chunk, index) => ({
          ...chunk,
          chunkIndex: index,
          metadata: {
            ...chunk.metadata,
            chunk_index: index,
            ...(options as Record<string, unknown>),
          },
        }));
      } else {
        // 没有找到标签标识，使用默认的 token 切分
        const tokenChunks = await this.chunkByTokens(text);
        parentChunks = tokenChunks.map((chunk, index) => ({
          ...chunk,
          chunkIndex: index,
          metadata: {
            ...chunk.metadata,
            chunk_index: index,
            ...(options as Record<string, unknown>),
          },
        }));
      }
    } else {
      // 直接使用 token 切分
      const tokenChunks = await this.chunkByTokens(text);
      parentChunks = tokenChunks.map((chunk, index) => ({
        ...chunk,
        chunkIndex: index,
        metadata: {
          ...chunk.metadata,
          chunk_index: index,
          ...(options as Record<string, unknown>),
        },
      }));
    }

    // 步骤2：为每个父块生成子块（小块）
    // 使用内置固定的子块配置
    const childSplitter = this.createChildSplitter();

    const childChunks: ChildChunk[] = [];

    for (let parentIndex = 0; parentIndex < parentChunks.length; parentIndex++) {
      const parentChunk = parentChunks[parentIndex];
      
      // 将父块内容切分成子块
      const childDocuments = await childSplitter.createDocuments([parentChunk.content]);
      
      // 为每个子块建立父子关系
      childDocuments.forEach((childDoc, childIndex) => {
        const childChunk: ChildChunk = {
          id: generateUUID(),
          content: childDoc.pageContent,
          parentId: parentChunk.id,
          metadata: {
            chunk_index: childIndex,
            chunk_size: childDoc.pageContent.length,
            chunk_type: 'child',
            parent_chunk_index: parentIndex,
            parent_chunk_id: parentChunk.id,
            ...(options as Record<string, unknown>),
            ...(childDoc.metadata || {}),
          },
        };
        
        childChunks.push(childChunk);
      });
    }

    return {
      parentChunks,
      childChunks,
      totalParentChunks: parentChunks.length,
      totalChildChunks: childChunks.length,
    };
  }

  /**
   * 对多个文档进行父子索引切分
   * @param documents 文档列表
   * @param options 切分选项
   * @returns 父子索引切分结果
   */
  async chunkDocuments(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    options?: Partial<ParentChildChunkerConfig> & ChunkOptions
  ): Promise<ParentChildChunkResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!documents || documents.length === 0) {
      return {
        parentChunks: [],
        childChunks: [],
        totalParentChunks: 0,
        totalChildChunks: 0,
      };
    }

    // 合并所有文档的切分结果
    const allParentChunks: ParentChunk[] = [];
    const allChildChunks: ChildChunk[] = [];

    for (const doc of documents) {
      if (!doc.content || doc.content.trim().length === 0) {
        continue;
      }

      // 对每个文档进行父子索引切分
      const result = await this.chunkText(doc.content, {
        ...options,
        ...(doc.metadata as Record<string, unknown>),
      });

      // 合并结果，并更新元数据
      const baseMetadata = doc.metadata || {};
      
      result.parentChunks.forEach(parentChunk => {
        allParentChunks.push({
          ...parentChunk,
          metadata: {
            ...parentChunk.metadata,
            ...baseMetadata,
          },
        });
      });

      result.childChunks.forEach(childChunk => {
        allChildChunks.push({
          ...childChunk,
          metadata: {
            ...childChunk.metadata,
            ...baseMetadata,
          },
        });
      });
    }

    return {
      parentChunks: allParentChunks,
      childChunks: allChildChunks,
      totalParentChunks: allParentChunks.length,
      totalChildChunks: allChildChunks.length,
    };
  }

  /**
   * 关闭切分器
   */
  async close(): Promise<void> {
    this.initialized = false;
  }
}

