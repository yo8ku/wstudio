/**
 * Workbench contribution IPC 处理器。
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  DeliverWorkbenchWebviewMessageRequest,
  DisposeWorkbenchWebviewPanelRequest,
  ExecuteWorkbenchCommandRequest,
  WorkbenchCommandExecutionResponse,
  WorkbenchContributionListResponse,
  WorkbenchWebviewMutationResponse,
} from '@note-studio/shared';
import {
  pluginHostManager,
  workbenchContributionRegistry,
} from '../services/LegacyPluginPlatformStub';

let handlersRegistered = false;
let workbenchContributionSubscriptionRegistered = false;

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

  if (!workbenchContributionSubscriptionRegistered) {
    workbenchContributionRegistry.subscribe((snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('extensions:workbench:contributions-changed', snapshot);
      }
    });
    workbenchContributionSubscriptionRegistered = true;
  }

  ipcMain.handle(
    'extensions:workbench:get-contributions',
    async (): Promise<WorkbenchContributionListResponse> => {
      return {
        success: true,
        data: workbenchContributionRegistry.getSnapshot(),
      };
    },
  );

  ipcMain.handle(
    'extensions:workbench:execute-command',
    async (
      _event,
      request: ExecuteWorkbenchCommandRequest,
    ): Promise<WorkbenchCommandExecutionResponse> => {
      return {
        success: true,
        data: await pluginHostManager.executeContributedCommand(
          request.commandId,
          request.args,
        ),
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
