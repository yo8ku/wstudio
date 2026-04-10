/**
 * Demo plugin entry used to verify basic editor read/write and selection behavior.
 */

import {
  Notice,
  Plugin,
  type Editor,
  type EditorPosition,
  type MarkdownFileInfo,
  type PluginFailureContext,
} from '@note-studio/plugin';

const DEMO_TITLE = '编辑器基础演示';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-editor-basic-snapshot';
const SELECT_FIRST_LINE_COMMAND_ID = 'select-editor-basic-first-line';
const REPLACE_SELECTION_COMMAND_ID = 'replace-editor-basic-selection';
const APPEND_FOOTER_COMMAND_ID = 'append-editor-basic-footer';
const MOVE_CURSOR_TO_END_COMMAND_ID = 'move-editor-basic-cursor-to-end';
const REPLACEMENT_TEXT = '【编辑器基础演示已替换】';
const FOOTER_TEXT = '编辑器基础演示尾注';

function formatPosition(position: EditorPosition): string {
  return `${position.line}:${position.ch}`;
}

function getFilePath(context: MarkdownFileInfo): string {
  return context.file?.path ?? '无文件';
}

function getEndPosition(editor: Editor): EditorPosition {
  const lastLine = editor.lastLine();

  return {
    line: lastLine,
    ch: editor.getLine(lastLine).length,
  };
}

function getFirstLineRange(editor: Editor): {
  readonly from: EditorPosition;
  readonly to: EditorPosition;
} {
  return {
    from: {
      line: 0,
      ch: 0,
    },
    to: {
      line: 0,
      ch: editor.getLine(0).length,
    },
  };
}

export default class EditorBasicDemoPlugin extends Plugin {
  public onload(): void {
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('pencil', DEMO_TITLE, () => {
      this.showNotice('请从命令中心执行编辑器基础测试命令。', 2600);
    }, { location: 'activityBar' });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '编辑器基础演示：显示快照',
      editorCheckCallback: (checking) => {
        this.recordTrace(`editor.check checking=${checking ? 'true' : 'false'}`);
        return true;
      },
      editorCallback: (editor, context) => {
        this.showSnapshot(editor, context, '命令中心');
      },
    });

    this.addCommand({
      id: SELECT_FIRST_LINE_COMMAND_ID,
      name: '编辑器基础演示：选中第一行',
      editorCallback: (editor, context) => {
        this.selectFirstLine(editor, context);
      },
    });

    this.addCommand({
      id: REPLACE_SELECTION_COMMAND_ID,
      name: '编辑器基础演示：替换当前选区',
      editorCallback: (editor, context) => {
        this.replaceCurrentSelection(editor, context);
      },
    });

    this.addCommand({
      id: APPEND_FOOTER_COMMAND_ID,
      name: '编辑器基础演示：在末尾追加尾注',
      editorCallback: (editor, context) => {
        this.appendFooter(editor, context);
      },
    });

    this.addCommand({
      id: MOVE_CURSOR_TO_END_COMMAND_ID,
      name: '编辑器基础演示：移动光标到末尾',
      editorCallback: (editor, context) => {
        this.moveCursorToEnd(editor, context);
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public onunload(): void {
    this.recordTrace('plugin.onunload');
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    this.showNotice(`${DEMO_TITLE} 在 ${failure.operation} 阶段失败。`, 2600);
  }

  private showSnapshot(editor: Editor, context: MarkdownFileInfo, source: string): void {
    const cursor = editor.getCursor();
    const cursorOffset = editor.posToOffset(cursor);
    const roundTrip = editor.offsetToPos(cursorOffset);
    const currentWordRange = editor.wordAt(cursor);
    const currentWord = currentWordRange === null
      ? '无'
      : editor.getRange(currentWordRange.from, currentWordRange.to);
    const summary = [
      `source=${source}`,
      `file=${getFilePath(context)}`,
      `lines=${editor.lineCount()}`,
      `lastLine=${editor.lastLine()}`,
      `cursor=${formatPosition(cursor)}`,
      `offset=${cursorOffset}`,
      `roundTrip=${formatPosition(roundTrip)}`,
      `selection=${editor.getSelection() || '空'}`,
      `firstLine=${editor.getLine(0) || '空行'}`,
      `word=${currentWord}`,
    ].join(', ');

    this.recordTrace(`editor.snapshot ${summary}`);
    this.showNotice(summary, 4200);
  }

  private selectFirstLine(editor: Editor, context: MarkdownFileInfo): void {
    const firstLineRange = getFirstLineRange(editor);
    editor.setSelection(firstLineRange.from, firstLineRange.to);
    editor.focus();
    const selectedText = editor.getSelection();
    const summary = `file=${getFilePath(context)}, selection=${selectedText || '空行'}`;

    this.recordTrace(`editor.selectFirstLine ${summary}`);
    this.showNotice(`已选中第一行：${selectedText || '空行'}`, 3200);
  }

  private replaceCurrentSelection(editor: Editor, context: MarkdownFileInfo): void {
    if (!editor.somethingSelected()) {
      const firstLineRange = getFirstLineRange(editor);
      editor.setSelection(firstLineRange.from, firstLineRange.to);
      editor.focus();
    }

    const previousSelection = editor.getSelection() || '空行';
    editor.replaceSelection(REPLACEMENT_TEXT);
    editor.focus();
    const firstLine = editor.getLine(0);
    const summary = `file=${getFilePath(context)}, before=${previousSelection}, firstLine=${firstLine}`;

    this.recordTrace(`editor.replaceSelection ${summary}`);
    this.showNotice(`已替换当前选区，第一行变为：${firstLine}`, 3600);
  }

  private appendFooter(editor: Editor, context: MarkdownFileInfo): void {
    const currentValue = editor.getValue();
    const suffix = currentValue.endsWith('\n') || currentValue.length === 0
      ? FOOTER_TEXT
      : `\n${FOOTER_TEXT}`;
    const endPosition = getEndPosition(editor);

    editor.replaceRange(suffix, endPosition);
    const lastLine = editor.getLine(editor.lastLine());
    const summary = `file=${getFilePath(context)}, lastLine=${lastLine}`;

    this.recordTrace(`editor.appendFooter ${summary}`);
    this.showNotice(`已在末尾追加尾注：${lastLine}`, 3600);
  }

  private moveCursorToEnd(editor: Editor, context: MarkdownFileInfo): void {
    const lastLine = editor.lastLine();
    editor.setCursor({
      line: lastLine,
      ch: 0,
    });
    editor.exec('goEnd');
    editor.focus();

    const cursor = editor.getCursor();
    const summary = [
      `file=${getFilePath(context)}`,
      `cursor=${formatPosition(cursor)}`,
      `offset=${editor.posToOffset(cursor)}`,
      `hasFocus=${editor.hasFocus() ? 'true' : 'false'}`,
    ].join(', ');

    this.recordTrace(`editor.moveCursorToEnd ${summary}`);
    this.showNotice(`光标已移动到末尾：${summary}`, 3600);
  }

  private showNotice(message: string, timeout = 2400): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-editor-basic] ${message}`);
  }
}
