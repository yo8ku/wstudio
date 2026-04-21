import {
  app,
  session,
  shell,
  type DownloadItem,
  type Event,
  type OpenExternalPermissionRequest,
  type Session,
  type WebContents,
} from 'electron';
import type { JsonValue } from '@note-studio/shared';

export const URL_BROWSER_VIEW_TYPE = 'url-browser-view';
export const URL_BROWSER_WEBVIEW_PARTITION = 'persist:wstudio-url-browser';
const URL_BROWSER_ALLOWED_NAVIGATION_PROTOCOLS = new Set<string>([
  'http:',
  'https:',
  'about:',
  'blob:',
  'data:',
]);

export type UrlBrowserDownloadAction =
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'retry'
  | 'open-file'
  | 'show-in-folder'
  | 'remove'
  | 'clear-finished';

export interface UrlBrowserDownloadActionRequest {
  readonly action: UrlBrowserDownloadAction;
  readonly downloadId?: string;
}

export type UrlBrowserDownloadState =
  | 'progressing'
  | 'paused'
  | 'interrupted'
  | 'completed'
  | 'cancelled';

export interface UrlBrowserDownloadSnapshot {
  readonly id: string;
  readonly url: string;
  readonly urlChain: readonly string[];
  readonly filename: string;
  readonly savePath: string | null;
  readonly mimeType: string;
  readonly state: UrlBrowserDownloadState;
  readonly receivedBytes: number;
  readonly totalBytes: number;
  readonly bytesPerSecond: number;
  readonly percentComplete: number;
  readonly canResume: boolean;
  readonly startTime: number;
  readonly endTime: number | null;
}

interface TrackedUrlBrowserDownload {
  readonly id: string;
  item: DownloadItem | null;
  sourceUrl: string;
  urlChain: readonly string[];
  filename: string;
  savePath: string | null;
  mimeType: string;
  state: UrlBrowserDownloadState;
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  percentComplete: number;
  canResume: boolean;
  startTime: number;
  endTime: number | null;
}

type UrlBrowserDownloadListener = (downloads: readonly UrlBrowserDownloadSnapshot[]) => void;

function isJsonRecord(value: JsonValue | null): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUrlBrowserDownloadState(item: DownloadItem): UrlBrowserDownloadState {
  const itemState = item.getState();

  if (itemState === 'progressing' && item.isPaused()) {
    return 'paused';
  }

  return itemState;
}

function normalizeOptionalPath(value: string): string | null {
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function isAllowedUrlBrowserNavigationTarget(targetUrl: string): boolean {
  const normalizedTargetUrl = targetUrl.trim();

  if (normalizedTargetUrl.length === 0) {
    return true;
  }

  try {
    const parsedTargetUrl = new URL(normalizedTargetUrl);
    return URL_BROWSER_ALLOWED_NAVIGATION_PROTOCOLS.has(parsedTargetUrl.protocol);
  } catch {
    return false;
  }
}

function logBlockedUrlBrowserNavigationAttempt(source: string, targetUrl: string): void {
  const normalizedTargetUrl = targetUrl.trim();

  if (normalizedTargetUrl.length === 0) {
    return;
  }

  console.warn(
    `[UrlBrowserDownloadService] Blocked ${source} navigation target: ${normalizedTargetUrl}`,
  );
}

function shouldBlockUrlBrowserNavigationTarget(targetUrl: string): boolean {
  const blocked = !isAllowedUrlBrowserNavigationTarget(targetUrl);

  if (blocked) {
    logBlockedUrlBrowserNavigationAttempt('guest-webcontents', targetUrl);
  }

  return blocked;
}

function isFinishedUrlBrowserDownload(download: {
  readonly state: UrlBrowserDownloadState;
  readonly canResume: boolean;
}): boolean {
  return download.state === 'completed'
    || download.state === 'cancelled'
    || (download.state === 'interrupted' && !download.canResume);
}

export class UrlBrowserDownloadService {
  private readonly downloads = new Map<string, TrackedUrlBrowserDownload>();
  private readonly listeners = new Set<UrlBrowserDownloadListener>();
  private initialized = false;
  private nextDownloadSequence = 1;
  private readonly willDownloadListener = (_event: Electron.Event, item: DownloadItem): void => {
    this.trackDownload(item);
  };
  private readonly webContentsCreatedListener = (
    _event: Event,
    contents: WebContents,
  ): void => {
    if (contents.session !== this.getSession()) {
      return;
    }

    contents.setWindowOpenHandler(({ url }) => {
      return shouldBlockUrlBrowserNavigationTarget(url)
        ? { action: 'deny' }
        : { action: 'allow' };
    });

    contents.on('will-navigate', (navigationEvent, navigationUrl) => {
      if (!shouldBlockUrlBrowserNavigationTarget(navigationUrl)) {
        return;
      }

      navigationEvent.preventDefault();
    });

    contents.on('will-frame-navigate', (navigationEvent) => {
      if (!shouldBlockUrlBrowserNavigationTarget(navigationEvent.url)) {
        return;
      }

      navigationEvent.preventDefault();
    });

    contents.on('will-redirect', (navigationEvent) => {
      if (!shouldBlockUrlBrowserNavigationTarget(navigationEvent.url)) {
        return;
      }

      navigationEvent.preventDefault();
    });
  };

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.getSession().setPermissionCheckHandler((_webContents, permission) => {
      return permission !== 'openExternal';
    });
    this.getSession().setPermissionRequestHandler(
      (_webContents, permission, callback, details) => {
        if (permission !== 'openExternal') {
          callback(true);
          return;
        }

        const externalUrl = (details as OpenExternalPermissionRequest).externalURL ?? '';
        logBlockedUrlBrowserNavigationAttempt('permission-request', externalUrl);
        callback(false);
      },
    );
    this.getSession().on('will-download', this.willDownloadListener);
    app.on('web-contents-created', this.webContentsCreatedListener);
    this.initialized = true;
  }

  public dispose(): void {
    if (!this.initialized) {
      return;
    }

    this.getSession().setPermissionCheckHandler(null);
    this.getSession().setPermissionRequestHandler(null);
    this.getSession().removeListener('will-download', this.willDownloadListener);
    app.removeListener('web-contents-created', this.webContentsCreatedListener);
    this.initialized = false;
  }

  public subscribe(listener: UrlBrowserDownloadListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshots());

    return (): void => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshots(): readonly UrlBrowserDownloadSnapshot[] {
    return [...this.downloads.values()]
      .map((record) => this.toSnapshot(record))
      .sort((left, right) => {
        if (left.startTime !== right.startTime) {
          return right.startTime - left.startTime;
        }

        return right.id.localeCompare(left.id);
      });
  }

  public buildRuntimeState(): JsonValue {
    const downloads = this.getSnapshots().map((download) => {
      return {
        id: download.id,
        url: download.url,
        urlChain: [...download.urlChain],
        filename: download.filename,
        savePath: download.savePath,
        mimeType: download.mimeType,
        state: download.state,
        receivedBytes: download.receivedBytes,
        totalBytes: download.totalBytes,
        bytesPerSecond: download.bytesPerSecond,
        percentComplete: download.percentComplete,
        canResume: download.canResume,
        startTime: download.startTime,
        endTime: download.endTime,
      };
    });

    return {
      downloads,
    };
  }

  public mergeRuntimeState(baseState: JsonValue | null): JsonValue {
    const runtimeState = this.buildRuntimeState();

    if (!isJsonRecord(runtimeState)) {
      return baseState ?? null;
    }

    if (!isJsonRecord(baseState)) {
      return runtimeState;
    }

    return {
      ...baseState,
      ...runtimeState,
    };
  }

  public pauseDownload(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download?.item === null || download === undefined) {
      return false;
    }

    if (download.item.isPaused() || download.item.getState() !== 'progressing') {
      return false;
    }

    download.item.pause();
    this.refreshDownload(download);
    return true;
  }

  public resumeDownload(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download?.item === null || download === undefined) {
      return false;
    }

    if (!download.item.isPaused() && !download.item.canResume()) {
      return false;
    }

    download.item.resume();
    this.refreshDownload(download);
    return true;
  }

  public cancelDownload(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download?.item === null || download === undefined) {
      return false;
    }

    download.item.cancel();
    this.refreshDownload(download);
    return true;
  }

  public retryDownload(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download === undefined || download.sourceUrl.trim().length === 0) {
      return false;
    }

    this.getSession().downloadURL(download.sourceUrl);
    return true;
  }

  public async openDownloadedFile(downloadId: string): Promise<boolean> {
    const download = this.downloads.get(downloadId);

    if (download === undefined || download.savePath === null) {
      return false;
    }

    const errorMessage = await shell.openPath(download.savePath);
    return errorMessage.trim().length === 0;
  }

  public showDownloadInFolder(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download === undefined || download.savePath === null) {
      return false;
    }

    shell.showItemInFolder(download.savePath);
    return true;
  }

  public removeDownload(downloadId: string): boolean {
    const download = this.downloads.get(downloadId);

    if (download === undefined || !isFinishedUrlBrowserDownload(download)) {
      return false;
    }

    this.downloads.delete(downloadId);
    this.emit();
    return true;
  }

  public clearFinishedDownloads(): boolean {
    let changed = false;

    for (const [downloadId, download] of this.downloads.entries()) {
      if (!isFinishedUrlBrowserDownload(download)) {
        continue;
      }

      this.downloads.delete(downloadId);
      changed = true;
    }

    if (changed) {
      this.emit();
    }

    return changed;
  }

  private getSession(): Session {
    return session.fromPartition(URL_BROWSER_WEBVIEW_PARTITION);
  }

  private createDownloadId(): string {
    const nextSequence = this.nextDownloadSequence;
    this.nextDownloadSequence += 1;
    return `url-browser-download-${nextSequence}`;
  }

  private trackDownload(item: DownloadItem): void {
    const download: TrackedUrlBrowserDownload = {
      id: this.createDownloadId(),
      item,
      sourceUrl: item.getURL(),
      urlChain: item.getURLChain(),
      filename: item.getFilename(),
      savePath: normalizeOptionalPath(item.getSavePath()),
      mimeType: item.getMimeType(),
      state: normalizeUrlBrowserDownloadState(item),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      bytesPerSecond: item.getCurrentBytesPerSecond(),
      percentComplete: item.getPercentComplete(),
      canResume: item.canResume(),
      startTime: item.getStartTime(),
      endTime: item.getEndTime() > 0 ? item.getEndTime() : null,
    };

    const refresh = (): void => {
      this.refreshDownload(download);
    };

    const finalize = (): void => {
      refresh();
      if (isFinishedUrlBrowserDownload(download)) {
        download.item = null;
      }
      this.emit();
    };

    item.on('updated', refresh);
    item.once('done', finalize);
    this.downloads.set(download.id, download);
    this.emit();
  }

  private refreshDownload(download: TrackedUrlBrowserDownload): void {
    const item = download.item;

    if (item !== null) {
      download.sourceUrl = item.getURL();
      download.urlChain = item.getURLChain();
      download.filename = item.getFilename();
      download.savePath = normalizeOptionalPath(item.getSavePath());
      download.mimeType = item.getMimeType();
      download.state = normalizeUrlBrowserDownloadState(item);
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.bytesPerSecond = item.getCurrentBytesPerSecond();
      download.percentComplete = item.getPercentComplete();
      download.canResume = item.canResume();
      download.endTime = item.getEndTime() > 0 ? item.getEndTime() : null;
    }

    this.downloads.set(download.id, download);
    this.emit();
  }

  private toSnapshot(download: TrackedUrlBrowserDownload): UrlBrowserDownloadSnapshot {
    return {
      id: download.id,
      url: download.sourceUrl,
      urlChain: download.urlChain,
      filename: download.filename,
      savePath: download.savePath,
      mimeType: download.mimeType,
      state: download.state,
      receivedBytes: download.receivedBytes,
      totalBytes: download.totalBytes,
      bytesPerSecond: download.bytesPerSecond,
      percentComplete: download.percentComplete,
      canResume: download.canResume,
      startTime: download.startTime,
      endTime: download.endTime,
    };
  }

  private emit(): void {
    const snapshots = this.getSnapshots();

    for (const listener of this.listeners) {
      listener(snapshots);
    }
  }
}

export const urlBrowserDownloadService = new UrlBrowserDownloadService();
