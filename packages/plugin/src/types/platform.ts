/**
 * Cross-platform utility functions for requests, path normalization, and plugin-facing helpers.
 */

import type {
  BlockSubpathResult,
  CachedMetadata,
  FootnoteSubpathResult,
  FrontMatterCache,
  FrontMatterInfo,
  HeadingSubpathResult,
  Reference,
  ReferenceCache,
} from './metadata';
import type { MutableJsonObject, MutableJsonValue } from './json';
import type {
  SearchMatches,
  SearchResult,
  SearchResultContainer,
} from './suggest';

type DebounceArgument =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | object
  | null
  | undefined;

type PromiseRejectionReason =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | object
  | null
  | undefined;

export interface RequestUrlParam {
  readonly url: string;
  readonly method?: string;
  readonly contentType?: string;
  readonly body?: string | ArrayBuffer;
  readonly headers?: Readonly<Record<string, string>>;
  readonly throw?: boolean;
}

export interface RequestUrlResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly arrayBuffer: ArrayBuffer;
  readonly json: MutableJsonValue | null;
  readonly text: string;
}

export interface RequestUrlResponsePromise extends Promise<RequestUrlResponse> {
  readonly arrayBuffer: Promise<ArrayBuffer>;
  readonly json: Promise<MutableJsonValue | null>;
  readonly text: Promise<string>;
  readonly [Symbol.toStringTag]: string;
}

export interface MomentDuration {
  asMilliseconds(): number;
  humanize(): string;
}

export interface MomentLike {
  toDate(): Date;
  valueOf(): number;
  format(pattern?: string): string;
  fromNow(): string;
  clone(): MomentLike;
  add(amount: number, unit?: string): MomentLike;
  subtract(amount: number, unit?: string): MomentLike;
}

export interface MomentFactory {
  (input?: string | number | Date | MomentLike | null): MomentLike;
  unix(seconds: number): MomentLike;
  duration(input: number, unit?: string): MomentDuration;
  isMoment(value: object | null | undefined): value is MomentLike;
}

export interface Debouncer<TArgs extends readonly DebounceArgument[], TValue> {
  (...args: TArgs): Debouncer<TArgs, TValue>;
  cancel(): Debouncer<TArgs, TValue>;
  run(): TValue | void;
}

function normalizeRequestParams(request: RequestUrlParam | string): RequestUrlParam {
  if (typeof request === 'string') {
    return {
      url: request,
    };
  }

  return request;
}

function safeParseJson(text: string): MutableJsonValue | null {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as MutableJsonValue;
  } catch {
    return null;
  }
}

function collectHeaders(headers: Headers): Readonly<Record<string, string>> {
  const entries: Record<string, string> = {};

  headers.forEach((value, key) => {
    entries[key] = value;
  });

  return entries;
}

class ManagedRequestUrlResponsePromise implements RequestUrlResponsePromise {
  public readonly [Symbol.toStringTag] = 'Promise';

  public constructor(private readonly promise: Promise<RequestUrlResponse>) {}

  public get arrayBuffer(): Promise<ArrayBuffer> {
    return this.promise.then((response) => response.arrayBuffer);
  }

  public get json(): Promise<MutableJsonValue | null> {
    return this.promise.then((response) => response.json);
  }

  public get text(): Promise<string> {
    return this.promise.then((response) => response.text);
  }

  public then<TResult1 = RequestUrlResponse, TResult2 = never>(
    onfulfilled?:
      | ((value: RequestUrlResponse) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: PromiseRejectionReason) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  public catch<TResult = never>(
    onrejected?:
      | ((reason: PromiseRejectionReason) => TResult | PromiseLike<TResult>)
      | null,
  ): Promise<RequestUrlResponse | TResult> {
    return this.promise.catch(onrejected ?? undefined);
  }

  public finally(onfinally?: (() => void) | null): Promise<RequestUrlResponse> {
    return this.promise.finally(onfinally ?? undefined);
  }
}

export const apiVersion = '1.0.0';

class ManagedMomentDuration implements MomentDuration {
  private readonly milliseconds: number;

  public constructor(input: number, unit?: string) {
    this.milliseconds = convertDurationToMilliseconds(input, unit);
  }

  public asMilliseconds(): number {
    return this.milliseconds;
  }

  public humanize(): string {
    const absolute = Math.abs(this.milliseconds);

    if (absolute < 60_000) {
      return 'a few seconds';
    }

    if (absolute < 3_600_000) {
      return `${Math.round(absolute / 60_000)} minutes`;
    }

    if (absolute < 86_400_000) {
      return `${Math.round(absolute / 3_600_000)} hours`;
    }

    return `${Math.round(absolute / 86_400_000)} days`;
  }
}

class ManagedMoment implements MomentLike {
  private readonly date: Date;

  public constructor(input?: string | number | Date | MomentLike | null) {
    if (input === null || input === undefined) {
      this.date = new Date();
      return;
    }

    if (isMomentLike(input)) {
      this.date = input.toDate();
      return;
    }

    this.date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  }

  public toDate(): Date {
    return new Date(this.date.getTime());
  }

  public valueOf(): number {
    return this.date.getTime();
  }

  public format(pattern?: string): string {
    void pattern;
    return Number.isNaN(this.date.getTime()) ? '' : this.date.toISOString();
  }

  public fromNow(): string {
    const delta = this.date.getTime() - Date.now();

    if (Math.abs(delta) < 60_000) {
      return 'a few seconds';
    }

    const minutes = Math.round(delta / 60_000);

    if (Math.abs(minutes) < 60) {
      return minutes > 0 ? `in ${minutes} minutes` : `${Math.abs(minutes)} minutes ago`;
    }

    const hours = Math.round(minutes / 60);

    if (Math.abs(hours) < 24) {
      return hours > 0 ? `in ${hours} hours` : `${Math.abs(hours)} hours ago`;
    }

    const days = Math.round(hours / 24);
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
  }

  public clone(): MomentLike {
    return new ManagedMoment(this.date);
  }

  public add(amount: number, unit?: string): MomentLike {
    return new ManagedMoment(this.date.getTime() + convertDurationToMilliseconds(amount, unit));
  }

  public subtract(amount: number, unit?: string): MomentLike {
    return new ManagedMoment(this.date.getTime() - convertDurationToMilliseconds(amount, unit));
  }
}

type GlobalWithProcess = typeof globalThis & {
  readonly navigator?: Navigator;
  readonly process?: {
    readonly platform?: string;
  };
};

function isMomentLike(
  value: string | number | Date | MomentLike | object | null | undefined,
): value is MomentLike {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== 'object' && typeof value !== 'function') {
    return false;
  }

  return 'toDate' in value && 'format' in value && 'fromNow' in value;
}

function convertDurationToMilliseconds(value: number, unit?: string): number {
  switch (unit) {
    case 'ms':
    case 'millisecond':
    case 'milliseconds':
    case undefined:
      return value;
    case 's':
    case 'second':
    case 'seconds':
      return value * 1_000;
    case 'm':
    case 'minute':
    case 'minutes':
      return value * 60_000;
    case 'h':
    case 'hour':
    case 'hours':
      return value * 3_600_000;
    case 'd':
    case 'day':
    case 'days':
      return value * 86_400_000;
    case 'w':
    case 'week':
    case 'weeks':
      return value * 604_800_000;
    default:
      return value;
  }
}

const momentFactory = ((input?: string | number | Date | MomentLike | null): MomentLike => {
  return new ManagedMoment(input);
}) as MomentFactory;

momentFactory.unix = (seconds: number): MomentLike => new ManagedMoment(seconds * 1_000);
momentFactory.duration = (input: number, unit?: string): MomentDuration => {
  return new ManagedMomentDuration(input, unit);
};
momentFactory.isMoment = (value: object | null | undefined): value is MomentLike => {
  return isMomentLike(value);
};

export const moment = momentFactory;

const platformContext = globalThis as GlobalWithProcess;
const userAgent = platformContext.navigator?.userAgent ?? '';
const processPlatform = platformContext.process?.platform ?? '';
const isDesktopApp = typeof processPlatform === 'string' && processPlatform.length > 0;
const isAndroidApp = /Android/i.test(userAgent);
const isIosApp = /iPhone|iPad|iPod/i.test(userAgent);
const isMobileApp = isAndroidApp || isIosApp;
const isMobile = isMobileApp;
const isDesktop = !isMobile;
const isPhone = isMobile && /Mobile/i.test(userAgent);
const isTablet = isMobile && !isPhone;
const isMacOS = /Mac|iPhone|iPad|iPod/i.test(userAgent) || processPlatform === 'darwin';
const isWin = processPlatform === 'win32' || /Windows/i.test(userAgent);
const isLinux = processPlatform === 'linux' || /Linux/i.test(userAgent);
const isSafari = /Safari/i.test(userAgent) && !/Chrome|Chromium|Android/i.test(userAgent);

export const Platform = {
  isDesktop,
  isMobile,
  isDesktopApp,
  isMobileApp,
  isIosApp,
  isAndroidApp,
  isPhone,
  isTablet,
  isMacOS,
  isWin,
  isLinux,
  isSafari,
  resourcePathPrefix: isMobile ? 'file:///' : 'app://local/',
};

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseScalar(value: string): MutableJsonValue {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  if (trimmed === '') {
    return '';
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const content = trimmed.slice(1, -1).trim();

    if (content.length === 0) {
      return [];
    }

    return content.split(',').map((item) => parseScalar(item));
  }

  return trimmed;
}

function stringifyScalar(value: MutableJsonValue): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyScalar(item)).join(', ')}]`;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return stringifyYaml(value);
  }

  return String(value);
}

function normalizeFrontmatterValue(value: MutableJsonValue | undefined): MutableJsonValue | null {
  if (value === undefined) {
    return null;
  }

  return value;
}

function collectHeadingMatch(
  cache: CachedMetadata,
  headingText: string,
): HeadingSubpathResult | null {
  const headings = cache.headings ?? [];
  const normalizedHeading = stripHeadingForLink(headingText);

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];

    if (stripHeadingForLink(heading.heading) !== normalizedHeading) {
      continue;
    }

    const next = headings[index + 1] ?? heading;

    return {
      type: 'heading',
      current: heading,
      next,
      start: heading.position.start,
      end: heading.position.end,
    };
  }

  return null;
}

function collectBlockMatch(
  cache: CachedMetadata,
  blockId: string,
): BlockSubpathResult | FootnoteSubpathResult | null {
  const blocks = cache.blocks ?? [];

  for (const block of blocks) {
    if (block.id !== blockId) {
      continue;
    }

    const list = (cache.listItems ?? []).find((item) => item.id === blockId);

    return {
      type: 'block',
      block,
      list,
      start: block.position.start,
      end: block.position.end,
    };
  }

  const footnotes = cache.footnotes ?? [];

  for (const footnote of footnotes) {
    if (footnote.id !== blockId) {
      continue;
    }

    return {
      type: 'footnote',
      footnote,
      start: footnote.position.start,
      end: footnote.position.end,
    };
  }

  return null;
}

export function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (part.length === 0 || part === '.') {
      continue;
    }

    if (part === '..') {
      if (stack.length > 0) {
        stack.pop();
      }

      continue;
    }

    stack.push(part);
  }

  return stack.join('/');
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';

  for (const value of new Uint8Array(buffer)) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary);
}

export function arrayBufferToHex(data: ArrayBuffer): string {
  return Array.from(new Uint8Array(data))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes.buffer;
}

export function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

export function getLanguage(): string {
  const language = navigator.language.trim().toLowerCase();

  if (language.length === 0) {
    return 'en';
  }

  return language.split('-')[0] ?? 'en';
}

export function parseLinktext(linktext: string): {
  readonly path: string;
  readonly subpath: string;
} {
  const hashIndex = linktext.indexOf('#');

  if (hashIndex === -1) {
    return {
      path: linktext,
      subpath: '',
    };
  }

  return {
    path: linktext.slice(0, hashIndex),
    subpath: linktext.slice(hashIndex),
  };
}

export function getLinkpath(linktext: string): string {
  return parseLinktext(linktext).path;
}

export function stripHeading(heading: string): string {
  return heading.replace(/^#+\s*/, '').trim();
}

export function stripHeadingForLink(heading: string): string {
  return stripHeading(heading)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFrontMatterInfo(content: string): FrontMatterInfo {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m.exec(content);

  if (match === null || match.index !== 0) {
    return {
      exists: false,
      frontmatter: '',
      from: 0,
      to: 0,
      contentStart: 0,
    };
  }

  const fullMatch = match[0];
  const frontmatter = match[1] ?? '';
  const from = fullMatch.indexOf(frontmatter);
  const to = from + frontmatter.length;

  return {
    exists: true,
    frontmatter,
    from,
    to,
    contentStart: fullMatch.length,
  };
}

export function parseYaml(yaml: string): MutableJsonValue | null {
  const lines = yaml.split(/\r?\n/);
  const result: MutableJsonObject = {};
  let currentArrayKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0 || line.trimStart().startsWith('#')) {
      continue;
    }

    const arrayMatch = /^\s*-\s+(.*)$/.exec(line);

    if (arrayMatch !== null && currentArrayKey !== null) {
      const currentValue = result[currentArrayKey];
      const nextValue = parseScalar(arrayMatch[1] ?? '');

      if (Array.isArray(currentValue)) {
        currentValue.push(nextValue);
      }

      continue;
    }

    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const valueText = line.slice(separatorIndex + 1).trim();

    if (valueText.length === 0) {
      currentArrayKey = key;
      result[key] = [];
      continue;
    }

    currentArrayKey = null;
    result[key] = parseScalar(valueText);
  }

  return result;
}

export function stringifyYaml(value: MutableJsonValue): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return value.map((item) => `- ${stringifyScalar(item)}`).join('\n');
  }

  if (typeof value !== 'object') {
    return stringifyScalar(value);
  }

  return Object.entries(value)
    .map(([key, entry]) => {
      if (entry === undefined) {
        return `${key}:`;
      }

      if (Array.isArray(entry)) {
        if (entry.length === 0) {
          return `${key}: []`;
        }

        return `${key}:\n${entry.map((item) => `  - ${stringifyScalar(item)}`).join('\n')}`;
      }

      return `${key}: ${stringifyScalar(entry)}`;
    })
    .join('\n');
}

export function parseFrontMatterEntry(
  frontmatter: FrontMatterCache | null,
  key: string | RegExp,
): MutableJsonValue | null {
  if (frontmatter === null) {
    return null;
  }

  if (typeof key === 'string') {
    return normalizeFrontmatterValue(frontmatter[key]);
  }

  for (const [entryKey, entryValue] of Object.entries(frontmatter)) {
    if (key.test(entryKey)) {
      return normalizeFrontmatterValue(entryValue);
    }
  }

  return null;
}

export function parseFrontMatterStringArray(
  frontmatter: FrontMatterCache | null,
  key: string | RegExp,
): string[] | null {
  const value = parseFrontMatterEntry(frontmatter, key);

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return null;
}

export function parseFrontMatterAliases(frontmatter: FrontMatterCache | null): string[] | null {
  return parseFrontMatterStringArray(frontmatter, /^aliases?$/i);
}

export function parseFrontMatterTags(frontmatter: FrontMatterCache | null): string[] | null {
  const value = parseFrontMatterEntry(frontmatter, /^tags?$/i);

  if (typeof value === 'string') {
    return value.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return null;
}

export function getAllTags(cache: CachedMetadata): string[] | null {
  const tags = new Set<string>();

  for (const tag of cache.tags ?? []) {
    tags.add(tag.tag);
  }

  for (const tag of parseFrontMatterTags(cache.frontmatter ?? null) ?? []) {
    tags.add(tag);
  }

  if (tags.size === 0) {
    return null;
  }

  return [...tags];
}

export function iterateRefs<TReference extends Reference>(
  refs: readonly TReference[],
  callback: (ref: TReference) => boolean | void,
): boolean {
  for (const ref of refs) {
    if (callback(ref) === true) {
      return true;
    }
  }

  return false;
}

export function iterateCacheRefs(
  cache: CachedMetadata,
  callback: (ref: ReferenceCache) => boolean | void,
): boolean {
  const refs: ReferenceCache[] = [
    ...(cache.links ?? []),
    ...(cache.embeds ?? []),
  ];

  return iterateRefs(refs, callback);
}

export function resolveSubpath(
  cache: CachedMetadata,
  subpath: string,
): HeadingSubpathResult | BlockSubpathResult | FootnoteSubpathResult | null {
  const normalized = subpath.startsWith('#') ? subpath.slice(1) : subpath;

  if (normalized.startsWith('^')) {
    return collectBlockMatch(cache, normalized.slice(1));
  }

  return collectHeadingMatch(cache, normalized);
}

export function prepareSimpleSearch(query: string): (text: string) => SearchResult | null {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return (text: string): SearchResult | null => {
    if (words.length === 0) {
      return {
        score: 0,
        matches: [],
      };
    }

    const haystack = text.toLowerCase();
    const matches: Array<[number, number]> = [];
    let score = 0;

    for (const word of words) {
      const start = haystack.indexOf(word);

      if (start === -1) {
        return null;
      }

      matches.push([start, start + word.length]);
      score += word.length / (start + 1);
    }

    return {
      score,
      matches,
    };
  };
}

export function prepareFuzzySearch(query: string): (text: string) => SearchResult | null {
  const normalizedQuery = query.toLowerCase();

  return (text: string): SearchResult | null => {
    if (normalizedQuery.length === 0) {
      return {
        score: 0,
        matches: [],
      };
    }

    const haystack = text.toLowerCase();
    const matches: Array<[number, number]> = [];
    let searchIndex = 0;

    for (const char of normalizedQuery) {
      const foundIndex = haystack.indexOf(char, searchIndex);

      if (foundIndex === -1) {
        return null;
      }

      matches.push([foundIndex, foundIndex + 1]);
      searchIndex = foundIndex + 1;
    }

    return {
      score: normalizedQuery.length / Math.max(searchIndex, 1),
      matches,
    };
  };
}

export function sortSearchResults(results: SearchResultContainer[]): void {
  results.sort((left, right) => right.match.score - left.match.score);
}

function appendParsedHtml(
  root: DocumentFragment,
  html: string,
): void {
  const tokenPattern = /<\/?[^>]+>|[^<]+/g;
  const attributePattern = /([^\s=]+)(?:=(["'])(.*?)\2)?/g;
  const stack: Array<DocumentFragment | HTMLElement> = [root];
  const tokens = html.match(tokenPattern) ?? [];

  for (const token of tokens) {
    if (token.startsWith('</')) {
      if (stack.length > 1) {
        stack.pop();
      }

      continue;
    }

    if (token.startsWith('<')) {
      const tagMatch = /^<([a-zA-Z0-9-]+)([^>]*)\/?>$/.exec(token.trim());

      if (tagMatch === null) {
        continue;
      }

      const tagName = tagMatch[1].toLowerCase();
      const attributeSource = tagMatch[2] ?? '';
      const element = document.createElement(tagName);

      for (const attributeMatch of attributeSource.matchAll(attributePattern)) {
        const attributeName = attributeMatch[1];
        const attributeValue = attributeMatch[3] ?? '';

        if (attributeName === undefined || attributeName === '/') {
          continue;
        }

        if (attributeName === 'class') {
          element.className = attributeValue;
          continue;
        }

        element.setAttribute(attributeName, attributeValue);
      }

      stack[stack.length - 1].append(element);

      const selfClosing = token.endsWith('/>') || tagName === 'br';

      if (!selfClosing) {
        stack.push(element);
      }

      continue;
    }

    stack[stack.length - 1].append(document.createTextNode(token));
  }
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();

  for (const node of Array.from(documentNode.body.childNodes)) {
    if (typeof node === 'string') {
      appendParsedHtml(fragment, node);
      continue;
    }

    fragment.append(node.cloneNode(true));
  }

  return fragment;
}

function markdownFromNode(node: Node): string {
  if (node instanceof Text) {
    return node.textContent ?? '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const childContent = Array.from(node.childNodes).map(markdownFromNode).join('');
  const tagName = node.tagName.toLowerCase();

  if (tagName === 'br') {
    return '\n';
  }

  if (tagName === 'strong' || tagName === 'b') {
    return `**${childContent}**`;
  }

  if (tagName === 'em' || tagName === 'i') {
    return `*${childContent}*`;
  }

  if (tagName === 'code') {
    return `\`${childContent}\``;
  }

  if (tagName === 'pre') {
    return `\`\`\`\n${node.textContent ?? ''}\n\`\`\`\n\n`;
  }

  if (tagName === 'a') {
    const href = node.getAttribute('href') ?? '';
    return `[${childContent}](${href})`;
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number.parseInt(tagName.slice(1), 10);
    return `${'#'.repeat(level)} ${childContent}\n\n`;
  }

  if (tagName === 'li') {
    return `- ${childContent}\n`;
  }

  if (tagName === 'ul' || tagName === 'ol') {
    return `${childContent}\n`;
  }

  if (tagName === 'p' || tagName === 'div' || tagName === 'section' || tagName === 'article') {
    return `${childContent}\n\n`;
  }

  return childContent;
}

export function htmlToMarkdown(html: string | HTMLElement | Document | DocumentFragment): string {
  if (typeof html === 'string') {
    return htmlToMarkdown(sanitizeHTMLToDom(html));
  }

  if (html instanceof Document) {
    return htmlToMarkdown(html.body);
  }

  return Array.from(html.childNodes)
    .map(markdownFromNode)
    .join('')
    .trim();
}

export function renderMatches(
  el: HTMLElement | DocumentFragment,
  text: string,
  matches: SearchMatches | null,
  offset = 0,
): void {
  const target = el;

  if (target instanceof HTMLElement) {
    target.replaceChildren();
  } else {
    while (target.firstChild !== null) {
      target.removeChild(target.firstChild);
    }
  }

  if (matches === null || matches.length === 0) {
    target.append(text);
    return;
  }

  let cursor = 0;

  for (const match of matches) {
    const start = Math.max(match[0] - offset, 0);
    const end = Math.max(match[1] - offset, start);

    if (start > cursor) {
      target.append(text.slice(cursor, start));
    }

    const markEl = document.createElement('mark');
    markEl.textContent = text.slice(start, end);
    target.append(markEl);
    cursor = end;
  }

  if (cursor < text.length) {
    target.append(text.slice(cursor));
  }
}

export function renderResults(
  el: HTMLElement,
  text: string,
  result: SearchResult,
  offset = 0,
): void {
  renderMatches(el, text, result.matches, offset);
}

export function requireApiVersion(version: string): boolean {
  return compareVersions(apiVersion, version) >= 0;
}

type GlobalWithOptionalLibraries = typeof globalThis & {
  readonly MathJax?: object;
  readonly mermaid?: object;
  readonly pdfjsLib?: object;
  readonly Prism?: object;
};

export function loadMathJax(): Promise<void> {
  const context = globalThis as GlobalWithOptionalLibraries;
  void context.MathJax;
  return Promise.resolve();
}

export function loadMermaid(): Promise<object | null> {
  const context = globalThis as GlobalWithOptionalLibraries;
  return Promise.resolve(context.mermaid ?? null);
}

export function loadPdfJs(): Promise<object | null> {
  const context = globalThis as GlobalWithOptionalLibraries;
  return Promise.resolve(context.pdfjsLib ?? null);
}

export function loadPrism(): Promise<object | null> {
  const context = globalThis as GlobalWithOptionalLibraries;
  return Promise.resolve(context.Prism ?? null);
}

export function renderMath(source: string, display: boolean): HTMLElement {
  const el = document.createElement(display ? 'div' : 'span');
  el.dataset.math = display ? 'block' : 'inline';
  el.textContent = source;
  return el;
}

export function finishRenderMath(): Promise<void> {
  return Promise.resolve();
}

export function debounce<TArgs extends readonly DebounceArgument[], TValue>(
  callback: (...args: TArgs) => TValue,
  timeout = 0,
  resetTimer = true,
): Debouncer<TArgs, TValue> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const runCallback = (): TValue | void => {
    if (lastArgs === null) {
      return undefined;
    }

    const value = callback(...lastArgs);
    lastArgs = null;
    return value;
  };

  const debounced = ((...args: TArgs): Debouncer<TArgs, TValue> => {
    lastArgs = args;

    if (timer !== null && !resetTimer) {
      return debounced;
    }

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      runCallback();
    }, timeout);

    return debounced;
  }) as Debouncer<TArgs, TValue>;

  debounced.cancel = (): Debouncer<TArgs, TValue> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    lastArgs = null;
    return debounced;
  };

  debounced.run = (): TValue | void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    return runCallback();
  };

  return debounced;
}

export function request(requestInput: RequestUrlParam | string): Promise<string> {
  return requestUrl(requestInput).text;
}

export function requestUrl(requestInput: RequestUrlParam | string): RequestUrlResponsePromise {
  const requestParams = normalizeRequestParams(requestInput);
  const headers = new Headers(requestParams.headers);

  if (requestParams.contentType !== undefined && !headers.has('content-type')) {
    headers.set('content-type', requestParams.contentType);
  }

  const responsePromise = fetch(requestParams.url, {
    method: requestParams.method,
    headers,
    body: requestParams.body,
  }).then(async (response) => {
    const responseClone = response.clone();
    const responseArrayBuffer = await responseClone.arrayBuffer();
    const responseText = await response.text();

    if ((requestParams.throw ?? true) && response.status >= 400) {
      throw new Error(`Request failed with status ${response.status}: ${responseText}`);
    }

    return {
      status: response.status,
      headers: collectHeaders(response.headers),
      arrayBuffer: responseArrayBuffer,
      json: safeParseJson(responseText),
      text: responseText,
    } satisfies RequestUrlResponse;
  });

  return new ManagedRequestUrlResponsePromise(responsePromise);
}
