import { ipcMain } from 'electron';
import type { BlockDocumentNativeFile } from '@note-studio/shared';
import {
  blockDocumentNativeFileService,
  type UpsertBlockDocumentNativeFileByPathPayload,
} from '../services/BlockDocumentNativeFileService';

let isRegistered = false;

interface BlockDocumentNativeFileUpsertRequest {
  readonly path: string;
  readonly title?: string;
  readonly content?: string;
  readonly file: BlockDocumentNativeFile;
}

export function registerBlockDocumentNativeFileHandlers(): void {
  if (isRegistered) {
    return;
  }

  const handlersToRemove = [
    'note:block-document-native-file:getByPath',
    'note:block-document-native-file:upsertByPath',
    'note:block-document-native-file:deleteByPath',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // Ignore missing handlers during reload.
    }
  }

  ipcMain.handle(
    'note:block-document-native-file:getByPath',
    async (_event, filePath: string): Promise<BlockDocumentNativeFile | null> => {
      return blockDocumentNativeFileService.getByPath(filePath);
    },
  );

  ipcMain.handle(
    'note:block-document-native-file:upsertByPath',
    async (
      _event,
      request: BlockDocumentNativeFileUpsertRequest,
    ): Promise<BlockDocumentNativeFile> => {
      const payload: UpsertBlockDocumentNativeFileByPathPayload = {
        path: request.path,
        title: request.title,
        content: request.content,
        file: request.file,
      };

      return blockDocumentNativeFileService.upsertByPath(payload);
    },
  );

  ipcMain.handle(
    'note:block-document-native-file:deleteByPath',
    async (_event, filePath: string): Promise<boolean> => {
      return blockDocumentNativeFileService.deleteByPath(filePath);
    },
  );

  isRegistered = true;
}
