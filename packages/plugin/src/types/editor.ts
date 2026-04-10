/**
 * Editor contracts aligned with the text editing capabilities exposed to plugins.
 */

import type { LivePreviewStateType, MarkdownFileInfo } from './markdown';
import type { TFile } from './vault';

export interface EditorPosition {
  readonly line: number;
  readonly ch: number;
}

export interface EditorRange {
  readonly from: EditorPosition;
  readonly to: EditorPosition;
}

export interface EditorRangeOrCaret {
  readonly from: EditorPosition;
  readonly to?: EditorPosition;
}

export interface EditorSelection {
  readonly anchor: EditorPosition;
  readonly head: EditorPosition;
}

export interface EditorSelectionOrCaret {
  readonly anchor: EditorPosition;
  readonly head?: EditorPosition;
}

export interface EditorChange extends EditorRangeOrCaret {
  readonly text: string;
}

export interface EditorScrollInfo {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export type EditorCommandName =
  | 'goUp'
  | 'goDown'
  | 'goLeft'
  | 'goRight'
  | 'goStart'
  | 'goEnd'
  | 'goWordLeft'
  | 'goWordRight'
  | 'indentMore'
  | 'indentLess'
  | 'newlineAndIndent'
  | 'swapLineUp'
  | 'swapLineDown'
  | 'deleteLine'
  | 'toggleFold'
  | 'foldAll'
  | 'unfoldAll';

export interface EditorTransaction {
  readonly replaceSelection?: string;
  readonly changes?: readonly EditorChange[];
  readonly selections?: readonly EditorRangeOrCaret[];
  readonly selection?: EditorRangeOrCaret;
}

export interface EditorSuggestTriggerInfo {
  readonly start: EditorPosition;
  readonly end: EditorPosition;
  readonly query: string;
}

export interface EditorSuggestContext extends EditorSuggestTriggerInfo {
  readonly editor: Editor;
  readonly file: TFile;
}

export type EditorExtension = object | readonly EditorExtension[];

export interface EditorView {
  readonly dom: HTMLElement | null;
  readonly contentDOM: HTMLElement | null;
  readonly state: object | null;
}

export interface StateField<TValue> {
  readonly id: string;
  get(): TValue;
}

export interface ViewPlugin<TValue> {
  readonly id: string;
  create(): TValue;
}

export abstract class Editor {
  public getDoc(): this {
    return this;
  }

  public abstract refresh(): void;

  public abstract getValue(): string;

  public abstract setValue(content: string): void;

  public abstract getLine(line: number): string;

  public setLine(line: number, text: string): void {
    this.replaceRange(
      text,
      { line, ch: 0 },
      { line, ch: this.getLine(line).length },
    );
  }

  public abstract lineCount(): number;

  public abstract lastLine(): number;

  public abstract getSelection(): string;

  public somethingSelected(): boolean {
    return this.getSelection().length > 0;
  }

  public abstract getRange(from: EditorPosition, to: EditorPosition): string;

  public abstract replaceSelection(replacement: string, origin?: string): void;

  public abstract replaceRange(
    replacement: string,
    from: EditorPosition,
    to?: EditorPosition,
    origin?: string,
  ): void;

  public abstract getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;

  public abstract listSelections(): readonly EditorSelection[];

  public abstract setCursor(position: EditorPosition | number, ch?: number): void;

  public abstract setSelection(anchor: EditorPosition, head?: EditorPosition): void;

  public abstract setSelections(ranges: readonly EditorSelectionOrCaret[], main?: number): void;

  public abstract focus(): void;

  public abstract blur(): void;

  public abstract hasFocus(): boolean;

  public abstract getScrollInfo(): EditorScrollInfo;

  public abstract scrollTo(x?: number | null, y?: number | null): void;

  public abstract scrollIntoView(range: EditorRange, center?: boolean): void;

  public abstract undo(): void;

  public abstract redo(): void;

  public abstract exec(command: EditorCommandName): void;

  public abstract transaction(transaction: EditorTransaction, origin?: string): void;

  public abstract wordAt(position: EditorPosition): EditorRange | null;

  public abstract posToOffset(position: EditorPosition): number;

  public abstract offsetToPos(offset: number): EditorPosition;

  public processLines<TValue>(
    read: (line: number, lineText: string) => TValue | null,
    write: (
      line: number,
      lineText: string,
      value: TValue | null,
    ) => EditorChange | void,
    ignoreEmpty = false,
  ): void {
    const changes: EditorChange[] = [];

    for (let line = 0; line < this.lineCount(); line += 1) {
      const lineText = this.getLine(line);

      if (ignoreEmpty && lineText.length === 0) {
        continue;
      }

      const value = read(line, lineText);
      const change = write(line, lineText, value);

      if (change !== undefined) {
        changes.push(change);
      }
    }

    if (changes.length === 0) {
      return;
    }

    this.transaction({
      changes,
    });
  }
}

export const editorEditorField: StateField<EditorView> = {
  id: 'note-studio.editorEditorField',
  get(): EditorView {
    return {
      dom: null,
      contentDOM: null,
      state: null,
    };
  },
};

export const editorInfoField: StateField<MarkdownFileInfo | null> = {
  id: 'note-studio.editorInfoField',
  get(): MarkdownFileInfo | null {
    return null;
  },
};

export const editorLivePreviewField: StateField<boolean> = {
  id: 'note-studio.editorLivePreviewField',
  get(): boolean {
    return false;
  },
};

export const editorViewField: StateField<MarkdownFileInfo | null> = editorInfoField;

export const livePreviewState: ViewPlugin<LivePreviewStateType> = {
  id: 'note-studio.livePreviewState',
  create(): LivePreviewStateType {
    return {
      mousedown: false,
    };
  },
};
