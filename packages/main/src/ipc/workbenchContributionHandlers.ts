/**
 * Workbench contribution IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  DeliverWorkbenchWebviewMessageRequest,
  DisposeWorkbenchWebviewPanelRequest,
  ExecuteWorkbenchCommandRequest,
  WorkbenchCommandExecutionResponse,
  WorkbenchContributionListResponse,
  WorkbenchWebviewMutationResponse,
} from '@note-studio/shared';
import { EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT } from '@note-studio/shared';

let handlersRegistered = false;

const WORKBENCH_CONTRIBUTION_CHANNELS = [
  'extensions:workbench:get-contributions',
  'extensions:workbench:execute-command',
  'extensions:workbench:webview:post-message',
  'extensions:workbench:webview:dispose-panel',
] as const;

export function registerWorkbenchContributionHandlers(): void {
  if (handlersRegistered) {
    return;
  }

  for (const channel of WORKBENCH_CONTRIBUTION_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers during startup.
    }
  }

  handlersRegistered = true;

  ipcMain.handle(
    'extensions:workbench:get-contributions',
    async (): Promise<WorkbenchContributionListResponse> => {
      return {
        success: true,
        data: EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
      };
    },
  );

  ipcMain.handle(
    'extensions:workbench:execute-command',
    async (
      _event,
      _request: ExecuteWorkbenchCommandRequest,
    ): Promise<WorkbenchCommandExecutionResponse> => {
      return {
        success: true,
        data: null,
      };
    },
  );

  ipcMain.handle(
    'extensions:workbench:webview:post-message',
    async (
      _event,
      _request: DeliverWorkbenchWebviewMessageRequest,
    ): Promise<WorkbenchWebviewMutationResponse> => {
      return {
        success: true,
      };
    },
  );

  ipcMain.handle(
    'extensions:workbench:webview:dispose-panel',
    async (
      _event,
      _request: DisposeWorkbenchWebviewPanelRequest,
    ): Promise<WorkbenchWebviewMutationResponse> => {
      return {
        success: true,
      };
    },
  );
}
