/**
 * Static command registry derived from plugin manifests.
 */

import type { CommandContribution } from '@note-studio/extension-api';

export interface RegisteredPluginCommand {
  readonly extensionId: string;
  readonly commandId: string;
  readonly title: string;
  readonly category: string | null;
}

export class PluginCommandRegistry {
  private readonly commands = new Map<string, RegisteredPluginCommand>();

  public replaceExtensionCommands(
    extensionId: string,
    commands: readonly CommandContribution[],
  ): void {
    this.clearExtension(extensionId);

    for (const command of commands) {
      this.commands.set(command.id, {
        extensionId,
        commandId: command.id,
        title: command.title,
        category: command.category ?? null,
      });
    }
  }

  public get(commandId: string): RegisteredPluginCommand | undefined {
    return this.commands.get(commandId);
  }

  public clearExtension(extensionId: string): void {
    for (const [commandId, registration] of this.commands.entries()) {
      if (registration.extensionId === extensionId) {
        this.commands.delete(commandId);
      }
    }
  }

  public clearAll(): void {
    this.commands.clear();
  }
}

export const pluginCommandRegistry = new PluginCommandRegistry();
