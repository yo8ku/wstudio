/**
 * Workbench contribution registry.
 * Projects static manifest contributions plus runtime webview panels into a renderer snapshot.
 */

import type { ResolvedExtensionManifest } from '@note-studio/extension-api';
import {
  EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  type WorkbenchCommandContributionEntry,
  type WorkbenchContributionSnapshot,
  type WorkbenchMenuContributionEntry,
  type WorkbenchRuntimeWebviewPanelEntry,
  type WorkbenchSettingContributionEntry,
  type WorkbenchViewContainerContributionEntry,
  type WorkbenchViewContributionEntry,
} from '@note-studio/shared';
import { resolveExtensionAssetUrl } from './ExtensionAssetUrl';

interface ExtensionWorkbenchContributionRecord {
  readonly commands: readonly WorkbenchCommandContributionEntry[];
  readonly menus: readonly WorkbenchMenuContributionEntry[];
  readonly settings: readonly WorkbenchSettingContributionEntry[];
  readonly viewContainers: readonly WorkbenchViewContainerContributionEntry[];
  readonly views: readonly WorkbenchViewContributionEntry[];
}

export interface RegisterRuntimeWebviewPanelOptions {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly panelId: string;
  readonly title: string;
  readonly webviewEntryUrl: string;
  readonly webviewHtml: string | null;
  readonly retainContextWhenHidden: boolean;
}

type WorkbenchContributionSnapshotListener =
  (snapshot: WorkbenchContributionSnapshot) => void;

function sortByDisplayText<TEntry extends {
  readonly title: string;
  readonly extensionDisplayName: string;
}>(
  entries: readonly TEntry[],
): readonly TEntry[] {
  return [...entries].sort((left, right) => {
    const extensionCompare = left.extensionDisplayName.localeCompare(
      right.extensionDisplayName,
      'zh-CN',
    );
    if (extensionCompare !== 0) {
      return extensionCompare;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });
}

function namespacePluginSettingKey(extensionId: string, relativeKey: string): string {
  return `extensions.${extensionId}.${relativeKey}`;
}

function createViewContainerKey(extensionId: string, containerId: string): string {
  return `${extensionId}:${containerId}`;
}

function createViewKey(extensionId: string, viewId: string): string {
  return `${extensionId}:${viewId}`;
}

export class WorkbenchContributionRegistry {
  private readonly byExtension = new Map<string, ExtensionWorkbenchContributionRecord>();
  private readonly runtimeWebviewPanels = new Map<string, WorkbenchRuntimeWebviewPanelEntry>();
  private readonly listeners = new Set<WorkbenchContributionSnapshotListener>();
  private runtimeWebviewPanelCounter = 0;

  public subscribe(listener: WorkbenchContributionSnapshotListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  public replaceExtensionContributions(
    manifest: ResolvedExtensionManifest,
    rootDirectory: string,
  ): void {
    const extensionDisplayName = manifest.displayName;
    const commands = sortByDisplayText(
      (manifest.contributes.commands ?? []).map(command => ({
        extensionId: manifest.id,
        extensionDisplayName,
        commandId: command.id,
        title: command.title,
        category: command.category ?? null,
        icon: resolveExtensionAssetUrl(manifest.id, rootDirectory, command.icon),
      })),
    );

    const viewContainers = sortByDisplayText(
      (manifest.contributes.viewContainers ?? []).map(container => ({
        extensionId: manifest.id,
        extensionDisplayName,
        containerKey: createViewContainerKey(manifest.id, container.id),
        containerId: container.id,
        title: container.title,
        icon: resolveExtensionAssetUrl(manifest.id, rootDirectory, container.icon),
      })),
    );

    const commandLookup = new Map(commands.map(command => [command.commandId, command]));
    const viewContainerLookup = new Map(viewContainers.map(container => [container.containerId, container]));
    const webviewLookup = new Map(
      (manifest.contributes.webviews ?? []).map(webview => [
        webview.id,
        {
          id: webview.id,
          entryUrl: resolveExtensionAssetUrl(manifest.id, rootDirectory, webview.entry),
          html: null,
          retainContextWhenHidden: webview.retainContextWhenHidden ?? false,
        },
      ]),
    );

    const menus = sortByDisplayText(
      (manifest.contributes.menus ?? []).map((menu, index) => {
        const command = commandLookup.get(menu.command);
        return {
          extensionId: manifest.id,
          extensionDisplayName,
          menuItemId: `${manifest.id}:${menu.location}:${index}`,
          location: menu.location,
          commandId: menu.command,
          title: command?.title ?? menu.command,
          category: command?.category ?? null,
          icon: command?.icon ?? null,
          group: menu.group ?? null,
          when: menu.when ?? null,
        } satisfies WorkbenchMenuContributionEntry;
      }),
    );

    const views = sortByDisplayText(
      (manifest.contributes.views ?? []).map(view => {
        const container = viewContainerLookup.get(view.container);
        const webview = webviewLookup.get(view.id);
        return {
          extensionId: manifest.id,
          extensionDisplayName,
          viewKey: createViewKey(manifest.id, view.id),
          viewId: view.id,
          containerKey: container?.containerKey ?? createViewContainerKey(manifest.id, view.container),
          containerId: view.container,
          title: view.title,
          when: view.when ?? null,
          webviewId: webview?.id ?? null,
          webviewEntryUrl: webview?.entryUrl ?? null,
          webviewHtml: webview?.html ?? null,
          retainContextWhenHidden: webview?.retainContextWhenHidden ?? false,
        } satisfies WorkbenchViewContributionEntry;
      }),
    );

    const settings = sortByDisplayText(
      (manifest.contributes.settings ?? []).map(setting => ({
        extensionId: manifest.id,
        extensionDisplayName,
        key: namespacePluginSettingKey(manifest.id, setting.key),
        relativeKey: setting.key,
        title: setting.title,
        description: setting.description ?? '',
        type: setting.type,
        defaultValue: setting.defaultValue,
        options: setting.options ?? [],
      })),
    );

    if (
      commands.length === 0
      && menus.length === 0
      && settings.length === 0
      && viewContainers.length === 0
      && views.length === 0
    ) {
      this.byExtension.delete(manifest.id);
      this.emitChanged();
      return;
    }

    this.byExtension.set(manifest.id, {
      commands,
      menus,
      settings,
      viewContainers,
      views,
    });
    this.emitChanged();
  }

  public registerRuntimeWebviewPanel(
    options: RegisterRuntimeWebviewPanelOptions,
  ): WorkbenchRuntimeWebviewPanelEntry {
    const existingEntry = this.findRuntimeWebviewPanelByIdentity(
      options.extensionId,
      options.panelId,
    );
    if (existingEntry) {
      const updatedEntry: WorkbenchRuntimeWebviewPanelEntry = {
        ...existingEntry,
        extensionDisplayName: options.extensionDisplayName,
        title: options.title,
        webviewEntryUrl: options.webviewEntryUrl,
        webviewHtml: options.webviewHtml,
        retainContextWhenHidden: options.retainContextWhenHidden,
        revealToken: existingEntry.revealToken + 1,
      };

      this.runtimeWebviewPanels.set(existingEntry.panelInstanceKey, updatedEntry);
      this.emitChanged();
      return updatedEntry;
    }

    const panelInstanceKey = `${options.extensionId}:${options.panelId}:${this.runtimeWebviewPanelCounter}`;
    this.runtimeWebviewPanelCounter += 1;

    const panelEntry: WorkbenchRuntimeWebviewPanelEntry = {
      extensionId: options.extensionId,
      extensionDisplayName: options.extensionDisplayName,
      panelInstanceKey,
      panelId: options.panelId,
      title: options.title,
      webviewEntryUrl: options.webviewEntryUrl,
      webviewHtml: options.webviewHtml,
      retainContextWhenHidden: options.retainContextWhenHidden,
      revealToken: 1,
    };

    this.runtimeWebviewPanels.set(panelInstanceKey, panelEntry);
    this.emitChanged();
    return panelEntry;
  }

  public revealRuntimeWebviewPanel(panelInstanceKey: string): WorkbenchRuntimeWebviewPanelEntry {
    const currentEntry = this.runtimeWebviewPanels.get(panelInstanceKey);
    if (!currentEntry) {
      throw new Error(`Runtime webview panel not found: ${panelInstanceKey}`);
    }

    const updatedEntry: WorkbenchRuntimeWebviewPanelEntry = {
      ...currentEntry,
      revealToken: currentEntry.revealToken + 1,
    };

    this.runtimeWebviewPanels.set(panelInstanceKey, updatedEntry);
    this.emitChanged();
    return updatedEntry;
  }

  public getRuntimeWebviewPanel(panelInstanceKey: string): WorkbenchRuntimeWebviewPanelEntry | undefined {
    return this.runtimeWebviewPanels.get(panelInstanceKey);
  }

  public disposeRuntimeWebviewPanel(panelInstanceKey: string): WorkbenchRuntimeWebviewPanelEntry | null {
    const entry = this.runtimeWebviewPanels.get(panelInstanceKey);
    if (!entry) {
      return null;
    }

    this.runtimeWebviewPanels.delete(panelInstanceKey);
    this.emitChanged();
    return entry;
  }

  public clearExtension(extensionId: string): void {
    const hadStaticContributions = this.byExtension.delete(extensionId);
    const hadRuntimePanels = this.deleteRuntimeWebviewPanelsByExtension(extensionId);
    if (hadStaticContributions || hadRuntimePanels) {
      this.emitChanged();
    }
  }

  public clearRuntimeWebviewPanels(extensionId: string): void {
    if (this.deleteRuntimeWebviewPanelsByExtension(extensionId)) {
      this.emitChanged();
    }
  }

  public clearAll(): void {
    const hadStaticContributions = this.byExtension.size > 0;
    const hadRuntimePanels = this.runtimeWebviewPanels.size > 0;

    this.byExtension.clear();
    this.runtimeWebviewPanels.clear();

    if (hadStaticContributions || hadRuntimePanels) {
      this.emitChanged();
    }
  }

  public getSnapshot(): WorkbenchContributionSnapshot {
    const commands: WorkbenchCommandContributionEntry[] = [];
    const menus: WorkbenchMenuContributionEntry[] = [];
    const settings: WorkbenchSettingContributionEntry[] = [];
    const viewContainers: WorkbenchViewContainerContributionEntry[] = [];
    const views: WorkbenchViewContributionEntry[] = [];
    const runtimeWebviewPanels = Array.from(this.runtimeWebviewPanels.values());

    for (const record of this.byExtension.values()) {
      commands.push(...record.commands);
      menus.push(...record.menus);
      settings.push(...record.settings);
      viewContainers.push(...record.viewContainers);
      views.push(...record.views);
    }

    if (
      commands.length === 0
      && menus.length === 0
      && settings.length === 0
      && viewContainers.length === 0
      && views.length === 0
      && runtimeWebviewPanels.length === 0
    ) {
      return EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT;
    }

    return {
      commands: sortByDisplayText(commands),
      menus: sortByDisplayText(menus),
      settings: sortByDisplayText(settings),
      viewContainers: sortByDisplayText(viewContainers),
      views: sortByDisplayText(views),
      runtimeWebviewPanels: sortByDisplayText(runtimeWebviewPanels),
    };
  }

  private deleteRuntimeWebviewPanelsByExtension(extensionId: string): boolean {
    let deleted = false;
    for (const [panelInstanceKey, panelEntry] of this.runtimeWebviewPanels.entries()) {
      if (panelEntry.extensionId !== extensionId) {
        continue;
      }

      this.runtimeWebviewPanels.delete(panelInstanceKey);
      deleted = true;
    }

    return deleted;
  }

  private findRuntimeWebviewPanelByIdentity(
    extensionId: string,
    panelId: string,
  ): WorkbenchRuntimeWebviewPanelEntry | null {
    for (const panelEntry of this.runtimeWebviewPanels.values()) {
      if (panelEntry.extensionId === extensionId && panelEntry.panelId === panelId) {
        return panelEntry;
      }
    }

    return null;
  }

  private emitChanged(): void {
    if (this.listeners.size === 0) {
      return;
    }

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const workbenchContributionRegistry = new WorkbenchContributionRegistry();
