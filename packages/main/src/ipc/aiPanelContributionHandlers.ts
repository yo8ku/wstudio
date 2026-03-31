/**
 * AI panel 插件 contribution 与执行 IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  AIPanelContributionExecutionResponse,
  AIPanelContributionListResponse,
  ExecuteAIPanelContributionRequest,
} from '@note-studio/shared';
import { EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT } from '@note-studio/shared';

let handlersRegistered = false;

const AI_PANEL_CONTRIBUTION_CHANNELS = [
  'extensions:ai-panel:get-contributions',
  'extensions:ai-panel:execute-item',
] as const;

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
      return {
        success: true,
        data: EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
      };
    },
  );

  ipcMain.handle(
    'extensions:ai-panel:execute-item',
    async (
      _event,
      _request: ExecuteAIPanelContributionRequest,
    ): Promise<AIPanelContributionExecutionResponse> => {
      return {
        success: true,
        data: {
          type: 'handled',
          message: 'Legacy plugin platform is temporarily disabled.',
        },
      };
    },
  );
}
