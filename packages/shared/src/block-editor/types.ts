/**
 * blockEditor 共享协议类型，供 renderer、main 和后续插件桥接统一复用。
 */

import type {
  BlockEditorSelectionKind,
  BlockEditorSelectionSnapshot,
} from './selection';
import type { BlockEditorWritebackCapabilities } from './commands';
import type { JsonObject } from '../types/json';

export type {
  BlockEditorBlockSelectionSnapshot,
  BlockEditorEmptySelectionSnapshot,
  BlockEditorSelectionKind,
  BlockEditorSelectionPointSnapshot,
  BlockEditorSelectionSnapshot,
  BlockEditorTextSelectionSnapshot,
} from './selection';
export type {
  BlockEditorCommandDescriptor,
  BlockEditorCommandExecution,
  BlockEditorCommandId,
  BlockEditorPrimaryWritebackMode,
  BlockEditorWritebackCapabilities,
  BlockEditorWritebackMode,
} from './commands';
export type {
  BlockEditorOperation,
  BlockEditorWritebackOperation,
} from './operations';

export type BlockEditorParagraphType =
  | 'text'
  | 'quote'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6';

export type BlockEditorListType =
  | 'bulleted'
  | 'numbered'
  | 'todo'
  | 'toggle';

export interface BlockEditorBlockAttributes extends JsonObject {
  readonly type: BlockEditorParagraphType | BlockEditorListType | null;
  readonly checked: boolean | null;
  readonly order: number | null;
  readonly language: string | null;
  readonly url: string | null;
  readonly caption: string | null;
}

export interface BlockEditorBlockSnapshot extends JsonObject {
  readonly id: string;
  readonly flavour: string;
  readonly depth: number;
  readonly childCount: number;
  readonly text: string;
  readonly attributes: BlockEditorBlockAttributes | null;
}

export interface BlockEditorDocumentSnapshot extends JsonObject {
  readonly documentId: string;
  readonly blockCount: number;
  readonly textBlockCount: number;
  readonly plainText: string;
  readonly blocks: BlockEditorBlockSnapshot[];
}

export interface BlockEditorSnapshot extends JsonObject {
  readonly document: BlockEditorDocumentSnapshot;
  readonly selection: BlockEditorSelectionSnapshot;
}

export interface BlockEditorContext extends JsonObject {
  readonly snapshot: BlockEditorSnapshot;
  readonly selectionKind: BlockEditorSelectionKind;
  readonly selectedText: string;
  readonly activeBlockId: string | null;
  readonly activeBlockFlavour: string | null;
  readonly activeBlockText: string;
  readonly documentPlainText: string;
  readonly writeback: BlockEditorWritebackCapabilities;
}
