/**
 * Demo plugin entry used to verify metadata cache and markdown related APIs with visible file operations.
 */

import {
  Notice,
  Plugin,
  normalizePath,
  type CachedMetadata,
  type PluginFailureContext,
  type TAbstractFile,
  type TFile,
  type WorkspaceLeaf,
} from '@note-studio/plugin';

const DEMO_TITLE = 'Metadata 与 Markdown 演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/metadata-markdown');
const DEMO_NOTE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/metadata-demo.md`);
const LINK_TARGET_PATH = normalizePath(`${DEMO_FOLDER_PATH}/linked-target.md`);
const REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/metadata-report.md`);
const APPENDED_SECTION_HEADING = '## Appended Metadata Section';
const APPENDED_TAG = '#gamma-demo';

interface MetadataEventTotals {
  changed: number;
  deleted: number;
  resolve: number;
  resolved: number;
}

function stringifyList(values: readonly string[]): string {
  return values.length === 0 ? '无' : values.join(' | ');
}

function summarizeFrontmatter(cache: CachedMetadata | null): string {
  if (cache?.frontmatter === undefined) {
    return '无';
  }

  const entries = Object.entries(cache.frontmatter).map(([key, value]) => `${key}=${String(value)}`);
  return stringifyList(entries);
}

function summarizeHeadings(cache: CachedMetadata | null): string {
  return stringifyList((cache?.headings ?? []).map((heading) => `${heading.level}:${heading.heading}`));
}

function summarizeTags(cache: CachedMetadata | null): string {
  return stringifyList((cache?.tags ?? []).map((tag) => tag.tag));
}

function summarizeLinks(cache: CachedMetadata | null): string {
  return stringifyList((cache?.links ?? []).map((link) => link.link));
}

function createLinkedTargetContent(): string {
  return [
    '# Linked Target',
    '',
    'This is the linked target note for metadata verification.',
  ].join('\n');
}

function createDemoNoteContent(dynamicWikiLink: string): string {
  return [
    '---',
    'title: Metadata Demo',
    'status: draft',
    'reviewed: false',
    'category: metadata-demo',
    '---',
    '',
    '# Metadata Demo',
    '',
    '## Section Alpha',
    `This line contains tag #alpha-demo and wiki link ${dynamicWikiLink}.`,
    '',
    '## Section Beta',
    'This line contains tag #beta-demo and markdown link [Open target](linked-target.md).',
    '',
    '^metadata-demo-block',
  ].join('\n');
}

function createEventTotals(): MetadataEventTotals {
  return {
    changed: 0,
    deleted: 0,
    resolve: 0,
    resolved: 0,
  };
}

export default class MetadataMarkdownDemoPlugin extends Plugin {
  private metadataEventTotals: MetadataEventTotals = createEventTotals();
  private lastMetadataSummary = '无';

  public onload(): void {
    this.recordTrace('plugin.onload');
    this.registerMetadataEvents();

    this.addRibbonIcon('book-open', DEMO_TITLE, () => {
      void this.rebuildAndOpenDemo();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'rebuild-open-metadata-demo',
      name: '元数据演示：重建并打开测试文件',
      callback: () => {
        void this.rebuildAndOpenDemo();
      },
    });

    this.addCommand({
      id: 'toggle-frontmatter-status',
      name: '元数据演示：切换 frontmatter 状态',
      callback: () => {
        void this.toggleFrontmatterStatus();
      },
    });

    this.addCommand({
      id: 'append-metadata-section',
      name: '元数据演示：追加标签与链接段落',
      callback: () => {
        void this.appendMetadataSection();
      },
    });

    this.addCommand({
      id: 'generate-metadata-report',
      name: '元数据演示：生成元数据报告',
      callback: () => {
        void this.generateMetadataReport();
      },
    });

    this.addCommand({
      id: 'open-first-linked-target',
      name: '元数据演示：打开第一个链接目标',
      callback: () => {
        void this.openFirstLinkedTarget();
      },
    });

    this.addCommand({
      id: 'cleanup-metadata-demo',
      name: '元数据演示：清理测试目录',
      callback: () => {
        void this.cleanupDemoFolder();
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
    this.recordTrace(`plugin.onFailed operation=${failure.operation}`);
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  private registerMetadataEvents(): void {
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (!this.isDemoPath(file.path)) {
        return;
      }

      this.metadataEventTotals.changed += 1;
      this.recordTrace(`metadata.changed path=${file.path}`);
    }));

    this.registerEvent(this.app.metadataCache.on('deleted', (file) => {
      if (!this.isDemoPath(file.path)) {
        return;
      }

      this.metadataEventTotals.deleted += 1;
      this.recordTrace(`metadata.deleted path=${file.path}`);
    }));

    this.registerEvent(this.app.metadataCache.on('resolve', (file) => {
      if (!this.isDemoPath(file.path)) {
        return;
      }

      this.metadataEventTotals.resolve += 1;
      this.recordTrace(`metadata.resolve path=${file.path}`);
    }));

    this.registerEvent(this.app.metadataCache.on('resolved', () => {
      this.metadataEventTotals.resolved += 1;
      this.recordTrace('metadata.resolved');
    }));
  }

  private async rebuildAndOpenDemo(): Promise<void> {
    await this.removeDemoFolderIfExists();
    await this.app.vault.createFolder(DEMO_FOLDER_PATH);

    const linkedTarget = await this.app.vault.create(LINK_TARGET_PATH, createLinkedTargetContent());
    const wikiLink = this.app.fileManager.generateMarkdownLink(linkedTarget, DEMO_NOTE_PATH);
    const demoFile = await this.app.vault.create(DEMO_NOTE_PATH, createDemoNoteContent(wikiLink));

    await this.openFileInWorkspace(demoFile);
    this.lastMetadataSummary = '已重建测试文件';
    this.showNotice(`已重建并打开 ${demoFile.path}。`, 3200);
  }

  private async toggleFrontmatterStatus(): Promise<void> {
    const demoFile = await this.ensureDemoNote();
    await this.app.fileManager.processFrontMatter(demoFile, (frontmatter) => {
      const currentStatus = frontmatter.status === 'reviewed' ? 'reviewed' : 'draft';
      const nextStatus = currentStatus === 'draft' ? 'reviewed' : 'draft';
      frontmatter.status = nextStatus;
      frontmatter.reviewed = nextStatus === 'reviewed';
    });

    const refreshedFile = this.requireFile(DEMO_NOTE_PATH);
    await this.openFileInWorkspace(refreshedFile);
    this.lastMetadataSummary = '已切换 frontmatter 状态';
    this.showNotice(`已切换 ${refreshedFile.path} 的 frontmatter 状态。`, 3200);
  }

  private async appendMetadataSection(): Promise<void> {
    const demoFile = await this.ensureDemoNote();
    const linkedTarget = this.requireFile(LINK_TARGET_PATH);
    const generatedLink = this.app.fileManager.generateMarkdownLink(linkedTarget, demoFile.path, undefined, 'Linked Target Alias');
    await this.app.vault.append(demoFile, [
      '',
      APPENDED_SECTION_HEADING,
      `Appended tag: ${APPENDED_TAG}`,
      `Appended wiki link: ${generatedLink}`,
      'Appended markdown link: [Alias target](linked-target.md)',
    ].join('\n'));

    const refreshedFile = this.requireFile(demoFile.path);
    await this.openFileInWorkspace(refreshedFile);
    this.lastMetadataSummary = '已追加标签与链接段落';
    this.showNotice(`已向 ${refreshedFile.path} 追加新的 metadata 段落。`, 3400);
  }

  private async generateMetadataReport(): Promise<void> {
    const demoFile = await this.ensureDemoNote();
    const cache = this.app.metadataCache.getFileCache(demoFile);
    const resolvedLinks = this.app.metadataCache.resolvedLinks[demoFile.path];
    const unresolvedLinks = this.app.metadataCache.unresolvedLinks[demoFile.path];
    const firstResolvedTarget = this.app.metadataCache.getFirstLinkpathDest('linked-target', demoFile.path);
    const fileLinkText = this.app.metadataCache.fileToLinktext(demoFile, REPORT_PATH, true);
    const reportContent = [
      '# Metadata Report',
      '',
      `sourceFile: ${demoFile.path}`,
      `fileToLinktext: ${fileLinkText}`,
      `firstResolvedTarget: ${firstResolvedTarget?.path ?? '无'}`,
      `frontmatter: ${summarizeFrontmatter(cache)}`,
      `headings: ${summarizeHeadings(cache)}`,
      `tags: ${summarizeTags(cache)}`,
      `links: ${summarizeLinks(cache)}`,
      `resolvedLinks: ${stringifyList(Object.entries(resolvedLinks ?? {}).map(([targetPath, count]) => `${targetPath}:${count}`))}`,
      `unresolvedLinks: ${stringifyList(Object.entries(unresolvedLinks ?? {}).map(([targetPath, count]) => `${targetPath}:${count}`))}`,
      `events: changed=${this.metadataEventTotals.changed}, deleted=${this.metadataEventTotals.deleted}, resolve=${this.metadataEventTotals.resolve}, resolved=${this.metadataEventTotals.resolved}`,
      `summary: ${this.lastMetadataSummary}`,
    ].join('\n');

    const existingReport = this.app.vault.getFileByPath(REPORT_PATH);

    if (existingReport === null) {
      await this.app.vault.create(REPORT_PATH, reportContent);
    } else {
      await this.app.vault.modify(existingReport, reportContent);
    }

    const reportFile = this.requireFile(REPORT_PATH);
    await this.openFileInWorkspace(reportFile);
    this.lastMetadataSummary = '已生成元数据报告';
    this.showNotice(`已生成并打开 ${reportFile.path}。`, 3200);
  }

  private async openFirstLinkedTarget(): Promise<void> {
    const demoFile = await this.ensureDemoNote();
    const targetFile = this.app.metadataCache.getFirstLinkpathDest('linked-target', demoFile.path);

    if (targetFile === null) {
      this.showNotice('当前没有解析到可打开的链接目标。', 2800);
      return;
    }

    await this.openFileInWorkspace(targetFile);
    this.lastMetadataSummary = `已打开链接目标 ${targetFile.path}`;
    this.showNotice(`已打开链接目标 ${targetFile.path}。`, 3200);
  }

  private async cleanupDemoFolder(): Promise<void> {
    await this.removeDemoFolderIfExists();
    this.lastMetadataSummary = '已清理测试目录';
    this.showNotice('已清理 metadata-markdown 测试目录。', 2800);
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async ensureDemoNote(): Promise<TFile> {
    const existingFile = this.app.vault.getFileByPath(DEMO_NOTE_PATH);

    if (existingFile !== null) {
      return existingFile;
    }

    await this.rebuildAndOpenDemo();
    return this.requireFile(DEMO_NOTE_PATH);
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

  private isDemoPath(targetPath: string): boolean {
    return targetPath === DEMO_FOLDER_PATH || targetPath.startsWith(`${DEMO_FOLDER_PATH}/`);
  }

  private showNotice(message: string, timeout = 2600): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-metadata-markdown] ${message}`);
  }
}
