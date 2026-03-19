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
import { pluginHostManager } from '../plugins/PluginHostManager';
import { broadcastWorkbenchContributionSnapshot } from '../plugins/WorkbenchContributionBroadcaster';
import { workbenchContributionRegistry } from '../plugins/WorkbenchContributionRegistry';

let handlersRegistered = false;
let registrySubscriptionRegistered = false;

const WORKBENCH_CONTRIBUTION_CHANNELS = [
  'extensions:workbench:get-contributions',
  'extensions:workbench:execute-command',
  'extensions:workbench:webview:post-message',
  'extensions:workbench:webview:dispose-panel',
] as const;

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

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

  if (!registrySubscriptionRegistered) {
    workbenchContributionRegistry.subscribe((snapshot) => {
      broadcastWorkbenchContributionSnapshot(snapshot);
    });
    registrySubscriptionRegistered = true;
  }

  ipcMain.handle(
    'extensions:workbench:get-contributions',
    async (): Promise<WorkbenchContributionListResponse> => {
      try {
        return {
          success: true,
          data: workbenchContributionRegistry.getSnapshot(),
        };
      } catch (error) {
        console.error('[WorkbenchContribution IPC] failed to get contributions:', error);
        return {
          success: false,
          error: {
            code: 'WORKBENCH_CONTRIBUTION_LIST_FAILED',
            message: toErrorMessage(error instanceof Error ? error : String(error)),
          },
        };
      }
    },
  );

  ipcMain.handle(
    'extensions:workbench:execute-command',
    async (
      _event,
      request: ExecuteWorkbenchCommandRequest,
    ): Promise<WorkbenchCommandExecutionResponse> => {
      try {
        return {
          success: true,
          data: await pluginHostManager.executeContributedCommand(
            request.commandId,
            request.args ?? [],
          ),
        };
      } catch (error) {
        console.error('[WorkbenchContribution IPC] failed to execute command:', error);
        return {
          success: false,
          error: {
            code: 'WORKBENCH_COMMAND_EXECUTION_FAILED',
            message: toErrorMessage(error instanceof Error ? error : String(error)),
          },
        };
      }
    },
  );

  ipcMain.handle(
    'extensions:workbench:webview:post-message',
    async (
      _event,
      request: DeliverWorkbenchWebviewMessageRequest,
    ): Promise<WorkbenchWebviewMutationResponse> => {
      try {
        const panel = workbenchContributionRegistry.getRuntimeWebviewPanel(request.panelInstanceKey);
        if (!panel) {
          return {
            success: false,
            error: {
              code: 'WORKBENCH_WEBVIEW_PANEL_NOT_FOUND',
              message: `Runtime webview panel not found: ${request.panelInstanceKey}`,
            },
          };
        }

        await pluginHostManager.deliverRuntimeWebviewMessage(
          panel.extensionId,
          request.panelInstanceKey,
          request.message,
        );

        return {
          success: true,
        };
      } catch (error) {
        console.error('[WorkbenchContribution IPC] failed to deliver webview message:', error);
        return {
          success: false,
          error: {
            code: 'WORKBENCH_WEBVIEW_MESSAGE_FAILED',
            message: toErrorMessage(error instanceof Error ? error : String(error)),
          },
        };
      }
    },
  );

  ipcMain.handle(
    'extensions:workbench:webview:dispose-panel',
    async (
      _event,
      request: DisposeWorkbenchWebviewPanelRequest,
    ): Promise<WorkbenchWebviewMutationResponse> => {
      try {
        const panel = workbenchContributionRegistry.disposeRuntimeWebviewPanel(
          request.panelInstanceKey,
        );

        if (!panel) {
          return {
            success: false,
            error: {
              code: 'WORKBENCH_WEBVIEW_PANEL_NOT_FOUND',
              message: `Runtime webview panel not found: ${request.panelInstanceKey}`,
            },
          };
        }

        await pluginHostManager.notifyRuntimeWebviewDisposed(
          panel.extensionId,
          panel.panelInstanceKey,
        );

        return {
          success: true,
        };
      } catch (error) {
        console.error('[WorkbenchContribution IPC] failed to dispose runtime webview panel:', error);
        return {
          success: false,
          error: {
            code: 'WORKBENCH_WEBVIEW_DISPOSE_FAILED',
            message: toErrorMessage(error instanceof Error ? error : String(error)),
          },
        };
      }
    },
  );
}
