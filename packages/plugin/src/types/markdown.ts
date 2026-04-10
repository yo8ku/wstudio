/**
 * Markdown-facing plugin contracts for editor context and preview post processing.
 */

import { Component } from '../core/Component';
import { TextFileView } from '../core/FileView';
import type { App } from './app';
import type { Editor } from './editor';
import type { MutableJsonObject } from './json';
import type { HoverLinkSource, HoverParent, HoverPopover } from './render';
import type { TFile } from './vault';
import type { WorkspaceLeaf } from './view';

export type HoverPreviewSource = HoverLinkSource;

export interface MarkdownSectionInformation {
  readonly text: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

export abstract class MarkdownRenderChild extends Component {
  public readonly containerEl: HTMLElement;

  public constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
  }
}

export interface MarkdownPostProcessorContext {
  readonly docId: string;
  readonly sourcePath: string;
  readonly frontmatter: MutableJsonObject | null | undefined;
  addChild(child: MarkdownRenderChild): void;
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export interface MarkdownPostProcessor {
  (el: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> | void;
  sortOrder?: number;
}

export interface MarkdownPreviewEvents extends Component {}

export type MarkdownCodeBlockProcessor = (
  source: string,
  el: HTMLElement,
  context: MarkdownPostProcessorContext,
) => Promise<void> | void;

export interface MarkdownSubView {
  getScroll(): number;
  applyScroll(scroll: number): void;
  get(): string;
  set(data: string, clear: boolean): void;
}

export interface MarkdownFileInfo extends HoverParent {
  readonly app: App;
  readonly file: TFile | null;
  readonly editor?: Editor;
}

export interface LivePreviewStateType {
  readonly mousedown: boolean;
}

export type MarkdownViewModeType = 'source' | 'preview';

interface MarkdownSectionDataset {
  readonly text: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

function setSectionDataset(element: HTMLElement, section: MarkdownSectionDataset): void {
  element.dataset.sectionText = section.text;
  element.dataset.lineStart = String(section.lineStart);
  element.dataset.lineEnd = String(section.lineEnd);
}

function getSectionDataset(element: HTMLElement): MarkdownSectionInformation | null {
  const lineStartValue = element.dataset.lineStart;
  const lineEndValue = element.dataset.lineEnd;
  const sectionText = element.dataset.sectionText;

  if (lineStartValue === undefined || lineEndValue === undefined || sectionText === undefined) {
    return null;
  }

  const lineStart = Number.parseInt(lineStartValue, 10);
  const lineEnd = Number.parseInt(lineEndValue, 10);

  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    return null;
  }

  return {
    text: sectionText,
    lineStart,
    lineEnd,
  };
}

function appendText(parent: HTMLElement, value: string): void {
  if (value.length === 0) {
    return;
  }

  parent.append(document.createTextNode(value));
}

function appendInlineMarkdown(parent: HTMLElement, source: string): void {
  const tokenPattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;

  while (true) {
    const match = tokenPattern.exec(source);

    if (match === null) {
      break;
    }

    appendText(parent, source.slice(lastIndex, match.index));

    const codeText = match[1];
    const linkText = match[2];
    const linkHref = match[3];

    if (codeText !== undefined) {
      const codeEl = document.createElement('code');
      codeEl.textContent = codeText;
      parent.append(codeEl);
    } else if (linkText !== undefined && linkHref !== undefined) {
      const linkEl = document.createElement('a');
      linkEl.textContent = linkText;
      linkEl.setAttribute('href', linkHref);
      parent.append(linkEl);
    }

    lastIndex = match.index + match[0].length;
  }

  appendText(parent, source.slice(lastIndex));
}

function createParagraphElement(
  lines: readonly string[],
  lineStart: number,
  lineEnd: number,
): HTMLElement | null {
  const text = lines.join(' ').trim();

  if (text.length === 0) {
    return null;
  }

  const paragraphEl = document.createElement('p');
  appendInlineMarkdown(paragraphEl, text);
  setSectionDataset(paragraphEl, {
    text,
    lineStart,
    lineEnd,
  });
  return paragraphEl;
}

function createHeadingElement(
  level: number,
  text: string,
  lineIndex: number,
): HTMLElement {
  const headingEl = document.createElement(`h${Math.min(Math.max(level, 1), 6)}`);
  appendInlineMarkdown(headingEl, text);
  setSectionDataset(headingEl, {
    text,
    lineStart: lineIndex,
    lineEnd: lineIndex,
  });
  return headingEl;
}

function createCodeBlockElement(
  language: string,
  source: string,
  lineStart: number,
  lineEnd: number,
): HTMLElement {
  const preEl = document.createElement('pre');
  const codeEl = document.createElement('code');

  if (language.length > 0) {
    codeEl.classList.add(`language-${language}`);
  }

  codeEl.textContent = source;
  preEl.append(codeEl);
  setSectionDataset(preEl, {
    text: source,
    lineStart,
    lineEnd,
  });
  return preEl;
}

function renderMarkdownBlocks(markdown: string, container: HTMLElement): void {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const paragraphLines: string[] = [];
  let paragraphLineStart = 0;

  const flushParagraph = (lineEndExclusive: number): void => {
    const paragraphEl = createParagraphElement(
      paragraphLines,
      paragraphLineStart,
      Math.max(paragraphLineStart, lineEndExclusive - 1),
    );

    if (paragraphEl !== null) {
      container.append(paragraphEl);
    }

    paragraphLines.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index] ?? '';
    const codeFenceMatch = /^```([a-z0-9_-]*)\s*$/i.exec(currentLine);

    if (codeFenceMatch !== null) {
      flushParagraph(index);

      const language = (codeFenceMatch[1] ?? '').trim();
      const codeLineStart = index;
      const codeLines: string[] = [];
      let codeLineEnd = index;

      for (index += 1; index < lines.length; index += 1) {
        const codeLine = lines[index] ?? '';

        if (/^```\s*$/.test(codeLine)) {
          codeLineEnd = index;
          break;
        }

        codeLines.push(codeLine);
        codeLineEnd = index;
      }

      container.append(createCodeBlockElement(
        language,
        codeLines.join('\n'),
        codeLineStart,
        codeLineEnd,
      ));
      paragraphLineStart = index + 1;
      continue;
    }

    if (currentLine.trim().length === 0) {
      flushParagraph(index);
      paragraphLineStart = index + 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(currentLine);

    if (headingMatch !== null) {
      flushParagraph(index);
      container.append(createHeadingElement(
        headingMatch[1]?.length ?? 1,
        (headingMatch[2] ?? '').trim(),
        index,
      ));
      paragraphLineStart = index + 1;
      continue;
    }

    if (paragraphLines.length === 0) {
      paragraphLineStart = index;
    }

    paragraphLines.push(currentLine);
  }

  flushParagraph(lines.length);
}

function collectCodeBlocksByLanguage(root: HTMLElement, language: string): readonly HTMLElement[] {
  const expectedClass = `language-${language}`;
  const results: HTMLElement[] = [];
  const visit = (element: HTMLElement): void => {
    if (
      element.tagName === 'CODE'
      && element.classList.contains(expectedClass)
      && element.parentElement?.tagName === 'PRE'
    ) {
      results.push(element);
    }

    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) {
        visit(child);
      }
    }
  };

  visit(root);
  return results;
}

function createPostProcessorContext(
  sourcePath: string,
  component: Component,
): MarkdownPostProcessorContext {
  return {
    docId: sourcePath,
    sourcePath,
    frontmatter: null,
    addChild(child: MarkdownRenderChild): void {
      component.addChild(child);
    },
    getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null {
      const fromDataset = getSectionDataset(el);

      if (fromDataset !== null) {
        return fromDataset;
      }

      const text = el.textContent ?? '';

      return text.length === 0 ? null : {
        text,
        lineStart: 0,
        lineEnd: text.split('\n').length - 1,
      };
    },
  };
}

export class MarkdownPreviewRenderer {
  private static readonly postProcessors = new Set<MarkdownPostProcessor>();

  public static registerPostProcessor(postProcessor: MarkdownPostProcessor, sortOrder?: number): void {
    if (sortOrder !== undefined) {
      postProcessor.sortOrder = sortOrder;
    }

    this.postProcessors.add(postProcessor);
  }

  public static unregisterPostProcessor(postProcessor: MarkdownPostProcessor): void {
    this.postProcessors.delete(postProcessor);
  }

  public static createCodeBlockPostProcessor(
    language: string,
    handler: MarkdownCodeBlockProcessor,
  ): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
    return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
      const codeBlocks = collectCodeBlocksByLanguage(el, language);

      for (const codeBlock of Array.from(codeBlocks)) {
        const source = codeBlock.textContent ?? '';
        const replacementEl = document.createElement('div');
        codeBlock.parentElement?.replaceWith(replacementEl);
        void handler(source, replacementEl, ctx);
      }
    };
  }

  public static getPostProcessors(): readonly MarkdownPostProcessor[] {
    return [...this.postProcessors].sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    );
  }
}

export abstract class MarkdownRenderer
  extends MarkdownRenderChild implements MarkdownPreviewEvents, HoverParent {
  public readonly app: App;
  public hoverPopover: HoverPopover | null = null;

  protected constructor(app: App, containerEl: HTMLElement) {
    super(containerEl);
    this.app = app;
  }

  public abstract get file(): TFile;

  public static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ): Promise<void> {
    await this.render((component as MarkdownRenderer | MarkdownView).app, markdown, el, sourcePath, component);
  }

  public static async render(
    app: App,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ): Promise<void> {
    void app;
    el.replaceChildren();

    const articleEl = document.createElement('div');
    articleEl.className = 'ns-plugin-markdown-render';
    renderMarkdownBlocks(markdown, articleEl);
    el.append(articleEl);

    const context = createPostProcessorContext(sourcePath, component);

    for (const postProcessor of MarkdownPreviewRenderer.getPostProcessors()) {
      await postProcessor(articleEl, context);
    }
  }
}

export class MarkdownPreviewView
  extends MarkdownRenderer implements MarkdownSubView, MarkdownPreviewEvents {
  private readonly sourceFile: TFile;
  private data = '';

  public constructor(app: App, containerEl: HTMLElement, file: TFile) {
    super(app, containerEl);
    this.sourceFile = file;
  }

  public get file(): TFile {
    return this.sourceFile;
  }

  public get(): string {
    return this.data;
  }

  public set(data: string, clear: boolean): void {
    if (clear) {
      this.clear();
    }

    this.data = data;
    this.rerender();
  }

  public clear(): void {
    this.data = '';
    this.containerEl.replaceChildren();
  }

  public rerender(full = true): void {
    if (full) {
      void MarkdownRenderer.render(this.app, this.data, this.containerEl, this.file.path, this);
      return;
    }

    void MarkdownRenderer.render(this.app, this.data, this.containerEl, this.file.path, this);
  }

  public getScroll(): number {
    return this.containerEl.scrollTop;
  }

  public applyScroll(scroll: number): void {
    this.containerEl.scrollTop = scroll;
  }

  public override onload(): void {
    return undefined;
  }

  public override onunload(): void {
    return undefined;
  }
}

export class MarkdownEditView implements MarkdownSubView, HoverParent, MarkdownFileInfo {
  public readonly app: App;
  public readonly editor: Editor;
  public readonly hoverPopover: HoverPopover | null;

  public constructor(private readonly view: MarkdownView) {
    this.app = view.app;
    this.editor = view.editor;
    this.hoverPopover = view.hoverPopover;
  }

  public clear(): void {
    this.view.clear();
  }

  public get(): string {
    return this.view.getViewData();
  }

  public set(data: string, clear: boolean): void {
    this.view.setViewData(data, clear);
  }

  public get file(): TFile | null {
    return this.view.file;
  }

  public getSelection(): string {
    return this.editor.getSelection();
  }

  public getScroll(): number {
    return this.editor.getScrollInfo().top;
  }

  public applyScroll(scroll: number): void {
    this.editor.scrollTo(null, scroll);
  }
}

export abstract class MarkdownView extends TextFileView implements MarkdownFileInfo {
  public abstract readonly editor: Editor;

  public abstract readonly hoverPopover: HoverPopover | null;

  public abstract readonly previewMode: MarkdownPreviewView;

  public abstract readonly currentMode: MarkdownSubView;

  public constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public abstract getMode(): MarkdownViewModeType;

  public abstract showSearch(replace?: boolean): void;
}
