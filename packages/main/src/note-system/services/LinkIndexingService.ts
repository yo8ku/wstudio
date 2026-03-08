/**
 * LinkIndexingService.ts
 * 笔记链接索引服务
 * 功能：在主进程内完成 wikilink 解析、出链重建、重命名传播和未链接提及查询
 */

import {
  createWikilink,
  findUnlinkedMentions as parseUnlinkedMentions,
  getLinkContext,
  parseWikilinksFromContent
} from '@note-studio/note-system';
import type { LinkItem, LinkTargetKind, NoteItem } from '../types';
import { NoteDatabase, NoteWithAliases, noteDatabase } from './NoteDatabase';

/**
 * 提供给 renderer 的未链接提及结果
 */
export interface UnlinkedMentionItem {
  noteId: string;
  noteTitle: string;
  context: string;
  matchedText: string;
  position: {
    start: number;
    end: number;
    line: number;
  };
}

export interface LinkTargetSuggestionItem {
  noteId: string;
  title: string;
  path: string;
  aliases: string[];
}

export interface LinkAnchorSuggestionItem {
  noteId: string;
  kind: Exclude<LinkTargetKind, 'note'>;
  reference: string;
  preview: string;
  line: number;
}

interface ParsedLinkLike {
  targetReference?: string;
  targetTitle?: string;
  targetKind?: LinkTargetKind;
  targetAnchor?: string;
  displayText?: string;
  position: {
    start: number;
    end: number;
  };
}

interface ParsedMentionLike {
  context: string;
  noteTitle: string;
  matchedText?: string;
  position: {
    start: number;
    end: number;
  };
}

interface ParsedAnchorTarget {
  kind: Exclude<LinkTargetKind, 'note'>;
  reference: string;
  normalizedReference: string;
  preview: string;
  position: {
    line: number;
    start: number;
    end: number;
  };
}

const STEM_ALIAS_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdown',
  'mkd',
  'mkdn',
  'mdx',
  'txt',
  'json'
]);

/**
 * 统一管理链接索引构建和查询
 */
export class LinkIndexingService {
  constructor(private readonly database: NoteDatabase) {}

  /**
   * 规范化链接引用
   */
  private normalizeReference(value?: string | null): string {
    return (value || '').trim().replace(/\\/g, '/').toLowerCase();
  }

  /**
   * 规范化标题锚点
   */
  private normalizeHeadingReference(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }

  /**
   * 规范化块锚点
   */
  private normalizeBlockReference(value: string): string {
    return value.trim().replace(/^\^/, '').toLowerCase();
  }

  /**
   * 将链接目标拆分为基础引用和锚点信息
   */
  private parseLinkTarget(rawTarget: string): {
    targetReference: string;
    targetTitle: string;
    targetKind: LinkTargetKind;
    targetAnchor?: string;
  } {
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
   * 兼容旧解析器输出，统一补齐缺失字段
   */
  private normalizeParsedLink(link: ParsedLinkLike): ParsedLinkLike & {
    targetReference: string;
    targetTitle: string;
    targetKind: LinkTargetKind;
  } {
    const parsedTarget = this.parseLinkTarget(link.targetReference || link.targetTitle || '');

    return {
      ...link,
      targetReference: parsedTarget.targetReference,
      targetTitle: parsedTarget.targetTitle,
      targetKind: link.targetKind || parsedTarget.targetKind,
      targetAnchor: link.targetAnchor || parsedTarget.targetAnchor
    };
  }

  /**
   * 构造带锚点的 Wikilink 目标
   */
  private buildLinkTarget(
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
   * 解析笔记中的标题和块级锚点
   */
  private parseNoteAnchorsFromContent(content: string): ParsedAnchorTarget[] {
    const anchors: ParsedAnchorTarget[] = [];
    const lines = content.split('\n');
    let currentPosition = 0;

    lines.forEach((line, index) => {
      const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (headingMatch && headingMatch[2].trim()) {
        const headingTitle = headingMatch[2].trim();
        anchors.push({
          kind: 'heading',
          reference: headingTitle,
          normalizedReference: this.normalizeHeadingReference(headingTitle),
          preview: headingTitle,
          position: {
            line: index,
            start: currentPosition,
            end: currentPosition + line.length
          }
        });
      }

      const blockMatch = line.match(/\^([A-Za-z0-9-]+)\s*$/);
      if (blockMatch) {
        const blockId = blockMatch[1];
        anchors.push({
          kind: 'block',
          reference: `^${blockId}`,
          normalizedReference: this.normalizeBlockReference(blockId),
          preview: line.trim() || `第 ${index + 1} 行`,
          position: {
            line: index,
            start: currentPosition,
            end: currentPosition + line.length
          }
        });
      }

      currentPosition += line.length + 1;
    });

    return anchors;
  }

  /**
   * 在笔记中定位单个锚点
   */
  private findNoteAnchorInContent(
    content: string,
    kind: Exclude<LinkTargetKind, 'note'>,
    reference: string
  ): ParsedAnchorTarget | undefined {
    const normalizedReference = kind === 'heading'
      ? this.normalizeHeadingReference(reference)
      : this.normalizeBlockReference(reference);

    return this.parseNoteAnchorsFromContent(content).find(anchor =>
      anchor.kind === kind && anchor.normalizedReference === normalizedReference
    );
  }

  private stripKnownExtension(reference: string): string | undefined {
    const trimmedReference = reference.trim();
    if (!trimmedReference) {
      return undefined;
    }

    const normalizedReference = trimmedReference.replace(/\\/g, '/');
    const dotIndex = normalizedReference.lastIndexOf('.');
    const slashIndex = normalizedReference.lastIndexOf('/');

    if (dotIndex <= slashIndex + 1 || dotIndex === normalizedReference.length - 1) {
      return undefined;
    }

    const extension = normalizedReference.slice(dotIndex + 1).toLowerCase();
    if (!STEM_ALIAS_EXTENSIONS.has(extension)) {
      return undefined;
    }

    return normalizedReference.slice(0, dotIndex);
  }

  private collectReferenceVariants(reference?: string | null): string[] {
    const trimmedReference = reference?.trim();
    if (!trimmedReference) {
      return [];
    }

    const variants = new Set<string>();
    const addVariant = (value?: string | null) => {
      const trimmedValue = value?.trim();
      if (trimmedValue) {
        variants.add(trimmedValue);
      }
    };

    addVariant(trimmedReference);

    const normalizedReference = trimmedReference.replace(/\\/g, '/');
    addVariant(normalizedReference);

    const pathSegments = normalizedReference.split('/').filter(Boolean);
    const basename = pathSegments[pathSegments.length - 1];
    addVariant(basename);

    addVariant(this.stripKnownExtension(normalizedReference));
    addVariant(basename ? this.stripKnownExtension(basename) : undefined);

    return Array.from(variants);
  }

  private collectRecordReferences(record: NoteWithAliases): string[] {
    const references = new Set<string>();

    for (const reference of [record.note.title, record.note.path, ...record.aliases]) {
      for (const variant of this.collectReferenceVariants(reference)) {
        references.add(variant);
      }
    }

    return Array.from(references);
  }

  /**
   * 构建标题、路径、别名的统一解析索引
   */
  private buildReferenceIndex(records: NoteWithAliases[]): Map<string, NoteItem> {
    const referenceIndex = new Map<string, NoteItem>();

    for (const record of records) {
      for (const reference of this.collectRecordReferences(record)) {
        const normalizedReference = this.normalizeReference(reference);
        if (!referenceIndex.has(normalizedReference)) {
          referenceIndex.set(normalizedReference, record.note);
        }
      }
    }

    return referenceIndex;
  }

  /**
   * 计算字符偏移对应的行号（1-based）
   */
  private getLineNumber(content: string, offset: number): number {
    return content.slice(0, offset).split('\n').length;
  }

  /**
   * 重新索引指定笔记的全部出链
   */
  async reindexNoteLinks(noteId: string): Promise<LinkItem[]> {
    const note = await this.database.getNote(noteId);
    if (!note) {
      return [];
    }

    const parsedLinks = parseWikilinksFromContent(note.content)
      .map(link => this.normalizeParsedLink(link as ParsedLinkLike))
      .filter(link => link.targetReference.length > 0);

    if (parsedLinks.length === 0) {
      return this.database.replaceLinksBySource(noteId, []);
    }

    const referenceRecords = await this.database.getAllNotesWithAliases();
    const referenceIndex = this.buildReferenceIndex(referenceRecords);

    return this.database.replaceLinksBySource(
      noteId,
      parsedLinks.map(link => ({
        targetId: referenceIndex.get(this.normalizeReference(link.targetReference))?.id,
        targetTitle: link.targetReference,
        context: getLinkContext(note.content, link.position),
        displayText: link.displayText,
        targetKind: link.targetKind,
        targetAnchor: link.targetAnchor,
        sourceStart: link.position.start,
        sourceEnd: link.position.end,
        isResolved: referenceIndex.has(this.normalizeReference(link.targetReference))
      }))
    );
  }

  /**
   * 查询某篇笔记在其他笔记中的未链接提及
   */
  async findUnlinkedMentions(noteId: string): Promise<UnlinkedMentionItem[]> {
    const currentNote = await this.database.getNote(noteId);
    if (!currentNote) {
      return [];
    }

    const aliases = await this.database.getNoteAliases(noteId);
    const searchTargets = this.collectRecordReferences({
      note: currentNote,
      aliases
    });
    const notes = await this.database.getAllNotes();
    const mentions: UnlinkedMentionItem[] = [];

    for (const note of notes) {
      if (note.id === currentNote.id) {
        continue;
      }

      const parsedMentions = parseUnlinkedMentions(
        note.content,
        searchTargets,
        note.title
      ) as ParsedMentionLike[];

      for (const mention of parsedMentions) {
        mentions.push({
          noteId: note.id,
          noteTitle: note.title,
          context: mention.context,
          matchedText: mention.matchedText || note.content.slice(mention.position.start, mention.position.end),
          position: {
            start: mention.position.start,
            end: mention.position.end,
            line: this.getLineNumber(note.content, mention.position.start)
          }
        });
      }
    }

    return mentions;
  }

  /**
   * 将未链接提及直接替换为 Wikilink
   */
  async convertUnlinkedMention(
    sourceNoteId: string,
    targetNoteId: string,
    position: { start: number; end: number },
    matchedText?: string
  ): Promise<boolean> {
    const [sourceNote, targetNote] = await Promise.all([
      this.database.getNote(sourceNoteId),
      this.database.getNote(targetNoteId)
    ]);

    if (!sourceNote || !targetNote) {
      return false;
    }

    const currentText = sourceNote.content.slice(position.start, position.end);
    if (!currentText) {
      return false;
    }

    const normalizedMatchedText = matchedText?.trim().replace(/^\[([^\]]+)\]$/, '$1');
    const replacement = createWikilink(
      targetNote.title,
      normalizedMatchedText && normalizedMatchedText !== targetNote.title ? normalizedMatchedText : undefined
    );
    const nextContent = `${sourceNote.content.slice(0, position.start)}${replacement}${sourceNote.content.slice(position.end)}`;

    const updated = await this.database.updateNote(sourceNote.id, { content: nextContent });
    if (!updated) {
      return false;
    }

    await this.reindexNoteLinks(sourceNote.id);
    return true;
  }

  /**
   * 标题变更后，将已解析到该笔记的旧标题链接改写为新标题
   */
  async propagateNoteRename(noteId: string, oldTitle: string, newTitle: string): Promise<number> {
    if (oldTitle.trim() === newTitle.trim()) {
      return 0;
    }

    const backlinks = await this.database.getBacklinks(noteId);
    const backlinksBySourceId = new Map<string, LinkItem[]>();

    for (const backlink of backlinks) {
      const normalizedTargetTitle = this.normalizeReference(backlink.targetTitle);
      if (normalizedTargetTitle !== this.normalizeReference(oldTitle)) {
        continue;
      }

      const sourceBacklinks = backlinksBySourceId.get(backlink.sourceId) || [];
      sourceBacklinks.push(backlink);
      backlinksBySourceId.set(backlink.sourceId, sourceBacklinks);
    }

    let updatedSourceCount = 0;
    for (const [sourceId, sourceLinks] of backlinksBySourceId) {
      const sourceNote = await this.database.getNote(sourceId);
      if (!sourceNote) {
        continue;
      }

      let nextContent = sourceNote.content;
      const linksToRewrite = sourceLinks
        .filter(link => link.sourceStart !== undefined && link.sourceEnd !== undefined)
        .sort((left, right) => (right.sourceStart || 0) - (left.sourceStart || 0));

      if (linksToRewrite.length === 0) {
        continue;
      }

      for (const link of linksToRewrite) {
        const sourceStart = link.sourceStart as number;
        const sourceEnd = link.sourceEnd as number;
        const replacementTarget = this.buildLinkTarget(
          newTitle,
          link.targetKind || 'note',
          link.targetAnchor
        );
        const replacement = createWikilink(replacementTarget, link.displayText);

        nextContent = `${nextContent.slice(0, sourceStart)}${replacement}${nextContent.slice(sourceEnd)}`;
      }

      if (nextContent === sourceNote.content) {
        continue;
      }

      await this.database.updateNote(sourceId, { content: nextContent });
      await this.reindexNoteLinks(sourceId);
      updatedSourceCount += 1;
    }

    return updatedSourceCount;
  }

  /**
   * 当笔记标题、路径或别名发生变化后，恢复可重新解析的 dangling links
   */
  async repairDanglingLinksForNote(noteId: string): Promise<number> {
    const referenceRecords = await this.database.getAllNotesWithAliases();
    const currentRecord = referenceRecords.find(record => record.note.id === noteId);
    if (!currentRecord) {
      return 0;
    }

    const validReferences = new Set(
      this.collectRecordReferences(currentRecord)
        .map(reference => this.normalizeReference(reference))
        .filter(reference => reference.length > 0)
    );

    const danglingLinks = await this.database.getDanglingLinks();
    const matchedTitles = new Set(
      danglingLinks
        .map(link => link.targetTitle)
        .filter(targetTitle => validReferences.has(this.normalizeReference(targetTitle)))
    );

    let repairedCount = 0;

    for (const targetTitle of matchedTitles) {
      repairedCount += await this.database.updateLinkTargetId(targetTitle, noteId);
    }

    return repairedCount;
  }

  /**
   * 搜索可用于 Wikilink 自动补全的目标
   */
  async searchLinkTargets(query: string): Promise<LinkTargetSuggestionItem[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const records = await this.database.getAllNotesWithAliases();

    return records
      .filter(record => {
        if (!normalizedQuery) {
          return true;
        }

        const searchSpace = this.collectRecordReferences(record).join('\n').toLowerCase();

        return searchSpace.includes(normalizedQuery);
      })
      .slice(0, 50)
      .map(record => ({
        noteId: record.note.id,
        title: record.note.title,
        path: record.note.path,
        aliases: record.aliases
      }));
  }

  /**
   * 获取某个链接目标可用的标题/块锚点建议
   */
  async getLinkAnchors(targetReference: string, query?: string): Promise<LinkAnchorSuggestionItem[]> {
    const referenceRecords = await this.database.getAllNotesWithAliases();
    const referenceIndex = this.buildReferenceIndex(referenceRecords);
    const targetNote = referenceIndex.get(this.normalizeReference(targetReference));
    if (!targetNote) {
      return [];
    }

    const normalizedQuery = query?.trim().toLowerCase() || '';
    return this.parseNoteAnchorsFromContent(targetNote.content)
      .filter(anchor => {
        if (!normalizedQuery) {
          return true;
        }

        return anchor.reference.toLowerCase().includes(normalizedQuery)
          || anchor.preview.toLowerCase().includes(normalizedQuery);
      })
      .map(anchor => ({
        noteId: targetNote.id,
        kind: anchor.kind,
        reference: anchor.reference,
        preview: anchor.preview,
        line: anchor.position.line + 1
      }));
  }

  /**
   * 校验某个引用的锚点是否存在
   */
  async validateTargetAnchor(
    targetReference: string,
    targetKind: Exclude<LinkTargetKind, 'note'>,
    targetAnchor: string
  ): Promise<boolean> {
    const referenceRecords = await this.database.getAllNotesWithAliases();
    const referenceIndex = this.buildReferenceIndex(referenceRecords);
    const targetNote = referenceIndex.get(this.normalizeReference(targetReference));
    if (!targetNote) {
      return false;
    }

    return !!this.findNoteAnchorInContent(targetNote.content, targetKind, targetAnchor);
  }
}

/**
 * 默认单例服务
 */
export const linkIndexingService = new LinkIndexingService(noteDatabase);
