/**
 * 插件命令贡献提供器。
 */

import type { WorkbenchContributionSnapshot } from '@note-studio/shared';
import type { Command } from './CommandTypes';
import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import { notification } from '../components/Notification';
import { workbenchContributionService } from '../services/WorkbenchContributionService';

export class PluginCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;
  private readonly registeredCommandIds = new Set<string>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private unsubscribeSnapshot: (() => void) | null = null;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.isInitialized && this.initPromise) {
      await this.initPromise;
    }
  }

  public dispose(): void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }

    const staleCommandIds = Array.from(this.registeredCommandIds);
    if (staleCommandIds.length > 0) {
      this.commandCenter.unregisterCommands(staleCommandIds);
      this.registeredCommandIds.clear();
    }
  }

  private async initialize(): Promise<void> {
    try {
      const snapshot = await workbenchContributionService.getContributions();
      this.syncCommands(snapshot);
      this.unsubscribeSnapshot = workbenchContributionService.subscribe((nextSnapshot) => {
        this.syncCommands(nextSnapshot);
      });
      this.isInitialized = true;
    } catch (error) {
      this.isInitialized = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PluginCommandProvider] 初始化失败:', error);
      notification.error(`加载插件命令失败: ${message}`);
    }
  }

  private syncCommands(snapshot: WorkbenchContributionSnapshot): void {
    const commands: Command[] = snapshot.commands.map(entry => ({
      id: entry.commandId,
      label: `${entry.extensionDisplayName}: ${entry.title}`,
      description: `插件命令 · ${entry.extensionDisplayName}`,
      category: entry.category ?? entry.extensionDisplayName,
      icon: entry.icon ?? undefined,
      execute: async () => {
        try {
          await workbenchContributionService.executeCommand({
            commandId: entry.commandId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          notification.error(`插件命令执行失败: ${message}`);
        }
      },
    }));

    const nextCommandIds = new Set(commands.map(command => command.id));
    const staleCommandIds: string[] = [];

    for (const commandId of this.registeredCommandIds) {
      if (!nextCommandIds.has(commandId)) {
        staleCommandIds.push(commandId);
      }
    }

    if (staleCommandIds.length > 0) {
      this.commandCenter.unregisterCommands(staleCommandIds);
    }

    this.commandCenter.registerCommands(commands);

    this.registeredCommandIds.clear();
    for (const commandId of nextCommandIds) {
      this.registeredCommandIds.add(commandId);
    }
  }
}
