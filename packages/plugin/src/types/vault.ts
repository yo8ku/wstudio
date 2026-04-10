/**
 * Vault interfaces exposed to plugins for file and folder access.
 */

import { Events } from './events';
import type { EventRef } from './disposable';

export interface DataWriteOptions {
  readonly ctime?: number;
  readonly mtime?: number;
}

export interface Stat {
  readonly type: 'file' | 'folder';
  readonly ctime: number;
  readonly mtime: number;
  readonly size: number;
}

export interface FileStats {
  readonly ctime: number;
  readonly mtime: number;
  readonly size: number;
}

export interface ListedFiles {
  readonly files: readonly string[];
  readonly folders: readonly string[];
}

export interface DataAdapter {
  getName(): string;
  exists(normalizedPath: string, sensitive?: boolean): Promise<boolean>;
  stat(normalizedPath: string): Promise<Stat | null>;
  list(normalizedPath: string): Promise<ListedFiles>;
  read(normalizedPath: string): Promise<string>;
  readBinary(normalizedPath: string): Promise<ArrayBuffer>;
  write(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
  writeBinary(normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>;
  append(normalizedPath: string, data: string, options?: DataWriteOptions): Promise<void>;
  process(
    normalizedPath: string,
    mutator: (data: string) => string,
    options?: DataWriteOptions,
  ): Promise<string>;
  getResourcePath(normalizedPath: string): string;
  mkdir(normalizedPath: string): Promise<void>;
  trashSystem(normalizedPath: string): Promise<boolean>;
  trashLocal(normalizedPath: string): Promise<void>;
  rmdir(normalizedPath: string, recursive: boolean): Promise<void>;
  remove(normalizedPath: string): Promise<void>;
  rename(normalizedPath: string, normalizedNewPath: string): Promise<void>;
  copy(normalizedPath: string, normalizedNewPath: string): Promise<void>;
}

interface StoredFileEntry {
  buffer: ArrayBuffer;
  stat: Stat;
}

function normalizeAdapterPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function getParentPath(path: string): string {
  const normalized = normalizeAdapterPath(path);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash <= 0) {
    return '';
  }

  return normalized.slice(0, lastSlash);
}

function getNameFromPath(path: string): string {
  const normalized = normalizeAdapterPath(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
}

function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function createFileStat(size: number, options?: DataWriteOptions): Stat {
  const now = Date.now();

  return {
    type: 'file',
    ctime: options?.ctime ?? now,
    mtime: options?.mtime ?? now,
    size,
  };
}

function createFolderStat(): Stat {
  const now = Date.now();

  return {
    type: 'folder',
    ctime: now,
    mtime: now,
    size: 0,
  };
}

abstract class MemoryDataAdapter implements DataAdapter {
  private readonly files = new Map<string, StoredFileEntry>();
  private readonly folders = new Set<string>(['']);
  private readonly textEncoder = new TextEncoder();
  private readonly textDecoder = new TextDecoder();

  protected constructor(
    private readonly adapterName: string,
    protected readonly basePath = '',
  ) {}

  public getName(): string {
    return this.adapterName;
  }

  public async exists(normalizedPath: string, sensitive?: boolean): Promise<boolean> {
    void sensitive;
    const target = normalizeAdapterPath(normalizedPath);
    return this.files.has(target) || this.folders.has(target);
  }

  public async stat(normalizedPath: string): Promise<Stat | null> {
    const target = normalizeAdapterPath(normalizedPath);
    const file = this.files.get(target);

    if (file !== undefined) {
      return {
        ...file.stat,
      };
    }

    if (this.folders.has(target)) {
      return createFolderStat();
    }

    return null;
  }

  public async list(normalizedPath: string): Promise<ListedFiles> {
    const target = normalizeAdapterPath(normalizedPath);
    const folderPrefix = target.length === 0 ? '' : `${target}/`;
    const files = new Set<string>();
    const folders = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(folderPrefix)) {
        continue;
      }

      const relative = filePath.slice(folderPrefix.length);

      if (relative.length === 0) {
        continue;
      }

      const slashIndex = relative.indexOf('/');

      if (slashIndex === -1) {
        files.add(relative);
        continue;
      }

      folders.add(relative.slice(0, slashIndex));
    }

    for (const folderPath of this.folders) {
      if (folderPath === target || !folderPath.startsWith(folderPrefix)) {
        continue;
      }

      const relative = folderPath.slice(folderPrefix.length);

      if (relative.length === 0) {
        continue;
      }

      const slashIndex = relative.indexOf('/');
      folders.add(slashIndex === -1 ? relative : relative.slice(0, slashIndex));
    }

    return {
      files: [...files],
      folders: [...folders],
    };
  }

  public async read(normalizedPath: string): Promise<string> {
    const buffer = await this.readBinary(normalizedPath);
    return this.textDecoder.decode(buffer);
  }

  public async readBinary(normalizedPath: string): Promise<ArrayBuffer> {
    const target = normalizeAdapterPath(normalizedPath);
    const file = this.files.get(target);

    if (file === undefined) {
      throw new Error(`File does not exist: ${target}`);
    }

    return cloneArrayBuffer(file.buffer);
  }

  public async write(
    normalizedPath: string,
    data: string,
    options?: DataWriteOptions,
  ): Promise<void> {
    await this.writeBinary(normalizedPath, this.textEncoder.encode(data).buffer, options);
  }

  public async writeBinary(
    normalizedPath: string,
    data: ArrayBuffer,
    options?: DataWriteOptions,
  ): Promise<void> {
    const target = normalizeAdapterPath(normalizedPath);
    this.ensureParentFolders(target);
    this.files.set(target, {
      buffer: cloneArrayBuffer(data),
      stat: createFileStat(data.byteLength, options),
    });
  }

  public async append(
    normalizedPath: string,
    data: string,
    options?: DataWriteOptions,
  ): Promise<void> {
    const current = await this.read(normalizedPath).catch(() => '');
    await this.write(normalizedPath, `${current}${data}`, options);
  }

  public async process(
    normalizedPath: string,
    mutator: (data: string) => string,
    options?: DataWriteOptions,
  ): Promise<string> {
    const current = await this.read(normalizedPath).catch(() => '');
    const next = mutator(current);
    await this.write(normalizedPath, next, options);
    return next;
  }

  public getResourcePath(normalizedPath: string): string {
    const target = normalizeAdapterPath(normalizedPath);
    return `file:///${this.getFullPath(target).replace(/\\/g, '/')}`;
  }

  public async mkdir(normalizedPath: string): Promise<void> {
    const target = normalizeAdapterPath(normalizedPath);
    this.ensureParentFolders(target);
    this.folders.add(target);
  }

  public async trashSystem(normalizedPath: string): Promise<boolean> {
    const existed = await this.exists(normalizedPath);

    if (!existed) {
      return false;
    }

    await this.remove(normalizedPath).catch(async () => {
      await this.rmdir(normalizedPath, true);
    });
    return true;
  }

  public async trashLocal(normalizedPath: string): Promise<void> {
    await this.remove(normalizedPath).catch(async () => {
      await this.rmdir(normalizedPath, true);
    });
  }

  public async rmdir(normalizedPath: string, recursive: boolean): Promise<void> {
    const target = normalizeAdapterPath(normalizedPath);
    const prefix = target.length === 0 ? '' : `${target}/`;
    const fileChildren = [...this.files.keys()].filter((path) => path.startsWith(prefix));
    const folderChildren = [...this.folders].filter((path) => path.startsWith(prefix) && path !== target);

    if (!recursive && (fileChildren.length > 0 || folderChildren.length > 0)) {
      throw new Error(`Folder is not empty: ${target}`);
    }

    for (const filePath of fileChildren) {
      this.files.delete(filePath);
    }

    for (const folderPath of folderChildren) {
      this.folders.delete(folderPath);
    }

    this.folders.delete(target);
  }

  public async remove(normalizedPath: string): Promise<void> {
    const target = normalizeAdapterPath(normalizedPath);

    if (this.files.delete(target)) {
      return;
    }

    if (this.folders.has(target)) {
      await this.rmdir(target, true);
      return;
    }

    throw new Error(`Path does not exist: ${target}`);
  }

  public async rename(normalizedPath: string, normalizedNewPath: string): Promise<void> {
    const source = normalizeAdapterPath(normalizedPath);
    const target = normalizeAdapterPath(normalizedNewPath);

    if (this.files.has(source)) {
      const file = this.files.get(source);

      if (file === undefined) {
        return;
      }

      this.ensureParentFolders(target);
      this.files.delete(source);
      this.files.set(target, file);
      return;
    }

    if (!this.folders.has(source)) {
      throw new Error(`Path does not exist: ${source}`);
    }

    const sourcePrefix = source.length === 0 ? '' : `${source}/`;
    const targetPrefix = target.length === 0 ? '' : `${target}/`;
    const fileEntries = [...this.files.entries()];
    const folderEntries = [...this.folders];

    this.ensureParentFolders(target);
    this.folders.add(target);

    for (const [filePath, file] of fileEntries) {
      if (!filePath.startsWith(sourcePrefix)) {
        continue;
      }

      const nextPath = `${targetPrefix}${filePath.slice(sourcePrefix.length)}`;
      this.files.delete(filePath);
      this.files.set(nextPath, file);
    }

    for (const folderPath of folderEntries) {
      if (folderPath === source || !folderPath.startsWith(sourcePrefix)) {
        continue;
      }

      const nextPath = `${targetPrefix}${folderPath.slice(sourcePrefix.length)}`;
      this.folders.delete(folderPath);
      this.folders.add(nextPath);
    }

    this.folders.delete(source);
  }

  public async copy(normalizedPath: string, normalizedNewPath: string): Promise<void> {
    const source = normalizeAdapterPath(normalizedPath);
    const target = normalizeAdapterPath(normalizedNewPath);
    const file = this.files.get(source);

    if (file === undefined) {
      throw new Error(`File does not exist: ${source}`);
    }

    this.ensureParentFolders(target);
    this.files.set(target, {
      buffer: cloneArrayBuffer(file.buffer),
      stat: {
        ...file.stat,
      },
    });
  }

  public getFullPath(normalizedPath: string): string {
    const target = normalizeAdapterPath(normalizedPath);

    if (this.basePath.length === 0) {
      return target;
    }

    return target.length === 0 ? this.basePath : `${this.basePath}/${target}`;
  }

  protected ensureParentFolders(normalizedPath: string): void {
    const target = normalizeAdapterPath(normalizedPath);
    const segments = target.split('/').slice(0, -1);
    let current = '';

    this.folders.add('');

    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      this.folders.add(current);
    }
  }
}

export class FileSystemAdapter extends MemoryDataAdapter {
  public constructor(basePath = '') {
    super('filesystem', basePath);
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public getFilePath(normalizedPath: string): string {
    return this.getFullPath(normalizedPath);
  }

  public static readLocalFile(path: string): Promise<ArrayBuffer> {
    void path;
    return Promise.resolve(new ArrayBuffer(0));
  }

  public static mkdir(path: string): Promise<void> {
    void path;
    return Promise.resolve();
  }
}

export class CapacitorAdapter extends MemoryDataAdapter {
  public constructor(basePath = '') {
    super('capacitor', basePath);
  }
}

export abstract class TAbstractFile {
  public readonly vault: Vault;
  public readonly path: string;
  public readonly name: string;
  public readonly parent: TFolder | null;

  protected constructor(vault: Vault, path: string, name: string, parent: TFolder | null) {
    this.vault = vault;
    this.path = path;
    this.name = name;
    this.parent = parent;
  }
}

export class TFile extends TAbstractFile {
  public readonly stat: FileStats;
  public readonly basename: string;
  public readonly extension: string;

  constructor(
    vault: Vault,
    path: string,
    name: string,
    stat: FileStats,
    basename: string,
    extension: string,
    parent: TFolder | null = null,
  ) {
    super(vault, path, name, parent);
    this.stat = stat;
    this.basename = basename;
    this.extension = extension;
  }
}

export class TFolder extends TAbstractFile {
  public readonly children: readonly TAbstractFile[];

  constructor(
    vault: Vault,
    path: string,
    name: string,
    children: readonly TAbstractFile[] = [],
    parent: TFolder | null = null,
  ) {
    super(vault, path, name, parent);
    this.children = children;
  }

  public isRoot(): boolean {
    return this.parent === null;
  }
}

export abstract class Vault extends Events {
  public abstract readonly adapter: DataAdapter;

  public abstract readonly configDir: string;

  public abstract getName(): string;

  public abstract getFileByPath(path: string): TFile | null;

  public abstract getFolderByPath(path: string): TFolder | null;

  public abstract getAbstractFileByPath(path: string): TAbstractFile | null;

  public abstract getRoot(): TFolder;

  public abstract create(path: string, data: string, options?: DataWriteOptions): Promise<TFile>;

  public abstract createBinary(
    path: string,
    data: ArrayBuffer,
    options?: DataWriteOptions,
  ): Promise<TFile>;

  public abstract createFolder(path: string): Promise<TFolder>;

  public abstract read(file: TFile): Promise<string>;

  public abstract cachedRead(file: TFile): Promise<string>;

  public abstract readBinary(file: TFile): Promise<ArrayBuffer>;

  public abstract getResourcePath(file: TFile): string;

  public abstract delete(file: TAbstractFile, force?: boolean): Promise<void>;

  public abstract trash(file: TAbstractFile, system: boolean): Promise<void>;

  public abstract rename(file: TAbstractFile, newPath: string): Promise<void>;

  public abstract modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;

  public abstract modifyBinary(
    file: TFile,
    data: ArrayBuffer,
    options?: DataWriteOptions,
  ): Promise<void>;

  public abstract append(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;

  public abstract process(
    file: TFile,
    mutator: (data: string) => string,
    options?: DataWriteOptions,
  ): Promise<string>;

  public abstract copy<TFileType extends TAbstractFile>(
    file: TFileType,
    newPath: string,
  ): Promise<TFileType>;

  public abstract getAllLoadedFiles(): readonly TAbstractFile[];

  public abstract getAllFolders(includeRoot?: boolean): readonly TFolder[];

  public abstract getMarkdownFiles(): readonly TFile[];

  public abstract getFiles(): readonly TFile[];
}

export interface Vault {
  on(
    name: 'create',
    callback: (file: TAbstractFile) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'modify',
    callback: (file: TAbstractFile) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'delete',
    callback: (file: TAbstractFile) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'rename',
    callback: (file: TAbstractFile, oldPath: string) => void,
    context?: object,
  ): EventRef;
}

export function recurseChildren(root: TFolder, callback: (file: TAbstractFile) => void): void {
  for (const child of root.children) {
    callback(child);

    if (child instanceof TFolder) {
      recurseChildren(child, callback);
    }
  }
}
