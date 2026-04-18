import path from 'node:path';
import { existsSync } from 'node:fs';
import { WebContentsView } from 'electron';
import type { Event, Input, Rectangle } from 'electron';
import type {
  JsonValue,
  PluginSurfaceInvalidationReason,
  PluginSurfaceRuntimeStatusSnapshot,
  PluginSurfaceStateSnapshot,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import { buildPluginSurfaceBootstrapDocument } from './pluginSurfaceBootstrapDocument';
import { buildPluginSurfaceContextArgument } from './pluginSurfaceContext';
import {
  PLUGIN_SURFACE_CONTEXT_UPDATED_CHANNEL,
  type PluginSurfaceRuntimeContextSnapshot,
  type PluginSurfaceThemeSnapshot,
} from './pluginSurfaceRuntime';

export interface PluginSurfaceViewAttachRequest {
  readonly surfaceInstanceId: string;
  readonly surface: PluginUiRuntimeSurfaceDescriptor;
  readonly bounds: Rectangle;
  readonly visible?: boolean;
  readonly leafId: string | null;
  readonly overlayId?: string | null;
  readonly focusOnAttach?: boolean;
  readonly theme: PluginSurfaceThemeSnapshot;
}

interface ManagedPluginSurfaceView {
  readonly surfaceInstanceId: string;
  readonly surface: PluginUiRuntimeSurfaceDescriptor;
  readonly context: PluginSurfaceRuntimeContextSnapshot;
  readonly view: WebContentsView;
  readonly detachFailureHandlers: () => void;
  readonly desiredVisible: boolean;
}

interface PluginSurfaceHostWindow {
  readonly contentView: {
    addChildView(view: WebContentsView): void;
    removeChildView(view: WebContentsView): void;
  };
  readonly webContents: {
    send(
      channel: string,
      payload: {
        readonly accelerator: 'F1';
        readonly origin: 'plugin-surface';
      },
    ): void;
  };
  isDestroyed(): boolean;
}

const PLUGIN_SURFACE_BOOTSTRAP_LOAD_TIMEOUT_MS = 10000;
const PLUGIN_SURFACE_BOOTSTRAP_TIMEOUT_ERROR_NAME = 'PluginSurfaceBootstrapTimeoutError';
const COMMAND_CENTER_SHOW_CHANNEL = 'command-center:show';

function normalizeCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function normalizeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeBounds(bounds: Rectangle): Rectangle {
  return {
    x: normalizeCoordinate(bounds.x),
    y: normalizeCoordinate(bounds.y),
    width: normalizeDimension(bounds.width),
    height: normalizeDimension(bounds.height),
  };
}

function resolveSurfacePartition(surfaceInstanceId: string): string {
  const normalizedSurfaceInstanceId = surfaceInstanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return `plugin-surface-${normalizedSurfaceInstanceId.length > 0 ? normalizedSurfaceInstanceId : 'surface'}`;
}

function resolvePluginSurfacePreloadPath(): string {
  const compiledPreloadPath = path.join(__dirname, 'pluginSurface.preload.js');

  if (existsSync(compiledPreloadPath)) {
    return compiledPreloadPath;
  }

  return path.join(__dirname, 'pluginSurface.preload.ts');
}

function buildPluginSurfaceBootstrapUrl(): string {
  const document = buildPluginSurfaceBootstrapDocument();
  return `data:text/html;charset=UTF-8,${encodeURIComponent(document)}`;
}

export class PluginSurfaceViewService {
  private mainWindow: PluginSurfaceHostWindow | null = null;

  private readonly attachedSurfaces = new Map<string, ManagedPluginSurfaceView>();

  private readonly stateListeners = new Set<(snapshot: PluginSurfaceStateSnapshot) => void>();

  private readonly runtimeStatusListeners = new Set<(snapshot: PluginSurfaceRuntimeStatusSnapshot) => void>();

  private readonly preloadPath = resolvePluginSurfacePreloadPath();

  private commandCenterVisible = false;

  public subscribeToSurfaceState(
    listener: (snapshot: PluginSurfaceStateSnapshot) => void,
  ): () => void {
    this.stateListeners.add(listener);

    return (): void => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeToRuntimeStatus(
    listener: (snapshot: PluginSurfaceRuntimeStatusSnapshot) => void,
  ): () => void {
    this.runtimeStatusListeners.add(listener);

    return (): void => {
      this.runtimeStatusListeners.delete(listener);
    };
  }

  public setMainWindow(mainWindow: PluginSurfaceHostWindow | null): void {
    const nextMainWindow = mainWindow !== null && !mainWindow.isDestroyed()
      ? mainWindow
      : null;

    if (this.mainWindow === nextMainWindow) {
      return;
    }

    this.destroyAllSurfaces();
    this.mainWindow = nextMainWindow;
  }

  public async attachSurface(request: PluginSurfaceViewAttachRequest): Promise<void> {
    const surfaceInstanceId = request.surfaceInstanceId.trim();

    if (surfaceInstanceId.length === 0) {
      throw new Error('Plugin surface attach requires a non-empty surfaceInstanceId.');
    }

    this.destroySurface(surfaceInstanceId);
    const targetWindow = this.requireMainWindow();
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: true,
        preload: this.preloadPath,
        partition: resolveSurfacePartition(surfaceInstanceId),
        additionalArguments: [
          buildPluginSurfaceContextArgument(surfaceInstanceId, {
            pluginId: request.surface.pluginId,
            surfaceKind: request.surface.surfaceKind,
            surfaceId: request.surface.surfaceId,
            entryUrl: request.surface.entryUrl,
            leafId: request.leafId,
            overlayId: request.overlayId ?? null,
          }),
        ],
      },
    });
    const detachFailureHandlers = this.attachSurfaceFailureHandlers(surfaceInstanceId, view);
    const context: PluginSurfaceRuntimeContextSnapshot = {
      surfaceInstanceId,
      state: request.surface.state,
      theme: request.theme,
    };
    const managedSurface: ManagedPluginSurfaceView = {
      surfaceInstanceId,
      surface: request.surface,
      context,
      view,
      detachFailureHandlers,
      desiredVisible: request.visible ?? false,
    };

    targetWindow.contentView.addChildView(view);
    view.setBounds(normalizeBounds(request.bounds));
    this.attachedSurfaces.set(surfaceInstanceId, managedSurface);
    this.applyManagedSurfaceVisibility(managedSurface);

    try {
      await this.loadSurfaceBootstrap(surfaceInstanceId, view);

      if (request.focusOnAttach === true) {
        view.webContents.focus();
      }

      this.publishSurfaceContext(surfaceInstanceId);
    } catch (error) {
      const invalidState = error instanceof Error && error.name === PLUGIN_SURFACE_BOOTSTRAP_TIMEOUT_ERROR_NAME
        ? this.buildInvalidSurfaceState(surfaceInstanceId, 'timeout', error.message)
        : null;
      this.detachManagedSurface(surfaceInstanceId, view, invalidState);
      throw error;
    }
  }

  public updateSurfaceBounds(surfaceInstanceId: string, bounds: Rectangle): boolean {
    const record = this.attachedSurfaces.get(surfaceInstanceId.trim()) ?? null;

    if (record === null) {
      return false;
    }

    record.view.setBounds(normalizeBounds(bounds));
    return true;
  }

  public bringSurfaceToFront(surfaceInstanceId: string): boolean {
    const record = this.attachedSurfaces.get(surfaceInstanceId.trim()) ?? null;
    const targetWindow = this.mainWindow;

    if (
      record === null
      || targetWindow === null
      || targetWindow.isDestroyed()
    ) {
      return false;
    }

    targetWindow.contentView.addChildView(record.view);
    return true;
  }

  public async setCommandCenterVisible(visible: boolean): Promise<void> {
    if (this.commandCenterVisible === visible) {
      return;
    }

    this.commandCenterVisible = visible;

    for (const record of this.attachedSurfaces.values()) {
      this.applyManagedSurfaceVisibility(record);
    }
  }

  public async captureCommandCenterPreviews(): Promise<Readonly<Record<string, string>>> {
    return this.captureVisibleSurfacePreviews();
  }

  public updateSurfaceRuntimeContext(
    surfaceInstanceId: string,
    state: JsonValue | null,
    theme: PluginSurfaceThemeSnapshot,
  ): boolean {
    const normalizedSurfaceInstanceId = surfaceInstanceId.trim();
    const record = this.attachedSurfaces.get(normalizedSurfaceInstanceId) ?? null;

    if (record === null) {
      return false;
    }

    const nextRecord: ManagedPluginSurfaceView = {
      ...record,
      context: {
        surfaceInstanceId: normalizedSurfaceInstanceId,
        state,
        theme,
      },
    };
    this.attachedSurfaces.set(normalizedSurfaceInstanceId, nextRecord);
    this.publishSurfaceContext(normalizedSurfaceInstanceId);
    return true;
  }

  public destroySurface(surfaceInstanceId: string): boolean {
    const normalizedSurfaceInstanceId = surfaceInstanceId.trim();
    const record = this.attachedSurfaces.get(normalizedSurfaceInstanceId) ?? null;

    if (record === null) {
      return false;
    }

    return this.detachManagedSurface(normalizedSurfaceInstanceId, record.view);
  }

  public hasSurface(surfaceInstanceId: string): boolean {
    return this.attachedSurfaces.has(surfaceInstanceId.trim());
  }

  private destroyAllSurfaces(): void {
    for (const surfaceInstanceId of [...this.attachedSurfaces.keys()]) {
      this.destroySurface(surfaceInstanceId);
    }
  }

  private attachSurfaceFailureHandlers(
    surfaceInstanceId: string,
    view: WebContentsView,
  ): () => void {
    const handleDidFailLoad = (
      _event: object,
      _errorCode: number,
      errorDescription: string,
      _validatedUrl: string,
      isMainFrame: boolean,
    ): void => {
      if (!isMainFrame) {
        return;
      }

      this.detachManagedSurface(
        surfaceInstanceId,
        view,
        this.buildInvalidSurfaceState(surfaceInstanceId, 'did-fail-load', errorDescription),
      );
    };
    const handleRenderProcessGone = (
      _event: object,
      details: {
        readonly reason: string;
        readonly exitCode: number;
      },
    ): void => {
      const detail = `${details.reason} (${details.exitCode})`;
      this.detachManagedSurface(
        surfaceInstanceId,
        view,
        this.buildInvalidSurfaceState(surfaceInstanceId, 'render-process-gone', detail),
      );
    };
    const handleUnresponsive = (): void => {
      this.detachManagedSurface(
        surfaceInstanceId,
        view,
        this.buildInvalidSurfaceState(surfaceInstanceId, 'unresponsive', null),
      );
    };
    const handleBeforeInputEvent = (event: Event, input: Input): void => {
      if (!this.shouldShowCommandCenterFromInput(input)) {
        return;
      }

      event.preventDefault();
      this.emitCommandCenterShowRequest();
    };

    view.webContents.on('did-fail-load', handleDidFailLoad);
    view.webContents.on('render-process-gone', handleRenderProcessGone);
    view.webContents.on('unresponsive', handleUnresponsive);
    view.webContents.on('before-input-event', handleBeforeInputEvent);

    return (): void => {
      view.webContents.removeListener('did-fail-load', handleDidFailLoad);
      view.webContents.removeListener('render-process-gone', handleRenderProcessGone);
      view.webContents.removeListener('unresponsive', handleUnresponsive);
      view.webContents.removeListener('before-input-event', handleBeforeInputEvent);
    };
  }

  private async loadSurfaceBootstrap(
    surfaceInstanceId: string,
    view: WebContentsView,
  ): Promise<void> {
    let timeout: NodeJS.Timeout | null = null;

    try {
      await Promise.race([
        view.webContents.loadURL(buildPluginSurfaceBootstrapUrl()),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            const timeoutError = new Error(
              `Plugin surface bootstrap load timed out after ${PLUGIN_SURFACE_BOOTSTRAP_LOAD_TIMEOUT_MS}ms.`,
            );
            timeoutError.name = PLUGIN_SURFACE_BOOTSTRAP_TIMEOUT_ERROR_NAME;
            reject(timeoutError);
          }, PLUGIN_SURFACE_BOOTSTRAP_LOAD_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    }
  }

  private detachManagedSurface(
    surfaceInstanceId: string,
    view: WebContentsView,
    invalidState: PluginSurfaceStateSnapshot | null = null,
  ): boolean {
    const normalizedSurfaceInstanceId = surfaceInstanceId.trim();
    const record = this.attachedSurfaces.get(normalizedSurfaceInstanceId) ?? null;

    if (record === null || record.view !== view) {
      return false;
    }

    this.attachedSurfaces.delete(normalizedSurfaceInstanceId);
    record.detachFailureHandlers();
    if (invalidState !== null) {
      this.publishSurfaceState(invalidState);
    }

    if (this.mainWindow !== null && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.removeChildView(record.view);
    }

    record.view.webContents.close();
    return true;
  }

  private buildInvalidSurfaceState(
    surfaceInstanceId: string,
    reason: PluginSurfaceInvalidationReason,
    detail: string | null,
  ): PluginSurfaceStateSnapshot {
    return {
      surfaceInstanceId,
      status: 'invalid',
      reason,
      detail,
    };
  }

  private publishSurfaceState(snapshot: PluginSurfaceStateSnapshot): void {
    for (const listener of this.stateListeners) {
      listener(snapshot);
    }
  }

  public publishRuntimeStatus(snapshot: PluginSurfaceRuntimeStatusSnapshot): void {
    const record = this.attachedSurfaces.get(snapshot.surfaceInstanceId) ?? null;

    if (record !== null) {
      const desiredVisible = snapshot.status === 'module-error'
        ? false
        : snapshot.status === 'module-loaded' || snapshot.status === 'rendered'
          ? true
          : record.desiredVisible;
      const nextRecord: ManagedPluginSurfaceView = {
        ...record,
        desiredVisible,
      };
      this.attachedSurfaces.set(snapshot.surfaceInstanceId, nextRecord);
      this.applyManagedSurfaceVisibility(nextRecord);
    }

    for (const listener of this.runtimeStatusListeners) {
      listener(snapshot);
    }
  }

  private publishSurfaceContext(surfaceInstanceId: string): void {
    const record = this.attachedSurfaces.get(surfaceInstanceId) ?? null;

    if (record === null) {
      return;
    }

    record.view.webContents.send(PLUGIN_SURFACE_CONTEXT_UPDATED_CHANNEL, record.context);
  }

  private applyManagedSurfaceVisibility(record: ManagedPluginSurfaceView): void {
    record.view.setVisible(record.desiredVisible && !this.commandCenterVisible);
  }

  private shouldShowCommandCenterFromInput(input: Input): boolean {
    return input.type === 'keyDown' && input.key === 'F1';
  }

  private emitCommandCenterShowRequest(): void {
    const targetWindow = this.mainWindow;

    if (targetWindow === null || targetWindow.isDestroyed()) {
      return;
    }

    targetWindow.webContents.send(COMMAND_CENTER_SHOW_CHANNEL, {
      accelerator: 'F1',
      origin: 'plugin-surface',
    });
  }

  private async captureVisibleSurfacePreviews(): Promise<Readonly<Record<string, string>>> {
    const previews: Record<string, string> = {};
    const visibleRecords = [...this.attachedSurfaces.values()].filter((record) => record.desiredVisible);

    await Promise.all(visibleRecords.map(async (record) => {
      try {
        const image = await record.view.webContents.capturePage();

        if (image.isEmpty()) {
          return;
        }

        previews[record.surfaceInstanceId] = image.toDataURL();
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Failed to capture plugin surface preview.';
        console.error('[PluginSurfaceViewService] failed to capture surface preview:', {
          surfaceInstanceId: record.surfaceInstanceId,
          message,
        });
      }
    }));

    return previews;
  }

  private requireMainWindow(): PluginSurfaceHostWindow {
    if (this.mainWindow === null || this.mainWindow.isDestroyed()) {
      throw new Error('Plugin surface view service is not bound to an active BrowserWindow.');
    }

    return this.mainWindow;
  }
}

export const pluginSurfaceViewService = new PluginSurfaceViewService();
