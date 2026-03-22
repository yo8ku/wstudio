/**
 * blockEditor 共享操作协议，当前先围绕写回动作定义最小操作模型。
 */

import type { JsonObject } from '../types/json';
import type { BlockEditorWritebackMode } from './commands';

export interface BlockEditorWritebackOperation extends JsonObject {
  readonly kind: 'writeback';
  readonly mode: BlockEditorWritebackMode;
  readonly text: string;
}

export type BlockEditorOperation = BlockEditorWritebackOperation;
