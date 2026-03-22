/**
 * blockEditor 共享选区协议，描述文本选区、块选区和空选区快照。
 */

import type { JsonObject } from '../types/json';

export type BlockEditorSelectionKind = 'none' | 'text' | 'block';

export interface BlockEditorSelectionPointSnapshot extends JsonObject {
  readonly blockId: string;
  readonly index: number;
  readonly length: number;
}

export interface BlockEditorEmptySelectionSnapshot extends JsonObject {
  readonly kind: 'none';
  readonly text: string;
  readonly canReplaceText: false;
}

export interface BlockEditorTextSelectionSnapshot extends JsonObject {
  readonly kind: 'text';
  readonly blockId: string;
  readonly text: string;
  readonly isCollapsed: boolean;
  readonly canReplaceText: boolean;
  readonly from: BlockEditorSelectionPointSnapshot;
  readonly to: BlockEditorSelectionPointSnapshot | null;
}

export interface BlockEditorBlockSelectionSnapshot extends JsonObject {
  readonly kind: 'block';
  readonly text: string;
  readonly canReplaceText: false;
  readonly blockIds: string[];
  readonly primaryBlockId: string;
}

export type BlockEditorSelectionSnapshot =
  | BlockEditorEmptySelectionSnapshot
  | BlockEditorTextSelectionSnapshot
  | BlockEditorBlockSelectionSnapshot;
