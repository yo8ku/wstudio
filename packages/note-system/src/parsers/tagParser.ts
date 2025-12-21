/**
 * tagParser.ts
 * 标签解析器
 * 功能：从笔记内容中解析标签
 */

/**
 * 解析后的标签信息
 */
export interface ParsedTag {
  name: string;
  fullName: string;
  parent?: string;
  isNested: boolean;
  position: {
    start: number;
    end: number;
  };
}

/**
 * 标签正则表达式
 * 匹配 #标签名 或 #父标签/子标签 格式
 */
const TAG_REGEX = /#([\w\u4e00-\u9fa5]+(\/[\w\u4e00-\u9fa5]+)*)/g;

/**
 * 从内容中解析标签
 * @param content 笔记内容
 * @returns 解析出的标签列表
 */
export function parseTagsFromContent(content: string): ParsedTag[] {
  const tags: ParsedTag[] = [];
  let match: RegExpExecArray | null;

  // 重置正则表达式的 lastIndex
  TAG_REGEX.lastIndex = 0;

  while ((match = TAG_REGEX.exec(content)) !== null) {
    const fullName = match[1];
    const isNested = fullName.includes('/');
    
    let name = fullName;
    let parent: string | undefined;

    if (isNested) {
      const parts = fullName.split('/');
      name = parts[parts.length - 1];
      parent = parts.slice(0, -1).join('/');
    }

    tags.push({
      name,
      fullName,
      parent,
      isNested,
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return tags;
}

/**
 * 解析嵌套标签，返回所有层级的标签
 * 例如：#工作/项目/任务 会返回 ['工作', '工作/项目', '工作/项目/任务']
 * @param tagFullName 完整标签名
 * @returns 所有层级的标签名
 */
export function parseNestedTags(tagFullName: string): string[] {
  if (!tagFullName.includes('/')) {
    return [tagFullName];
  }

  const parts = tagFullName.split('/');
  const result: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    result.push(parts.slice(0, i + 1).join('/'));
  }

  return result;
}

/**
 * 获取标签的父标签
 * @param tagFullName 完整标签名
 * @returns 父标签名，如果没有则返回 undefined
 */
export function getParentTag(tagFullName: string): string | undefined {
  if (!tagFullName.includes('/')) {
    return undefined;
  }

  const parts = tagFullName.split('/');
  return parts.slice(0, -1).join('/');
}

/**
 * 获取标签的叶子名称
 * @param tagFullName 完整标签名
 * @returns 叶子标签名
 */
export function getLeafTagName(tagFullName: string): string {
  if (!tagFullName.includes('/')) {
    return tagFullName;
  }

  const parts = tagFullName.split('/');
  return parts[parts.length - 1];
}

/**
 * 验证标签名是否有效
 * @param tagName 标签名
 * @returns 是否有效
 */
export function isValidTagName(tagName: string): boolean {
  if (!tagName || tagName.trim().length === 0) {
    return false;
  }

  // 标签名只能包含字母、数字、中文和下划线
  const validPattern = /^[\w\u4e00-\u9fa5]+(\/[\w\u4e00-\u9fa5]+)*$/;
  return validPattern.test(tagName);
}

/**
 * 从内容中提取唯一的标签名列表
 * @param content 笔记内容
 * @returns 唯一的标签名列表
 */
export function extractUniqueTags(content: string): string[] {
  const tags = parseTagsFromContent(content);
  const uniqueNames = new Set<string>();

  for (const tag of tags) {
    // 添加完整标签名
    uniqueNames.add(tag.fullName);
    
    // 如果是嵌套标签，也添加所有父级标签
    if (tag.isNested) {
      const allLevels = parseNestedTags(tag.fullName);
      allLevels.forEach(level => uniqueNames.add(level));
    }
  }

  return Array.from(uniqueNames);
}
