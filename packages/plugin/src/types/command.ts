/**
 * Command registration contracts exposed by the plugin host.
 */

import type { Disposable } from './disposable';
import type { Editor } from './editor';
import type { MarkdownFileInfo, MarkdownView } from './markdown';
import type { Modifier } from './base';
import type { IconName } from './ui';

export type CommandCallback = () => Promise<void> | void;

export type CommandCheckCallback = (checking: boolean) => Promise<boolean | void> | boolean | void;

export type EditorCommandCallback = (
  editor: Editor,
  context: MarkdownView | MarkdownFileInfo,
) => Promise<void> | void;

export type EditorCheckCallback = (
  checking: boolean,
  editor: Editor,
  context: MarkdownView | MarkdownFileInfo,
) => Promise<boolean | void> | boolean | void;

export interface Hotkey {
  readonly modifiers: readonly Modifier[];
  readonly key: string;
}

export interface Command {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly icon?: IconName;
  readonly mobileOnly?: boolean;
  readonly repeatable?: boolean;
  readonly callback?: CommandCallback;
  readonly checkCallback?: CommandCheckCallback;
  readonly editorCallback?: EditorCommandCallback;
  readonly editorCheckCallback?: EditorCheckCallback;
  readonly hotkeys?: readonly Hotkey[];
}

export interface CommandRegistry {
  registerCommand(pluginId: string, command: Command): Disposable;
  removeCommand(commandId: string): void;
  executeCommand(commandId: string): Promise<void>;
}
