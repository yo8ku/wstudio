/**
 * File-oriented view base classes aligned with the primary Obsidian view inheritance chain.
 */

import { ItemView } from './View';
import type { JsonObject } from '../types/json';
import type { TFile } from '../types/vault';
import type { ViewStateResult, WorkspaceLeaf } from '../types/view';

function readFilePath(state: JsonObject): string | null {
  const candidate = state.file;

  if (typeof candidate === 'string') {
    return candidate;
  }

  return null;
}

export abstract class FileView extends ItemView {
  public allowNoFile = false;
  public file: TFile | null = null;
  public override navigation = true;

  protected constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public override getDisplayText(): string {
    if (this.file !== null) {
      return this.file.basename;
    }

    return this.getViewType();
  }

  public override async onload(): Promise<void> {
    await super.onload();
  }

  public override getState(): JsonObject {
    if (this.file === null) {
      return {};
    }

    return {
      file: this.file.path,
    };
  }

  public override async setState(state: JsonObject, result: ViewStateResult): Promise<void> {
    const previousFile = this.file;
    const nextFilePath = readFilePath(state);
    const nextFile = nextFilePath === null
      ? null
      : this.app.vault.getFileByPath(nextFilePath);

    if (previousFile !== null && (nextFile === null || nextFile.path !== previousFile.path)) {
      await this.onUnloadFile(previousFile);
    }

    if (nextFile !== null) {
      this.file = nextFile;
      await this.onLoadFile(nextFile);
      return;
    }

    if (this.allowNoFile) {
      this.file = null;
    }

    void result;
  }

  public async onLoadFile(_file: TFile): Promise<void> {
    return undefined;
  }

  public async onUnloadFile(_file: TFile): Promise<void> {
    return undefined;
  }

  public async onRename(file: TFile): Promise<void> {
    this.file = file;
  }

  public canAcceptExtension(_extension: string): boolean {
    return true;
  }
}

export abstract class EditableFileView extends FileView {}

export abstract class TextFileView extends EditableFileView {
  public data = '';
  public readonly requestSave: () => void;

  protected constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.requestSave = () => {
      void this.save();
    };
  }

  public override async onUnloadFile(file: TFile): Promise<void> {
    this.data = '';
    this.clear();
    await super.onUnloadFile(file);
  }

  public override async onLoadFile(file: TFile): Promise<void> {
    const clear = this.file === null || this.file.path !== file.path;
    const data = await this.app.vault.cachedRead(file);

    this.file = file;
    this.data = data;
    this.setViewData(data, clear);
  }

  public async save(_clear?: boolean): Promise<void> {
    const nextData = this.getViewData();

    if (this.file !== null) {
      await this.app.vault.modify(this.file, nextData);
    }

    this.data = nextData;
  }

  public abstract getViewData(): string;

  public abstract setViewData(data: string, clear: boolean): void;

  public abstract clear(): void;
}
