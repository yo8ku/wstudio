import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePluginSurfaceContextArgument } from './pluginSurfaceContext';

const electronMocks = vi.hoisted(() => {
  interface MockCapturedPage {
    isEmpty(): boolean;
    toDataURL(): string;
  }

  interface MockBeforeInputEvent {
    preventDefault(): void;
  }

  interface MockBeforeInput {
    readonly type: string;
    readonly key: string;
  }

  type DidFailLoadHandler = (
    event: object,
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean,
  ) => void;

  type RenderProcessGoneHandler = (
    event: object,
    details: {
      readonly reason: string;
      readonly exitCode: number;
    },
  ) => void;

  type UnresponsiveHandler = () => void;

  type BeforeInputEventHandler = (
    event: MockBeforeInputEvent,
    input: MockBeforeInput,
  ) => void;

  type MockWebContentsEventName =
    | 'did-fail-load'
    | 'render-process-gone'
    | 'unresponsive'
    | 'before-input-event';

  type MockWebContentsEventHandler =
    | DidFailLoadHandler
    | RenderProcessGoneHandler
    | UnresponsiveHandler
    | BeforeInputEventHandler;

  class HoistedMockWebContentsView {
    private static nextLoadUrlImplementation: ((url: string) => Promise<void>) | null = null;

    private static nextCapturePageImplementation: (() => Promise<MockCapturedPage>) | null = null;

    public readonly webContents = {
      loadURL: vi.fn((url: string): Promise<void> => {
        const implementation = HoistedMockWebContentsView.nextLoadUrlImplementation;
        HoistedMockWebContentsView.nextLoadUrlImplementation = null;

        if (implementation !== null) {
          return implementation(url);
        }

        return Promise.resolve();
      }),
      capturePage: vi.fn((): Promise<MockCapturedPage> => {
        const implementation = HoistedMockWebContentsView.nextCapturePageImplementation;
        HoistedMockWebContentsView.nextCapturePageImplementation = null;

        if (implementation !== null) {
          return implementation();
        }

        return Promise.resolve({
          isEmpty: (): boolean => false,
          toDataURL: (): string => 'data:image/png;base64,mock-surface-preview',
        });
      }),
      close: vi.fn((): void => undefined),
      focus: vi.fn((): void => undefined),
      send: vi.fn((_channel: string, _payload: object): void => undefined),
      on: vi.fn((
        event: MockWebContentsEventName,
        handler: MockWebContentsEventHandler,
      ): void => {
        this.addWebContentsHandler(event, handler);
      }),
      removeListener: vi.fn((
        event: MockWebContentsEventName,
        handler: MockWebContentsEventHandler,
      ): void => {
        this.removeWebContentsHandler(event, handler);
      }),
    };

    public bounds = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    public visible = false;

    private readonly didFailLoadHandlers = new Set<DidFailLoadHandler>();

    private readonly renderProcessGoneHandlers = new Set<RenderProcessGoneHandler>();

    private readonly unresponsiveHandlers = new Set<UnresponsiveHandler>();

    private readonly beforeInputEventHandlers = new Set<BeforeInputEventHandler>();

    public constructor(
      public readonly options?: {
        readonly webPreferences?: {
          readonly sandbox?: boolean;
          readonly contextIsolation?: boolean;
          readonly nodeIntegration?: boolean;
          readonly webSecurity?: boolean;
          readonly webviewTag?: boolean;
          readonly preload?: string;
          readonly partition?: string;
          readonly additionalArguments?: readonly string[];
        };
      },
    ) {}

    public setBounds(bounds: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }): void {
      this.bounds = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }

    public setVisible(visible: boolean): void {
      this.visible = visible;
    }

    public static setNextLoadUrlImplementation(
      implementation: (url: string) => Promise<void>,
    ): void {
      HoistedMockWebContentsView.nextLoadUrlImplementation = implementation;
    }

    public static setNextCapturePageImplementation(
      implementation: () => Promise<MockCapturedPage>,
    ): void {
      HoistedMockWebContentsView.nextCapturePageImplementation = implementation;
    }

    public emitDidFailLoad(isMainFrame: boolean): void {
      for (const handler of [...this.didFailLoadHandlers]) {
        handler({}, -3, 'mock-load-failure', 'data:text/html,broken', isMainFrame);
      }
    }

    public emitRenderProcessGone(): void {
      for (const handler of [...this.renderProcessGoneHandlers]) {
        handler({}, {
          reason: 'crashed',
          exitCode: 1,
        });
      }
    }

    public emitUnresponsive(): void {
      for (const handler of [...this.unresponsiveHandlers]) {
        handler();
      }
    }

    public emitBeforeInputEvent(input: MockBeforeInput): MockBeforeInputEvent {
      const event = {
        preventDefault: vi.fn((): void => undefined),
      };

      for (const handler of [...this.beforeInputEventHandlers]) {
        handler(event, input);
      }

      return event;
    }

    private addWebContentsHandler(
      event: MockWebContentsEventName,
      handler: MockWebContentsEventHandler,
    ): void {
      switch (event) {
        case 'did-fail-load':
          this.didFailLoadHandlers.add(handler as DidFailLoadHandler);
          return;
        case 'render-process-gone':
          this.renderProcessGoneHandlers.add(handler as RenderProcessGoneHandler);
          return;
        case 'unresponsive':
          this.unresponsiveHandlers.add(handler as UnresponsiveHandler);
          return;
        case 'before-input-event':
          this.beforeInputEventHandlers.add(handler as BeforeInputEventHandler);
          return;
      }
    }

    private removeWebContentsHandler(
      event: MockWebContentsEventName,
      handler: MockWebContentsEventHandler,
    ): void {
      switch (event) {
        case 'did-fail-load':
          this.didFailLoadHandlers.delete(handler as DidFailLoadHandler);
          return;
        case 'render-process-gone':
          this.renderProcessGoneHandlers.delete(handler as RenderProcessGoneHandler);
          return;
        case 'unresponsive':
          this.unresponsiveHandlers.delete(handler as UnresponsiveHandler);
          return;
        case 'before-input-event':
          this.beforeInputEventHandlers.delete(handler as BeforeInputEventHandler);
          return;
      }
    }
  }

  class HoistedMockBrowserWindow {
    public readonly contentView = {
      addChildView: vi.fn((_view: object): void => undefined),
      removeChildView: vi.fn((_view: object): void => undefined),
    };

    public readonly webContents = {
      send: vi.fn((_channel: string, _payload: object): void => undefined),
    };

    private destroyed = false;

    public isDestroyed(): boolean {
      return this.destroyed;
    }
  }

  return {
    BrowserWindow: HoistedMockBrowserWindow,
    WebContentsView: HoistedMockWebContentsView,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
  WebContentsView: electronMocks.WebContentsView,
}));

import { PluginSurfaceViewService } from './PluginSurfaceViewService';

type MockBrowserWindow = InstanceType<typeof electronMocks.BrowserWindow>;
type MockWebContentsView = InstanceType<typeof electronMocks.WebContentsView>;

function resolveAttachedView(mainWindow: MockBrowserWindow): MockWebContentsView | null {
  const attachedView = mainWindow.contentView.addChildView.mock.calls[0]?.[0] ?? null;
  return attachedView instanceof electronMocks.WebContentsView ? attachedView : null;
}

describe('PluginSurfaceViewService', () => {
  const surfaceDescriptor = {
    pluginId: 'test-plugin',
    surfaceKind: 'view',
    surfaceId: 'test-surface',
    entryUrl: 'wstudio-extension://test-plugin/view.runtime.js',
    state: null,
  } as const;
  const themeInfo = {
    id: 'test-theme',
    label: 'Test Theme',
    appearance: 'dark',
  } as const;
  const theme = {
    info: themeInfo,
    tokens: {
      'text.primary': '#ffffff',
    },
  } as const;

  let service: PluginSurfaceViewService;
  let mainWindow: MockBrowserWindow;

  beforeEach(() => {
    service = new PluginSurfaceViewService();
    mainWindow = new electronMocks.BrowserWindow();
    service.setMainWindow(mainWindow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates, resizes, and destroys a WebContentsView-backed surface', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:test-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 10,
        y: 20,
        width: 320,
        height: 180,
      },
      leafId: 'test-leaf',
      theme,
    });

    expect(mainWindow.contentView.addChildView).toHaveBeenCalledTimes(1);
    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    expect(attachedView?.visible).toBe(false);
    expect(attachedView?.bounds).toEqual({
      x: 10,
      y: 20,
      width: 320,
      height: 180,
    });
    const additionalArguments = attachedView?.options?.webPreferences?.additionalArguments ?? [];
    expect(attachedView?.options?.webPreferences?.partition).toBe('plugin-surface-leaf-test-surface');
    expect(attachedView?.options?.webPreferences?.preload?.includes('pluginSurface.preload')).toBe(true);
    expect(attachedView?.options?.webPreferences?.webviewTag).toBe(true);
    expect(parsePluginSurfaceContextArgument(additionalArguments)).toEqual({
      surfaceInstanceId: 'leaf:test-surface',
      pluginId: 'test-plugin',
      surfaceKind: 'view',
      surfaceId: 'test-surface',
      entryUrl: 'wstudio-extension://test-plugin/view.runtime.js',
      leafId: 'test-leaf',
      overlayId: null,
    });
    expect(attachedView?.webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(attachedView?.webContents.send).toHaveBeenCalledWith('plugin-surface:context-updated', {
      surfaceInstanceId: 'leaf:test-surface',
      state: null,
      theme,
    });
    expect(service.hasSurface('leaf:test-surface')).toBe(true);

    const updated = service.updateSurfaceBounds('leaf:test-surface', {
      x: 14,
      y: 28,
      width: 400,
      height: 220,
    });

    expect(updated).toBe(true);
    expect(attachedView?.bounds).toEqual({
      x: 14,
      y: 28,
      width: 400,
      height: 220,
    });

    const destroyed = service.destroySurface('leaf:test-surface');

    expect(destroyed).toBe(true);
    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(attachedView);
    expect(attachedView?.webContents.close).toHaveBeenCalledTimes(1);
    expect(service.hasSurface('leaf:test-surface')).toBe(false);
  });

  it('tears down active surfaces when the bound BrowserWindow changes', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:test-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      },
      leafId: 'test-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);
    const nextWindow = new electronMocks.BrowserWindow();

    service.setMainWindow(nextWindow);

    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(attachedView);
    expect(attachedView?.webContents.close).toHaveBeenCalledTimes(1);
    expect(service.hasSurface('leaf:test-surface')).toBe(false);
  });

  it('reveals a hidden surface after the runtime module loads', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:hidden-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 24,
        y: 36,
        width: 280,
        height: 160,
      },
      visible: false,
      leafId: 'hidden-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    expect(attachedView?.visible).toBe(false);
    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:hidden-surface',
      status: 'module-loaded',
      error: null,
    });
    expect(attachedView?.visible).toBe(true);
    expect(service.hasSurface('leaf:hidden-surface')).toBe(true);
  });

  it('temporarily hides rendered surfaces while the command center is visible', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:command-center-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 18,
        y: 26,
        width: 320,
        height: 200,
      },
      visible: false,
      leafId: 'command-center-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    expect(attachedView?.visible).toBe(false);

    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:command-center-surface',
      status: 'rendered',
      error: null,
    });
    expect(attachedView?.visible).toBe(true);

    const previews = await service.captureCommandCenterPreviews();

    expect(previews).toEqual({
      'leaf:command-center-surface': 'data:image/png;base64,mock-surface-preview',
    });
    expect(attachedView?.webContents.capturePage).toHaveBeenCalledTimes(1);
    expect(attachedView?.visible).toBe(true);

    await service.setCommandCenterVisible(true);
    expect(attachedView?.visible).toBe(false);

    await service.setCommandCenterVisible(false);
    expect(attachedView?.visible).toBe(true);
  });

  it('does not restore surfaces that became hidden while the command center was open', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:command-center-error-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 22,
        y: 30,
        width: 300,
        height: 180,
      },
      visible: false,
      leafId: 'command-center-error-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();

    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:command-center-error-surface',
      status: 'module-loaded',
      error: null,
    });
    expect(attachedView?.visible).toBe(true);

    await service.setCommandCenterVisible(true);
    expect(attachedView?.visible).toBe(false);

    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:command-center-error-surface',
      status: 'module-error',
      error: 'runtime-failure',
    });
    expect(attachedView?.visible).toBe(false);

    await service.setCommandCenterVisible(false);
    expect(attachedView?.visible).toBe(false);
  });

  it('reorders an attached surface to the front when requested', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:front-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 20,
        y: 24,
        width: 300,
        height: 180,
      },
      leafId: 'front-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);
    const moved = service.bringSurfaceToFront('leaf:front-surface');

    expect(attachedView).not.toBeNull();
    expect(moved).toBe(true);
    expect(mainWindow.contentView.addChildView).toHaveBeenCalledTimes(2);
    expect(mainWindow.contentView.addChildView.mock.calls[1]?.[0]).toBe(attachedView);
    expect(attachedView?.visible).toBe(false);
  });

  it('forwards F1 pressed inside a plugin surface to the host command center', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:shortcut-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 18,
        y: 22,
        width: 320,
        height: 200,
      },
      leafId: 'shortcut-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    const forwardedEvent = attachedView?.emitBeforeInputEvent({
      type: 'keyDown',
      key: 'F1',
    });

    expect(forwardedEvent?.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('command-center:show', {
      accelerator: 'F1',
      origin: 'plugin-surface',
    });
  });

  it('focuses a surface when requested after bootstrap finishes', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'overlay:test-surface',
      surface: {
        ...surfaceDescriptor,
        surfaceKind: 'modal',
      },
      bounds: {
        x: 32,
        y: 48,
        width: 360,
        height: 240,
      },
      visible: false,
      leafId: null,
      overlayId: 'plugin-runtime-overlay-1',
      focusOnAttach: true,
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    expect(attachedView?.visible).toBe(false);
    expect(attachedView?.webContents.focus).toHaveBeenCalledTimes(1);
    expect(parsePluginSurfaceContextArgument(attachedView?.options?.webPreferences?.additionalArguments ?? [])).toEqual({
      surfaceInstanceId: 'overlay:test-surface',
      pluginId: 'test-plugin',
      surfaceKind: 'modal',
      surfaceId: 'test-surface',
      entryUrl: 'wstudio-extension://test-plugin/view.runtime.js',
      leafId: null,
      overlayId: 'plugin-runtime-overlay-1',
    });
  });

  it('tears down an attached surface when the guest renderer process is gone', async () => {
    const stateListener = vi.fn();
    service.subscribeToSurfaceState(stateListener);

    await service.attachSurface({
      surfaceInstanceId: 'leaf:faulted-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 8,
        y: 12,
        width: 240,
        height: 120,
      },
      leafId: 'faulted-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    attachedView?.emitRenderProcessGone();

    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(attachedView);
    expect(attachedView?.webContents.close).toHaveBeenCalledTimes(1);
    expect(service.hasSurface('leaf:faulted-surface')).toBe(false);
    expect(stateListener).toHaveBeenCalledWith({
      surfaceInstanceId: 'leaf:faulted-surface',
      status: 'invalid',
      reason: 'render-process-gone',
      detail: 'crashed (1)',
    });
  });

  it('ignores subframe load failures but tears down main-frame load failures', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:load-failure-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 16,
        y: 18,
        width: 260,
        height: 140,
      },
      leafId: 'load-failure-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    attachedView?.emitDidFailLoad(false);
    expect(service.hasSurface('leaf:load-failure-surface')).toBe(true);

    attachedView?.emitDidFailLoad(true);
    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(attachedView);
    expect(attachedView?.webContents.close).toHaveBeenCalledTimes(1);
    expect(service.hasSurface('leaf:load-failure-surface')).toBe(false);
  });

  it('tears down a surface when bootstrap loading times out', async () => {
    vi.useFakeTimers();

    const serviceWithTimeout = new PluginSurfaceViewService();
    const stateListener = vi.fn();
    serviceWithTimeout.setMainWindow(mainWindow);
    serviceWithTimeout.subscribeToSurfaceState(stateListener);
    electronMocks.WebContentsView.setNextLoadUrlImplementation(
      (_url: string): Promise<void> => new Promise<void>(() => undefined),
    );

    const attachPromise = serviceWithTimeout.attachSurface({
      surfaceInstanceId: 'leaf:timed-out-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 12,
        y: 14,
        width: 220,
        height: 110,
      },
      leafId: 'timed-out-leaf',
      theme,
    });
    const attachResultPromise = attachPromise.then(
      (): Error | null => null,
      (error: Error): Error => error,
    );

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    await vi.runAllTimersAsync();

    const attachError = await attachResultPromise;
    expect(attachError).toBeInstanceOf(Error);
    expect(attachError?.message).toContain('Plugin surface bootstrap load timed out');
    expect(mainWindow.contentView.removeChildView).toHaveBeenCalledWith(attachedView);
    expect(attachedView?.webContents.close).toHaveBeenCalledTimes(1);
    expect(serviceWithTimeout.hasSurface('leaf:timed-out-surface')).toBe(false);
    expect(stateListener).toHaveBeenCalledWith({
      surfaceInstanceId: 'leaf:timed-out-surface',
      status: 'invalid',
      reason: 'timeout',
      detail: 'Plugin surface bootstrap load timed out after 10000ms.',
    });
  });

  it('publishes updated runtime context into the attached guest surface', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:context-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 0,
        y: 0,
        width: 180,
        height: 120,
      },
      leafId: 'context-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();

    const updated = service.updateSurfaceRuntimeContext(
      'leaf:context-surface',
      {
        view: 'next',
      },
      {
        info: {
          id: 'light-theme',
          label: 'Light Theme',
          appearance: 'light',
        },
        tokens: {
          'text.primary': '#111111',
        },
      },
    );

    expect(updated).toBe(true);
    expect(attachedView?.webContents.send).toHaveBeenLastCalledWith('plugin-surface:context-updated', {
      surfaceInstanceId: 'leaf:context-surface',
      state: {
        view: 'next',
      },
      theme: {
        info: {
          id: 'light-theme',
          label: 'Light Theme',
          appearance: 'light',
        },
        tokens: {
          'text.primary': '#111111',
        },
      },
    });
  });

  it('hides a guest surface again when the runtime reports a module error', async () => {
    await service.attachSurface({
      surfaceInstanceId: 'leaf:error-surface',
      surface: surfaceDescriptor,
      bounds: {
        x: 4,
        y: 6,
        width: 280,
        height: 160,
      },
      leafId: 'error-leaf',
      theme,
    });

    const attachedView = resolveAttachedView(mainWindow);

    expect(attachedView).not.toBeNull();
    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:error-surface',
      status: 'module-loaded',
      error: null,
    });
    expect(attachedView?.visible).toBe(true);

    service.publishRuntimeStatus({
      surfaceInstanceId: 'leaf:error-surface',
      status: 'module-error',
      error: 'mock-error',
    });
    expect(attachedView?.visible).toBe(false);
  });
});
