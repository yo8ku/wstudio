/**
 * Shell IPC handlers.
 * Handles opening external links and local file targets from the renderer.
 */

import { ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';

export const SHELL_OPEN_EXTERNAL_CHANNEL = 'shell:open-external';

interface ShellOperationResult {
  success: boolean;
  error?: string;
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set<string>([
  'http:',
  'https:',
  'mailto:',
  'file:',
]);

const normalizeExternalTarget = (rawTarget: string): URL => {
  const target = rawTarget.trim();

  if (target.length === 0) {
    throw new Error('External target must not be empty.');
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    throw new Error(`Invalid external target: ${target}`);
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsedTarget.protocol)) {
    throw new Error(`Unsupported external protocol: ${parsedTarget.protocol}`);
  }

  return parsedTarget;
};

const openTarget = async (target: URL): Promise<void> => {
  if (target.protocol === 'file:') {
    const openError = await shell.openPath(fileURLToPath(target));

    if (openError.length > 0) {
      throw new Error(openError);
    }

    return;
  }

  await shell.openExternal(target.toString());
};

export function registerShellHandlers(): void {
  try {
    ipcMain.removeHandler(SHELL_OPEN_EXTERNAL_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  ipcMain.handle(
    SHELL_OPEN_EXTERNAL_CHANNEL,
    async (_event, rawTarget: string): Promise<ShellOperationResult> => {
      try {
        const target = normalizeExternalTarget(rawTarget);
        await openTarget(target);

        return {
          success: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open external target.';
        console.error('[ShellHandlers] failed to open external target:', rawTarget, message);

        return {
          success: false,
          error: message,
        };
      }
    },
  );
}
