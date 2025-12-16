/**
 * 文本切分器模块
 * 功能：实现智能的父子块切分，基于语义分隔符进行切分
 * 描述：
 * 
 * 子块切分规则（使用 LangChain RecursiveCharacterTextSplitter）：
 * 1. 切分算法：LangChain 递归字符切分
 * 2. 子块目标大小：250-300 字符
 * 3. 子块重叠：50 字符
 * 4. 分隔符优先级：\n\n > \n > 。 > ！ > ？ > ； > . > : > ： > , > ， > 空格 > 空字符串
 * 5. 如果父块 < 子块最大大小（300），直接作为唯一子块
 * 
 * 父块切分规则：
 * 1. 切分符号（优先使用）：
 *    - 中文序号：一、二、三...十、十一、十二...（格式：中文数字 + 、或.）
 *    - Markdown 标题：#、##、###、####、#####、######（必须在行首）
 * 2. 回退规则：如果没有匹配到语义分隔符，使用段落换行（\n\n）切分
 * 3. 递归切分：如果父块超过1000字符，触发递归切分
 *    - 优先级：段落换行 > 单换行 > 句号 > 固定字符数（1000字符，无重叠）
 * 4. 最小块合并：如果父块低于100字符，合并到下一个父块
 * 5. 重叠规则：后续父块会包含前一个父块的完整内容
 *    - 第1个父块：原始内容
 *    - 第2个父块：父块1 + 父块2
 *    - 第3个父块：父块2 + 父块3
 *    - 合并后大小检查：如果块1 + 块2 > 2000字符，则不合并，只保留当前块
 *    - 缓冲区规则：如果前一个块 < 100字符，允许合并到2500字符（给小块更多合并空间）
 * 
 * 示例1（语义切分）：
 * 文本："开头内容...一、第一章内容...二、第二章内容..."
 * 切分结果：
 * - 第1个父块：开头内容...
 * - 第2个父块：开头内容... + 一、第一章内容...
 * - 第3个父块：一、第一章内容... + 二、第二章内容...
 * 
 * 示例2（段落切分回退）：
 * 文本："一位70后的老奶奶...\n\n一位小姐姐..."
 * 切分结果：
 * - 第1个父块：一位70后的老奶奶...
 * - 第2个父块：一位70后的老奶奶... + 一位小姐姐...
 * 
 * 示例3（递归切分）：
 * 文本："一、第一章内容（1200字符）..."
 * 处理流程：
 * - 块1（1200字符）> 1000，触发递归切分
 * - 按段落/换行/句号切分成多个小块
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * 切分配置
 */
export interface ChunkerConfig {
  /** 子块大小（字符数） */
  childChunkSize: number;
  /** 子块重叠大小（字符数） */
  childChunkOverlap: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ChunkerConfig = {
  childChunkSize: 500,
  childChunkOverlap: 150,
};

/**
 * 子块切分配置
 */
const CHILD_CHUNK_CONFIG = {
  /** 子块目标大小范围：最小值 */
  minSize: 400,
  /** 子块目标大小范围：最大值 */
  maxSize: 500,
  /** 子块重叠大小 */
  overlap: 150,
  /** 
   * LangChain RecursiveCharacterTextSplitter 分隔符优先级
   * 从高到低：段落换行 > 单换行 > 中文句号 > 感叹号 > 问号 > 分号 > 空字符串（兜底）
   */
  separators: ['\n\n', '\n', '。', '！', '？', '；', ''],
};

/**
 * 创建 LangChain 子块切分器实例
 */
const childChunkSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHILD_CHUNK_CONFIG.maxSize,
  chunkOverlap: CHILD_CHUNK_CONFIG.overlap,
  separators: CHILD_CHUNK_CONFIG.separators,
  keepSeparator: true,
});

/**
 * 父块切分配置
 */
const PARENT_CHUNK_CONFIG = {
  /** 父块最大字符数，超过此值会触发递归切分 */
  maxChunkSize: 1000,
  /** 父块最小字符数，低于此值会合并到下一个父块 */
  minChunkSize: 100,
  /** 合并后的最大字符数，超过此值则不合并（正常情况） */
  maxMergedSize: 2000,
  /** 合并后的最大字符数（缓冲区），当前一个块 < minChunkSize 时使用此限制 */
  maxMergedSizeBuffer: 2500,
  /** 合并后的最小字符数（目标范围下限） */
  minMergedSize: 800,
  /** 递归切分时的固定块大小 */
  recursiveChunkSize: 1000,
  /** 递归切分时的重叠大小（父块递归切分不需要重叠） */
  recursiveOverlap: 0,
};

/**
 * 语义分隔符正则表达式（按优先级排序）
 * 用于查找切分点
 * 
 * 切分规则：
 * 1. 中文序号：一、二、三...十、十一、十二...（格式：中文数字 + 、或.）
 * 2. Markdown 标题：#、##、###、####、#####、######（必须在行首）
 */
const SEPARATOR_PATTERNS: RegExp[] = [
  // Markdown 标题（# 到 ######，必须在行首）
  /^#{1,6}\s+/gm,
  
  // 中文序号（一、二、三...十、十一、十二...后跟、或.）
  /^[一二三四五六七八九十]+[、.]/gm,
];

/**
 * 分隔符位置信息
 */
interface SeparatorPosition {
  /** 分隔符起始位置 */
  index: number;
  /** 分隔符长度 */
  length: number;
}

/**
 * 查找文本中所有分隔符的位置
 * @param text 文本内容
 * @returns 分隔符位置数组，按位置排序
 */
function findAllSeparatorPositions(text: string): SeparatorPosition[] {
  const positions: SeparatorPosition[] = [];
  const foundIndices = new Set<number>();
  
  for (const pattern of SEPARATOR_PATTERNS) {
    // 重置正则表达式
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // 避免重复添加同一位置
      if (!foundIndices.has(match.index)) {
        foundIndices.add(match.index);
        positions.push({
          index: match.index,
          length: match[0].length,
        });
      }
    }
  }
  
  // 按位置排序
  return positions.sort((a, b) => a.index - b.index);
}

/**
 * 按段落换行切分（回退方案）
 * 当没有找到语义分隔符时，使用段落换行（\n\n）进行切分
 * @param text 要切分的文本
 * @returns 切分后的块数组
 */
function chunkByParagraph(text: string): string[] {
  const trimmedText = text.trim();
  
  // 使用段落换行（\n\n 或 \r\n\r\n）进行切分
  const paragraphs = trimmedText.split(/\r?\n\r?\n/);
  
  // 过滤掉空段落
  const chunks = paragraphs
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  // 如果没有段落分隔，整个文本作为一个块
  if (chunks.length === 0) {
    return [trimmedText];
  }
  
  return chunks;
}

/**
 * 按单换行切分
 * @param text 要切分的文本
 * @returns 切分后的块数组
 */
function chunkByLine(text: string): string[] {
  const trimmedText = text.trim();
  const lines = trimmedText.split(/\r?\n/);
  return lines.map(l => l.trim()).filter(l => l.length > 0);
}

/**
 * 按句号切分
 * @param text 要切分的文本
 * @returns 切分后的块数组
 */
function chunkBySentence(text: string): string[] {
  const trimmedText = text.trim();
  // 按中文句号、英文句号、感叹号、问号切分
  const sentences = trimmedText.split(/(?<=[。！？.!?])/);
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * 按固定字符数切分
 * @param text 要切分的文本
 * @param chunkSize 块大小
 * @param overlap 重叠大小
 * @returns 切分后的块数组
 */
function chunkByFixedSize(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  const trimmedText = text.trim();
  
  if (trimmedText.length <= chunkSize) {
    return [trimmedText];
  }
  
  let start = 0;
  while (start < trimmedText.length) {
    const end = Math.min(start + chunkSize, trimmedText.length);
    const chunk = trimmedText.slice(start, end);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    const nextStart = start + chunkSize - overlap;
    if (nextStart >= trimmedText.length) break;
    start = nextStart;
  }
  
  return chunks;
}

/**
 * 递归切分过大的块
 * 当块超过最大字符数时，按优先级尝试不同的切分方式
 * 优先级：段落换行 > 单换行 > 句号 > 固定字符数
 * @param chunk 要切分的块
 * @param maxSize 最大字符数
 * @returns 切分后的块数组
 */
function recursiveSplitLargeChunk(chunk: string, maxSize: number): string[] {
  const trimmedChunk = chunk.trim();
  
  // 如果块大小在限制内，直接返回
  if (trimmedChunk.length <= maxSize) {
    return [trimmedChunk];
  }
  
  // 尝试按段落换行切分
  const paragraphs = chunkByParagraph(trimmedChunk);
  if (paragraphs.length > 1) {
    // 递归处理每个段落
    const result: string[] = [];
    for (const p of paragraphs) {
      if (p.length > maxSize) {
        result.push(...recursiveSplitLargeChunk(p, maxSize));
      } else {
        result.push(p);
      }
    }
    return result;
  }
  
  // 尝试按单换行切分
  const lines = chunkByLine(trimmedChunk);
  if (lines.length > 1) {
    const result: string[] = [];
    for (const line of lines) {
      if (line.length > maxSize) {
        result.push(...recursiveSplitLargeChunk(line, maxSize));
      } else {
        result.push(line);
      }
    }
    return result;
  }
  
  // 尝试按句号切分
  const sentences = chunkBySentence(trimmedChunk);
  if (sentences.length > 1) {
    const result: string[] = [];
    for (const sentence of sentences) {
      if (sentence.length > maxSize) {
        result.push(...recursiveSplitLargeChunk(sentence, maxSize));
      } else {
        result.push(sentence);
      }
    }
    return result;
  }
  
  // 最后回退到固定字符数切分
  return chunkByFixedSize(
    trimmedChunk,
    PARENT_CHUNK_CONFIG.recursiveChunkSize,
    PARENT_CHUNK_CONFIG.recursiveOverlap
  );
}

/**
 * 对所有块应用递归切分
 * 遍历每个块，如果超过最大字符数则递归切分
 * @param chunks 原始块数组
 * @param maxSize 最大字符数
 * @returns 切分后的块数组
 */
function applyRecursiveSplit(chunks: string[], maxSize: number): string[] {
  const result: string[] = [];
  
  for (const chunk of chunks) {
    if (chunk.trim().length > maxSize) {
      // 递归切分过大的块
      const splitChunks = recursiveSplitLargeChunk(chunk, maxSize);
      result.push(...splitChunks);
    } else {
      result.push(chunk);
    }
  }
  
  return result;
}

/**
 * 合并过小的块到下一个块
 * 如果某个块的字符数低于最小值，将其合并到下一个块
 * @param chunks 原始块数组
 * @param minSize 最小字符数
 * @returns 合并后的块数组
 */
function mergeSmallChunks(chunks: string[], minSize: number): string[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  
  const mergedChunks: string[] = [];
  let pendingChunk = '';
  
  for (let i = 0; i < chunks.length; i++) {
    const currentChunk = chunks[i];
    
    // 如果有待合并的内容，先合并
    if (pendingChunk.length > 0) {
      const merged = pendingChunk + currentChunk;
      pendingChunk = '';
      
      // 检查合并后的块是否仍然过小
      if (merged.trim().length < minSize && i < chunks.length - 1) {
        // 仍然过小且不是最后一个，继续累积
        pendingChunk = merged;
      } else {
        mergedChunks.push(merged);
      }
    } else {
      // 检查当前块是否过小
      if (currentChunk.trim().length < minSize && i < chunks.length - 1) {
        // 过小且不是最后一个，累积到下一个块
        pendingChunk = currentChunk;
      } else {
        mergedChunks.push(currentChunk);
      }
    }
  }
  
  // 处理最后可能剩余的待合并内容
  if (pendingChunk.length > 0) {
    if (mergedChunks.length > 0) {
      // 合并到最后一个块
      mergedChunks[mergedChunks.length - 1] += pendingChunk;
    } else {
      mergedChunks.push(pendingChunk);
    }
  }
  
  return mergedChunks;
}

/**
 * 智能父块切分
 * 基于语义分隔符进行切分
 * 
 * 切分规则：
 * 1. 优先使用语义分隔符（中文序号、Markdown标题）切分
 * 2. 如果没有找到语义分隔符，回退到段落换行切分
 * 3. 如果某个父块超过1000字符，触发递归切分
 * 4. 如果某个父块低于100字符，合并到下一个父块
 * 
 * 重叠规则：
 * - 第1个父块：原始内容（从开头到第一个切分符）
 * - 第2个父块：父块1的内容 + 父块2的原始内容
 * - 第3个父块：父块2的原始内容 + 父块3的原始内容
 * - 合并后检查：如果合并后超过2000字符，只保留当前块（不合并）
 * 
 * @param text 要切分的文本
 * @returns 父块数组（已应用重叠规则）
 */
export function chunkParentBlocks(text: string): string[] {
  const trimmedText = text.trim();
  
  if (trimmedText.length === 0) {
    return [];
  }
  
  // 查找所有分隔符位置
  const separators = findAllSeparatorPositions(trimmedText);
  
  // 如果没有找到任何分隔符，回退到段落换行切分
  if (separators.length === 0) {
    const paragraphChunks = chunkByParagraph(trimmedText);
    
    // 对段落切分结果应用递归切分（处理过大的块）
    const recursiveSplitChunks = applyRecursiveSplit(paragraphChunks, PARENT_CHUNK_CONFIG.maxChunkSize);
    
    // 合并过小的块
    const mergedParagraphs = mergeSmallChunks(recursiveSplitChunks, PARENT_CHUNK_CONFIG.minChunkSize);
    
    // 如果只有一个块，直接返回
    if (mergedParagraphs.length <= 1) {
      return mergedParagraphs;
    }
    
    // 应用重叠规则（带大小检查）
    return applyOverlapWithSizeCheck(mergedParagraphs);
  }
  
  // 第一步：先切分成原始块（不含重叠）
  const rawChunks: string[] = [];
  
  // 构建切分点数组：[0, sep1, sep2, ..., textLength]
  const splitPoints: number[] = [0];
  for (const sep of separators) {
    // 跳过位置为0的分隔符
    if (sep.index > 0) {
      splitPoints.push(sep.index);
    }
  }
  splitPoints.push(trimmedText.length);
  
  // 切分成原始块
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const startIndex = splitPoints[i];
    const endIndex = splitPoints[i + 1];
    const chunk = trimmedText.slice(startIndex, endIndex);
    if (chunk.trim().length > 0) {
      rawChunks.push(chunk);
    }
  }
  
  // 如果只有一个块，检查是否需要递归切分
  if (rawChunks.length <= 1) {
    if (rawChunks.length === 1 && rawChunks[0].length > PARENT_CHUNK_CONFIG.maxChunkSize) {
      return applyRecursiveSplit(rawChunks, PARENT_CHUNK_CONFIG.maxChunkSize);
    }
    return rawChunks;
  }
  
  // 第二步：对过大的块应用递归切分
  const recursiveSplitChunks = applyRecursiveSplit(rawChunks, PARENT_CHUNK_CONFIG.maxChunkSize);
  
  // 第三步：合并过小的块
  const mergedRawChunks = mergeSmallChunks(recursiveSplitChunks, PARENT_CHUNK_CONFIG.minChunkSize);
  
  // 如果合并后只有一个块，直接返回
  if (mergedRawChunks.length <= 1) {
    return mergedRawChunks;
  }
  
  // 第四步：应用重叠规则（带大小检查）
  return applyOverlapWithSizeCheck(mergedRawChunks);
}

/**
 * 应用重叠规则，并检查合并后的大小
 * 规则：
 * - 如果合并后超过2000字符，只保留当前块（不合并）
 * - 如果前一个块 < 100字符，使用2500字符作为缓冲区限制（允许更大的合并）
 * @param chunks 原始块数组
 * @returns 应用重叠后的块数组
 */
function applyOverlapWithSizeCheck(chunks: string[]): string[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  
  const overlappedChunks: string[] = [];
  
  // 第一个块保持原样
  overlappedChunks.push(chunks[0]);
  
  // 从第二个块开始，每个块 = 前一个原始块 + 当前原始块
  for (let i = 1; i < chunks.length; i++) {
    const prevRawChunk = chunks[i - 1];
    const currentRawChunk = chunks[i];
    const overlappedChunk = prevRawChunk + currentRawChunk;
    
    // 确定合并限制：如果前一个块 < 100字符，使用缓冲区限制（2500），否则使用正常限制（2000）
    const mergeLimit = prevRawChunk.trim().length < PARENT_CHUNK_CONFIG.minChunkSize
      ? PARENT_CHUNK_CONFIG.maxMergedSizeBuffer
      : PARENT_CHUNK_CONFIG.maxMergedSize;
    
    // 检查合并后的大小
    if (overlappedChunk.length > mergeLimit) {
      // 合并后超过限制，只保留当前块（不合并）
      overlappedChunks.push(currentRawChunk);
    } else {
      // 合并后在限制内，使用合并后的块
      overlappedChunks.push(overlappedChunk);
    }
  }
  
  return overlappedChunks;
}

/**
 * 使用 LangChain RecursiveCharacterTextSplitter 切分子块（异步版本）
 * 切分规则：
 * 1. 如果父块 < 子块最大大小，直接作为唯一子块
 * 2. 子块目标大小：250-300 字符
 * 3. 子块重叠：50 字符
 * 4. 分隔符优先级：\n\n > \n > 。 > ！ > ？ > ； > . > : > ： > , > ， > 空格 > 空字符串
 * 5. LangChain 会自动在分隔符位置切分，保持语义完整性
 * 
 * @param text 要切分的文本（父块内容）
 * @param _chunkSize 块大小（已在 splitter 中配置，此参数保留兼容性）
 * @param _overlap 重叠大小（已在 splitter 中配置，此参数保留兼容性）
 * @returns 子块数组的 Promise
 */
export async function chunkChildBlocksAsync(
  text: string,
  _chunkSize: number = DEFAULT_CONFIG.childChunkSize,
  _overlap: number = DEFAULT_CONFIG.childChunkOverlap
): Promise<string[]> {
  const trimmedText = text.trim();
  
  // 如果父块 < 子块最大大小，直接作为唯一子块
  if (trimmedText.length <= CHILD_CHUNK_CONFIG.maxSize) {
    return [trimmedText];
  }
  
  // 使用 LangChain RecursiveCharacterTextSplitter 进行切分
  const chunks = await childChunkSplitter.splitText(trimmedText);
  
  // 过滤空块并返回
  return chunks.filter((chunk: string) => chunk.trim().length > 0);
}

/**
 * 使用 LangChain RecursiveCharacterTextSplitter 切分子块（同步版本，内部使用异步）
 * 为了保持向后兼容，提供同步接口
 * 
 * @param text 要切分的文本（父块内容）
 * @param _chunkSize 块大小（已在 splitter 中配置，此参数保留兼容性）
 * @param _overlap 重叠大小（已在 splitter 中配置，此参数保留兼容性）
 * @returns 子块数组
 */
export function chunkChildBlocks(
  text: string,
  _chunkSize: number = DEFAULT_CONFIG.childChunkSize,
  _overlap: number = DEFAULT_CONFIG.childChunkOverlap
): string[] {
  const trimmedText = text.trim();
  
  // 如果父块 < 子块最大大小，直接作为唯一子块
  if (trimmedText.length <= CHILD_CHUNK_CONFIG.maxSize) {
    return [trimmedText];
  }
  
  // 使用自定义的同步递归切分实现（LangChain 的 splitText 是异步的）
  return syncRecursiveSplit(trimmedText, CHILD_CHUNK_CONFIG.maxSize, CHILD_CHUNK_CONFIG.overlap, CHILD_CHUNK_CONFIG.separators);
}

/**
 * 同步递归字符切分（模拟 LangChain RecursiveCharacterTextSplitter 的行为）
 * 
 * 切分规则：
 * 1. 按分隔符优先级切分，保持语义完整性
 * 2. 重叠是基于完整的语义单元（句子/段落），不会在任意字符位置截断
 * 3. 如果单个分隔单元超过块大小，递归使用下一级分隔符切分
 * 4. 重叠通过从上一个块末尾取完整的语义单元实现
 * 
 * @param text 要切分的文本
 * @param chunkSize 块大小
 * @param overlap 重叠大小
 * @param separators 分隔符数组
 * @returns 切分后的块数组
 */
function syncRecursiveSplit(text: string, chunkSize: number, overlap: number, separators: string[]): string[] {
  // 如果文本长度小于等于块大小，直接返回
  if (text.length <= chunkSize) {
    return text.trim() ? [text.trim()] : [];
  }
  
  // 尝试使用分隔符切分
  for (const separator of separators) {
    if (separator === '') {
      // 空字符串分隔符：按字符切分（带重叠）
      return splitByCharacterWithOverlap(text, chunkSize, overlap);
    }
    
    if (text.includes(separator)) {
      // 按分隔符切分，保留分隔符在前一个片段末尾
      const splits = splitKeepSeparator(text, separator);
      
      // 先构建不带重叠的块
      const rawChunks: string[][] = []; // 每个块包含的片段数组
      let currentSplits: string[] = [];
      let currentLength = 0;
      
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        
        // 如果当前片段为空，跳过
        if (!split.trim()) continue;
        
        // 如果单个片段超过块大小，递归切分
        if (split.length > chunkSize) {
          // 先保存当前块
          if (currentSplits.length > 0) {
            rawChunks.push([...currentSplits]);
            currentSplits = [];
            currentLength = 0;
          }
          // 递归切分大片段
          const subChunks = syncRecursiveSplit(split, chunkSize, overlap, separators.slice(separators.indexOf(separator) + 1));
          for (const subChunk of subChunks) {
            rawChunks.push([subChunk]);
          }
          continue;
        }
        
        const potentialLength = currentLength + split.length;
        
        if (potentialLength <= chunkSize) {
          // 可以合并到当前块
          currentSplits.push(split);
          currentLength = potentialLength;
        } else {
          // 当前块已满，保存并开始新块
          if (currentSplits.length > 0) {
            rawChunks.push([...currentSplits]);
          }
          currentSplits = [split];
          currentLength = split.length;
        }
      }
      
      // 保存最后一个块
      if (currentSplits.length > 0) {
        rawChunks.push(currentSplits);
      }
      
      // 应用重叠：从上一个块末尾取完整的语义单元
      const chunks: string[] = [];
      for (let i = 0; i < rawChunks.length; i++) {
        if (i === 0) {
          // 第一个块不需要重叠
          chunks.push(rawChunks[i].join('').trim());
        } else {
          // 从上一个块末尾取语义单元作为重叠
          const prevSplits = rawChunks[i - 1];
          const currentContent = rawChunks[i].join('');
          
          // 从上一个块末尾取片段，直到达到重叠大小
          let overlapContent = '';
          for (let j = prevSplits.length - 1; j >= 0; j--) {
            const potentialOverlap = prevSplits[j] + overlapContent;
            if (potentialOverlap.length <= overlap) {
              overlapContent = potentialOverlap;
            } else if (overlapContent.length === 0) {
              // 如果第一个片段就超过重叠大小，取这个片段的一部分
              overlapContent = prevSplits[j].slice(-overlap);
              break;
            } else {
              break;
            }
          }
          
          // 合并重叠内容和当前块
          const chunkWithOverlap = overlapContent + currentContent;
          chunks.push(chunkWithOverlap.trim());
        }
      }
      
      return chunks.filter(c => c.length > 0);
    }
  }
  
  // 没有找到任何分隔符，按字符切分（带重叠）
  return splitByCharacterWithOverlap(text, chunkSize, overlap);
}

/**
 * 按字符切分（带重叠）
 * @param text 要切分的文本
 * @param chunkSize 块大小
 * @param overlap 重叠大小
 * @returns 切分后的块数组
 */
function splitByCharacterWithOverlap(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    // 下一个块的起始位置 = 当前结束位置 - 重叠大小
    const nextStart = end - overlap;
    if (nextStart <= start) {
      // 防止无限循环
      start = end;
    } else {
      start = nextStart;
    }
    if (start >= text.length) break;
  }
  
  return chunks;
}

/**
 * 按分隔符切分，保留分隔符在前一个片段末尾
 * 例如：按"。"切分 "你好。世界。" => ["你好。", "世界。"]
 * @param text 要切分的文本
 * @param separator 分隔符
 * @returns 切分后的片段数组
 */
function splitKeepSeparator(text: string, separator: string): string[] {
  if (!separator) return [text];
  
  const parts = text.split(separator);
  const result: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1) {
      // 不是最后一个片段，添加分隔符到末尾
      result.push(parts[i] + separator);
    } else if (parts[i]) {
      // 最后一个片段（如果非空）
      result.push(parts[i]);
    }
  }
  
  return result;
}





/**
 * 父子块切分结果
 */
export interface ParentChildChunkResult {
  parentContent: string;
  childContents: string[];
}

/**
 * 执行父子块切分
 * @param content 文档内容
 * @param config 切分配置（可选）
 * @returns 父子块切分结果数组
 */
export function parentChildChunk(
  content: string,
  config: ChunkerConfig = DEFAULT_CONFIG
): ParentChildChunkResult[] {
  const results: ParentChildChunkResult[] = [];
  const trimmedContent = content.trim();
  
  // 切分成父块
  const parentChunks = chunkParentBlocks(trimmedContent);
  
  // 为每个父块生成子块
  for (const parentContent of parentChunks) {
    const childContents = chunkChildBlocks(
      parentContent,
      config.childChunkSize,
      config.childChunkOverlap
    );
    results.push({ parentContent, childContents });
  }
  
  return results;
}

/**
 * 获取默认配置
 */
export function getDefaultConfig(): ChunkerConfig {
  return { ...DEFAULT_CONFIG };
}
