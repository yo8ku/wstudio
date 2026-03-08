/**
 * linkParser.ts
 * 链接解析器
 * 功能：从笔记内容中解析双向链接
 */

/**
 * 解析后的链接信息
 */
export type LinkTargetKind = 'note' | 'heading' | 'block';

export interface ParsedLink {
  targetReference: string;
  targetTitle: string;
  targetKind: LinkTargetKind;
  targetAnchor?: string;
  displayText?: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * 未链接提及信息
 */
export interface UnlinkedMention {
  noteTitle: string;
  context: string;
  matchedText: string;
  position: {
    start: number;
    end: number;
  };
}

/**
 * Wikilink 正则表达式
 * 匹配 [[笔记名]] 或 [[笔记名|显示文本]] 格式
 */
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

const getLineBounds = (
  content: string,
  position: { start: number; end: number }
): { start: number; end: number } => {
  const safeStart = Math.max(0, Math.min(position.start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(position.end, content.length));
  const lineStart = content.lastIndexOf('\n', Math.max(0, safeStart - 1)) + 1;
  const nextLineBreakIndex = content.indexOf('\n', safeEnd);
  const lineEnd = nextLineBreakIndex === -1 ? content.length : nextLineBreakIndex;

  return {
    start: lineStart,
    end: lineEnd
  };
};

const getExactLineContext = (
  content: string,
  position: { start: number; end: number }
): string => {
  const { start, end } = getLineBounds(content, position);
  return content.slice(start, end).replace(/\r$/, '');
};

/**
 * 解析 Wikilink 的目标部分
 * 支持：
 * - 标题：[[标题]]
 * - 显示文本：[[标题|显示文本]]
 * - 标题引用：[[标题#章节]]
 * - 块引用：[[标题#^block-id]]
 */
export function parseWikilinkTarget(rawTarget: string): Pick<ParsedLink, 'targetReference' | 'targetTitle' | 'targetKind' | 'targetAnchor'> {
  const trimmedTarget = rawTarget.trim();
  const hashIndex = trimmedTarget.indexOf('#');

  if (hashIndex === -1) {
    return {
      targetReference: trimmedTarget,
      targetTitle: trimmedTarget,
      targetKind: 'note'
    };
  }

  const targetTitle = trimmedTarget.slice(0, hashIndex).trim();
  const anchor = trimmedTarget.slice(hashIndex + 1).trim();

  if (anchor.startsWith('^')) {
    return {
      targetReference: targetTitle,
      targetTitle,
      targetKind: 'block',
      targetAnchor: anchor.slice(1).trim()
    };
  }

  return {
    targetReference: targetTitle,
    targetTitle,
    targetKind: 'heading',
    targetAnchor: anchor
  };
}

/**
 * 根据基础目标和锚点构造 Wikilink 的目标部分
 */
export function buildWikilinkTarget(
  targetReference: string,
  targetKind: LinkTargetKind = 'note',
  targetAnchor?: string
): string {
  const normalizedReference = targetReference.trim();
  const normalizedAnchor = targetAnchor?.trim();

  if (targetKind === 'note' || !normalizedAnchor) {
    return normalizedReference;
  }

  if (targetKind === 'block') {
    return `${normalizedReference}#^${normalizedAnchor.replace(/^\^/, '')}`;
  }

  return `${normalizedReference}#${normalizedAnchor}`;
}

/**
 * 从内容中解析 Wikilink
 * @param content 笔记内容
 * @returns 解析出的链接列表
 */
export function parseWikilinksFromContent(content: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  let match: RegExpExecArray | null;

  // 重置正则表达式的 lastIndex
  WIKILINK_REGEX.lastIndex = 0;

  while ((match = WIKILINK_REGEX.exec(content)) !== null) {
    const rawInner = match[1].trim();
    const separatorIndex = rawInner.indexOf('|');
    const rawTarget = separatorIndex === -1 ? rawInner : rawInner.slice(0, separatorIndex);
    const displayText = separatorIndex === -1 ? undefined : rawInner.slice(separatorIndex + 1).trim();
    const parsedTarget = parseWikilinkTarget(rawTarget);

    links.push({
      ...parsedTarget,
      displayText,
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return links;
}

/**
 * 查找未链接提及
 * @param content 笔记内容
 * @param noteTitles 所有笔记标题列表
 * @param excludeTitle 排除的标题（当前笔记标题）
 * @returns 未链接提及列表
 */
export function findUnlinkedMentions(
  content: string,
  noteTitles: string[],
  excludeTitle?: string
): UnlinkedMention[] {
  const mentions: UnlinkedMention[] = [];
  
  // 先获取已链接的标题
  const linkedTitles = new Set(
    parseWikilinksFromContent(content).map(link => link.targetTitle)
  );

  // 过滤掉当前笔记标题和已链接的标题
  const titlesToSearch = noteTitles.filter(title => 
    title !== excludeTitle && !linkedTitles.has(title)
  );

  // 按标题长度降序排序，优先匹配长标题
  titlesToSearch.sort((a, b) => b.length - a.length);

  for (const title of titlesToSearch) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bracketedTitleRegex = new RegExp(`(?<!\\[)(?<!\\!)\\[${escapedTitle}\\](?![\\]\\(])`, 'gi');
    const plainTitleRegex = new RegExp(`(?<!\\[\\[)(?<!\\[)\\b${escapedTitle}\\b(?!\\]\\]|\\])`, 'gi');

    for (const matcher of [
      { regex: bracketedTitleRegex, matchedText: title },
      { regex: plainTitleRegex, matchedText: undefined as string | undefined }
    ]) {
      let match: RegExpExecArray | null;
      while ((match = matcher.regex.exec(content)) !== null) {
        mentions.push({
          noteTitle: title,
          context: getExactLineContext(content, {
            start: match.index,
            end: match.index + match[0].length
          }),
          // Keep the replacement text clean so converting mention -> wikilink becomes [[title]].
          matchedText: matcher.matchedText || match[0],
          position: {
            start: match.index,
            end: match.index + match[0].length
          }
        });
      }
    }
  }

  return mentions.sort((left, right) => left.position.start - right.position.start);
}

/**
 * 从内容中提取唯一的链接目标列表
 * @param content 笔记内容
 * @returns 唯一的链接目标列表
 */
export function extractUniqueLinks(content: string): string[] {
  const links = parseWikilinksFromContent(content);
  const uniqueTargets = new Set<string>();

  for (const link of links) {
    uniqueTargets.add(link.targetTitle);
  }

  return Array.from(uniqueTargets);
}

/**
 * 将文本转换为 Wikilink
 * @param title 笔记标题
 * @param displayText 可选的显示文本
 * @returns Wikilink 字符串
 */
export function createWikilink(title: string, displayText?: string): string {
  const normalizedTarget = title.trim();

  if (displayText && displayText !== normalizedTarget) {
    return `[[${normalizedTarget}|${displayText}]]`;
  }
  return `[[${normalizedTarget}]]`;
}

/**
 * 检查内容是否包含指向特定笔记的链接
 * @param content 笔记内容
 * @param targetTitle 目标笔记标题
 * @returns 是否包含链接
 */
export function hasLinkTo(content: string, targetTitle: string): boolean {
  const links = parseWikilinksFromContent(content);
  return links.some(link => link.targetTitle === targetTitle);
}

/**
 * 获取链接的上下文
 * @param content 笔记内容
 * @param position 链接位置
 * @param contextLength 保留兼容性的上下文长度参数，当前按命中所在原始行返回
 * @returns 链接所在原始行
 */
export function getLinkContext(
  content: string,
  position: { start: number; end: number },
  contextLength: number = 50
): string {
  void contextLength;
  return getExactLineContext(content, position);
}
