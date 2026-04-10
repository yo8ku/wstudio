/**
 * Host app facade exposed to every plugin instance.
 */

import type { UserEvent } from './base';
import type { FileManager } from './file-manager';
import type { Keymap, Scope } from './keymap';
import type { MetadataCache } from './metadata';
import type { MutableJsonValue } from './json';
import type { RenderContext } from './render';
import type { ShellService } from './shell';
import type { UrlMetadataService } from './url-metadata';
import type { Vault } from './vault';
import type { Workspace } from './view';

export abstract class App {
  public abstract readonly keymap: Keymap;

  public abstract readonly scope: Scope;

  public abstract readonly workspace: Workspace;

  public abstract readonly vault: Vault;

  public abstract readonly metadataCache: MetadataCache;

  public abstract readonly fileManager: FileManager;

  public abstract readonly urlMetadata: UrlMetadataService;

  public abstract readonly shell: ShellService;

  public abstract readonly lastEvent: UserEvent | null;

  public abstract readonly renderContext: RenderContext;

  public abstract isDarkMode(): boolean;

  public abstract loadLocalStorage<TValue extends MutableJsonValue = MutableJsonValue>(
    key: string,
  ): TValue | null;

  public abstract saveLocalStorage(key: string, data: MutableJsonValue | null): void;
}
