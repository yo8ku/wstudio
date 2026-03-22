import { ipcMain } from 'electron';
import type { PersistedBlockDocumentState } from '@note-studio/shared';
import {
  blockDocumentStateService,
  type UpsertBlockDocumentStateByPathPayload,
} from '../services/BlockDocumentStateService';

let isRegistered = false;

interface BlockDocumentStateUpsertRequest {
  readonly path: string;
  readonly title?: string;
  readonly content?: string;
  readonly state: PersistedBlockDocumentState;
}

export function registerBlockDocumentStateHandlers(): void {
  if (isRegistered) {
    return;
  }

  const handlersToRemove = [
    'note:block-document-state:getByPath',
    'note:block-document-state:upsertByPath',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // Ignore missing handlers during reload.
    }
  }

  ipcMain.handle(
    'note:block-document-state:getByPath',
    async (_event, filePath: string): Promise<PersistedBlockDocumentState | null> => {
      return blockDocumentStateService.getByPath(filePath);
    },
  );

  ipcMain.handle(
    'note:block-document-state:upsertByPath',
    async (
      _event,
      request: BlockDocumentStateUpsertRequest,
    ): Promise<PersistedBlockDocumentState> => {
      const payload: UpsertBlockDocumentStateByPathPayload = {
        path: request.path,
        title: request.title,
        content: request.content,
        state: request.state,
      };

      return blockDocumentStateService.upsertByPath(payload);
    },
  );

  isRegistered = true;
}
