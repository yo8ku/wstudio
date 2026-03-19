/**
 * AI panel 插件 contribution 与执行 IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  AIPanelContributionExecutionResponse,
  AIPanelContributionListResponse,
  ExecuteAIPanelContributionRequest,
} from '@note-studio/shared';
import { aiPanelActionRegistry } from '../plugins/AIPanelActionRegistry';
import { aiPanelContributionRegistry } from '../plugins/AIPanelContributionRegistry';
import { pluginHostManager } from '../plugins/PluginHostManager';

let handlersRegistered = false;

const AI_PANEL_CONTRIBUTION_CHANNELS = [
  'extensions:ai-panel:get-contributions',
  'extensions:ai-panel:execute-item',
] as const;

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerAIPanelContributionHandlers(): void {
  if (handlersRegistered) {
    return;
  }

  for (const channel of AI_PANEL_CONTRIBUTION_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers during startup.
    }
  }

  handlersRegistered = true;

  ipcMain.handle(
    'extensions:ai-panel:get-contributions',
    async (): Promise<AIPanelContributionListResponse> => {
      try {
        return {
          success: true,
          data: aiPanelContributionRegistry.getSnapshot(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[AIPanelContribution IPC] failed to get contributions:', error);
        return {
          success: false,
          error: {
            code: 'AI_PANEL_CONTRIBUTION_LIST_FAILED',
            message,
          },
        };
      }
    },
  );

  ipcMain.handle(
    'extensions:ai-panel:execute-item',
    async (
      _event,
      request: ExecuteAIPanelContributionRequest,
    ): Promise<AIPanelContributionExecutionResponse> => {
      try {
        const item = aiPanelContributionRegistry.findItem(request);

        if (!item) {
          return {
            success: false,
            error: {
              code: 'AI_PANEL_CONTRIBUTION_NOT_FOUND',
              message: `AI panel item not found: ${request.itemId}`,
            },
          };
        }

        await pluginHostManager.activateForAIPanelItem(item);

        return {
          success: true,
          data: await aiPanelActionRegistry.execute(item),
        };
      } catch (error) {
        const message = toErrorMessage(error instanceof Error ? error : String(error));
        console.error('[AIPanelContribution IPC] failed to execute item:', error);
        return {
          success: false,
          error: {
            code: 'AI_PANEL_CONTRIBUTION_EXECUTION_FAILED',
            message,
          },
        };
      }
    },
  );
}
