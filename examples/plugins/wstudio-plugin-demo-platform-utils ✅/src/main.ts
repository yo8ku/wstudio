/**
 * Demo plugin entry used to verify platform utility helpers with visible
 * report files and generated markdown output.
 */

import {
  Notice,
  Platform,
  Plugin,
  debounce,
  getFrontMatterInfo,
  htmlToMarkdown,
  moment,
  normalizePath,
  parseFrontMatterAliases,
  parseFrontMatterTags,
  parseLinktext,
  parseYaml,
  requireApiVersion,
  sanitizeHTMLToDom,
  stripHeading,
  stripHeadingForLink,
  type FrontMatterCache,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '平台工具演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/platform-utils');
const REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/platform-utils-report.md`);
const MARKDOWN_RESULT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/platform-utils-markdown-result.md`);

const SAMPLE_HTML = [
  '<section class="demo-shell">',
  '  <h1 class="demo-title">Platform Utils Demo</h1>',
  '  <p>Hello <strong>world</strong> and <a href="https://example.com">Example Link</a>.</p>',
  '  <ul><li>alpha</li><li>beta</li></ul>',
  '  <pre><code>console.log(\'demo-card\')</code></pre>',
  '</section>',
].join('');

const SAMPLE_FRONTMATTER = [
  '---',
  'title: Platform Utils',
  'aliases:',
  '  - Alpha Alias',
  '  - Beta Alias',
  'tags: [alpha, beta]',
  'status: draft',
  '---',
  '',
  '# Example Heading',
].join('\n');

interface PlatformUtilsSummary {
  readonly normalizedPath: string;
  readonly parsedLinkPath: string;
  readonly parsedLinkSubpath: string;
  readonly strippedHeading: string;
  readonly strippedHeadingForLink: string;
  readonly frontmatterExists: string;
  readonly aliases: string;
  readonly tags: string;
  readonly yamlTitle: string;
  readonly yamlStatus: string;
  readonly requireApiVersionCurrent: string;
  readonly requireApiVersionFuture: string;
  readonly momentIso: string;
  readonly durationMilliseconds: string;
  readonly durationHuman: string;
  readonly debounceDelayedCount: string;
  readonly debounceAfterCancel: string;
  readonly debounceAfterRun: string;
  readonly debounceValues: string;
  readonly platformFlags: string;
  readonly markdownResult: string;
  readonly domSnapshot: readonly string[];
}

function stringifyList(values: readonly string[]): string {
  return values.length === 0 ? '无' : values.join(' | ');
}

function serializeDomTree(node: Node, depth = 0): readonly string[] {
  const indent = '  '.repeat(depth);

  if (node instanceof Text) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length === 0 ? [] : [`${indent}TEXT "${text}"`];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const classSuffix = node.className.trim().length === 0
    ? ''
    : `.${node.className.trim().split(/\s+/).join('.')}`;
  const line = `${indent}${node.tagName}${classSuffix}`;
  const childLines = Array.from(node.childNodes).flatMap((childNode) => serializeDomTree(childNode, depth + 1));
  return [line, ...childLines];
}

function frontMatterToCache(value: ReturnType<typeof parseYaml>): FrontMatterCache | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as FrontMatterCache;
}

export default class PlatformUtilsDemoPlugin extends Plugin {
  public override onload(): void {
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('wrench', DEMO_TITLE, () => {
      void this.generateAndOpenReports();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'generate-open-platform-utils-report',
      name: '平台工具演示：生成并打开工具报告',
      callback: () => {
        void this.generateAndOpenReports();
      },
    });

    this.addCommand({
      id: 'cleanup-platform-utils-demo',
      name: '平台工具演示：清理测试目录',
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
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  private async generateAndOpenReports(): Promise<void> {
    const summary = await this.collectSummary();
    const reportContent = [
      '# Platform Utils Report',
      '',
      `normalizedPath=${summary.normalizedPath}`,
      `parsedLinkPath=${summary.parsedLinkPath}`,
      `parsedLinkSubpath=${summary.parsedLinkSubpath}`,
      `strippedHeading=${summary.strippedHeading}`,
      `strippedHeadingForLink=${summary.strippedHeadingForLink}`,
      `frontmatterExists=${summary.frontmatterExists}`,
      `aliases=${summary.aliases}`,
      `tags=${summary.tags}`,
      `yamlTitle=${summary.yamlTitle}`,
      `yamlStatus=${summary.yamlStatus}`,
      `requireApiVersionCurrent=${summary.requireApiVersionCurrent}`,
      `requireApiVersionFuture=${summary.requireApiVersionFuture}`,
      `momentIso=${summary.momentIso}`,
      `durationMilliseconds=${summary.durationMilliseconds}`,
      `durationHuman=${summary.durationHuman}`,
      `debounceDelayedCount=${summary.debounceDelayedCount}`,
      `debounceAfterCancel=${summary.debounceAfterCancel}`,
      `debounceAfterRun=${summary.debounceAfterRun}`,
      `debounceValues=${summary.debounceValues}`,
      `platformFlags=${summary.platformFlags}`,
      '',
      '## DOM Snapshot',
      ...summary.domSnapshot,
    ].join('\n');

    const reportFile = await this.upsertMarkdownFile(REPORT_PATH, reportContent);
    const markdownResultFile = await this.upsertMarkdownFile(MARKDOWN_RESULT_PATH, summary.markdownResult);
    await this.openFileInWorkspace(markdownResultFile);
    await this.openFileInWorkspace(reportFile);
    this.showNotice(`已生成并打开 ${reportFile.path}。`, 3200);
  }

  private async collectSummary(): Promise<PlatformUtilsSummary> {
    const normalizedPath = normalizePath('folder\\nested/../final//demo.md');
    const linkInfo = parseLinktext('docs/Test.md#Section Alpha');
    const strippedHeading = stripHeading('## Example Heading');
    const strippedHeadingForLink = stripHeadingForLink('## Example Heading!');
    const frontmatterInfo = getFrontMatterInfo(SAMPLE_FRONTMATTER);
    const frontmatterValue = parseYaml(frontmatterInfo.frontmatter);
    const frontmatterCache = frontMatterToCache(frontmatterValue);
    const aliases = parseFrontMatterAliases(frontmatterCache);
    const tags = parseFrontMatterTags(frontmatterCache);
    const currentMoment = moment('2024-01-02T03:04:05Z');
    const duration = moment.duration(90, 'minutes');
    const debounceSummary = await this.runDebounceScenario();
    const fragment = sanitizeHTMLToDom(SAMPLE_HTML);
    const markdownResult = htmlToMarkdown(fragment);
    const domSnapshot = Array.from(fragment.childNodes).flatMap((childNode) => serializeDomTree(childNode));

    return {
      normalizedPath,
      parsedLinkPath: linkInfo.path,
      parsedLinkSubpath: linkInfo.subpath,
      strippedHeading,
      strippedHeadingForLink,
      frontmatterExists: String(frontmatterInfo.exists),
      aliases: stringifyList(aliases ?? []),
      tags: stringifyList(tags ?? []),
      yamlTitle: frontmatterCache?.title !== undefined ? String(frontmatterCache.title) : '无',
      yamlStatus: frontmatterCache?.status !== undefined ? String(frontmatterCache.status) : '无',
      requireApiVersionCurrent: String(requireApiVersion('1.0.0')),
      requireApiVersionFuture: String(requireApiVersion('99.0.0')),
      momentIso: currentMoment.format(),
      durationMilliseconds: String(duration.asMilliseconds()),
      durationHuman: duration.humanize(),
      debounceDelayedCount: String(debounceSummary.delayedCount),
      debounceAfterCancel: String(debounceSummary.afterCancel),
      debounceAfterRun: String(debounceSummary.afterRun),
      debounceValues: debounceSummary.values,
      platformFlags: `desktop=${Platform.isDesktop}|mobile=${Platform.isMobile}|win=${Platform.isWin}|mac=${Platform.isMacOS}|linux=${Platform.isLinux}`,
      markdownResult,
      domSnapshot,
    };
  }

  private async runDebounceScenario(): Promise<{
    readonly delayedCount: number;
    readonly afterCancel: number;
    readonly afterRun: number;
    readonly values: string;
  }> {
    const observedValues: string[] = [];
    let callCount = 0;
    const debounced = debounce((value: string): string => {
      callCount += 1;
      observedValues.push(value);
      return value;
    }, 20);

    debounced('first');
    debounced('second');
    await new Promise((resolve) => {
      setTimeout(resolve, 35);
    });
    const delayedCount = callCount;

    debounced('third');
    debounced.cancel();
    const afterCancel = callCount;

    debounced('fourth');
    debounced.run();
    const afterRun = callCount;

    return {
      delayedCount,
      afterCancel,
      afterRun,
      values: stringifyList(observedValues),
    };
  }

  private async upsertMarkdownFile(path: string, content: string): Promise<TFile> {
    await this.ensureDemoFolder();
    const existingFile = this.app.vault.getFileByPath(path);

    if (existingFile === null) {
      return this.app.vault.create(path, content);
    }

    await this.app.vault.modify(existingFile, content);
    return this.requireFile(path);
  }

  private async ensureDemoFolder(): Promise<void> {
    const existingFolder = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (existingFolder !== null) {
      return;
    }

    await this.app.vault.createFolder(DEMO_FOLDER_PATH);
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(path);

    if (file === null) {
      throw new Error(`Expected demo file "${path}" to exist.`);
    }

    return file;
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async cleanupDemoFolder(): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (abstractFile !== null) {
      await this.app.vault.delete(abstractFile, true);
    }

    this.showNotice('已清理 platform-utils 测试目录。', 2800);
  }

  private showNotice(message: string, timeout = 2400): void {
    void timeout;
    new Notice(`${DEMO_TITLE}：${message}`);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-platform-utils] ${message}`);
  }
}
