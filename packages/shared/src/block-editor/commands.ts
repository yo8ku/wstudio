/**
 * blockEditor 共享命令协议，当前先收敛原型阶段已落地的写回命令语义。
 */

import type { JsonObject } from '../types/json';

export type BlockEditorWritebackMode =
  | 'replace-selection'
  | 'append-active-block'
  | 'create-adjacent-paragraph';

export type BlockEditorCommandId =
  | 'block-editor.writeback.replace-selection'
  | 'block-editor.writeback.append-active-block'
  | 'block-editor.writeback.create-adjacent-paragraph';

export type BlockEditorPrimaryWritebackMode =
  | BlockEditorWritebackMode
  | 'unavailable';

export interface BlockEditorWritebackCapabilities extends JsonObject {
  readonly replaceSelection: boolean;
  readonly appendToActiveBlock: boolean;
  readonly createAdjacentParagraph: boolean;
  readonly primaryMode: BlockEditorPrimaryWritebackMode;
}

export interface BlockEditorCommandDescriptor extends JsonObject {
  readonly id: BlockEditorCommandId;
  readonly title: string;
  readonly description: string;
  readonly mode: BlockEditorWritebackMode;
  readonly isAvailable: boolean;
  readonly isPrimary: boolean;
}

export interface BlockEditorCommandExecution extends JsonObject {
  readonly text: string;
}
