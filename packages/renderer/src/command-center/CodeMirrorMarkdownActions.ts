/**
 * CodeMirror Markdown 操作。
 * 在唯一主编辑器切换到 CodeMirror 后，为命令中心提供基础 Markdown 编辑能力。
 */

import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { getActiveCodeMirrorEditorMeta } from '../lib/editor/activeCodeMirrorEditor';

export class CodeMirrorMarkdownActions {
  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
  }

  private getSelectionRange(): { readonly from: number; readonly to: number } {
    const selection = this.view.state.selection.main;
    return {
      from: selection.from,
      to: selection.to,
    };
  }

  private getSelectedText(): string {
    const selection = this.getSelectionRange();
    return this.view.state.doc.sliceString(selection.from, selection.to);
  }

  private dispatchChange(
    from: number,
    to: number,
    insert: string,
    selectionFrom?: number,
    selectionTo?: number,
  ): void {
    const nextSelection = selectionFrom === undefined
      ? {
          anchor: from + insert.length,
        }
      : EditorSelection.range(selectionFrom, selectionTo ?? selectionFrom);

    this.view.dispatch({
      changes: {
        from,
        to,
        insert,
      },
      selection: nextSelection,
    });
    this.view.focus();
  }

  private wrapSelection(prefix: string, suffix: string = prefix): void {
    const selection = this.getSelectionRange();
    const selectedText = this.getSelectedText();
    const candidateFrom = Math.max(0, selection.from - prefix.length);
    const candidateTo = Math.min(
      this.view.state.doc.length,
      selection.to + suffix.length,
    );
    const wrappedText = this.view.state.doc.sliceString(candidateFrom, candidateTo);
    const shouldUnwrap = wrappedText.startsWith(prefix) && wrappedText.endsWith(suffix);

    if (shouldUnwrap) {
      this.dispatchChange(
        candidateFrom,
        candidateTo,
        selectedText,
        candidateFrom,
        candidateFrom + selectedText.length,
      );
      return;
    }

    const nextText = `${prefix}${selectedText}${suffix}`;
    const cursorPosition = selectedText.length === 0
      ? selection.from + prefix.length
      : undefined;
    this.dispatchChange(
      selection.from,
      selection.to,
      nextText,
      cursorPosition,
      cursorPosition,
    );
  }

  private toggleLinePrefix(prefix: string): void {
    const selection = this.getSelectionRange();
    const line = this.view.state.doc.lineAt(selection.from);
    const trimmedText = line.text.trimStart();
    const indentation = line.text.slice(0, line.text.length - trimmedText.length);
    const nextText = trimmedText.startsWith(prefix)
      ? `${indentation}${trimmedText.slice(prefix.length).trimStart()}`
      : `${indentation}${prefix} ${trimmedText}`;

    this.dispatchChange(line.from, line.to, nextText);
  }

  private toggleHeading(level: number): void {
    const selection = this.getSelectionRange();
    const line = this.view.state.doc.lineAt(selection.from);
    const headingPrefix = '#'.repeat(level);
    const headingMatch = line.text.match(/^(#{1,6})\s/);

    let nextText = '';
    if (headingMatch && headingMatch[1]?.length === level) {
      nextText = line.text.replace(/^#{1,6}\s/, '');
    } else if (headingMatch) {
      nextText = line.text.replace(/^#{1,6}\s/, `${headingPrefix} `);
    } else {
      nextText = `${headingPrefix} ${line.text}`;
    }

    this.dispatchChange(line.from, line.to, nextText);
  }

  toggleBold(): void {
    this.wrapSelection('**');
  }

  toggleItalic(): void {
    this.wrapSelection('*');
  }

  toggleStrikethrough(): void {
    this.wrapSelection('~~');
  }

  toggleCode(): void {
    this.wrapSelection('`');
  }

  toggleCodeBlock(): void {
    const selection = this.getSelectionRange();
    const selectedText = this.getSelectedText();
    const nextText = selectedText.includes('\n')
      ? `\`\`\`\n${selectedText}\n\`\`\``
      : `\`\`\`\n${selectedText || 'code'}\n\`\`\``;
    this.dispatchChange(selection.from, selection.to, nextText);
  }

  insertLink(): void {
    const selection = this.getSelectionRange();
    const selectedText = this.getSelectedText();
    const linkText = selectedText || '链接文本';
    const url = 'https://example.com';
    const nextText = `[${linkText}](${url})`;
    const urlStart = selection.from + linkText.length + 3;
    this.dispatchChange(selection.from, selection.to, nextText, urlStart, urlStart + url.length);
  }

  insertImage(): void {
    const selection = this.getSelectionRange();
    const selectedText = this.getSelectedText();
    const altText = selectedText || '图片描述';
    const url = 'https://example.com/image.png';
    const nextText = `![${altText}](${url})`;
    const urlStart = selection.from + altText.length + 4;
    this.dispatchChange(selection.from, selection.to, nextText, urlStart, urlStart + url.length);
  }

  insertTable(): void {
    const selection = this.getSelectionRange();
    const table = '|  |  |  |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |';
    this.dispatchChange(selection.from, selection.to, table);
  }

  toggleHeading1(): void {
    this.toggleHeading(1);
  }

  toggleHeading2(): void {
    this.toggleHeading(2);
  }

  toggleHeading3(): void {
    this.toggleHeading(3);
  }

  toggleUnorderedList(): void {
    this.toggleLinePrefix('-');
  }

  toggleOrderedList(): void {
    const selection = this.getSelectionRange();
    const line = this.view.state.doc.lineAt(selection.from);
    const trimmedText = line.text.trimStart();
    const indentation = line.text.slice(0, line.text.length - trimmedText.length);
    const nextText = /^\d+\.\s/.test(trimmedText)
      ? `${indentation}${trimmedText.replace(/^\d+\.\s/, '')}`
      : `${indentation}1. ${trimmedText}`;
    this.dispatchChange(line.from, line.to, nextText);
  }

  toggleTaskList(): void {
    const selection = this.getSelectionRange();
    const line = this.view.state.doc.lineAt(selection.from);
    const trimmedText = line.text.trimStart();
    const indentation = line.text.slice(0, line.text.length - trimmedText.length);
    const nextText = /^-\s\[[\sxX]\]\s/.test(trimmedText)
      ? `${indentation}${trimmedText.replace(/^-\s\[[\sxX]\]\s/, '')}`
      : `${indentation}- [ ] ${trimmedText.replace(/^-\s/, '')}`;
    this.dispatchChange(line.from, line.to, nextText);
  }

  toggleQuote(): void {
    this.toggleLinePrefix('>');
  }

  insertHorizontalRule(): void {
    const selection = this.getSelectionRange();
    this.dispatchChange(selection.from, selection.to, '\n---\n');
  }

  formatDocument(): void {
    const content = this.view.state.doc.toString();
    const formatted = content
      .replace(/(^#{1,6}\s.+$)/gm, '$1\n')
      .replace(/([^\n])(```)/g, '$1\n\n$2')
      .replace(/(```[^\n]*\n)/g, '$1\n')
      .replace(/(\n[-*+]\s.+)(\n[-*+]\s)/g, '$1\n$2')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/([^\n])$/g, '$1\n');

    this.dispatchChange(0, this.view.state.doc.length, formatted, 0, 0);
  }

  showPreview(): void {
    this.showPreviewToSide();
  }

  showPreviewToSide(): void {
    const meta = getActiveCodeMirrorEditorMeta();
    if (!meta.tabId || !meta.title) {
      return;
    }

    window.dispatchEvent(new CustomEvent('show-markdown-preview', {
      detail: {
        content: this.view.state.doc.toString(),
        sourceTabId: meta.tabId,
        title: meta.title,
      },
    }));
  }
}
