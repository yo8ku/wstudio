/**
 * Demo plugin entry used to verify vault file and folder operations in the host runtime.
 */

import {
  Notice,
  Plugin,
  normalizePath,
  type PluginFailureContext,
  type TAbstractFile,
  type TFile,
  type TFolder,
} from '@note-studio/plugin';

const DEMO_TITLE = 'Vault 文件操作演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/vault-file-ops');
const PRIMARY_FILE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/vault-demo.md`);
const RENAMED_FILE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/vault-demo-renamed.md`);
const COPIED_FILE_PATH = normalizePath(`${DEMO_FOLDER_PATH}/vault-demo-copy.md`);
const APPEND_LINE = '> 由 Vault 文件操作演示追加的尾注';
const PROCESS_MARKER = 'processed-by-vault-demo: true';

type VaultEventKind = 'create' | 'modify' | 'rename' | 'delete';

interface VaultEventTotals {
  create: number;
  modify: number;
  rename: number;
  delete: number;
}

function summarizePaths(paths: readonly string[]): string {
  return paths.length === 0 ? '无' : paths.join('|');
}

function summarizeText(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return '空';
  }

  return normalized.length <= 72
    ? normalized
    : `${normalized.slice(0, 69)}...`;
}

function cloneEventTotals(totals: VaultEventTotals): VaultEventTotals {
  return {
    create: totals.create,
    modify: totals.modify,
    rename: totals.rename,
    delete: totals.delete,
  };
}

function createInitialContent(): string {
  return [
    '# Vault 文件操作演示',
    '',
    'status: initialized',
    'line-1: 这是用于插件 API 测试的基准文件。',
    'line-2: 后续会追加、处理、重命名和复制这个文件。',
  ].join('\n');
}

export default class VaultFileOpsDemoPlugin extends Plugin {
  private lastEventSummary = '无';
  private lastReadPreview = '无';
  private eventTotals: VaultEventTotals = {
    create: 0,
    modify: 0,
    rename: 0,
    delete: 0,
  };

  public onload(): void {
    this.recordTrace('plugin.onload');
    this.registerVaultEvents();

    this.addRibbonIcon('files', DEMO_TITLE, () => {
      void this.rebuildDemoWorkspace('活动栏入口');
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'rebuild-demo-workspace',
      name: '文件操作演示：重建测试目录',
      callback: () => {
        void this.rebuildDemoWorkspace('命令中心');
      },
    });

    this.addCommand({
      id: 'show-vault-demo-snapshot',
      name: '文件操作演示：显示快照',
      callback: () => {
        this.showSnapshot('命令中心');
      },
    });

    this.addCommand({
      id: 'read-demo-file',
      name: '文件操作演示：读取测试文件',
      callback: () => {
        void this.readPrimaryFile();
      },
    });

    this.addCommand({
      id: 'append-demo-file',
      name: '文件操作演示：追加尾注',
      callback: () => {
        void this.appendToPrimaryFile();
      },
    });

    this.addCommand({
      id: 'process-demo-file',
      name: '文件操作演示：处理测试文件',
      callback: () => {
        void this.processPrimaryFile();
      },
    });

    this.addCommand({
      id: 'rename-demo-file',
      name: '文件操作演示：重命名测试文件',
      callback: () => {
        void this.renamePrimaryFile();
      },
    });

    this.addCommand({
      id: 'copy-demo-file',
      name: '文件操作演示：复制测试文件',
      callback: () => {
        void this.copyPrimaryFile();
      },
    });

    this.addCommand({
      id: 'cleanup-demo-folder',
      name: '文件操作演示：清理测试目录',
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

  private registerVaultEvents(): void {
    this.registerEvent(this.app.vault.on('create', (file) => {
      this.handleVaultEvent('create', file);
    }));
    this.registerEvent(this.app.vault.on('modify', (file) => {
      this.handleVaultEvent('modify', file);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.handleVaultEvent('delete', file);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.handleVaultRenameEvent(file, oldPath);
    }));
  }

  private handleVaultEvent(kind: VaultEventKind, file: TAbstractFile): void {
    if (!this.isDemoPath(file.path)) {
      return;
    }

    this.eventTotals[kind] += 1;
    this.lastEventSummary = `${kind}:${file.path}`;
    this.recordTrace(`vault.${kind} path=${file.path}`);
  }

  private handleVaultRenameEvent(file: TAbstractFile, oldPath: string): void {
    if (!this.isDemoPath(file.path) && !this.isDemoPath(oldPath)) {
      return;
    }

    this.eventTotals.rename += 1;
    this.lastEventSummary = `rename:${oldPath}->${file.path}`;
    this.recordTrace(`vault.rename oldPath=${oldPath} path=${file.path}`);
  }

  private async rebuildDemoWorkspace(source: string): Promise<void> {
    await this.removeDemoFolderIfExists();
    await this.app.vault.createFolder(DEMO_FOLDER_PATH);
    const file = await this.app.vault.create(PRIMARY_FILE_PATH, createInitialContent());
    this.lastReadPreview = summarizeText(await this.app.vault.read(file));
    this.showSnapshot(source);
  }

  private async readPrimaryFile(): Promise<void> {
    const file = await this.ensurePrimaryFile();
    const content = await this.app.vault.read(file);
    this.lastReadPreview = summarizeText(content);
    this.recordTrace(`vault.read path=${file.path}`);
    this.showNotice(`已读取 ${file.path}，预览=${this.lastReadPreview}`, 4200);
  }

  private async appendToPrimaryFile(): Promise<void> {
    const file = await this.ensurePrimaryFile();
    await this.app.vault.append(file, `\n${APPEND_LINE}`);
    const refreshedFile = this.requireFileByPath(file.path);
    const content = await this.app.vault.read(refreshedFile);
    this.lastReadPreview = summarizeText(content);
    this.recordTrace(`vault.append path=${refreshedFile.path}`);
    this.showNotice(`已向 ${refreshedFile.path} 追加尾注。`, 3200);
  }

  private async processPrimaryFile(): Promise<void> {
    const file = await this.ensurePrimaryFile();
    const nextContent = await this.app.vault.process(file, (content) => {
      if (content.includes(PROCESS_MARKER)) {
        return content;
      }

      return `${content}\n${PROCESS_MARKER}`;
    });
    this.lastReadPreview = summarizeText(nextContent);
    this.recordTrace(`vault.process path=${file.path}`);
    this.showNotice(`已处理 ${file.path}，并写入标记。`, 3200);
  }

  private async renamePrimaryFile(): Promise<void> {
    const file = await this.ensurePrimaryFile();

    if (file.path === RENAMED_FILE_PATH) {
      this.showNotice('当前主文件已经是重命名后的状态。', 2800);
      return;
    }

    const existingTarget = this.app.vault.getAbstractFileByPath(RENAMED_FILE_PATH);

    if (existingTarget !== null) {
      throw new Error(`重命名目标已存在：${RENAMED_FILE_PATH}`);
    }

    await this.app.vault.rename(file, RENAMED_FILE_PATH);
    const renamedFile = this.requireFileByPath(RENAMED_FILE_PATH);
    const content = await this.app.vault.read(renamedFile);
    this.lastReadPreview = summarizeText(content);
    this.recordTrace(`vault.rename path=${RENAMED_FILE_PATH}`);
    this.showNotice(`已将主文件重命名为 ${RENAMED_FILE_PATH}。`, 3600);
  }

  private async copyPrimaryFile(): Promise<void> {
    const file = await this.ensurePrimaryFile();
    const existingCopy = this.app.vault.getAbstractFileByPath(COPIED_FILE_PATH);

    if (existingCopy !== null) {
      await this.app.vault.delete(existingCopy, true);
    }

    const copiedFile = await this.app.vault.copy(file, COPIED_FILE_PATH);
    const content = await this.app.vault.read(copiedFile);
    this.lastReadPreview = summarizeText(content);
    this.recordTrace(`vault.copy source=${file.path} target=${COPIED_FILE_PATH}`);
    this.showNotice(`已复制主文件到 ${COPIED_FILE_PATH}。`, 3600);
  }

  private async cleanupDemoFolder(): Promise<void> {
    await this.removeDemoFolderIfExists();
    this.lastReadPreview = '无';
    this.showSnapshot('清理测试目录');
  }

  private showSnapshot(source: string): void {
    const folder = this.app.vault.getFolderByPath(DEMO_FOLDER_PATH);
    const primaryFile = this.getPrimaryFile();
    const abstractPrimary = this.app.vault.getAbstractFileByPath(primaryFile?.path ?? PRIMARY_FILE_PATH);
    const demoFiles = this.getDemoFiles();
    const demoMarkdownFiles = this.app.vault.getMarkdownFiles().filter((file) => this.isDemoPath(file.path));
    const root = this.app.vault.getRoot();
    const totals = cloneEventTotals(this.eventTotals);

    const summary = [
      `source=${source}`,
      `root=${root.path.length === 0 ? '/' : root.path}`,
      `folder=${folder === null ? '无' : folder.path}`,
      `primary=${primaryFile?.path ?? '无'}`,
      `lookup=${abstractPrimary?.path ?? '未找到'}`,
      `demoFiles=${summarizePaths(demoFiles.map((file) => file.path))}`,
      `demoMarkdown=${demoMarkdownFiles.length}`,
      `allFiles=${this.app.vault.getFiles().length}`,
      `events=create:${totals.create}/modify:${totals.modify}/rename:${totals.rename}/delete:${totals.delete}`,
      `lastEvent=${this.lastEventSummary}`,
      `lastRead=${this.lastReadPreview}`,
    ].join(', ');

    this.recordTrace(`snapshot ${summary}`);
    this.showNotice(summary, 5200);
  }

  private getPrimaryFile(): TFile | null {
    return this.app.vault.getFileByPath(RENAMED_FILE_PATH)
      ?? this.app.vault.getFileByPath(PRIMARY_FILE_PATH)
      ?? this.app.vault.getFileByPath(COPIED_FILE_PATH);
  }

  private getDemoFiles(): readonly TFile[] {
    return this.app.vault.getFiles().filter((file) => this.isDemoPath(file.path));
  }

  private async ensurePrimaryFile(): Promise<TFile> {
    const existingFile = this.getPrimaryFile();

    if (existingFile !== null) {
      return existingFile;
    }

    const folder = this.app.vault.getFolderByPath(DEMO_FOLDER_PATH);

    if (folder === null) {
      await this.app.vault.createFolder(DEMO_FOLDER_PATH);
    }

    return this.app.vault.create(PRIMARY_FILE_PATH, createInitialContent());
  }

  private requireFileByPath(targetPath: string): TFile {
    const file = this.app.vault.getFileByPath(targetPath);

    if (file === null) {
      throw new Error(`未找到测试文件：${targetPath}`);
    }

    return file;
  }

  private async removeDemoFolderIfExists(): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (abstractFile === null) {
      return;
    }

    await this.app.vault.delete(abstractFile, true);
  }

  private isDemoPath(targetPath: string): boolean {
    return targetPath === DEMO_FOLDER_PATH || targetPath.startsWith(`${DEMO_FOLDER_PATH}/`);
  }

  private showNotice(message: string, timeout = 2600): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-vault-file-ops] ${message}`);
  }
}
