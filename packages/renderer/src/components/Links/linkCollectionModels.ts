import type { LinkItem, UnlinkedMentionItem } from '../../types/electron';
import type { LinkCollectionChildItem, LinkCollectionItem } from './LinkCollection';

const hasLineNumber = (lineNumber?: number): lineNumber is number => typeof lineNumber === 'number';

const getAnchorSuffix = (kind?: LinkItem['targetKind'], anchor?: string): string => {
  if (!kind || kind === 'note' || !anchor) {
    return '';
  }

  return kind === 'block' ? `#^${anchor}` : `#${anchor}`;
};

const buildWikilinkLabel = (
  link: Pick<LinkItem, 'targetTitle' | 'displayText' | 'targetKind' | 'targetAnchor'>
): string => {
  const targetReference = `${link.targetTitle}${getAnchorSuffix(link.targetKind, link.targetAnchor)}`;

  if (link.displayText && link.displayText !== link.targetTitle) {
    return `[[${targetReference}|${link.displayText}]]`;
  }

  return `[[${targetReference}]]`;
};

const buildMentionLabel = (mention: Pick<UnlinkedMentionItem, 'matchedText' | 'context'>): string => {
  const normalizedText = mention.matchedText.trim();

  if (!normalizedText) {
    return '';
  }

  if (
    (normalizedText.startsWith('[') && normalizedText.endsWith(']'))
    || mention.context.includes(`[${normalizedText}]`)
  ) {
    return `[${normalizedText}]`;
  }

  return normalizedText;
};

const pushGroupedChild = (
  groups: Map<string, LinkCollectionItem>,
  groupKey: string,
  createGroup: () => LinkCollectionItem,
  child: LinkCollectionChildItem
) => {
  const existingGroup = groups.get(groupKey);

  if (existingGroup) {
    existingGroup.children = [...(existingGroup.children || []), child];
    return;
  }

  const nextGroup = createGroup();
  nextGroup.children = [...(nextGroup.children || []), child];
  groups.set(groupKey, nextGroup);
};

export const createOutlinkCollectionItems = (
  links: LinkItem[],
  openNote: (noteId?: string) => void | Promise<void>
): LinkCollectionItem[] => {
  const groups = new Map<string, LinkCollectionItem>();

  links.forEach(link => {
    const groupKey = `${link.targetId || 'dangling'}:${link.targetTitle}`;

    pushGroupedChild(
      groups,
      groupKey,
      () => ({
        id: `outlink-${groupKey}`,
        title: link.targetTitle,
        badges: link.targetId ? [] : [{ label: '未解析', tone: 'warning' }],
        children: []
      }),
      {
        id: link.id,
        title: buildWikilinkLabel(link),
        context: link.context,
        sourceNoteId: link.sourceId,
        lineNumber: link.sourceLine,
        badges: link.targetId ? [] : [{ label: '未解析', tone: 'warning' }],
        onOpen: link.targetId ? () => openNote(link.targetId) : undefined
      }
    );
  });

  return Array.from(groups.values());
};

export const createBacklinkCollectionItems = (
  links: LinkItem[],
  openNote: (noteId?: string, lineNumber?: number) => void | Promise<void>
): LinkCollectionItem[] => {
  const groups = new Map<string, LinkCollectionItem>();

  links.forEach(link => {
    const sourceTitle = link.sourceNoteTitle || '来源笔记';
    const groupKey = `${link.sourceId}:${sourceTitle}`;

    pushGroupedChild(
      groups,
      groupKey,
      () => ({
        id: `backlink-${groupKey}`,
        title: sourceTitle,
        children: []
      }),
      {
        id: link.id,
        title: buildWikilinkLabel(link),
        context: link.context,
        sourceNoteId: link.sourceId,
        lineNumber: link.sourceLine,
        badges: hasLineNumber(link.sourceLine) ? [{ label: `第${link.sourceLine}行` }] : [],
        onOpen: () => openNote(link.sourceId, link.sourceLine)
      }
    );
  });

  return Array.from(groups.values());
};

export const createMentionCollectionItems = (
  mentions: UnlinkedMentionItem[],
  openNote: (noteId?: string, lineNumber?: number) => void | Promise<void>,
  convertMention: (
    sourceNoteId: string,
    position: { start: number; end: number },
    matchedText: string
  ) => void | Promise<void>
): LinkCollectionItem[] => {
  const groups = new Map<string, LinkCollectionItem>();

  mentions.forEach((mention, index) => {
    const groupKey = `${mention.noteId}:${mention.noteTitle}`;

    pushGroupedChild(
      groups,
      groupKey,
      () => ({
        id: `mention-${groupKey}`,
        title: mention.noteTitle,
        children: []
      }),
      {
        id: `${mention.noteId}-${mention.position.start}-${index}`,
        title: buildMentionLabel(mention),
        context: mention.context,
        sourceNoteId: mention.noteId,
        lineNumber: mention.position.line,
        onOpen: () => openNote(mention.noteId, mention.position.line),
        action: {
          label: '转为链接',
          onTrigger: () => convertMention(mention.noteId, mention.position, mention.matchedText)
        }
      }
    );
  });

  return Array.from(groups.values());
};
