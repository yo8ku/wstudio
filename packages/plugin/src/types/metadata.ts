/**
 * Metadata cache contracts aligned with markdown cache capabilities exposed to plugins.
 */

import { Events } from './events';
import type { EventRef } from './disposable';
import type { MutableJsonValue } from './json';
import type { TFile } from './vault';

export interface Loc {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}

export interface Pos {
  readonly start: Loc;
  readonly end: Loc;
}

export interface CacheItem {
  readonly position: Pos;
}

export interface Reference {
  readonly link: string;
  readonly original: string;
  readonly displayText?: string;
}

export interface ReferenceCache extends Reference, CacheItem {}

export interface LinkCache extends ReferenceCache {}

export interface EmbedCache extends ReferenceCache {}

export interface FrontmatterLinkCache extends Reference {
  readonly key: string;
}

export interface ReferenceLinkCache extends CacheItem {
  readonly id: string;
  readonly link: string;
}

export interface TagCache extends CacheItem {
  readonly tag: string;
}

export interface HeadingCache extends CacheItem {
  readonly heading: string;
  readonly level: number;
}

export interface BlockCache extends CacheItem {
  readonly id: string;
}

export interface FootnoteCache extends CacheItem {
  readonly id: string;
}

export interface FootnoteRefCache extends CacheItem {
  readonly id: string;
}

export interface ListItemCache extends CacheItem {
  readonly id?: string;
  readonly task?: string;
  readonly parent: number;
}

export interface SectionCache extends CacheItem {
  readonly id?: string;
  readonly type:
    | 'blockquote'
    | 'callout'
    | 'code'
    | 'element'
    | 'footnoteDefinition'
    | 'heading'
    | 'html'
    | 'list'
    | 'paragraph'
    | 'table'
    | 'text'
    | 'thematicBreak'
    | 'yaml'
    | string;
}

export interface FrontMatterCache {
  [key: string]: MutableJsonValue | undefined;
}

export interface FrontMatterInfo {
  readonly exists: boolean;
  readonly frontmatter: string;
  readonly from: number;
  readonly to: number;
  readonly contentStart: number;
}

export interface SubpathResult {
  readonly start: Loc;
  readonly end: Loc | null;
}

export interface HeadingSubpathResult extends SubpathResult {
  readonly type: 'heading';
  readonly current: HeadingCache;
  readonly next: HeadingCache;
}

export interface BlockSubpathResult extends SubpathResult {
  readonly type: 'block';
  readonly block: BlockCache;
  readonly list?: ListItemCache;
}

export interface FootnoteSubpathResult extends SubpathResult {
  readonly type: 'footnote';
  readonly footnote: FootnoteCache;
}

export interface CachedMetadata {
  readonly links?: readonly LinkCache[];
  readonly embeds?: readonly EmbedCache[];
  readonly frontmatterLinks?: readonly FrontmatterLinkCache[];
  readonly referenceLinks?: readonly ReferenceLinkCache[];
  readonly tags?: readonly TagCache[];
  readonly headings?: readonly HeadingCache[];
  readonly blocks?: readonly BlockCache[];
  readonly footnotes?: readonly FootnoteCache[];
  readonly footnoteRefs?: readonly FootnoteRefCache[];
  readonly listItems?: readonly ListItemCache[];
  readonly sections?: readonly SectionCache[];
  readonly frontmatter?: FrontMatterCache;
  readonly frontmatterPosition?: Pos;
}

export abstract class MetadataCache extends Events {
  public abstract readonly resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>;

  public abstract readonly unresolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>;

  public abstract getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;

  public abstract getFileCache(file: TFile): CachedMetadata | null;

  public abstract getCache(path: string): CachedMetadata | null;

  public abstract fileToLinktext(
    file: TFile,
    sourcePath: string,
    omitMdExtension?: boolean,
  ): string;
}

export interface MetadataCache {
  on(
    name: 'changed',
    callback: (file: TFile, data: string, cache: CachedMetadata) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'deleted',
    callback: (file: TFile, previousCache: CachedMetadata | null) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'resolve',
    callback: (file: TFile) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'resolved',
    callback: () => void,
    context?: object,
  ): EventRef;
}
