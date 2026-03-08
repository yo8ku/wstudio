/**
 * anchorParser.ts
 * 笔记锚点解析器
 * 功能：解析 Markdown 标题锚点和块级锚点，供块级/标题级引用使用
 */

import { parseOutlineFromContent } from './outlineParser';

export type NoteAnchorKind = 'heading' | 'block';

export interface NoteAnchorTarget {
  kind: NoteAnchorKind;
  reference: string;
  normalizedReference: string;
  preview: string;
  position: {
    line: number;
    start: number;
    end: number;
  };
}

const BLOCK_REFERENCE_REGEX = /\^([A-Za-z0-9-]+)\s*$/;

/**
 * 生成标题锚点的规范化值
 */
export function normalizeHeadingReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '');
}

/**
 * 生成块锚点的规范化值
 */
export function normalizeBlockReference(value: string): string {
  return value.trim().replace(/^\^/, '').toLowerCase();
}

/**
 * 解析文档中的标题锚点
 */
export function parseHeadingAnchors(content: string): NoteAnchorTarget[] {
  return parseOutlineFromContent(content).map(item => ({
    kind: 'heading',
    reference: item.title,
    normalizedReference: normalizeHeadingReference(item.title),
    preview: item.title,
    position: item.position
  }));
}

/**
 * 解析文档中的块级锚点
 */
export function parseBlockAnchors(content: string): NoteAnchorTarget[] {
  const anchors: NoteAnchorTarget[] = [];
  const lines = content.split('\n');
  let currentPosition = 0;

  lines.forEach((line, index) => {
    const match = line.match(BLOCK_REFERENCE_REGEX);
    if (!match) {
      currentPosition += line.length + 1;
      return;
    }

    const blockId = match[1];
    anchors.push({
      kind: 'block',
      reference: `^${blockId}`,
      normalizedReference: normalizeBlockReference(blockId),
      preview: line.trim() || `第 ${index + 1} 行`,
      position: {
        line: index,
        start: currentPosition,
        end: currentPosition + line.length
      }
    });

    currentPosition += line.length + 1;
  });

  return anchors;
}

/**
 * 解析文档中的全部可引用锚点
 */
export function parseNoteAnchors(content: string): NoteAnchorTarget[] {
  return [
    ...parseHeadingAnchors(content),
    ...parseBlockAnchors(content)
  ];
}

/**
 * 按锚点类型过滤
 */
export function getAnchorsByKind(content: string, kind: NoteAnchorKind): NoteAnchorTarget[] {
  return parseNoteAnchors(content).filter(anchor => anchor.kind === kind);
}

/**
 * 查找单个锚点
 */
export function findNoteAnchor(
  content: string,
  kind: NoteAnchorKind,
  reference: string
): NoteAnchorTarget | undefined {
  const normalizedReference = kind === 'heading'
    ? normalizeHeadingReference(reference)
    : normalizeBlockReference(reference);

  return parseNoteAnchors(content).find(anchor =>
    anchor.kind === kind && anchor.normalizedReference === normalizedReference
  );
}
