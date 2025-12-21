/**
 * linkParser.ts
 * 链接解析器
 * 功能：从笔记内容中解析双向链接
 */

/**
 * 解析后的链接信息
 */
export interface ParsedLink {
  targetTitle: string;
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
  position: {
    start: number;
    end: number;
  };
}

/**
 * Wikilink 正则表达式
 * 匹配 [[笔记名]] 或 [[笔记名|显示文本]] 格式
 */
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

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
    const targetTitle = match[1].trim();
    const displayText = match[2]?.trim();

    links.push({
      targetTitle,
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
    // 转义正则特殊字符
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`(?<!\\[\\[)\\b${escapedTitle}\\b(?!\\]\\])`, 'gi');
    
    let match: RegExpExecArray | null;
    while ((match = titleRegex.exec(content)) !== null) {
      // 获取上下文（前后各 50 个字符）
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(content.length, match.index + match[0].length + 50);
      const context = content.slice(contextStart, contextEnd);

      mentions.push({
        noteTitle: title,
        context: contextStart > 0 ? '...' + context : context,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
  }

  return mentions;
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
  if (displayText && displayText !== title) {
    return `[[${title}|${displayText}]]`;
  }
  return `[[${title}]]`;
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
 * @param contextLength 上下文长度（前后各多少字符）
 * @returns 上下文字符串
 */
export function getLinkContext(
  content: string,
  position: { start: number; end: number },
  contextLength: number = 50
): string {
  const contextStart = Math.max(0, position.start - contextLength);
  const contextEnd = Math.min(content.length, position.end + contextLength);
  
  let context = content.slice(contextStart, contextEnd);
  
  if (contextStart > 0) {
    context = '...' + context;
  }
  if (contextEnd < content.length) {
    context = context + '...';
  }
  
  return context;
}
