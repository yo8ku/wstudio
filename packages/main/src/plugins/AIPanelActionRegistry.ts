/**
 * AI panel "/" 面板插件命令与技能执行注册表。
 */

import type {
  AIPanelContributionEntry,
  AIPanelContributionExecutionOutcome,
} from '@note-studio/shared';

export interface AIPanelActionExecutionContext {
  readonly extensionId: string;
  readonly itemId: string;
  readonly title: string;
}

type AIPanelActionHandler =
  (context: AIPanelActionExecutionContext) =>
    AIPanelContributionExecutionOutcome | void | Promise<AIPanelContributionExecutionOutcome | void>;

interface RegisteredAIPanelAction {
  readonly extensionId: string;
  readonly handler: AIPanelActionHandler;
}

export class AIPanelActionRegistry {
  private readonly commandHandlers = new Map<string, RegisteredAIPanelAction>();
  private readonly toolHandlers = new Map<string, RegisteredAIPanelAction>();

  public registerCommand(
    extensionId: string,
    commandId: string,
    handler: AIPanelActionHandler,
  ): void {
    this.commandHandlers.set(commandId, {
      extensionId,
      handler,
    });
  }

  public registerTool(
    extensionId: string,
    toolId: string,
    handler: AIPanelActionHandler,
  ): void {
    this.toolHandlers.set(toolId, {
      extensionId,
      handler,
    });
  }

  public clearExtension(extensionId: string): void {
    for (const [commandId, registration] of this.commandHandlers.entries()) {
      if (registration.extensionId === extensionId) {
        this.commandHandlers.delete(commandId);
      }
    }

    for (const [toolId, registration] of this.toolHandlers.entries()) {
      if (registration.extensionId === extensionId) {
        this.toolHandlers.delete(toolId);
      }
    }
  }

  public clearAll(): void {
    this.commandHandlers.clear();
    this.toolHandlers.clear();
  }

  public async execute(
    item: AIPanelContributionEntry,
  ): Promise<AIPanelContributionExecutionOutcome> {
    const itemId = item.itemId;

    if (item.kind === 'command' && item.insertText) {
      return {
        type: 'insert-text',
        insertText: item.insertText,
      };
    }

    if ('commandId' in item && typeof item.commandId === 'string') {
      return this.executeHandler(item.commandId, item, this.commandHandlers, 'command');
    }

    if ('toolId' in item && typeof item.toolId === 'string') {
      return this.executeHandler(item.toolId, item, this.toolHandlers, 'tool');
    }

    throw new Error(`AI panel item is not executable: ${itemId}`);
  }

  private async executeHandler(
    actionId: string,
    item: AIPanelContributionEntry,
    registry: Map<string, RegisteredAIPanelAction>,
    actionType: 'command' | 'tool',
  ): Promise<AIPanelContributionExecutionOutcome> {
    const registration = registry.get(actionId);

    if (!registration) {
      throw new Error(`No ${actionType} handler registered for ${actionId}`);
    }

    const result = await registration.handler({
      extensionId: item.extensionId,
      itemId: item.itemId,
      title: item.title,
    });

    return result ?? { type: 'handled' };
  }
}

export const aiPanelActionRegistry = new AIPanelActionRegistry();
