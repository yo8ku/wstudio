/**
 * outlineParser.ts
 * 大纲解析器
 * 功能：从 Markdown 内容中解析章节大纲
 */

/**
 * 大纲项
 */
export interface OutlineItem {
  id: string;
  title: string;
  level: number;
  position: {
    line: number;
    start: number;
    end: number;
  };
  children: OutlineItem[];
}

/**
 * 扁平化的大纲项（不含 children）
 */
export interface FlatOutlineItem {
  id: string;
  title: string;
  level: number;
  position: {
    line: number;
    start: number;
    end: number;
  };
}

/**
 * Markdown 标题正则表达式
 * 匹配 # 到 ###### 的标题
 */
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

/**
 * 从内容中解析大纲（扁平结构）
 * @param content Markdown 内容
 * @returns 扁平化的大纲项列表
 */
export function parseOutlineFromContent(content: string): FlatOutlineItem[] {
  const items: FlatOutlineItem[] = [];
  let match: RegExpExecArray | null;
  let idCounter = 0;

  // 计算行号
  const lines = content.split('\n');
  let currentPosition = 0;
  const linePositions: number[] = [];
  
  for (const line of lines) {
    linePositions.push(currentPosition);
    currentPosition += line.length + 1; // +1 for newline
  }

  // 重置正则表达式的 lastIndex
  HEADING_REGEX.lastIndex = 0;

  while ((match = HEADING_REGEX.exec(content)) !== null) {
    const level = match[1].length;
    const title = match[2].trim();
    
    // 计算行号
    let lineNumber = 0;
    for (let i = 0; i < linePositions.length; i++) {
      if (linePositions[i] <= match.index) {
        lineNumber = i;
      } else {
        break;
      }
    }

    items.push({
      id: `heading-${idCounter++}`,
      title,
      level,
      position: {
        line: lineNumber,
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return items;
}

/**
 * 将扁平大纲转换为树形结构
 * @param flatItems 扁平化的大纲项列表
 * @returns 树形结构的大纲
 */
export function buildOutlineTree(flatItems: FlatOutlineItem[]): OutlineItem[] {
  if (flatItems.length === 0) {
    return [];
  }

  const root: OutlineItem[] = [];
  const stack: OutlineItem[] = [];

  for (const item of flatItems) {
    const outlineItem: OutlineItem = {
      ...item,
      children: []
    };

    // 找到合适的父节点
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(outlineItem);
    } else {
      stack[stack.length - 1].children.push(outlineItem);
    }

    stack.push(outlineItem);
  }

  return root;
}

/**
 * 从内容中解析大纲（树形结构）
 * @param content Markdown 内容
 * @returns 树形结构的大纲
 */
export function parseOutlineTree(content: string): OutlineItem[] {
  const flatItems = parseOutlineFromContent(content);
  return buildOutlineTree(flatItems);
}

/**
 * 获取指定级别的标题
 * @param content Markdown 内容
 * @param level 标题级别（1-6）
 * @returns 指定级别的标题列表
 */
export function getHeadingsByLevel(content: string, level: number): FlatOutlineItem[] {
  const items = parseOutlineFromContent(content);
  return items.filter(item => item.level === level);
}

/**
 * 获取第一个标题作为文档标题
 * @param content Markdown 内容
 * @returns 第一个标题，如果没有则返回 undefined
 */
export function getDocumentTitle(content: string): string | undefined {
  const items = parseOutlineFromContent(content);
  if (items.length > 0) {
    return items[0].title;
  }
  return undefined;
}

/**
 * 检查内容是否有大纲结构
 * @param content Markdown 内容
 * @returns 是否有大纲
 */
export function hasOutline(content: string): boolean {
  const items = parseOutlineFromContent(content);
  return items.length > 0;
}

/**
 * 生成大纲的 Markdown 目录
 * @param content Markdown 内容
 * @param maxLevel 最大级别（默认 3）
 * @returns Markdown 格式的目录
 */
export function generateTableOfContents(content: string, maxLevel: number = 3): string {
  const items = parseOutlineFromContent(content);
  const filteredItems = items.filter(item => item.level <= maxLevel);
  
  if (filteredItems.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const minLevel = Math.min(...filteredItems.map(item => item.level));

  for (const item of filteredItems) {
    const indent = '  '.repeat(item.level - minLevel);
    const anchor = item.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
    lines.push(`${indent}- [${item.title}](#${anchor})`);
  }

  return lines.join('\n');
}
