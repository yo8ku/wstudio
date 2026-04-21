/**
 * Main-process app facade exposed to plugin instances.
 * It provides minimal concrete App, Vault, MetadataCache, FileManager, and Workspace implementations.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { shell as electronShell } from 'electron';
import {
  App,
  Editor,
  FileManager,
  Keymap,
  RenderContext,
  Scope,
  TAbstractFile,
  TFile,
  TFolder,
  Vault,
  View,
  Workspace,
  WorkspaceLeaf,
  WorkspaceRibbon,
  WorkspaceRoot,
  WorkspaceSidedock,
  WorkspaceTabs,
  WorkspaceWindow,
  type CachedMetadata,
  type DataAdapter,
  type EditorChange,
  type EditorCommandName,
  type EditorPosition,
  type EditorRange,
  type EditorScrollInfo,
  type EditorSelection,
  type EditorSelectionOrCaret,
  type EditorTransaction,
  type DataWriteOptions,
  type FileStats,
  type JsonObject,
  type JsonValue,
  type MarkdownFileInfo,
  type MetadataCache,
  type MutableJsonObject,
  type MutableJsonValue,
  type OpenViewState,
  type ShellService,
  type Stat,
  type ViewCreator,
  type ViewState,
} from '@note-studio/plugin';
import type {
  JsonValue as SharedJsonValue,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import {
  COMPONENT_INTERNAL_LOAD,
  COMPONENT_INTERNAL_UNLOAD,
} from '@note-studio/plugin/internal/runtime';
import type { SettingsManager } from '../../config/SettingsManager';
import {
  closePluginRuntimeView,
  openPluginRuntimeFile,
  openPluginRuntimeView,
  updatePluginRuntimeView,
} from '../../ipc/pluginRuntimeHandlers';
import type { WorkspaceManager } from '../../workspace/WorkspaceManager';
import type {
  MainProcessEditorBridge,
  PluginEditorActionRequest,
  PluginEditorCaretRectSnapshot,
  PluginEditorPoint,
  PluginEditorRange as PluginEditorBridgeRange,
  PluginEditorSelectionSnapshot,
  PluginEditorStateSnapshot,
  PluginEditorTextEdit,
} from './types';
import { MainProcessUrlMetadataService } from './MainProcessUrlMetadataService';
import { runWithPluginExecutionContext } from './pluginExecutionContext';

export interface MainProcessAppFacadeDependencies {
  readonly settingsManager: SettingsManager;
  readonly workspaceManager: WorkspaceManager;
  readonly editorBridge: MainProcessEditorBridge;
  readonly resolveViewCreator: (type: string) => ViewCreator | null;
  readonly resolveViewPluginId: (type: string) => string | null;
  readonly resolveViewTypeForExtension: (extension: string) => string | null;
  readonly resolveViewRuntimeSurface: (type: string) => PluginUiRuntimeSurfaceDescriptor | null;
}

type ComponentLifecycleMethodName = 'load' | 'unload';

interface ComponentLifecycleTarget {
  readonly [COMPONENT_INTERNAL_LOAD]?: () => Promise<void>;
  readonly [COMPONENT_INTERNAL_UNLOAD]?: () => Promise<void>;
  readonly load?: () => void;
  readonly unload?: () => void;
}

class MainProcessShellService implements ShellService {
  public async openExternal(target: string): Promise<void> {
    const trimmedTarget = target.trim();

    if (trimmedTarget.length === 0) {
      throw new Error('External target must not be empty.');
    }

    let parsedTarget: URL;

    try {
      parsedTarget = new URL(trimmedTarget);
    } catch {
      throw new Error(`Invalid external target: ${trimmedTarget}`);
    }

    if (
      parsedTarget.protocol !== 'http:'
      && parsedTarget.protocol !== 'https:'
      && parsedTarget.protocol !== 'mailto:'
    ) {
      throw new Error(`Unsupported external protocol: ${parsedTarget.protocol}`);
    }

    await electronShell.openExternal(parsedTarget.toString());
  }
}

function isSharedPrimitive(value: SharedJsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isMutablePrimitive(value: MutableJsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isMutableJsonObjectValue(value: MutableJsonValue): value is MutableJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSupportedFrontMatterValue(value: MutableJsonValue): boolean {
  if (isMutablePrimitive(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isSupportedFrontMatterValue(item));
  }

  if (isMutableJsonObjectValue(value)) {
    return Object.values(value).every((item) => item !== undefined && isSupportedFrontMatterValue(item));
  }

  return false;
}

function tryParseFrontMatterJsonValue(rawValue: string): MutableJsonValue | null {
  const trimmed = rawValue.trim();

  if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as MutableJsonValue;
    return isSupportedFrontMatterValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sharedToMutable(value: SharedJsonValue): MutableJsonValue {
  if (isSharedPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sharedToMutable(item));
  }

  const result: MutableJsonObject = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = sharedToMutable(item);
  }

  return result;
}

function mutableToShared(value: MutableJsonValue): SharedJsonValue {
  if (isMutablePrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mutableToShared(item));
  }

  const result: Record<string, SharedJsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      result[key] = mutableToShared(item);
    }
  }

  return result;
}

function normalizeVaultPath(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (normalized === '.' || normalized === '') {
    return '';
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function resolveWorkspacePath(baseDir: string, targetPath: string): string {
  const normalized = normalizeVaultPath(targetPath);
  return normalized.length === 0 ? baseDir : path.join(baseDir, normalized);
}

function normalizeComparablePath(targetPath: string): string {
  return path.normalize(targetPath).toLowerCase();
}

function matchesWorkspacePathOrDescendant(candidatePath: string, targetPath: string): boolean {
  const normalizedCandidate = path.normalize(candidatePath);
  const normalizedTarget = path.normalize(targetPath);
  const comparableCandidate = normalizeComparablePath(normalizedCandidate);
  const comparableTarget = normalizeComparablePath(normalizedTarget);

  return comparableCandidate === comparableTarget
    || comparableCandidate.startsWith(`${comparableTarget}${path.sep}`);
}

function rewriteWorkspacePathForRename(candidatePath: string, oldPath: string, newPath: string): string | null {
  const normalizedCandidate = path.normalize(candidatePath);
  const normalizedOldPath = path.normalize(oldPath);
  const normalizedNewPath = path.normalize(newPath);
  const comparableCandidate = normalizeComparablePath(normalizedCandidate);
  const comparableOldPath = normalizeComparablePath(normalizedOldPath);

  if (comparableCandidate === comparableOldPath) {
    return normalizedNewPath;
  }

  const descendantPrefix = `${comparableOldPath}${path.sep}`;

  if (!comparableCandidate.startsWith(descendantPrefix)) {
    return null;
  }

  const relativeSuffix = normalizedCandidate.slice(normalizedOldPath.length).replace(/^[\\/]+/, '');

  return relativeSuffix.length === 0
    ? normalizedNewPath
    : path.join(normalizedNewPath, relativeSuffix);
}

async function invokeComponentLifecycle(
  target: ComponentLifecycleTarget,
  symbolKey: typeof COMPONENT_INTERNAL_LOAD | typeof COMPONENT_INTERNAL_UNLOAD,
  fallbackName: ComponentLifecycleMethodName,
): Promise<void> {
  const symbolMethod = target[symbolKey];

  if (typeof symbolMethod === 'function') {
    await symbolMethod.call(target);
    return;
  }

  const fallbackMethod = target[fallbackName];

  if (typeof fallbackMethod === 'function') {
    fallbackMethod.call(target);
    await Promise.resolve();
    return;
  }

  throw new Error(`Component lifecycle method "${fallbackName}" is not available.`);
}

function getParentVaultPath(targetPath: string): string {
  const normalized = normalizeVaultPath(targetPath);
  const parentPath = path.posix.dirname(normalized);
  return parentPath === '.' ? '' : parentPath;
}

function getFileNameFromVaultPath(targetPath: string): string {
  return path.posix.basename(normalizeVaultPath(targetPath));
}

function buildFolderTree(
  vault: MainProcessVault,
  workspaceDir: string,
  normalizedPath: string,
  parent: TFolder | null,
): TFolder | null {
  const fullPath = resolveWorkspacePath(workspaceDir, normalizedPath);

  if (!fsSync.existsSync(fullPath) || !fsSync.statSync(fullPath).isDirectory()) {
    return null;
  }

  const children: TAbstractFile[] = [];
  const folder = new TFolder(
    vault,
    normalizedPath,
    normalizedPath.length === 0 ? vault.getName() : getFileNameFromVaultPath(normalizedPath),
    children,
    parent,
  );

  for (const entry of fsSync.readdirSync(fullPath, { withFileTypes: true })) {
    const childPath = normalizedPath.length === 0
      ? normalizeVaultPath(entry.name)
      : normalizeVaultPath(`${normalizedPath}/${entry.name}`);

    if (entry.isDirectory()) {
      const childFolder = buildFolderTree(vault, workspaceDir, childPath, folder);

      if (childFolder !== null) {
        children.push(childFolder);
      }

      continue;
    }

    const childStats = fsSync.statSync(resolveWorkspacePath(workspaceDir, childPath));
    const parts = getVaultFileParts(childPath);

    children.push(new TFile(
      vault,
      childPath,
      entry.name,
      createFileStats(childStats),
      parts.basename,
      parts.extension,
      folder,
    ));
  }

  return folder;
}

function getVaultFileParts(targetPath: string): {
  readonly basename: string;
  readonly extension: string;
} {
  const fileName = getFileNameFromVaultPath(targetPath);
  const extensionWithDot = path.posix.extname(fileName);

  if (extensionWithDot.length === 0) {
    return {
      basename: fileName,
      extension: '',
    };
  }

  return {
    basename: fileName.slice(0, -extensionWithDot.length),
    extension: extensionWithDot.slice(1).toLowerCase(),
  };
}

function createFileStats(stats: fsSync.Stats): FileStats {
  return {
    ctime: stats.ctimeMs,
    mtime: stats.mtimeMs,
    size: stats.size,
  };
}

function getPluginRuntimeEditorLanguage(file: TFile): string {
  return file.extension === 'md' || file.extension === 'markdown'
    ? 'markdown'
    : 'plaintext';
}

function isPluginEditorBridgeTimeoutError(error: Error): boolean {
  return error.message.startsWith('Plugin editor bridge request timed out:');
}

function buildPluginRuntimeViewPath(leafId: string, viewType: string): string {
  return `plugin-view:/${leafId}/${viewType}`;
}

function createAdapterStat(stats: fsSync.Stats): Stat {
  return {
    type: stats.isDirectory() ? 'folder' : 'file',
    ctime: stats.ctimeMs,
    mtime: stats.mtimeMs,
    size: stats.size,
  };
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function parseFrontMatter(data: string): {
  readonly frontmatter: MutableJsonObject;
  readonly body: string;
} {
  if (!data.startsWith('---\n')) {
    return {
      frontmatter: {},
      body: data,
    };
  }

  const closingIndex = data.indexOf('\n---\n', 4);

  if (closingIndex === -1) {
    return {
      frontmatter: {},
      body: data,
    };
  }

  const rawFrontMatter = data.slice(4, closingIndex);
  const body = data.slice(closingIndex + 5);
  const frontmatter: MutableJsonObject = {};

  for (const line of rawFrontMatter.split('\n')) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (rawValue === 'true') {
      frontmatter[key] = true;
      continue;
    }

    if (rawValue === 'false') {
      frontmatter[key] = false;
      continue;
    }

    if (rawValue === 'null') {
      frontmatter[key] = null;
      continue;
    }

    const numeric = Number(rawValue);

    if (!Number.isNaN(numeric) && rawValue.length > 0) {
      frontmatter[key] = numeric;
      continue;
    }

    const parsedJsonValue = tryParseFrontMatterJsonValue(rawValue);

    if (parsedJsonValue !== null) {
      frontmatter[key] = parsedJsonValue;
      continue;
    }

    frontmatter[key] = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }

  return {
    frontmatter,
    body,
  };
}

function serializeFrontMatter(frontmatter: MutableJsonObject): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      lines.push(`${key}: ${value}`);
      continue;
    }

    lines.push(`${key}: ${JSON.stringify(value)}`);
  }

  return lines.join('\n');
}

interface ParsedFrontMatterBlock {
  readonly exists: boolean;
  readonly frontmatter: MutableJsonObject;
  readonly body: string;
  readonly bodyOffset: number;
  readonly endOffset: number;
}

interface ParsedMetadataDocument {
  readonly cache: CachedMetadata;
  readonly linkTargets: readonly string[];
}

type NestedLinkCountRecord = Record<string, Record<string, number>>;

function parseFrontMatterBlock(data: string): ParsedFrontMatterBlock {
  if (!data.startsWith('---\n')) {
    return {
      exists: false,
      frontmatter: {},
      body: data,
      bodyOffset: 0,
      endOffset: 0,
    };
  }

  const closingIndex = data.indexOf('\n---\n', 4);

  if (closingIndex === -1) {
    return {
      exists: false,
      frontmatter: {},
      body: data,
      bodyOffset: 0,
      endOffset: 0,
    };
  }

  const parsed = parseFrontMatter(data);
  const bodyOffset = closingIndex + 5;

  return {
    exists: true,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    bodyOffset,
    endOffset: bodyOffset,
  };
}

function clearNestedLinkCountRecord(record: NestedLinkCountRecord): void {
  for (const key of Object.keys(record)) {
    delete record[key];
  }
}

function incrementNestedLinkCount(
  record: NestedLinkCountRecord,
  outerKey: string,
  innerKey: string,
): void {
  const bucket = record[outerKey] ?? {};
  bucket[innerKey] = (bucket[innerKey] ?? 0) + 1;
  record[outerKey] = bucket;
}

function createMetadataLoc(content: string, offset: number): {
  readonly line: number;
  readonly col: number;
  readonly offset: number;
} {
  const normalizedOffset = clampEditorOffset(content, offset);
  const position = editorOffsetToPosition(content, normalizedOffset);

  return {
    line: position.line,
    col: position.ch,
    offset: normalizedOffset,
  };
}

function createMetadataPos(content: string, startOffset: number, endOffset: number): {
  readonly start: {
    readonly line: number;
    readonly col: number;
    readonly offset: number;
  };
  readonly end: {
    readonly line: number;
    readonly col: number;
    readonly offset: number;
  };
} {
  return {
    start: createMetadataLoc(content, startOffset),
    end: createMetadataLoc(content, endOffset),
  };
}

function parseMetadataDocument(content: string): ParsedMetadataDocument {
  const parsedFrontMatter = parseFrontMatterBlock(content);
  const headings: Array<{
    readonly heading: string;
    readonly level: number;
    readonly position: {
      readonly start: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
      readonly end: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
    };
  }> = [];
  const tags: Array<{
    readonly tag: string;
    readonly position: {
      readonly start: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
      readonly end: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
    };
  }> = [];
  const links: Array<{
    readonly link: string;
    readonly original: string;
    readonly displayText?: string;
    readonly position: {
      readonly start: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
      readonly end: {
        readonly line: number;
        readonly col: number;
        readonly offset: number;
      };
    };
  }> = [];
  const linkTargets: string[] = [];
  const body = parsedFrontMatter.body;
  const bodyOffset = parsedFrontMatter.bodyOffset;

  const headingPattern = /^(#{1,6})\s+(.+)$/gm;

  while (true) {
    const match = headingPattern.exec(body);

    if (match === null) {
      break;
    }

    const hashes = match[1] ?? '';
    const heading = (match[2] ?? '').trim();
    const startOffset = bodyOffset + match.index;
    const endOffset = startOffset + match[0].length;
    headings.push({
      heading,
      level: hashes.length,
      position: createMetadataPos(content, startOffset, endOffset),
    });
  }

  const tagPattern = /(^|[\s(])(#[A-Za-z0-9_/-]+)/gm;

  while (true) {
    const match = tagPattern.exec(body);

    if (match === null) {
      break;
    }

    const leading = match[1] ?? '';
    const tag = match[2] ?? '';
    const startOffset = bodyOffset + match.index + leading.length;
    const endOffset = startOffset + tag.length;
    tags.push({
      tag,
      position: createMetadataPos(content, startOffset, endOffset),
    });
  }

  const wikiLinkPattern = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

  while (true) {
    const match = wikiLinkPattern.exec(body);

    if (match === null) {
      break;
    }

    const basePath = (match[1] ?? '').trim();
    const subpath = (match[2] ?? '').trim();
    const displayText = (match[3] ?? '').trim();
    const link = subpath.length === 0 ? basePath : `${basePath}#${subpath}`;
    const startOffset = bodyOffset + match.index;
    const endOffset = startOffset + match[0].length;
    links.push({
      link,
      original: match[0],
      displayText: displayText.length === 0 ? undefined : displayText,
      position: createMetadataPos(content, startOffset, endOffset),
    });
    linkTargets.push(link);
  }

  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  while (true) {
    const match = markdownLinkPattern.exec(body);

    if (match === null) {
      break;
    }

    const displayText = (match[1] ?? '').trim();
    const link = (match[2] ?? '').trim();
    const startOffset = bodyOffset + match.index;
    const endOffset = startOffset + match[0].length;
    links.push({
      link,
      original: match[0],
      displayText: displayText.length === 0 ? undefined : displayText,
      position: createMetadataPos(content, startOffset, endOffset),
    });
    linkTargets.push(link);
  }

  return {
    cache: {
      frontmatter: parsedFrontMatter.exists ? parsedFrontMatter.frontmatter : undefined,
      frontmatterPosition: parsedFrontMatter.exists
        ? createMetadataPos(content, 0, parsedFrontMatter.endOffset)
        : undefined,
      headings: headings.length === 0 ? undefined : headings,
      tags: tags.length === 0 ? undefined : tags,
      links: links.length === 0 ? undefined : links,
    },
    linkTargets,
  };
}

const EMPTY_EDITOR_SELECTION: EditorSelection = {
  anchor: {
    line: 0,
    ch: 0,
  },
  head: {
    line: 0,
    ch: 0,
  },
};

const EMPTY_EDITOR_SCROLL_INFO: EditorScrollInfo = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  clientWidth: 0,
  clientHeight: 0,
};

function getEditorLineStartOffsets(content: string): readonly number[] {
  const offsets = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function getEditorLineCount(content: string): number {
  return getEditorLineStartOffsets(content).length;
}

function clampEditorOffset(content: string, offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  if (offset <= 0) {
    return 0;
  }

  return offset >= content.length ? content.length : offset;
}

function clampEditorPosition(content: string, position: EditorPosition): EditorPosition {
  const lineStartOffsets = getEditorLineStartOffsets(content);
  const line = Math.min(Math.max(position.line, 0), lineStartOffsets.length - 1);
  const lineStartOffset = lineStartOffsets[line];
  const lineEndOffset = line + 1 < lineStartOffsets.length
    ? lineStartOffsets[line + 1] - 1
    : content.length;
  const maxColumn = Math.max(lineEndOffset - lineStartOffset, 0);

  return {
    line,
    ch: Math.min(Math.max(position.ch, 0), maxColumn),
  };
}

function editorPositionToOffset(content: string, position: EditorPosition): number {
  const normalizedPosition = clampEditorPosition(content, position);
  const lineStartOffsets = getEditorLineStartOffsets(content);
  return lineStartOffsets[normalizedPosition.line] + normalizedPosition.ch;
}

function editorOffsetToPosition(content: string, offset: number): EditorPosition {
  const normalizedOffset = clampEditorOffset(content, offset);
  const lineStartOffsets = getEditorLineStartOffsets(content);

  for (let line = lineStartOffsets.length - 1; line >= 0; line -= 1) {
    const lineStartOffset = lineStartOffsets[line];

    if (normalizedOffset >= lineStartOffset) {
      return {
        line,
        ch: normalizedOffset - lineStartOffset,
      };
    }
  }

  return {
    line: 0,
    ch: 0,
  };
}

function createPluginEditorRange(
  from: EditorPosition,
  to: EditorPosition,
): PluginEditorBridgeRange {
  return {
    from: {
      line: from.line,
      ch: from.ch,
    },
    to: {
      line: to.line,
      ch: to.ch,
    },
  };
}

function selectionSnapshotToEditorSelection(
  selection: PluginEditorSelectionSnapshot | null,
  content: string,
): EditorSelection {
  if (selection === null) {
    return EMPTY_EDITOR_SELECTION;
  }

  return {
    anchor: clampEditorPosition(content, selection.anchor),
    head: clampEditorPosition(content, selection.head),
  };
}

function getSelectionRange(selection: EditorSelection): EditorRange {
  const anchorOffset = selection.anchor.line < 0 ? 0 : selection.anchor.ch;
  const headOffset = selection.head.line < 0 ? 0 : selection.head.ch;
  const useAnchorFirst = selection.anchor.line < selection.head.line
    || (selection.anchor.line === selection.head.line && anchorOffset <= headOffset);

  return useAnchorFirst
    ? { from: selection.anchor, to: selection.head }
    : { from: selection.head, to: selection.anchor };
}

function getSelectionText(content: string, selection: EditorSelection): string {
  const range = getSelectionRange(selection);
  const fromOffset = editorPositionToOffset(content, range.from);
  const toOffset = editorPositionToOffset(content, range.to);
  return content.slice(fromOffset, toOffset);
}

function createSelectionSnapshot(
  content: string,
  selection: EditorSelection,
): PluginEditorSelectionSnapshot {
  return {
    anchor: {
      line: selection.anchor.line,
      ch: selection.anchor.ch,
    },
    head: {
      line: selection.head.line,
      ch: selection.head.ch,
    },
    text: getSelectionText(content, selection),
  };
}

function applyEditorTextEdits(
  content: string,
  edits: readonly PluginEditorTextEdit[],
): string {
  const mappedEdits = edits.map((edit) => {
    const startOffset = editorPositionToOffset(content, edit.range.from);
    const endOffset = editorPositionToOffset(content, edit.range.to);

    return {
      startOffset,
      endOffset,
      text: edit.text,
    };
  }).sort((left, right) => {
    if (left.startOffset !== right.startOffset) {
      return right.startOffset - left.startOffset;
    }

    return right.endOffset - left.endOffset;
  });

  let nextContent = content;

  for (const edit of mappedEdits) {
    nextContent = `${nextContent.slice(0, edit.startOffset)}${edit.text}${nextContent.slice(edit.endOffset)}`;
  }

  return nextContent;
}

function normalizeSelectionOrCaret(
  content: string,
  selection: EditorSelectionOrCaret,
): EditorSelection {
  const anchor = clampEditorPosition(content, selection.anchor);
  const head = clampEditorPosition(content, selection.head ?? selection.anchor);
  return {
    anchor,
    head,
  };
}

class MainProcessEditorProxy extends Editor {
  public constructor(
    private readonly editorBridge: MainProcessEditorBridge,
    private readonly getDocumentUri: () => string | null,
    private readonly getState: () => PluginEditorStateSnapshot | null,
    private readonly setState: (state: PluginEditorStateSnapshot | null) => void,
  ) {
    super();
  }

  public replaceState(state: PluginEditorStateSnapshot | null): void {
    this.setState(state);
  }

  public refresh(): void {
    return undefined;
  }

  public getValue(): string {
    return this.getCurrentState().content;
  }

  public setValue(content: string): void {
    const currentState = this.getCurrentState();
    const nextSelection = createSelectionSnapshot(content, EMPTY_EDITOR_SELECTION);

    this.commitContentMutation(
      [
        {
          range: createPluginEditorRange(
            { line: 0, ch: 0 },
            editorOffsetToPosition(currentState.content, currentState.content.length),
          ),
          text: content,
        },
      ],
      nextSelection,
    );
  }

  public getLine(line: number): string {
    const lines = this.getValue().split('\n');
    return line >= 0 && line < lines.length ? lines[line] : '';
  }

  public lineCount(): number {
    return getEditorLineCount(this.getValue());
  }

  public lastLine(): number {
    return this.lineCount() - 1;
  }

  public getSelection(): string {
    return this.getCurrentSelectionSnapshot().text;
  }

  public getRange(from: EditorPosition, to: EditorPosition): string {
    const content = this.getValue();
    const startOffset = editorPositionToOffset(content, from);
    const endOffset = editorPositionToOffset(content, to);
    return content.slice(startOffset, endOffset);
  }

  public replaceSelection(replacement: string, origin?: string): void {
    void origin;
    const currentState = this.getCurrentState();
    const currentSelection = selectionSnapshotToEditorSelection(currentState.selection, currentState.content);
    const range = getSelectionRange(currentSelection);
    const startOffset = editorPositionToOffset(currentState.content, range.from);
    const edits = [
      {
        range: createPluginEditorRange(range.from, range.to),
        text: replacement,
      },
    ] as const;
    const nextContent = applyEditorTextEdits(currentState.content, edits);
    const nextCursor = editorOffsetToPosition(nextContent, startOffset + replacement.length);

    this.commitContentMutation(
      edits,
      createSelectionSnapshot(
        nextContent,
        {
          anchor: nextCursor,
          head: nextCursor,
        },
      ),
    );
  }

  public replaceRange(
    replacement: string,
    from: EditorPosition,
    to?: EditorPosition,
    origin?: string,
  ): void {
    void origin;
    const currentState = this.getCurrentState();
    const normalizedFrom = clampEditorPosition(currentState.content, from);
    const normalizedTo = clampEditorPosition(currentState.content, to ?? from);
    const startOffset = editorPositionToOffset(currentState.content, normalizedFrom);
    const edits = [
      {
        range: createPluginEditorRange(normalizedFrom, normalizedTo),
        text: replacement,
      },
    ] as const;
    const nextContent = applyEditorTextEdits(currentState.content, edits);
    const nextCursor = editorOffsetToPosition(nextContent, startOffset + replacement.length);

    this.commitContentMutation(
      edits,
      createSelectionSnapshot(
        nextContent,
        {
          anchor: nextCursor,
          head: nextCursor,
        },
      ),
    );
  }

  public getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition {
    const selection = selectionSnapshotToEditorSelection(
      this.getCurrentState().selection,
      this.getCurrentState().content,
    );

    if (side === 'anchor') {
      return selection.anchor;
    }

    if (side === 'head' || side === undefined) {
      return selection.head;
    }

    const range = getSelectionRange(selection);
    return side === 'from' ? range.from : range.to;
  }

  public listSelections(): readonly EditorSelection[] {
    const currentState = this.getCurrentState();
    return [selectionSnapshotToEditorSelection(currentState.selection, currentState.content)];
  }

  public setCursor(position: EditorPosition | number, ch?: number): void {
    const currentState = this.getCurrentState();
    const nextPosition = typeof position === 'number'
      ? clampEditorPosition(currentState.content, {
          line: position,
          ch: ch ?? 0,
        })
      : clampEditorPosition(currentState.content, position);

    this.applySelectionUpdate({
      anchor: nextPosition,
      head: nextPosition,
    });
  }

  public setSelection(anchor: EditorPosition, head?: EditorPosition): void {
    const currentState = this.getCurrentState();
    this.applySelectionUpdate(normalizeSelectionOrCaret(currentState.content, {
      anchor,
      head,
    }));
  }

  public setSelections(ranges: readonly EditorSelectionOrCaret[], main?: number): void {
    const currentState = this.getCurrentState();
    const normalizedRanges = ranges.map((range) => normalizeSelectionOrCaret(currentState.content, range));

    if (normalizedRanges.length === 0) {
      this.applySelectionUpdate(EMPTY_EDITOR_SELECTION);
      return;
    }

    const mainSelectionIndex = typeof main === 'number' && main >= 0 && main < normalizedRanges.length
      ? main
      : 0;

    this.setState({
      ...currentState,
      selection: createSelectionSnapshot(currentState.content, normalizedRanges[mainSelectionIndex]),
    });
    this.runBridgeTask(async () => {
      const documentUri = this.requireDocumentUri();
      await this.editorBridge.performAction({
        action: 'set-selections',
        documentUri,
        ranges: normalizedRanges.map((range) => createPluginEditorRange(range.anchor, range.head)),
        mainSelectionIndex,
      });
    });
  }

  public focus(): void {
    const currentState = this.getCurrentState();
    this.setState({
      ...currentState,
      hasFocus: true,
    });
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'focus',
        documentUri: this.requireDocumentUri(),
      });
    });
  }

  public blur(): void {
    const currentState = this.getCurrentState();
    this.setState({
      ...currentState,
      hasFocus: false,
    });
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'blur',
        documentUri: this.requireDocumentUri(),
      });
    });
  }

  public hasFocus(): boolean {
    return this.getCurrentState().hasFocus;
  }

  public getScrollInfo(): EditorScrollInfo {
    return this.getCurrentState().scroll ?? EMPTY_EDITOR_SCROLL_INFO;
  }

  public scrollTo(x?: number | null, y?: number | null): void {
    const currentState = this.getCurrentState();
    this.setState({
      ...currentState,
      scroll: {
        ...(currentState.scroll ?? EMPTY_EDITOR_SCROLL_INFO),
        left: x ?? currentState.scroll?.left ?? 0,
        top: y ?? currentState.scroll?.top ?? 0,
      },
    });
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'scroll-to',
        documentUri: this.requireDocumentUri(),
        left: x ?? null,
        top: y ?? null,
      });
    });
  }

  public scrollIntoView(range: EditorRange, center?: boolean): void {
    void center;
    this.setSelection(range.from, range.to);
  }

  public undo(): void {
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'undo',
        documentUri: this.requireDocumentUri(),
      });
    });
  }

  public redo(): void {
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'redo',
        documentUri: this.requireDocumentUri(),
      });
    });
  }

  public exec(command: EditorCommandName): void {
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'exec',
        documentUri: this.requireDocumentUri(),
        command,
      });
    });
  }

  public transaction(transaction: EditorTransaction, origin?: string): void {
    void origin;
    const currentState = this.getCurrentState();
    const edits: PluginEditorTextEdit[] = [];

    if (typeof transaction.replaceSelection === 'string') {
      const currentSelection = selectionSnapshotToEditorSelection(currentState.selection, currentState.content);
      const range = getSelectionRange(currentSelection);
      edits.push({
        range: createPluginEditorRange(range.from, range.to),
        text: transaction.replaceSelection,
      });
    }

    if (Array.isArray(transaction.changes)) {
      for (const change of transaction.changes) {
        const toPosition = change.to ?? change.from;
        edits.push({
          range: createPluginEditorRange(change.from, toPosition),
          text: change.text,
        });
      }
    }

    if (edits.length > 0) {
      const nextContent = applyEditorTextEdits(currentState.content, edits);
      let nextSelection = currentState.selection;

      if (transaction.selection !== undefined) {
        nextSelection = createSelectionSnapshot(
          nextContent,
          normalizeSelectionOrCaret(nextContent, {
            anchor: transaction.selection.from,
            head: transaction.selection.to,
          }),
        );
      } else if (Array.isArray(transaction.selections) && transaction.selections.length > 0) {
        nextSelection = createSelectionSnapshot(
          nextContent,
          normalizeSelectionOrCaret(nextContent, {
            anchor: transaction.selections[0].from,
            head: transaction.selections[0].to,
          }),
        );
      }

      this.commitContentMutation(edits, nextSelection);
      return;
    }

    if (transaction.selection !== undefined) {
      this.setSelection(transaction.selection.from, transaction.selection.to);
      return;
    }

    if (Array.isArray(transaction.selections)) {
      this.setSelections(transaction.selections.map((selection) => ({
        anchor: selection.from,
        head: selection.to,
      })));
    }
  }

  public wordAt(position: EditorPosition): EditorRange | null {
    const content = this.getValue();
    const normalizedPosition = clampEditorPosition(content, position);
    const lineText = this.getLine(normalizedPosition.line);

    if (lineText.length === 0) {
      return null;
    }

    let start = normalizedPosition.ch;
    let end = normalizedPosition.ch;

    while (start > 0 && /[A-Za-z0-9_-]/.test(lineText[start - 1] ?? '')) {
      start -= 1;
    }

    while (end < lineText.length && /[A-Za-z0-9_-]/.test(lineText[end] ?? '')) {
      end += 1;
    }

    if (start === end) {
      return null;
    }

    return {
      from: {
        line: normalizedPosition.line,
        ch: start,
      },
      to: {
        line: normalizedPosition.line,
        ch: end,
      },
    };
  }

  public posToOffset(position: EditorPosition): number {
    return editorPositionToOffset(this.getValue(), position);
  }

  public offsetToPos(offset: number): EditorPosition {
    return editorOffsetToPosition(this.getValue(), offset);
  }

  private getCurrentState(): PluginEditorStateSnapshot {
    const currentState = this.getState();
    const documentUri = this.getDocumentUri();

    if (currentState !== null && currentState.documentUri === documentUri) {
      return currentState;
    }

    return {
      documentUri: documentUri ?? '',
      content: '',
      selection: null,
      hasFocus: false,
      scroll: null,
      caretRect: null,
    };
  }

  private getCurrentSelectionSnapshot(): PluginEditorSelectionSnapshot {
    const currentState = this.getCurrentState();
    return currentState.selection ?? createSelectionSnapshot(currentState.content, EMPTY_EDITOR_SELECTION);
  }

  private applySelectionUpdate(selection: EditorSelection): void {
    const currentState = this.getCurrentState();
    this.setState({
      ...currentState,
      selection: createSelectionSnapshot(currentState.content, selection),
    });
    this.runBridgeTask(async () => {
      await this.editorBridge.performAction({
        action: 'set-selection',
        documentUri: this.requireDocumentUri(),
        range: createPluginEditorRange(selection.anchor, selection.head),
      });
    });
  }

  private commitContentMutation(
    edits: readonly PluginEditorTextEdit[],
    nextSelection: PluginEditorSelectionSnapshot | null,
  ): void {
    const currentState = this.getCurrentState();
    const nextContent = applyEditorTextEdits(currentState.content, edits);
    this.setState({
      ...currentState,
      content: nextContent,
      selection: nextSelection,
    });
    this.runBridgeTask(async () => {
      const documentUri = this.requireDocumentUri();
      await this.editorBridge.applyTextEdits(documentUri, edits);

      if (nextSelection !== null) {
        await this.editorBridge.performAction({
          action: 'set-selection',
          documentUri,
          range: createPluginEditorRange(nextSelection.anchor, nextSelection.head),
        });
      }
    });
  }

  private requireDocumentUri(): string {
    const documentUri = this.getDocumentUri();

    if (documentUri === null || documentUri.length === 0) {
      throw new Error('No active editor document is available.');
    }

    return documentUri;
  }

  private runBridgeTask(task: () => Promise<void>): void {
    void task().catch((error) => {
      console.error('[MainProcessEditorProxy] failed to apply renderer action:', error);
    });
  }
}

class MainProcessDataAdapter implements DataAdapter {
  public constructor(private readonly baseDir: string) {}

  public getFullPath(normalizedPath: string): string {
    return resolveWorkspacePath(this.baseDir, normalizedPath);
  }

  public getName(): string {
    return 'main-process-filesystem';
  }

  public async exists(normalizedPath: string): Promise<boolean> {
    try {
      await fs.access(resolveWorkspacePath(this.baseDir, normalizedPath));
      return true;
    } catch {
      return false;
    }
  }

  public async stat(normalizedPath: string): Promise<Stat | null> {
    try {
      const stats = await fs.stat(resolveWorkspacePath(this.baseDir, normalizedPath));
      return createAdapterStat(stats);
    } catch {
      return null;
    }
  }

  public async list(normalizedPath: string): Promise<{ readonly files: readonly string[]; readonly folders: readonly string[] }> {
    const entries = await fs.readdir(resolveWorkspacePath(this.baseDir, normalizedPath), {
      withFileTypes: true,
    });
    const files: string[] = [];
    const folders: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        folders.push(entry.name);
      } else {
        files.push(entry.name);
      }
    }

    return {
      files,
      folders,
    };
  }

  public async read(normalizedPath: string): Promise<string> {
    return fs.readFile(resolveWorkspacePath(this.baseDir, normalizedPath), 'utf-8');
  }

  public async readBinary(normalizedPath: string): Promise<ArrayBuffer> {
    const buffer = await fs.readFile(resolveWorkspacePath(this.baseDir, normalizedPath));
    return toArrayBuffer(buffer);
  }

  public async write(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void> {
    void options;
    const fullPath = resolveWorkspacePath(this.baseDir, normalizedPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data, 'utf-8');
  }

  public async writeBinary(normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    void options;
    const fullPath = resolveWorkspacePath(this.baseDir, normalizedPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, Buffer.from(data));
  }

  public async append(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void> {
    void options;
    const fullPath = resolveWorkspacePath(this.baseDir, normalizedPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, data, 'utf-8');
  }

  public async process(
    normalizedPath: string,
    mutator: (data: string) => string,
    options?: DataWriteOptions,
  ): Promise<string> {
    void options;
    const current = await this.read(normalizedPath).catch(() => '');
    const next = mutator(current);
    await this.write(normalizedPath, next);
    return next;
  }

  public getResourcePath(normalizedPath: string): string {
    return `file:///${resolveWorkspacePath(this.baseDir, normalizedPath).replace(/\\/g, '/')}`;
  }

  public async mkdir(normalizedPath: string): Promise<void> {
    await fs.mkdir(resolveWorkspacePath(this.baseDir, normalizedPath), { recursive: true });
  }

  public async trashSystem(normalizedPath: string): Promise<boolean> {
    const exists = await this.exists(normalizedPath);

    if (!exists) {
      return false;
    }

    await fs.rm(resolveWorkspacePath(this.baseDir, normalizedPath), {
      recursive: true,
      force: true,
    });
    return true;
  }

  public async trashLocal(normalizedPath: string): Promise<void> {
    await fs.rm(resolveWorkspacePath(this.baseDir, normalizedPath), {
      recursive: true,
      force: true,
    });
  }

  public async rmdir(normalizedPath: string, recursive: boolean): Promise<void> {
    const fullPath = resolveWorkspacePath(this.baseDir, normalizedPath);

    if (recursive) {
      await fs.rm(fullPath, {
        recursive: true,
        force: false,
      });
      return;
    }

    await fs.rmdir(fullPath);
  }

  public async remove(normalizedPath: string): Promise<void> {
    await fs.rm(resolveWorkspacePath(this.baseDir, normalizedPath), {
      recursive: false,
      force: false,
    });
  }

  public async rename(normalizedPath: string, normalizedNewPath: string): Promise<void> {
    const newPath = resolveWorkspacePath(this.baseDir, normalizedNewPath);
    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.rename(
      resolveWorkspacePath(this.baseDir, normalizedPath),
      newPath,
    );
  }

  public async copy(normalizedPath: string, normalizedNewPath: string): Promise<void> {
    const newPath = resolveWorkspacePath(this.baseDir, normalizedNewPath);
    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.cp(
      resolveWorkspacePath(this.baseDir, normalizedPath),
      newPath,
      { recursive: true },
    );
  }
}

export class MainProcessVault extends Vault {
  public readonly adapter: DataAdapter;
  public readonly configDir = '.wstudio';

  public constructor(private readonly workspaceDir: string) {
    super();
    this.adapter = new MainProcessDataAdapter(workspaceDir);
  }

  public getName(): string {
    return path.basename(this.workspaceDir);
  }

  public resolveAbsolutePath(pathValue: string): string {
    return resolveWorkspacePath(this.workspaceDir, normalizeVaultPath(pathValue));
  }

  private createFolderReference(pathValue: string): TFolder | null {
    const normalized = normalizeVaultPath(pathValue);
    const fullPath = resolveWorkspacePath(this.workspaceDir, normalized);

    if (!fsSync.existsSync(fullPath) || !fsSync.statSync(fullPath).isDirectory()) {
      return null;
    }

    if (normalized.length === 0) {
      return new TFolder(this, '', this.getName(), [], null);
    }

    const parentPath = getParentVaultPath(normalized);
    const parent = this.createFolderReference(parentPath);

    return new TFolder(
      this,
      normalized,
      getFileNameFromVaultPath(normalized),
      [],
      parent,
    );
  }

  public resolveAnyFile(pathValue: string): TFile | null {
    const relativeFile = this.getFileByPath(pathValue);

    if (relativeFile !== null) {
      return relativeFile;
    }

    if (!path.isAbsolute(pathValue) || !fsSync.existsSync(pathValue)) {
      return null;
    }

    const stats = fsSync.statSync(pathValue);

    if (!stats.isFile()) {
      return null;
    }

    const relativePath = normalizeVaultPath(path.relative(this.workspaceDir, pathValue));
    const parent = path.dirname(pathValue);
    const isInsideWorkspace = !relativePath.startsWith('..');
    const filePath = isInsideWorkspace ? relativePath : pathValue;
    const parentFolder = isInsideWorkspace
      ? this.getFolderByPath(getParentVaultPath(relativePath))
      : (
          parent === pathValue
            ? null
            : new TFolder(this, parent, path.basename(parent), [])
        );
    const parts = getVaultFileParts(filePath);

    return new TFile(
      this,
      filePath,
      getFileNameFromVaultPath(filePath),
      createFileStats(stats),
      parts.basename,
      parts.extension,
      parentFolder,
    );
  }

  public getFileByPath(pathValue: string): TFile | null {
    const normalized = normalizeVaultPath(pathValue);
    const fullPath = resolveWorkspacePath(this.workspaceDir, normalized);

    if (!fsSync.existsSync(fullPath)) {
      return null;
    }

    const stats = fsSync.statSync(fullPath);

    if (!stats.isFile()) {
      return null;
    }

    const parent = this.createFolderReference(getParentVaultPath(normalized));
    const parts = getVaultFileParts(normalized);

    return new TFile(
      this,
      normalized,
      getFileNameFromVaultPath(normalized),
      createFileStats(stats),
      parts.basename,
      parts.extension,
      parent,
    );
  }

  public getFolderByPath(pathValue: string): TFolder | null {
    const normalized = normalizeVaultPath(pathValue);
    const parent = normalized.length === 0 ? null : this.createFolderReference(getParentVaultPath(normalized));
    return buildFolderTree(this, this.workspaceDir, normalized, parent);
  }

  public getAbstractFileByPath(pathValue: string): TAbstractFile | null {
    return this.getFileByPath(pathValue) ?? this.getFolderByPath(pathValue);
  }

  public getRoot(): TFolder {
    return this.getFolderByPath('') ?? new TFolder(this, '', this.getName(), []);
  }

  public async create(pathValue: string, data: string, options?: DataWriteOptions): Promise<TFile> {
    await this.adapter.write(pathValue, data, options);
    const file = this.getFileByPath(pathValue);

    if (file === null) {
      throw new Error(`Failed to create file "${pathValue}".`);
    }

    this.trigger('create', file);
    return file;
  }

  public async createBinary(
    pathValue: string,
    data: ArrayBuffer,
    options?: DataWriteOptions,
  ): Promise<TFile> {
    await this.adapter.writeBinary(pathValue, data, options);
    const file = this.getFileByPath(pathValue);

    if (file === null) {
      throw new Error(`Failed to create binary file "${pathValue}".`);
    }

    this.trigger('create', file);
    return file;
  }

  public async createFolder(pathValue: string): Promise<TFolder> {
    await this.adapter.mkdir(pathValue);
    const folder = this.getFolderByPath(pathValue);

    if (folder === null) {
      throw new Error(`Failed to create folder "${pathValue}".`);
    }

    this.trigger('create', folder);
    return folder;
  }

  public async read(file: TFile): Promise<string> {
    return this.adapter.read(file.path);
  }

  public async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  public async readBinary(file: TFile): Promise<ArrayBuffer> {
    return this.adapter.readBinary(file.path);
  }

  public getResourcePath(file: TFile): string {
    return this.adapter.getResourcePath(file.path);
  }

  public async delete(file: TAbstractFile, force?: boolean): Promise<void> {
    if (file instanceof TFolder) {
      await this.adapter.rmdir(file.path, force === true);
    } else {
      await this.adapter.remove(file.path);
    }

    this.trigger('delete', file);
  }

  public async trash(file: TAbstractFile, system: boolean): Promise<void> {
    if (system) {
      await this.adapter.trashSystem(file.path);
    } else {
      await this.adapter.trashLocal(file.path);
    }

    this.trigger('delete', file);
  }

  public async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const oldPath = file.path;
    await this.adapter.rename(file.path, newPath);
    this.trigger('rename', this.getAbstractFileByPath(newPath) ?? file, oldPath);
  }

  public async modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    await this.adapter.write(file.path, data, options);
    this.trigger('modify', this.getFileByPath(file.path) ?? file);
  }

  public async modifyBinary(
    file: TFile,
    data: ArrayBuffer,
    options?: DataWriteOptions,
  ): Promise<void> {
    await this.adapter.writeBinary(file.path, data, options);
    this.trigger('modify', this.getFileByPath(file.path) ?? file);
  }

  public async append(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    await this.adapter.append(file.path, data, options);
    this.trigger('modify', this.getFileByPath(file.path) ?? file);
  }

  public async process(
    file: TFile,
    mutator: (data: string) => string,
    options?: DataWriteOptions,
  ): Promise<string> {
    const result = await this.adapter.process(file.path, mutator, options);
    this.trigger('modify', this.getFileByPath(file.path) ?? file);
    return result;
  }

  public async copy<TFileType extends TAbstractFile>(file: TFileType, newPath: string): Promise<TFileType> {
    await this.adapter.copy(file.path, newPath);
    const copied = this.getAbstractFileByPath(newPath);

    if (copied === null) {
      throw new Error(`Failed to copy "${file.path}" to "${newPath}".`);
    }

    this.trigger('create', copied);
    return copied as TFileType;
  }

  public getAllLoadedFiles(): readonly TAbstractFile[] {
    const files: TAbstractFile[] = [];
    const visit = (folder: TFolder): void => {
      for (const child of folder.children) {
        files.push(child);

        if (child instanceof TFolder) {
          visit(child);
        }
      }
    };

    visit(this.getRoot());
    return files;
  }

  public getAllFolders(includeRoot = false): readonly TFolder[] {
    const folders: TFolder[] = [];
    const root = this.getRoot();

    if (includeRoot) {
      folders.push(root);
    }

    const visit = (folder: TFolder): void => {
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          folders.push(child);
          visit(child);
        }
      }
    };

    visit(root);
    return folders;
  }

  public getMarkdownFiles(): readonly TFile[] {
    return this.getFiles().filter((file) => file.extension === 'md' || file.extension === 'markdown');
  }

  public getFiles(): readonly TFile[] {
    return this.getAllLoadedFiles().filter((file): file is TFile => file instanceof TFile);
  }
}

export class MainProcessMetadataCache extends (require('@note-studio/plugin').MetadataCache as typeof import('@note-studio/plugin').MetadataCache) {
  public readonly resolvedLinks: Record<string, Record<string, number>> = {};
  public readonly unresolvedLinks: Record<string, Record<string, number>> = {};
  private readonly cacheByPath = new Map<string, CachedMetadata>();

  public constructor(private readonly vault: MainProcessVault) {
    super();
    this.vault.on('create', (file) => {
      void this.handleCreateOrModify(file);
    });
    this.vault.on('modify', (file) => {
      void this.handleCreateOrModify(file);
    });
    this.vault.on('delete', (file) => {
      this.handleDelete(file);
    });
    this.vault.on('rename', (file, oldPath) => {
      void this.handleRename(file, oldPath);
    });
    this.rebuildLinkIndices();
  }

  public getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const cleanLink = normalizeVaultPath(linkpath.split('#')[0] ?? linkpath);

    if (cleanLink.length === 0) {
      return null;
    }

    const sourceParent = getParentVaultPath(sourcePath);
    const candidateBase = sourceParent.length === 0
      ? cleanLink
      : normalizeVaultPath(path.posix.join(sourceParent, cleanLink));
    const candidates = [
      candidateBase,
      `${candidateBase}.md`,
      `${candidateBase}.markdown`,
    ];

    for (const candidate of candidates) {
      const file = this.vault.getFileByPath(candidate);

      if (file !== null) {
        return file;
      }
    }

    const leafName = path.posix.basename(cleanLink).toLowerCase();

    for (const file of this.vault.getMarkdownFiles()) {
      if (file.basename.toLowerCase() === leafName || file.name.toLowerCase() === leafName) {
        return file;
      }
    }

    return null;
  }

  public getFileCache(file: TFile): CachedMetadata | null {
    return this.isMarkdownFile(file) ? this.getOrCreateCache(file) : null;
  }

  public getCache(pathValue: string): CachedMetadata | null {
    const file = this.vault.getFileByPath(pathValue);
    return file === null ? null : this.getFileCache(file);
  }

  public fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string {
    const sourceParent = getParentVaultPath(sourcePath);
    const relativePath = path.posix.relative(sourceParent, file.path) || file.path;

    if (!omitMdExtension) {
      return relativePath;
    }

    if (relativePath.endsWith('.markdown')) {
      return relativePath.slice(0, -9);
    }

    if (relativePath.endsWith('.md')) {
      return relativePath.slice(0, -3);
    }

    return relativePath;
  }

  private isMarkdownFile(file: TAbstractFile): file is TFile {
    return file instanceof TFile && (file.extension === 'md' || file.extension === 'markdown');
  }

  private getOrCreateCache(file: TFile): CachedMetadata {
    const existingCache = this.cacheByPath.get(file.path);

    if (existingCache !== undefined) {
      return existingCache;
    }

    const content = this.readFileContentSync(file);
    const parsed = parseMetadataDocument(content);
    this.cacheByPath.set(file.path, parsed.cache);
    return parsed.cache;
  }

  private readFileContentSync(file: TFile): string {
    return fsSync.readFileSync(this.vault.resolveAbsolutePath(file.path), 'utf-8');
  }

  private rebuildLinkIndices(): void {
    clearNestedLinkCountRecord(this.resolvedLinks);
    clearNestedLinkCountRecord(this.unresolvedLinks);

    for (const file of this.vault.getMarkdownFiles()) {
      const content = this.readFileContentSync(file);
      const parsed = parseMetadataDocument(content);
      this.cacheByPath.set(file.path, parsed.cache);

      for (const linkTarget of parsed.linkTargets) {
        const resolvedFile = this.getFirstLinkpathDest(linkTarget, file.path);

        if (resolvedFile === null) {
          incrementNestedLinkCount(this.unresolvedLinks, file.path, linkTarget);
          continue;
        }

        incrementNestedLinkCount(this.resolvedLinks, file.path, resolvedFile.path);
      }
    }
  }

  private async handleCreateOrModify(file: TAbstractFile): Promise<void> {
    if (!this.isMarkdownFile(file)) {
      return;
    }

    const content = this.readFileContentSync(file);
    const parsed = parseMetadataDocument(content);
    this.cacheByPath.set(file.path, parsed.cache);
    this.rebuildLinkIndices();
    this.trigger('changed', file, content, parsed.cache);
    this.trigger('resolve', file);
    this.trigger('resolved');
  }

  private handleDelete(file: TAbstractFile): void {
    if (!this.isMarkdownFile(file)) {
      return;
    }

    const previousCache = this.cacheByPath.get(file.path) ?? null;
    this.cacheByPath.delete(file.path);
    this.rebuildLinkIndices();
    this.trigger('deleted', file, previousCache);
    this.trigger('resolved');
  }

  private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
    this.cacheByPath.delete(oldPath);

    if (!this.isMarkdownFile(file)) {
      this.rebuildLinkIndices();
      this.trigger('resolved');
      return;
    }

    const content = this.readFileContentSync(file);
    const parsed = parseMetadataDocument(content);
    this.cacheByPath.set(file.path, parsed.cache);
    this.rebuildLinkIndices();
    this.trigger('changed', file, content, parsed.cache);
    this.trigger('resolve', file);
    this.trigger('resolved');
  }
}

export class MainProcessFileManager extends FileManager {
  public constructor(private readonly vault: MainProcessVault) {
    super();
  }

  public getNewFileParent(sourcePath: string, newFilePath?: string): TFolder {
    const preferredPath = typeof newFilePath === 'string' && newFilePath.length > 0
      ? newFilePath
      : sourcePath;
    return this.vault.getFolderByPath(getParentVaultPath(preferredPath)) ?? this.vault.getRoot();
  }

  public async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    await this.vault.rename(file, newPath);
  }

  public async promptForDeletion(file: TAbstractFile): Promise<void> {
    await this.vault.trash(file, false);
  }

  public async trashFile(file: TAbstractFile): Promise<void> {
    await this.vault.trash(file, false);
  }

  public generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string {
    const sourceParent = getParentVaultPath(sourcePath);
    const relativePath = path.posix.relative(sourceParent, file.path) || file.path;
    const resolvedPath = typeof subpath === 'string' && subpath.length > 0
      ? `${relativePath}#${subpath}`
      : relativePath;

    return typeof alias === 'string' && alias.length > 0
      ? `[[${resolvedPath}|${alias}]]`
      : `[[${resolvedPath}]]`;
  }

  public async processFrontMatter(
    file: TFile,
    mutator: (frontmatter: MutableJsonObject) => void,
    options?: DataWriteOptions,
  ): Promise<void> {
    const current = await this.vault.read(file);
    const parsed = parseFrontMatter(current);
    mutator(parsed.frontmatter);
    const frontMatterText = serializeFrontMatter(parsed.frontmatter);
    const nextContent = frontMatterText.length === 0
      ? parsed.body
      : `---\n${frontMatterText}\n---\n${parsed.body.replace(/^\n/, '')}`;
    await this.vault.modify(file, nextContent, options);
  }

  public async getAvailablePathForAttachment(filename: string, sourcePath?: string): Promise<string> {
    const parentPath = typeof sourcePath === 'string' && sourcePath.length > 0
      ? getParentVaultPath(sourcePath)
      : '';
    const extension = path.extname(filename);
    const basename = extension.length === 0 ? filename : filename.slice(0, -extension.length);
    let attempt = 0;

    while (true) {
      const suffix = attempt === 0 ? '' : ` ${attempt}`;
      const candidateName = `${basename}${suffix}${extension}`;
      const candidatePath = parentPath.length === 0
        ? candidateName
        : normalizeVaultPath(`${parentPath}/${candidateName}`);

      if (this.vault.getAbstractFileByPath(candidatePath) === null) {
        return candidatePath;
      }

      attempt += 1;
    }
  }
}

class MainProcessWorkspaceRoot extends WorkspaceRoot {
  public override parent: WorkspaceRoot;
  public override readonly win: Window;
  public override readonly doc: Document;

  public constructor() {
    super();
    this.parent = this;
    this.win = globalThis.window;
    this.doc = globalThis.document;
  }
}

class MainProcessWorkspaceSidedock extends WorkspaceSidedock {
  public override parent: WorkspaceRoot;
  public readonly collapsed = false;

  public constructor(parent: WorkspaceRoot) {
    super();
    this.parent = parent;
  }

  public toggle(): void {
    return undefined;
  }

  public collapse(): void {
    return undefined;
  }

  public expand(): void {
    return undefined;
  }
}

class MainProcessWorkspaceTabs extends WorkspaceTabs {
  public override parent: WorkspaceRoot;

  public constructor(parent: WorkspaceRoot) {
    super();
    this.parent = parent;
  }
}

class MainProcessWorkspaceWindow extends WorkspaceWindow {
  public override parent: WorkspaceRoot;
  public override readonly win: Window;
  public override readonly doc: Document;

  public constructor(parent: WorkspaceRoot) {
    super();
    this.parent = parent;
    this.win = globalThis.window;
    this.doc = globalThis.document;
  }
}

class MainProcessEmptyView extends View {
  private readonly viewType: string;
  private readonly displayText: string;

  public constructor(leaf: WorkspaceLeaf, viewType = 'empty', displayText = 'Empty') {
    super(leaf);
    this.viewType = viewType;
    this.displayText = displayText;
  }

  public getViewType(): string {
    return this.viewType;
  }

  public getDisplayText(): string {
    return this.displayText;
  }
}

type ViewContainerBindings = View & {
  containerEl?: HTMLElement;
  contentEl?: HTMLElement;
};

function bindPluginViewElements(view: View, containerEl: HTMLElement): void {
  const compatibleView = view as ViewContainerBindings;
  compatibleView.containerEl = containerEl;
  compatibleView.contentEl = containerEl;
}

function isSharedJsonRecord(value: SharedJsonValue | null): value is { readonly [key: string]: SharedJsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeRuntimeSurfaceState(
  baseState: SharedJsonValue | null,
  viewState: SharedJsonValue | null,
): SharedJsonValue | null {
  if (isSharedJsonRecord(baseState) && isSharedJsonRecord(viewState)) {
    return {
      ...baseState,
      ...viewState,
    };
  }

  return viewState ?? baseState;
}

function resolveViewLoadingState(viewState: SharedJsonValue | null): boolean {
  if (!isSharedJsonRecord(viewState)) {
    return false;
  }

  return viewState.loading === true;
}

function resolveViewPageIconUrl(viewState: SharedJsonValue | null): string | null {
  if (!isSharedJsonRecord(viewState) || typeof viewState.pageIconUrl !== 'string') {
    return null;
  }

  return viewState.pageIconUrl.trim().length > 0 ? viewState.pageIconUrl : null;
}

export class MainProcessWorkspaceLeaf extends WorkspaceLeaf {
  public readonly app: App;
  public readonly id: string;
  public override parent: WorkspaceTabs;
  public readonly containerEl: HTMLElement;
  public hoverPopover = null;
  public readonly isDeferred = false;
  public view: View;

  private pinned = false;
  private ephemeralState: JsonValue | null = null;
  private rendererViewVisible = false;
  private rendererViewRuntimeActive = false;
  private rendererViewMutationUnsubscribe: (() => void) | null = null;
  private readonly pendingSupervisorViewInstanceIds = new Map<string, string>();

  public constructor(
    app: App,
    parent: WorkspaceTabs,
    id: string,
    private readonly resolveViewCreator: (type: string) => ViewCreator | null,
    private readonly resolveViewPluginId: (type: string) => string | null,
    private readonly resolveViewTypeForExtension: (extension: string) => string | null,
    private readonly resolveViewRuntimeSurface: (type: string) => PluginUiRuntimeSurfaceDescriptor | null,
    private readonly resolveAbsoluteVaultPath: (filePath: string) => string,
    private readonly notifyFileOpened: (
      file: TFile,
      leaf: WorkspaceLeaf,
      usesCustomView: boolean,
    ) => void,
  ) {
    super();
    this.app = app;
    this.parent = parent;
    this.id = id;
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'ns-plugin-workspace-leaf';
    this.view = new MainProcessEmptyView(this);
    bindPluginViewElements(this.view, this.containerEl);
  }

  public async openFile(file: TFile, openState?: OpenViewState): Promise<void> {
    const mappedViewType = this.resolveViewTypeForExtension(file.extension);
    const usesCustomView = mappedViewType !== null && this.resolveViewCreator(mappedViewType) !== null;
    const state = {
      ...(openState?.state ?? {}),
      file: file.path,
    };
    await this.setViewState({
      type: mappedViewType ?? this.view.getViewType(),
      active: openState?.active,
      state,
    });
    this.notifyFileOpened(file, this, usesCustomView);

    if (usesCustomView) {
      this.syncRendererPluginView(openState?.active === true);
    }
  }

  public async open(view: View): Promise<View> {
    this.disposeRendererPluginViewBridge();
    const previousView = this.view;
    await this.runWithViewPluginExecutionContext(previousView.getViewType(), async () => {
      await invokeComponentLifecycle(previousView, COMPONENT_INTERNAL_UNLOAD, 'unload');
    });
    bindPluginViewElements(view, this.containerEl);
    this.view = view;
    await this.runWithViewPluginExecutionContext(this.view.getViewType(), async () => {
      await invokeComponentLifecycle(this.view, COMPONENT_INTERNAL_LOAD, 'load');
    });
    this.ensureRendererPluginViewBridge();
    return this.view;
  }

  public registerPendingSupervisorViewInstanceToken(viewType: string, pendingViewInstanceId: string): void {
    const normalizedViewType = viewType.trim();
    const normalizedPendingViewInstanceId = pendingViewInstanceId.trim();

    if (normalizedViewType.length === 0 || normalizedPendingViewInstanceId.length === 0) {
      return;
    }

    this.pendingSupervisorViewInstanceIds.set(normalizedViewType, normalizedPendingViewInstanceId);
  }

  public consumePendingSupervisorViewInstanceToken(viewType: string): string | null {
    const normalizedViewType = viewType.trim();

    if (normalizedViewType.length === 0) {
      return null;
    }

    const pendingViewInstanceId = this.pendingSupervisorViewInstanceIds.get(normalizedViewType) ?? null;

    if (pendingViewInstanceId !== null) {
      this.pendingSupervisorViewInstanceIds.delete(normalizedViewType);
    }

    return pendingViewInstanceId;
  }

  public getViewState(): ViewState {
    return {
      type: this.view.getViewType(),
      pinned: this.pinned,
      state: this.view.getState(),
    };
  }

  public async setViewState(viewState: ViewState, ephemeralState?: JsonValue | null): Promise<void> {
    if (this.view.getViewType() !== viewState.type) {
      const creator = this.resolveViewCreator(viewState.type);
      const nextView = creator === null
        ? new MainProcessEmptyView(this, viewState.type, viewState.type)
        : await this.runWithViewPluginExecutionContext(viewState.type, async () => {
          return creator(this);
        });
      await this.open(nextView);
    }

    await this.runWithViewPluginExecutionContext(this.view.getViewType(), async () => {
      await this.view.setState(viewState.state ?? {}, { history: true });
    });

    if (viewState.pinned !== undefined) {
      this.setPinned(viewState.pinned);
    }

    if (ephemeralState !== undefined) {
      this.setEphemeralState(ephemeralState);
    }

    this.syncRendererPluginView(viewState.active === true);
  }

  public async loadIfDeferred(): Promise<void> {
    return undefined;
  }

  public getEphemeralState(): JsonValue | null {
    return this.ephemeralState;
  }

  public setEphemeralState(state: JsonValue | null): void {
    this.ephemeralState = state;
  }

  public togglePinned(): void {
    this.setPinned(!this.pinned);
  }

  public setPinned(pinned: boolean): void {
    if (this.pinned === pinned) {
      return;
    }

    this.pinned = pinned;
    this.trigger('pinned-change', pinned);
  }

  public setGroupMember(other: WorkspaceLeaf): void {
    this.trigger('group-change', other.id);
  }

  public setGroup(group: string): void {
    this.trigger('group-change', group);
  }

  public detach(): void {
    this.disposeRendererPluginViewBridge();
    void this.runWithViewPluginExecutionContext(this.view.getViewType(), async () => {
      await invokeComponentLifecycle(this.view, COMPONENT_INTERNAL_UNLOAD, 'unload');
    });
    this.containerEl.remove();
  }

  public getIcon(): string {
    return this.view.getIcon();
  }

  public getDisplayText(): string {
    return this.view.getDisplayText();
  }

  public onResize(): void {
    void this.runWithViewPluginExecutionContext(this.view.getViewType(), async () => {
      this.view.onResize();
    });
    this.syncRendererPluginView(false);
  }

  public activateInRenderer(): void {
    this.syncRendererPluginView(true);
  }

  public deactivateInRenderer(): void {
    this.syncRendererPluginView(false);
  }

  public refreshRendererRuntimeSurface(runtimeStateOverride: SharedJsonValue | null): void {
    const activeLeafId = this.app.workspace.activeLeaf?.id ?? null;
    this.syncRendererPluginView(activeLeafId === this.id, runtimeStateOverride);
  }

  public dispatchRendererEvent(
    runtimeNodeId: string,
    request: {
      readonly type: string;
      readonly key?: string;
      readonly clientX?: number;
      readonly clientY?: number;
      readonly button?: number;
      readonly elementX?: number;
      readonly elementY?: number;
      readonly deltaX?: number;
      readonly deltaY?: number;
      readonly surfaceWidth?: number;
      readonly surfaceHeight?: number;
      readonly value?: string;
      readonly checked?: boolean;
      readonly dataTransferTypes?: readonly string[];
      readonly dataTransferText?: string;
      readonly dataTransferUriList?: string;
      readonly dataTransferWorkspaceFilePath?: string;
    },
  ): boolean {
    void runtimeNodeId;
    void request;
    return false;
  }

  public markRendererRuntimeSurfaceActive(): void {
    if (!this.shouldRenderInRenderer() || this.rendererViewRuntimeActive) {
      return;
    }

    if (this.resolveViewRuntimeSurface(this.view.getViewType()) === null) {
      return;
    }

    this.rendererViewRuntimeActive = true;
  }

  private ensureRendererPluginViewBridge(): void {
    return;
  }

  private disposeRendererPluginViewBridge(): void {
    this.rendererViewMutationUnsubscribe?.();
    this.rendererViewMutationUnsubscribe = null;
    this.rendererViewRuntimeActive = false;

    if (!this.rendererViewVisible) {
      return;
    }

    closePluginRuntimeView(this.id);
    this.rendererViewVisible = false;
  }

  private shouldRenderInRenderer(): boolean {
    const viewType = this.view.getViewType();
    return viewType !== 'empty' && this.resolveViewCreator(viewType) !== null;
  }

  private syncRendererPluginView(
    active: boolean,
    runtimeStateOverride?: SharedJsonValue | null,
  ): void {
    if (!this.shouldRenderInRenderer()) {
      this.disposeRendererPluginViewBridge();
      return;
    }

    const baseRuntimeSurface = this.resolveViewRuntimeSurface(this.view.getViewType());
    const viewState = this.view.getState() as SharedJsonValue;
    const runtimeSurface = baseRuntimeSurface === null
      ? null
      : {
          ...baseRuntimeSurface,
          state: runtimeStateOverride === undefined
            ? mergeRuntimeSurfaceState(baseRuntimeSurface.state, viewState)
            : runtimeStateOverride,
        };
    const loading = resolveViewLoadingState(viewState);
    const pageIconUrl = resolveViewPageIconUrl(viewState);

    const payload = {
      leafId: this.id,
      path: buildPluginRuntimeViewPath(this.id, this.view.getViewType()),
      sourcePath: this.resolveRendererSourcePath(),
      title: this.getDisplayText(),
      viewType: this.view.getViewType(),
      icon: this.getIcon().trim().length > 0 ? this.getIcon() : null,
      pageIconUrl,
      runtimeSurface,
      active,
      loading,
    };

    if (this.rendererViewVisible) {
      updatePluginRuntimeView(payload);
      return;
    }

    this.rendererViewVisible = true;
    openPluginRuntimeView(payload);
  }

  private resolveRendererSourcePath(): string | null {
    const state = this.view.getState();

    if (state === null || Array.isArray(state) || typeof state !== 'object') {
      return null;
    }

    const sourcePath = state.file;

    if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
      return null;
    }

    return path.isAbsolute(sourcePath)
      ? sourcePath
      : this.resolveAbsoluteVaultPath(sourcePath);
  }

  private async runWithViewPluginExecutionContext<TValue>(
    viewType: string,
    operation: () => Promise<TValue>,
  ): Promise<TValue> {
    const pluginId = this.resolveViewPluginId(viewType);

    if (pluginId === null) {
      return await operation();
    }

    return await runWithPluginExecutionContext(pluginId, operation);
  }
}

export class MainProcessWorkspace extends Workspace {
  public leftSplit: WorkspaceSidedock;
  public rightSplit: WorkspaceSidedock;
  public leftRibbon = new WorkspaceRibbon();
  public rightRibbon = new WorkspaceRibbon();
  public rootSplit: WorkspaceRoot;
  public activeLeaf: WorkspaceLeaf | null = null;
  public activeEditor: MarkdownFileInfo | null = null;
  public containerEl: HTMLElement;
  public layoutReady = true;

  private readonly rootTabs: MainProcessWorkspaceTabs;
  private readonly leaves = new Map<string, MainProcessWorkspaceLeaf>();
  private readonly lastOpenFiles: string[] = [];
  private activeEditorState: PluginEditorStateSnapshot | null = null;
  private nextLeafId = 1;

  public constructor(
    private readonly appInstance: App,
    private readonly editorBridge: MainProcessEditorBridge,
    private readonly resolveViewCreator: (type: string) => ViewCreator | null,
    private readonly resolveViewPluginId: (type: string) => string | null,
    private readonly resolveViewTypeForExtension: (extension: string) => string | null,
    private readonly resolveViewRuntimeSurface: (type: string) => PluginUiRuntimeSurfaceDescriptor | null,
    private readonly vaultInstance: MainProcessVault,
    private readonly workspaceManager: WorkspaceManager,
  ) {
    super();
    this.rootSplit = new MainProcessWorkspaceRoot();
    this.leftSplit = new MainProcessWorkspaceSidedock(this.rootSplit as MainProcessWorkspaceRoot);
    this.rightSplit = new MainProcessWorkspaceSidedock(this.rootSplit as MainProcessWorkspaceRoot);
    this.rootTabs = new MainProcessWorkspaceTabs(this.rootSplit as MainProcessWorkspaceRoot);
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'ns-plugin-workspace';
    this.seedLastOpenFiles();
    this.activeLeaf = this.createLeaf();
  }

  public onLayoutReady(callback: () => void): void {
    callback();
  }

  public async changeLayout(workspace: JsonObject): Promise<void> {
    void workspace;
  }

  public getLayout(): JsonObject {
    return {};
  }

  public createLeafInParent(parent: import('@note-studio/plugin').WorkspaceSplit, index: number): WorkspaceLeaf {
    void parent;
    void index;
    return this.createLeaf();
  }

  public createLeafBySplit(leaf: WorkspaceLeaf, direction?: 'vertical' | 'horizontal', before?: boolean): WorkspaceLeaf {
    void leaf;
    void direction;
    void before;
    return this.createLeaf();
  }

  public splitActiveLeaf(direction?: 'vertical' | 'horizontal'): WorkspaceLeaf {
    return this.createLeafBySplit(this.activeLeaf ?? this.createLeaf(), direction);
  }

  public async duplicateLeaf(
    leaf: WorkspaceLeaf,
    leafTypeOrDirection?: 'tab' | 'split' | 'window' | boolean | 'vertical' | 'horizontal',
    direction?: 'vertical' | 'horizontal',
  ): Promise<WorkspaceLeaf> {
    void leafTypeOrDirection;
    void direction;
    const nextLeaf = this.createLeaf();
    await nextLeaf.setViewState(leaf.getViewState(), leaf.getEphemeralState());
    return nextLeaf;
  }

  public getUnpinnedLeaf(): WorkspaceLeaf {
    return [...this.leaves.values()].find((leaf) => leaf.getViewState().pinned !== true) ?? this.createLeaf();
  }

  public getLeaf(newLeaf?: 'split' | 'tab' | 'window' | boolean, direction?: 'vertical' | 'horizontal'): WorkspaceLeaf {
    void direction;
    return newLeaf === undefined || newLeaf === false
      ? (this.activeLeaf ?? this.createLeaf())
      : this.createLeaf();
  }

  public moveLeafToPopout(leaf: WorkspaceLeaf): WorkspaceWindow {
    void leaf;
    return new MainProcessWorkspaceWindow(this.rootSplit as MainProcessWorkspaceRoot);
  }

  public openPopoutLeaf(): WorkspaceLeaf {
    return this.createLeaf();
  }

  public async openLinkText(
    linktext: string,
    sourcePath: string,
    newLeaf?: 'tab' | 'split' | 'window' | boolean,
    openViewState?: OpenViewState,
  ): Promise<void> {
    const cleanLink = normalizeVaultPath(linktext.split('#')[0] ?? linktext);
    const sourceParent = getParentVaultPath(sourcePath);
    const candidateBase = sourceParent.length === 0
      ? cleanLink
      : normalizeVaultPath(path.posix.join(sourceParent, cleanLink));
    const candidates = [candidateBase, `${candidateBase}.md`, `${candidateBase}.markdown`];

    for (const candidate of candidates) {
      const file = this.vaultInstance.getFileByPath(candidate);

      if (file !== null) {
        await this.getLeaf(newLeaf).openFile(file, openViewState);
        return;
      }
    }
  }

  public setActiveLeaf(
    leaf: WorkspaceLeaf,
    paramsOrPushHistory?: { readonly focus?: boolean } | boolean,
    focus?: boolean,
  ): void {
    void paramsOrPushHistory;
    void focus;
    const previousActiveLeaf = this.activeLeaf;

    if (
      previousActiveLeaf instanceof MainProcessWorkspaceLeaf
      && previousActiveLeaf.id !== leaf.id
    ) {
      previousActiveLeaf.deactivateInRenderer();
    }

    this.activeLeaf = leaf;
    if (leaf instanceof MainProcessWorkspaceLeaf) {
      leaf.activateInRenderer();
    }
    this.trigger('active-leaf-change', leaf);
  }

  public activateLeafById(leafId: string): void {
    const leaf = this.leaves.get(leafId);

    if (leaf === undefined) {
      return;
    }

    this.setActiveLeaf(leaf);
  }

  public detachLeafById(leafId: string): void {
    const leaf = this.leaves.get(leafId);

    if (leaf === undefined) {
      return;
    }

    const removedActiveLeaf = this.activeLeaf?.id === leafId;
    leaf.detach();
    this.leaves.delete(leafId);

    if (removedActiveLeaf) {
      this.activeLeaf = this.resolveNextActiveLeaf();
      this.activeEditor = null;
      this.activeEditorState = null;
      this.trigger('active-leaf-change', this.activeLeaf);
    }
  }

  public markLeafRuntimeSurfaceActive(leafId: string): void {
    const leaf = this.leaves.get(leafId);

    if (!(leaf instanceof MainProcessWorkspaceLeaf)) {
      return;
    }

    leaf.markRendererRuntimeSurfaceActive();
  }

  public clearActiveLeaf(): void {
    const previousActiveLeaf = this.activeLeaf;

    if (previousActiveLeaf === null) {
      return;
    }

    if (previousActiveLeaf instanceof MainProcessWorkspaceLeaf) {
      previousActiveLeaf.deactivateInRenderer();
    }

    this.activeLeaf = null;
    this.activeEditor = null;
    this.activeEditorState = null;
    this.trigger('active-leaf-change', null);
  }

  public dispatchRendererEventToLeaf(
    leafId: string,
    runtimeNodeId: string,
    request: {
      readonly type: string;
      readonly key?: string;
      readonly clientX?: number;
      readonly clientY?: number;
      readonly button?: number;
      readonly elementX?: number;
      readonly elementY?: number;
      readonly deltaX?: number;
      readonly deltaY?: number;
      readonly surfaceWidth?: number;
      readonly surfaceHeight?: number;
      readonly value?: string;
      readonly checked?: boolean;
      readonly dataTransferTypes?: readonly string[];
      readonly dataTransferText?: string;
      readonly dataTransferUriList?: string;
      readonly dataTransferWorkspaceFilePath?: string;
    },
  ): boolean {
    const leaf = this.leaves.get(leafId);

    if (leaf === undefined) {
      return false;
    }

    return leaf.dispatchRendererEvent(runtimeNodeId, request);
  }

  public getLeafById(id: string): WorkspaceLeaf | null {
    return this.leaves.get(id) ?? null;
  }

  public getGroupLeaves(group: string): readonly WorkspaceLeaf[] {
    return [...this.leaves.values()].filter((leaf) => leaf.id === group);
  }

  public getMostRecentLeaf(root?: import('@note-studio/plugin').WorkspaceParent): WorkspaceLeaf | null {
    void root;
    return this.activeLeaf;
  }

  public getLeftLeaf(split: boolean): WorkspaceLeaf | null {
    void split;
    return this.activeLeaf;
  }

  public getRightLeaf(split: boolean): WorkspaceLeaf | null {
    void split;
    return this.activeLeaf;
  }

  public async ensureSideLeaf(
    type: string,
    side: 'left' | 'right',
    options?: { readonly active?: boolean; readonly split?: boolean; readonly reveal?: boolean; readonly state?: JsonObject },
  ): Promise<WorkspaceLeaf> {
    void side;
    void options?.split;
    void options?.reveal;
    const leaf = this.createLeaf();
    await leaf.setViewState({ type, active: options?.active, state: options?.state });
    return leaf;
  }

  public getActiveViewOfType<TView extends View>(
    type: abstract new (...args: (string | number | boolean | bigint | symbol | object | null | undefined)[]) => TView,
  ): TView | null {
    const currentView = this.activeLeaf?.view;
    return currentView instanceof type ? currentView : null;
  }

  public getActiveFile(): TFile | null {
    return this.activeEditor?.file ?? null;
  }

  public getActiveEditorCaretRect(): PluginEditorCaretRectSnapshot | null {
    return this.activeEditorState?.caretRect ?? null;
  }

  public async refreshActiveEditorState(documentUri: string | null = null): Promise<MarkdownFileInfo | null> {
    let snapshot: PluginEditorStateSnapshot | null;

    try {
      snapshot = await this.editorBridge.requestState(documentUri);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));

      if (!isPluginEditorBridgeTimeoutError(normalizedError)) {
        console.warn('[MainProcessWorkspace] Failed to refresh active editor state.', normalizedError);
      }

      this.activeEditor = null;
      this.activeEditorState = null;
      return null;
    }

    if (snapshot === null) {
      this.activeEditor = null;
      this.activeEditorState = null;
      return null;
    }

    this.activeEditorState = snapshot;

    const activeEditorPath = this.activeEditor?.file?.path;
    const normalizedActivePath = typeof activeEditorPath === 'string'
      ? normalizeComparablePath(
          path.isAbsolute(activeEditorPath)
            ? activeEditorPath
            : this.vaultInstance.resolveAbsolutePath(activeEditorPath),
        )
      : null;
    const normalizedSnapshotPath = normalizeComparablePath(
      path.isAbsolute(snapshot.documentUri)
        ? snapshot.documentUri
        : this.vaultInstance.resolveAbsolutePath(snapshot.documentUri),
    );

    if (normalizedActivePath === normalizedSnapshotPath && this.activeEditor?.editor !== undefined) {
      const currentRecord = this.activeEditor as MarkdownFileInfo & {
        readonly editor?: MainProcessEditorProxy;
      };
      currentRecord.editor?.replaceState(snapshot);
      return this.activeEditor;
    }

    const file = this.vaultInstance.resolveAnyFile(snapshot.documentUri);

    if (file === null) {
      this.activeEditor = null;
      return null;
    }

    const editor = new MainProcessEditorProxy(
      this.editorBridge,
      () => this.activeEditorState?.documentUri ?? snapshot.documentUri,
      () => this.activeEditorState,
      (state) => {
        this.activeEditorState = state;
      },
    );
    editor.replaceState(snapshot);
    this.activeEditor = {
      app: this.appInstance,
      file,
      editor,
      hoverPopover: null,
    };

    return this.activeEditor;
  }

  public iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    for (const leaf of this.leaves.values()) {
      callback(leaf);
    }
  }

  public iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    this.iterateRootLeaves(callback);
  }

  public getLeavesOfType(viewType: string): readonly WorkspaceLeaf[] {
    return [...this.leaves.values()].filter((leaf) => leaf.view.getViewType() === viewType);
  }

  public detachLeavesOfType(viewType: string): void {
    let removedActiveLeaf = false;

    for (const leaf of this.getLeavesOfType(viewType)) {
      if (this.activeLeaf?.id === leaf.id) {
        removedActiveLeaf = true;
      }

      leaf.detach();
      this.leaves.delete(leaf.id);
    }

    if (!removedActiveLeaf) {
      return;
    }

    this.activeLeaf = this.resolveNextActiveLeaf();
    this.activeEditor = null;
    this.activeEditorState = null;
    this.trigger('active-leaf-change', this.activeLeaf);
  }

  public async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
    this.setActiveLeaf(leaf);
  }

  public getLastOpenFiles(): readonly string[] {
    return [...this.lastOpenFiles];
  }

  public async openWorkspaceFileByPath(
    filePath: string,
    options?: { readonly forceNewLeaf?: boolean },
  ): Promise<boolean> {
    const file = this.vaultInstance.resolveAnyFile(filePath);

    if (file === null) {
      return false;
    }

    const existingLeaf = options?.forceNewLeaf === true
      ? null
      : this.findLeafByFile(file);

    if (existingLeaf !== null) {
      this.setActiveLeaf(existingLeaf);
      return true;
    }

    const mappedViewType = this.resolveViewTypeForExtension(file.extension);
    const usesCustomView = mappedViewType !== null && this.resolveViewCreator(mappedViewType) !== null;
    const targetLeaf = options?.forceNewLeaf === true
      ? this.getLeaf('tab')
      : usesCustomView && !this.canReuseActiveLeafForCustomView()
      ? this.getLeaf('tab')
      : this.getLeaf();

    await targetLeaf.openFile(file, {
      active: true,
    });

    return true;
  }

  public async syncRenamedWorkspaceFilePath(oldPath: string, newPath: string): Promise<void> {
    const workspaceRootPath = this.vaultInstance.resolveAbsolutePath('');

    for (const leaf of this.leaves.values()) {
      const leafPath = this.resolveLeafFilePath(leaf);

      if (leafPath === null) {
        continue;
      }

      const nextAbsolutePath = rewriteWorkspacePathForRename(leafPath, oldPath, newPath);

      if (nextAbsolutePath === null) {
        continue;
      }

      const currentState = leaf.getViewState();
      const viewStateData = currentState.state;

      if (viewStateData === null || Array.isArray(viewStateData) || typeof viewStateData !== 'object') {
        continue;
      }

      await leaf.setViewState({
        ...currentState,
        active: this.activeLeaf?.id === leaf.id,
        state: {
          ...viewStateData,
          file: normalizeVaultPath(path.relative(workspaceRootPath, nextAbsolutePath)),
        },
      }, leaf.getEphemeralState());
    }

    if (this.activeEditor?.file !== null && this.activeEditor?.file !== undefined) {
      const activeEditorPath = this.vaultInstance.resolveAbsolutePath(this.activeEditor.file.path);
      const nextActiveEditorPath = rewriteWorkspacePathForRename(activeEditorPath, oldPath, newPath);

      if (nextActiveEditorPath !== null) {
        const nextFile = this.vaultInstance.resolveAnyFile(nextActiveEditorPath);

        if (nextFile !== null) {
          this.activeEditor = {
            ...this.activeEditor,
            file: nextFile,
          };
        }
      }
    }

    this.rewriteLastOpenFilesForRename(oldPath, newPath);
    this.workspaceManager.syncRenamedFilePath(oldPath, newPath);
  }

  public async syncDeletedWorkspaceFilePath(targetPath: string): Promise<void> {
    let removedActiveLeaf = false;

    for (const [leafId, leaf] of [...this.leaves.entries()]) {
      const leafPath = this.resolveLeafFilePath(leaf);

      if (leafPath === null || !matchesWorkspacePathOrDescendant(leafPath, targetPath)) {
        continue;
      }

      if (this.activeLeaf?.id === leafId) {
        removedActiveLeaf = true;
      }

      leaf.detach();
      this.leaves.delete(leafId);
    }

    if (this.activeEditor?.file !== null && this.activeEditor?.file !== undefined) {
      const activeEditorPath = this.vaultInstance.resolveAbsolutePath(this.activeEditor.file.path);

      if (matchesWorkspacePathOrDescendant(activeEditorPath, targetPath)) {
        this.activeEditor = null;
        this.activeEditorState = null;
      }
    }

    this.removeDeletedPathsFromLastOpenFiles(targetPath);
    this.workspaceManager.syncDeletedFilePath(targetPath);

    if (!removedActiveLeaf) {
      return;
    }

    this.activeLeaf = this.resolveNextActiveLeaf();
    this.activeEditor = null;
    this.activeEditorState = null;

    if (this.activeLeaf instanceof MainProcessWorkspaceLeaf) {
      this.activeLeaf.activateInRenderer();
    }

    this.trigger('active-leaf-change', this.activeLeaf);
  }

  public requestSaveLayout(): void {
    return undefined;
  }

  public updateOptions(): void {
    return undefined;
  }

  public handleLinkContextMenu(
    menu: import('@note-studio/plugin').Menu,
    linktext: string,
    sourcePath: string,
    leaf?: WorkspaceLeaf,
  ): boolean {
    void menu;
    void linktext;
    void sourcePath;
    void leaf;
    return false;
  }

  public notifyFileOpened(file: TFile, leaf: WorkspaceLeaf, usesCustomView: boolean): void {
    this.activeLeaf = leaf;
    this.activeEditorState = null;
    const persistedPath = path.isAbsolute(file.path)
      ? file.path
      : this.vaultInstance.resolveAbsolutePath(file.path);
    this.lastOpenFiles.unshift(file.path);
    this.workspaceManager.addRecentFile(persistedPath);
    this.workspaceManager.setLastOpenedFile(persistedPath);

    const deduplicatedFiles = [...new Set(this.lastOpenFiles)];
    this.lastOpenFiles.length = 0;
    this.lastOpenFiles.push(...deduplicatedFiles.slice(0, 20));

    if (usesCustomView) {
      this.activeEditor = null;
      this.trigger('file-open', file);
      this.trigger('active-leaf-change', leaf);
      return;
    }

    const editor = new MainProcessEditorProxy(
      this.editorBridge,
      () => this.activeEditor?.file?.path ?? null,
      () => this.activeEditorState,
      (state) => {
        this.activeEditorState = state;
      },
    );
    this.activeEditor = {
      app: this.appInstance,
      file,
      editor,
      hoverPopover: null,
    };

    try {
      const absolutePath = path.isAbsolute(file.path)
        ? file.path
        : this.vaultInstance.resolveAbsolutePath(file.path);
      const content = fsSync.readFileSync(absolutePath, 'utf-8');
      openPluginRuntimeFile({
        path: absolutePath,
        title: file.name,
        language: getPluginRuntimeEditorLanguage(file),
        content,
      });
    } catch (error) {
      console.error('[MainProcessWorkspace] failed to open file in renderer:', error);
    }

    this.trigger('file-open', file);
    this.trigger('active-leaf-change', leaf);
  }

  private createLeaf(): MainProcessWorkspaceLeaf {
    const leaf = new MainProcessWorkspaceLeaf(
      this.appInstance,
      this.rootTabs,
      `leaf-${this.nextLeafId}`,
      this.resolveViewCreator,
      this.resolveViewPluginId,
      this.resolveViewTypeForExtension,
      this.resolveViewRuntimeSurface,
      (filePath) => this.vaultInstance.resolveAbsolutePath(filePath),
      (
        file: TFile,
        leaf: WorkspaceLeaf,
        usesCustomView: boolean,
      ) => this.notifyFileOpened(file, leaf, usesCustomView),
    );
    this.nextLeafId += 1;
    this.leaves.set(leaf.id, leaf);
    this.containerEl.append(leaf.containerEl);
    return leaf;
  }

  private seedLastOpenFiles(): void {
    const nextFiles = [
      ...this.workspaceManager.getRecentFiles(),
      ...this.workspaceManager.getOpenCanvasFiles(),
    ];

    const seen = new Set<string>();

    for (const filePath of nextFiles) {
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        continue;
      }

      const normalizedKey = normalizeComparablePath(filePath);

      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      this.lastOpenFiles.push(filePath);

      if (this.lastOpenFiles.length >= 20) {
        break;
      }
    }
  }

  private rewriteLastOpenFilesForRename(oldPath: string, newPath: string): void {
    const workspaceRootPath = this.vaultInstance.resolveAbsolutePath('');
    const nextFiles: string[] = [];
    const seen = new Set<string>();

    for (const filePath of this.lastOpenFiles) {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : this.vaultInstance.resolveAbsolutePath(filePath);
      const rewrittenAbsolutePath = rewriteWorkspacePathForRename(absolutePath, oldPath, newPath) ?? absolutePath;
      const nextPath = path.isAbsolute(filePath)
        ? rewrittenAbsolutePath
        : normalizeVaultPath(path.relative(workspaceRootPath, rewrittenAbsolutePath));
      const normalizedKey = normalizeComparablePath(rewrittenAbsolutePath);

      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      nextFiles.push(nextPath);

      if (nextFiles.length >= 20) {
        break;
      }
    }

    this.lastOpenFiles.length = 0;
    this.lastOpenFiles.push(...nextFiles);
  }

  private removeDeletedPathsFromLastOpenFiles(targetPath: string): void {
    const nextFiles: string[] = [];
    const seen = new Set<string>();

    for (const filePath of this.lastOpenFiles) {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : this.vaultInstance.resolveAbsolutePath(filePath);

      if (matchesWorkspacePathOrDescendant(absolutePath, targetPath)) {
        continue;
      }

      const normalizedKey = normalizeComparablePath(absolutePath);

      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);
      nextFiles.push(filePath);

      if (nextFiles.length >= 20) {
        break;
      }
    }

    this.lastOpenFiles.length = 0;
    this.lastOpenFiles.push(...nextFiles);
  }

  private canReuseActiveLeafForCustomView(): boolean {
    const activeLeaf = this.activeLeaf;

    if (!(activeLeaf instanceof MainProcessWorkspaceLeaf)) {
      return false;
    }

    if (activeLeaf.view.getViewType() !== 'empty') {
      return false;
    }

    return this.resolveLeafFilePath(activeLeaf) === null;
  }

  private findLeafByFile(file: TFile): MainProcessWorkspaceLeaf | null {
    const targetPath = normalizeComparablePath(this.vaultInstance.resolveAbsolutePath(file.path));

    for (const leaf of this.leaves.values()) {
      const leafPath = this.resolveLeafFilePath(leaf);

      if (leafPath === targetPath) {
        return leaf;
      }
    }

    return null;
  }

  private resolveLeafFilePath(leaf: WorkspaceLeaf): string | null {
    const state = leaf.getViewState().state;

    if (state === null || Array.isArray(state) || typeof state !== 'object') {
      return null;
    }

    const sourcePath = state.file;

    if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
      return null;
    }

    return normalizeComparablePath(
      path.isAbsolute(sourcePath)
        ? sourcePath
        : this.vaultInstance.resolveAbsolutePath(sourcePath),
    );
  }

  private resolveNextActiveLeaf(): WorkspaceLeaf | null {
    for (const leaf of this.leaves.values()) {
      return leaf;
    }

    return null;
  }
}

export class MainProcessAppFacade extends App {
  public readonly keymap = new Keymap();
  public readonly scope = new Scope();
  public readonly vault: MainProcessVault;
  public readonly metadataCache: MainProcessMetadataCache;
  public readonly fileManager: MainProcessFileManager;
  public readonly urlMetadata: MainProcessUrlMetadataService;
  public readonly shell: MainProcessShellService;
  public readonly workspace: MainProcessWorkspace;
  public readonly lastEvent = null;
  public readonly renderContext = new RenderContext();

  public constructor(private readonly dependencies: MainProcessAppFacadeDependencies) {
    super();
    this.vault = new MainProcessVault(dependencies.workspaceManager.getWorkspaceDir());
    this.metadataCache = new MainProcessMetadataCache(this.vault);
    this.fileManager = new MainProcessFileManager(this.vault);
    this.urlMetadata = new MainProcessUrlMetadataService();
    this.shell = new MainProcessShellService();
    this.workspace = new MainProcessWorkspace(
      this,
      dependencies.editorBridge,
      dependencies.resolveViewCreator,
      dependencies.resolveViewPluginId,
      dependencies.resolveViewTypeForExtension,
      dependencies.resolveViewRuntimeSurface,
      this.vault,
      dependencies.workspaceManager,
    );
  }

  public isDarkMode(): boolean {
    const themeName = this.dependencies.settingsManager.get('workbench.colorTheme').toLowerCase();
    return themeName.includes('dark') || themeName.includes('night') || themeName.includes('black');
  }

  public loadLocalStorage<TValue extends MutableJsonValue = MutableJsonValue>(key: string): TValue | null {
    const value = this.dependencies.settingsManager.getPluginSetting<SharedJsonValue>(`plugin.localStorage.${key}`);

    if (value === undefined) {
      return null;
    }

    return sharedToMutable(value) as TValue;
  }

  public saveLocalStorage(key: string, data: MutableJsonValue | null): void {
    if (data === null) {
      void this.dependencies.settingsManager.resetSettingValue(`plugin.localStorage.${key}`, 'user');
      return;
    }

    void this.dependencies.settingsManager.updatePluginSetting(
      `plugin.localStorage.${key}`,
      mutableToShared(data),
      'user',
    );
  }
}
