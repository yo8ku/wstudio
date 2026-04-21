import { ipcMain } from 'electron';
import type { JsonValue } from '@note-studio/shared';
import {
  type UrlBrowserDownloadActionRequest,
  urlBrowserDownloadService,
} from '../services/UrlBrowserDownloadService';

export const URL_BROWSER_DOWNLOAD_ACTION_CHANNEL = 'url-browser:download-action';

function isUrlBrowserDownloadAction(
  value: JsonValue | UrlBrowserDownloadActionRequest | null,
): value is UrlBrowserDownloadActionRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  if (typeof value.action !== 'string') {
    return false;
  }

  if (
    value.downloadId !== undefined
    && typeof value.downloadId !== 'string'
  ) {
    return false;
  }

  return (
    value.action === 'pause'
    || value.action === 'resume'
    || value.action === 'cancel'
    || value.action === 'retry'
    || value.action === 'open-file'
    || value.action === 'show-in-folder'
    || value.action === 'remove'
    || value.action === 'clear-finished'
  );
}

export function registerUrlBrowserDownloadHandlers(): void {
  try {
    ipcMain.removeHandler(URL_BROWSER_DOWNLOAD_ACTION_CHANNEL);
  } catch {
    // Ignore missing handler removals during reload.
  }

  ipcMain.handle(
    URL_BROWSER_DOWNLOAD_ACTION_CHANNEL,
    async (
      _event,
      payload: JsonValue | UrlBrowserDownloadActionRequest | null,
    ): Promise<boolean> => {
      if (!isUrlBrowserDownloadAction(payload)) {
        return false;
      }

      if (payload.action === 'clear-finished') {
        return urlBrowserDownloadService.clearFinishedDownloads();
      }

      if (typeof payload.downloadId !== 'string' || payload.downloadId.trim().length === 0) {
        return false;
      }

      if (payload.action === 'pause') {
        return urlBrowserDownloadService.pauseDownload(payload.downloadId);
      }

      if (payload.action === 'resume') {
        return urlBrowserDownloadService.resumeDownload(payload.downloadId);
      }

      if (payload.action === 'cancel') {
        return urlBrowserDownloadService.cancelDownload(payload.downloadId);
      }

      if (payload.action === 'retry') {
        return urlBrowserDownloadService.retryDownload(payload.downloadId);
      }

      if (payload.action === 'open-file') {
        return await urlBrowserDownloadService.openDownloadedFile(payload.downloadId);
      }

      if (payload.action === 'show-in-folder') {
        return urlBrowserDownloadService.showDownloadInFolder(payload.downloadId);
      }

      return urlBrowserDownloadService.removeDownload(payload.downloadId);
    },
  );
}
