/**
 * Broadcasts workbench contribution and runtime webview events to renderer windows.
 */

import { BrowserWindow } from 'electron';
import type {
  WorkbenchContributionSnapshot,
  WorkbenchWebviewMessageEnvelope,
} from '@note-studio/shared';

export const WORKBENCH_CONTRIBUTION_CHANGED_CHANNEL = 'extensions:workbench:contributions-changed';
export const WORKBENCH_WEBVIEW_MESSAGE_CHANNEL = 'extensions:workbench:webview:message';

function broadcastToAllWindows(channel: string, payload: WorkbenchContributionSnapshot | WorkbenchWebviewMessageEnvelope): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }

    window.webContents.send(channel, payload);
  }
}

export function broadcastWorkbenchContributionSnapshot(
  snapshot: WorkbenchContributionSnapshot,
): void {
  broadcastToAllWindows(WORKBENCH_CONTRIBUTION_CHANGED_CHANNEL, snapshot);
}

export function broadcastWorkbenchWebviewMessage(
  payload: WorkbenchWebviewMessageEnvelope,
): void {
  broadcastToAllWindows(WORKBENCH_WEBVIEW_MESSAGE_CHANNEL, payload);
}
