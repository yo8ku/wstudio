/**
 * Demo plugin entry used to verify markdown rendering, markdown post processors,
 * and markdown code block processors with visible report files.
 */

import {
  MarkdownRenderChild,
  MarkdownRenderer,
  Notice,
  Plugin,
  normalizePath,
  type MarkdownPostProcessorContext,
  type PluginFailureContext,
  type TAbstractFile,
  type TFile,
  type WorkspaceLeaf,
} from '@note-studio/plugin';

const DEMO_TITLE = 'Markdown 渲染演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/markdown-render');
const SOURCE_FILE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/markdown-render-source.md`);
const REPORT_FILE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/markdown-render-report.md`);
const CODE_BLOCK_LANGUAGE = 'demo-card';

interface RenderSummary {
  readonly headingSections: readonly string[];
  readonly codeCardSummaries: readonly string[];
  readonly domSnapshot: readonly string[];
  readonly renderedText: string;
}

class DemoMarkdownMarkerChild extends MarkdownRenderChild {
  public override onload(): void {
    return undefined;
  }

  public override onunload(): void {
    return undefined;
  }
}

function createSourceMarkdown(): string {
  return [
    '# Markdown Render Demo',
    '',
    'This paragraph should stay visible after rendering and contains [Example Link](https://example.com) plus `inline-code`.',
    '',
    '## Processed Heading',
    '',
    '```demo-card',
    'title: Demo Render Card',
    'body: This fenced block should be replaced by a custom card.',
    'status: rendered',
    '```',
    '',
    'Final paragraph for the markdown render verification.',
  ].join('\n');
}

function trimVisibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function collectElementsByTagNames(
  root: HTMLElement,
  tagNames: readonly string[],
): readonly HTMLElement[] {
  const expected = new Set(tagNames.map((tagName) => tagName.toUpperCase()));
  const results: HTMLElement[] = [];
  const visit = (element: HTMLElement): void => {
    if (expected.has(element.tagName)) {
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

function serializeDomTree(node: Node, depth = 0): readonly string[] {
  const indent = '  '.repeat(depth);

  if (node instanceof Text) {
    const text = trimVisibleText(node.textContent ?? '');
    return text.length === 0 ? [] : [`${indent}TEXT "${text}"`];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const classSuffix = node.className.trim().length === 0
    ? ''
    : `.${node.className.trim().split(/\s+/).join('.')}`;
  const sectionStart = node.dataset.lineStart;
  const sectionEnd = node.dataset.lineEnd;
  const sectionSuffix = sectionStart !== undefined && sectionEnd !== undefined
    ? ` [${sectionStart}-${sectionEnd}]`
    : '';
  const ownText = trimVisibleText(
    Array.from(node.childNodes)
      .filter((childNode) => childNode instanceof Text)
      .map((childNode) => childNode.textContent ?? '')
      .join(' '),
  );
  const line = `${indent}${node.tagName}${classSuffix}${sectionSuffix}${ownText.length === 0 ? '' : ` "${ownText}"`}`;
  const childLines = Array.from(node.childNodes).flatMap((childNode) => serializeDomTree(childNode, depth + 1));
  return [line, ...childLines];
}

function parseCardSource(source: string): {
  readonly title: string;
  readonly body: string;
  readonly status: string;
} {
  const entries = new Map<string, string>();

  for (const rawLine of source.split('\n')) {
    const match = /^([a-z-]+):\s*(.+)$/.exec(rawLine.trim());

    if (match === null) {
      continue;
    }

    const key = match[1] ?? '';
    const value = match[2] ?? '';
    entries.set(key, value);
  }

  return {
    title: entries.get('title') ?? 'Untitled Card',
    body: entries.get('body') ?? source.trim(),
    status: entries.get('status') ?? 'unknown',
  };
}

function stringifyLines(values: readonly string[]): string {
  return values.length === 0 ? '无' : values.join(' | ');
}

export default class MarkdownRenderDemoPlugin extends Plugin {
  private headingSections: string[] = [];
  private codeCardSummaries: string[] = [];

  public override onload(): void {
    this.recordTrace('plugin.onload');
    this.registerMarkdownProcessors();

    this.addRibbonIcon('book-open', DEMO_TITLE, () => {
      void this.rebuildAndOpenSourceFile();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'rebuild-open-markdown-render-source',
      name: 'Markdown 渲染演示：重建并打开源文件',
      callback: () => {
        void this.rebuildAndOpenSourceFile();
      },
    });

    this.addCommand({
      id: 'generate-open-markdown-render-report',
      name: 'Markdown 渲染演示：生成并打开渲染报告',
      callback: () => {
        void this.generateAndOpenRenderReport();
      },
    });

    this.addCommand({
      id: 'cleanup-markdown-render-demo',
      name: 'Markdown 渲染演示：清理测试目录',
      callback: () => {
        void this.cleanupDemoFolder();
      },
    });
  }

  public override onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public override onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public override onunload(): void {
    this.recordTrace('plugin.onunload');
  }

  public override onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed operation=${failure.operation}`);
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2800);
  }

  private registerMarkdownProcessors(): void {
    this.registerMarkdownPostProcessor((root, context) => {
      const headings = collectElementsByTagNames(root, ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

      for (const heading of headings) {
        heading.classList.add('demo-heading-processed');
        const badgeEl = document.createElement('span');
        badgeEl.className = 'demo-heading-badge';
        badgeEl.textContent = '已处理';
        heading.append(document.createTextNode(' '));
        heading.append(badgeEl);
        context.addChild(new DemoMarkdownMarkerChild(badgeEl));

        const section = context.getSectionInfo(heading);

        if (section !== null) {
          this.headingSections.push(`${heading.tagName}:${section.lineStart}-${section.lineEnd}:${section.text}`);
        }
      }
    }, 100);

    this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source, el, context) => {
      const parsed = parseCardSource(source);
      const cardEl = document.createElement('div');
      cardEl.className = 'demo-render-card';

      const titleEl = document.createElement('strong');
      titleEl.textContent = parsed.title;
      cardEl.append(titleEl);

      const bodyEl = document.createElement('p');
      bodyEl.textContent = parsed.body;
      cardEl.append(bodyEl);

      const statusEl = document.createElement('small');
      statusEl.textContent = `status=${parsed.status}`;
      cardEl.append(statusEl);

      el.append(cardEl);
      context.addChild(new DemoMarkdownMarkerChild(cardEl));
      this.codeCardSummaries.push(`${parsed.title}|${parsed.status}|${parsed.body}`);
    }, 200);
  }

  private async rebuildAndOpenSourceFile(): Promise<void> {
    await this.removeDemoFolderIfExists();
    await this.app.vault.createFolder(DEMO_FOLDER_PATH);
    const sourceFile = await this.app.vault.create(SOURCE_FILE_PATH, createSourceMarkdown());
    await this.openFileInWorkspace(sourceFile);
    this.showNotice(`已重建并打开 ${sourceFile.path}。`, 3200);
  }

  private async generateAndOpenRenderReport(): Promise<void> {
    const sourceFile = await this.ensureSourceFile();
    const summary = await this.renderSourceFile(sourceFile);
    const reportContent = [
      '# Markdown Render Report',
      '',
      `sourceFile: ${sourceFile.path}`,
      `headingBadges=${summary.headingSections.length}`,
      `codeCards=${summary.codeCardSummaries.length}`,
      `renderedText=${summary.renderedText.length === 0 ? '无' : summary.renderedText}`,
      `headingSections=${stringifyLines(summary.headingSections)}`,
      `codeCardSummaries=${stringifyLines(summary.codeCardSummaries)}`,
      '',
      '## DOM Snapshot',
      '```text',
      ...summary.domSnapshot,
      '```',
    ].join('\n');

    const existingReport = this.app.vault.getFileByPath(REPORT_FILE_PATH);

    if (existingReport === null) {
      await this.app.vault.create(REPORT_FILE_PATH, reportContent);
    } else {
      await this.app.vault.modify(existingReport, reportContent);
    }

    await this.openFileInWorkspace(this.requireFile(REPORT_FILE_PATH));
    this.showNotice('已生成并打开渲染报告。', 3200);
  }

  private async cleanupDemoFolder(): Promise<void> {
    await this.removeDemoFolderIfExists();
    this.showNotice('已清理 markdown-render 测试目录。', 2800);
  }

  private async renderSourceFile(sourceFile: TFile): Promise<RenderSummary> {
    this.headingSections = [];
    this.codeCardSummaries = [];
    const container = document.createElement('div');
    const markdown = await this.app.vault.read(sourceFile);
    await MarkdownRenderer.renderMarkdown(markdown, container, sourceFile.path, this);

    return {
      headingSections: [...this.headingSections],
      codeCardSummaries: [...this.codeCardSummaries],
      domSnapshot: serializeDomTree(container),
      renderedText: trimVisibleText(container.textContent ?? ''),
    };
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async ensureSourceFile(): Promise<TFile> {
    const existingFile = this.app.vault.getFileByPath(SOURCE_FILE_PATH);

    if (existingFile !== null) {
      return existingFile;
    }

    await this.rebuildAndOpenSourceFile();
    return this.requireFile(SOURCE_FILE_PATH);
  }

  private requireFile(targetPath: string): TFile {
    const file = this.app.vault.getFileByPath(targetPath);

    if (file === null) {
      throw new Error(`未找到测试文件：${targetPath}`);
    }

    return file;
  }

  private async removeDemoFolderIfExists(): Promise<void> {
    const existingFolder = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (existingFolder === null) {
      return;
    }

    await this.app.vault.delete(existingFolder, true);
  }

  private showNotice(message: string, timeout = 2600): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-markdown-render] ${message}`);
  }
}
