import {
  Menu,
  Notice,
  Plugin,
  type EditorPosition,
  type Editor,
  type MarkdownFileInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '编辑器快捷菜单演示';
const MENU_POSITION = {
  x: 112,
  y: 96,
} as const;

interface ActiveEditorContext extends MarkdownFileInfo {
  readonly editor: Editor;
}

interface MenuInvocationContext {
  readonly editor: Editor;
  readonly file: TFile | null;
  readonly selectionText: string;
  readonly selectionFrom: EditorPosition;
  readonly selectionTo: EditorPosition;
}

interface WorkspaceWithActiveEditorRefresh {
  refreshActiveEditorState?(): Promise<MarkdownFileInfo | null>;
}

export default class MenuContextDemoPlugin extends Plugin {
  private appendTrailingNewline = false;
  private lastMenuContext: MenuInvocationContext | null = null;
  private lastAutoOpenSignature = '';
  private lastPointerPosition: { readonly x: number; readonly y: number } = MENU_POSITION;
  private pendingSelectionTimer: ReturnType<typeof setTimeout> | null = null;

  public override onload(): void {
    this.addRibbonIcon('menu', DEMO_TITLE, () => {
      void this.openQuickActionMenu();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'open-editor-quick-action-menu',
      name: '菜单演示：打开编辑器快捷菜单',
      callback: () => {
        void this.openQuickActionMenu();
      },
    });

    this.registerDomEvent(document, 'mouseup', (event) => {
      void this.handleDocumentMouseUp(event as MouseEvent);
    });

    this.registerDomEvent(document, 'selectionchange', () => {
      this.handleSelectionChange();
    });
  }

  public override onFailed(failure: PluginFailureContext): void {
    new Notice(`${DEMO_TITLE}：在 ${failure.operation} 阶段发生异常。`, 2600);
  }

  public override onEnable(): void {
    return undefined;
  }

  public override onDisable(): void {
    return undefined;
  }

  public override onunload(): void {
    if (this.pendingSelectionTimer !== null) {
      clearTimeout(this.pendingSelectionTimer);
      this.pendingSelectionTimer = null;
    }

    return undefined;
  }

  private async openQuickActionMenu(
    position: { readonly x: number; readonly y: number } = MENU_POSITION,
  ): Promise<void> {
    await this.captureMenuContext();
    const menu = new Menu();

    menu
      .addItem((item) => {
        item
          .setTitle('插入当前时间')
          .setIcon('clock3')
          .onClick(() => {
            this.insertCurrentTime();
          });
      })
      .addItem((item) => {
        item
          .setTitle('包裹选中为加粗')
          .setIcon('bold')
          .onClick(() => {
            this.wrapSelectionWithBold();
          });
      })
      .addItem((item) => {
        item
          .setTitle('当前行转为二级标题')
          .setIcon('heading-2')
          .onClick(() => {
            this.convertCurrentLineToHeading();
          });
      })
      .addSeparator()
      .addItem((item) => {
        item
          .setTitle('插入当前文件链接')
          .setIcon('link')
          .onClick(() => {
            this.insertCurrentFileLink();
          });
      })
      .addItem((item) => {
        item
          .setTitle('插入后自动换行')
          .setChecked(this.appendTrailingNewline)
          .setIcon('check')
          .onClick(() => {
            this.toggleAppendTrailingNewline();
          });
      })
      .addSeparator()
      .addItem((item) => {
        item
          .setTitle('更多格式化操作开发中')
          .setDisabled(true)
          .setIcon('info')
          .setIsLabel(true);
      });

    menu.showAtPosition(position);
  }

  private insertCurrentTime(): void {
    const editorInfo = this.requireEditorForAction();

    if (editorInfo === null) {
      return;
    }

    const timestamp = this.formatTimestamp(new Date());
    editorInfo.editor.replaceSelection(this.withTrailingNewline(timestamp));
    editorInfo.editor.focus();
    void this.captureMenuContext();
    new Notice(`${DEMO_TITLE}：已插入当前时间。`, 2200);
  }

  private wrapSelectionWithBold(): void {
    const editorInfo = this.requireEditorForAction();

    if (editorInfo === null) {
      return;
    }

    const selectedText = editorInfo.selectionText;

    if (selectedText.length === 0) {
      new Notice(`${DEMO_TITLE}：请先选中一段文本。`, 2200);
      return;
    }

    editorInfo.editor.replaceRange(
      `**${selectedText}**`,
      editorInfo.selectionFrom,
      editorInfo.selectionTo,
    );
    editorInfo.editor.setSelection(
      editorInfo.selectionFrom,
      {
        line: editorInfo.selectionFrom.line,
        ch: editorInfo.selectionFrom.ch + `**${selectedText}**`.length,
      },
    );
    this.captureMenuContext();
    new Notice(`${DEMO_TITLE}：已将选中文本包裹为加粗。`, 2200);
  }

  private convertCurrentLineToHeading(): void {
    const editorInfo = this.requireEditorForAction();

    if (editorInfo === null) {
      return;
    }

    const cursor = editorInfo.editor.getCursor();
    const lineText = editorInfo.editor.getLine(cursor.line);
    const nextLineText = lineText.replace(/^#+\s*/, '').trim();
    const normalizedLineText = nextLineText.length === 0 ? '未命名标题' : nextLineText;

    editorInfo.editor.replaceRange(
      `## ${normalizedLineText}`,
      {
        line: cursor.line,
        ch: 0,
      },
      {
        line: cursor.line,
        ch: lineText.length,
      },
    );
    editorInfo.editor.setCursor({
      line: cursor.line,
      ch: `## ${normalizedLineText}`.length,
    });
    this.captureMenuContext();
    new Notice(`${DEMO_TITLE}：当前行已转换为二级标题。`, 2200);
  }

  private insertCurrentFileLink(): void {
    const editorInfo = this.requireEditorForAction();

    if (editorInfo === null) {
      return;
    }

    const activeFile = editorInfo.file;

    if (activeFile === null) {
      new Notice(`${DEMO_TITLE}：当前没有活动文件。`, 2200);
      return;
    }

    const wikiLink = `[[${this.resolveWikiLinkTarget(activeFile)}]]`;
    editorInfo.editor.replaceSelection(this.withTrailingNewline(wikiLink));
    editorInfo.editor.focus();
    void this.captureMenuContext();
    new Notice(`${DEMO_TITLE}：已插入当前文件链接。`, 2200);
  }

  private toggleAppendTrailingNewline(): void {
    this.appendTrailingNewline = !this.appendTrailingNewline;
    new Notice(
      `${DEMO_TITLE}：插入后自动换行已${this.appendTrailingNewline ? '开启' : '关闭'}。`,
      2200,
    );
  }

  private requireActiveEditor(): ActiveEditorContext | null {
    const activeEditor = this.app.workspace.activeEditor;

    if (activeEditor?.editor === undefined) {
      new Notice(`${DEMO_TITLE}：请先聚焦一个可编辑文档。`, 2200);
      return null;
    }

    return activeEditor as ActiveEditorContext;
  }

  private requireEditorForAction(): MenuInvocationContext | null {
    if (this.lastMenuContext !== null) {
      return this.lastMenuContext;
    }

    return null;
  }

  private async captureMenuContext(): Promise<MenuInvocationContext | null> {
    await this.refreshActiveEditor();
    const activeEditor = this.requireActiveEditor();

    if (activeEditor === null) {
      return null;
    }

    const selections = activeEditor.editor.listSelections();
    const primarySelection = selections[0];
    const selectionFrom = primarySelection === undefined
      ? activeEditor.editor.getCursor('from')
      : primarySelection.anchor;
    const selectionTo = primarySelection === undefined
      ? activeEditor.editor.getCursor('to')
      : primarySelection.head;
    const normalizedRange = this.normalizeRange(selectionFrom, selectionTo);
    const context: MenuInvocationContext = {
      editor: activeEditor.editor,
      file: activeEditor.file,
      selectionText: activeEditor.editor.getSelection(),
      selectionFrom: normalizedRange.from,
      selectionTo: normalizedRange.to,
    };

    this.lastMenuContext = context;
    return context;
  }

  private async refreshActiveEditor(): Promise<void> {
    const workspace = this.app.workspace as typeof this.app.workspace & WorkspaceWithActiveEditorRefresh;

    if (typeof workspace.refreshActiveEditorState !== 'function') {
      return;
    }

    await workspace.refreshActiveEditorState();
  }

  private normalizeRange(
    anchor: EditorPosition,
    head: EditorPosition,
  ): {
    readonly from: EditorPosition;
    readonly to: EditorPosition;
  } {
    if (anchor.line < head.line) {
      return {
        from: anchor,
        to: head,
      };
    }

    if (anchor.line > head.line) {
      return {
        from: head,
        to: anchor,
      };
    }

    if (anchor.ch <= head.ch) {
      return {
        from: anchor,
        to: head,
      };
    }

    return {
      from: head,
      to: anchor,
    };
  }

  private async handleDocumentMouseUp(event: MouseEvent): Promise<void> {
    this.lastPointerPosition = {
      x: event.clientX + 8,
      y: event.clientY + 8,
    };
    const capturedContext = await this.captureMenuContext();

    if (capturedContext === null) {
      return;
    }

    const selectionText = capturedContext.selectionText.trim();

    if (selectionText.length === 0) {
      this.lastAutoOpenSignature = '';
      return;
    }

    const signature = [
      capturedContext.file?.path ?? 'no-file',
      capturedContext.selectionFrom.line,
      capturedContext.selectionFrom.ch,
      capturedContext.selectionTo.line,
      capturedContext.selectionTo.ch,
      selectionText,
    ].join('|');

    if (this.lastAutoOpenSignature === signature) {
      return;
    }

    this.lastAutoOpenSignature = signature;
    await this.openQuickActionMenu(this.lastPointerPosition);
  }

  private handleSelectionChange(): void {
    if (this.pendingSelectionTimer !== null) {
      clearTimeout(this.pendingSelectionTimer);
    }

    this.pendingSelectionTimer = setTimeout(() => {
      void this.tryAutoOpenMenuFromSelection();
      this.pendingSelectionTimer = null;
    }, 60);
  }

  private async tryAutoOpenMenuFromSelection(): Promise<void> {
    const capturedContext = await this.captureMenuContext();

    if (capturedContext === null) {
      return;
    }

    const selectionText = capturedContext.selectionText.trim();

    if (selectionText.length === 0) {
      this.lastAutoOpenSignature = '';
      return;
    }

    const signature = [
      capturedContext.file?.path ?? 'no-file',
      capturedContext.selectionFrom.line,
      capturedContext.selectionFrom.ch,
      capturedContext.selectionTo.line,
      capturedContext.selectionTo.ch,
      selectionText,
    ].join('|');

    if (this.lastAutoOpenSignature === signature) {
      return;
    }

    this.lastAutoOpenSignature = signature;
    await this.openQuickActionMenu(this.lastPointerPosition);
  }

  private withTrailingNewline(content: string): string {
    return this.appendTrailingNewline ? `${content}\n` : content;
  }

  private resolveWikiLinkTarget(file: TFile): string {
    return file.basename;
  }

  private formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    const second = `${date.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}
