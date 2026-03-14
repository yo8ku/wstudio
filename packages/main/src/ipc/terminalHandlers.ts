/**
 * Terminal IPC handlers.
 * Validate renderer terminal requests and forward them to the main-process terminal service.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { TerminalService } from '../services/terminal';
import type { TerminalOptions } from '../services/terminal';

let terminalService: TerminalService | null = null;
let handlersRegistered = false;

interface TerminalOperationResult {
  success: boolean;
  error?: string;
}

interface TerminalCreateResult extends TerminalOperationResult {
  terminalId?: string;
  ptyInfo?: {
    backend: 'conpty' | 'winpty';
    buildNumber?: number;
  };
}

function ensureTerminalService(): TerminalService {
  if (!terminalService) {
    throw new Error('TerminalService is not initialized');
  }

  return terminalService;
}

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ensureNonEmptyString(value, fieldName);
}

function normalizeDimension(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  const nextValue = Math.trunc(value as number);
  if (nextValue <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  return nextValue;
}

function ensureRequiredDimension(value: unknown, fieldName: string): number {
  const normalizedValue = normalizeDimension(value, fieldName);
  if (normalizedValue === undefined) {
    throw new Error(`${fieldName} is required`);
  }

  return normalizedValue;
}

function normalizeEnv(env: unknown): Record<string, string> | undefined {
  if (env === undefined) {
    return undefined;
  }

  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('env must be a plain object');
  }

  const normalizedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(`env.${key} must be a string`);
    }
    normalizedEnv[key] = value;
  }

  return normalizedEnv;
}

function normalizeTerminalOptions(options: TerminalOptions = {}): TerminalOptions {
  return {
    shell: normalizeOptionalString(options.shell, 'shell'),
    cwd: normalizeOptionalString(options.cwd, 'cwd'),
    env: normalizeEnv(options.env),
    cols: normalizeDimension(options.cols, 'cols'),
    rows: normalizeDimension(options.rows, 'rows'),
    ownerWebContentsId: typeof options.ownerWebContentsId === 'number'
      ? Math.trunc(options.ownerWebContentsId)
      : undefined,
  };
}

/** Set the terminal service instance used by the IPC handlers. */
export function setTerminalService(service: TerminalService): void {
  terminalService = service;
  console.log('[Terminal IPC] terminal service configured');
}

/** Register terminal IPC handlers once for the app lifecycle. */
export function registerTerminalHandlers(service?: TerminalService): void {
  if (handlersRegistered) {
    if (service) {
      terminalService = service;
    }
    return;
  }

  if (service) {
    terminalService = service;
  }

  ipcMain.handle('terminal:create', async (
    event: IpcMainInvokeEvent,
    options: TerminalOptions = {}
  ): Promise<TerminalCreateResult> => {
    try {
      const service = ensureTerminalService();
      const normalizedOptions = normalizeTerminalOptions(options);
      const terminal = service.createTerminal({
        ...normalizedOptions,
        ownerWebContentsId: event.sender.id,
      });

      console.log(`[Terminal IPC] terminal created: ${terminal.id}`);
      return {
        success: true,
        terminalId: terminal.id,
        ptyInfo: terminal.ptyInfo,
      };
    } catch (error) {
      console.error('[Terminal IPC] failed to create terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.on('terminal:write', (_event, terminalId: unknown, data: unknown) => {
    try {
      const service = ensureTerminalService();
      service.writeToTerminal(
        ensureNonEmptyString(terminalId, 'terminalId'),
        typeof data === 'string' ? data : ''
      );
    } catch (error) {
      console.error('[Terminal IPC] failed to write terminal data:', error);
    }
  });

  ipcMain.handle('terminal:write', async (
    _event: IpcMainInvokeEvent,
    terminalId: unknown,
    data: unknown
  ): Promise<TerminalOperationResult> => {
    try {
      const service = ensureTerminalService();
      service.writeToTerminal(
        ensureNonEmptyString(terminalId, 'terminalId'),
        typeof data === 'string' ? data : ''
      );
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] failed to write terminal data:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('terminal:resize', async (
    _event: IpcMainInvokeEvent,
    terminalId: unknown,
    cols: unknown,
    rows: unknown
  ): Promise<TerminalOperationResult> => {
    try {
      const service = ensureTerminalService();
      service.resizeTerminal(
        ensureNonEmptyString(terminalId, 'terminalId'),
        ensureRequiredDimension(cols, 'cols'),
        ensureRequiredDimension(rows, 'rows')
      );
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] failed to resize terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('terminal:clear', async (
    _event: IpcMainInvokeEvent,
    terminalId: unknown
  ): Promise<TerminalOperationResult> => {
    try {
      const service = ensureTerminalService();
      service.clearTerminal(ensureNonEmptyString(terminalId, 'terminalId'));
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] failed to clear terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('terminal:destroy', async (
    _event: IpcMainInvokeEvent,
    terminalId: unknown
  ): Promise<TerminalOperationResult> => {
    try {
      const service = ensureTerminalService();
      service.destroyTerminal(ensureNonEmptyString(terminalId, 'terminalId'));
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] failed to destroy terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('terminal:list', async (_event: IpcMainInvokeEvent) => {
    try {
      const service = ensureTerminalService();
      return {
        success: true,
        terminalIds: service.getAllTerminalIds(),
      };
    } catch (error) {
      console.error('[Terminal IPC] failed to list terminals:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  handlersRegistered = true;
  console.log('[Terminal IPC] handlers registered');
}

/** Destroy all tracked terminals during app shutdown. */
export function cleanupTerminals(): void {
  if (terminalService) {
    terminalService.destroyAll();
  }
}
