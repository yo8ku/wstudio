import type { JsonValue } from '../types/json';
import type {
  PluginUiContext,
  PluginUiHostBridge,
  PluginUiSurfaceDescriptor,
  ThemeChangeEvent,
  ThemeService,
  ThemeSnapshot,
  ThemeTokenName,
} from '../types/plugin-ui-runtime';

interface PluginUiRuntimeBridge {
  readonly surface: PluginUiSurfaceDescriptor;
  readonly root: HTMLElement;
  readonly host: PluginUiHostBridge;
  readonly theme: {
    getSnapshot(): ThemeSnapshot;
    onDidChange(listener: (state: ThemeSnapshot) => void): () => void;
  };
  markRendered(): void;
  onSurfaceStateChange(listener: (state: JsonValue | null) => void): () => void;
}

interface PluginUiRuntimeBridgeOwner {
  __WSTUDIO_PLUGIN_RUNTIME_SURFACE__?: PluginUiRuntimeBridge;
}
const contextCache = new WeakMap<PluginUiRuntimeBridge, PluginUiContext>();

function getRuntimeBridge(): PluginUiRuntimeBridge {
  const owner = globalThis as typeof globalThis & PluginUiRuntimeBridgeOwner;
  const runtimeBridge = owner.__WSTUDIO_PLUGIN_RUNTIME_SURFACE__;

  if (runtimeBridge === undefined) {
    throw new Error('Plugin UI runtime context is unavailable outside a plugin UI surface.');
  }

  return runtimeBridge;
}

class RuntimeThemeService implements ThemeService {
  private snapshot: ThemeSnapshot;

  public constructor(private readonly runtimeBridge: PluginUiRuntimeBridge) {
    this.snapshot = this.runtimeBridge.theme.getSnapshot();
  }

  public getSnapshot(): ThemeSnapshot {
    this.snapshot = this.runtimeBridge.theme.getSnapshot();
    return this.snapshot;
  }

  public getToken(name: ThemeTokenName): string {
    return this.getSnapshot().tokens[name];
  }

  public onDidChange(listener: (event: ThemeChangeEvent) => void): () => void {
    if (typeof listener !== 'function') {
      return () => undefined;
    }

    return this.runtimeBridge.theme.onDidChange((state) => {
      const previousSnapshot = this.snapshot;
      const currentSnapshot = state;
      this.snapshot = currentSnapshot;
      listener({
        previous: previousSnapshot,
        current: currentSnapshot,
      });
    });
  }
}

export function acquirePluginUiContext(): PluginUiContext {
  const runtimeBridge = getRuntimeBridge();
  const cached = contextCache.get(runtimeBridge);

  if (cached !== undefined) {
    return cached;
  }

  const theme = new RuntimeThemeService(runtimeBridge);
  const context: PluginUiContext = {
    get surface() {
      return runtimeBridge.surface;
    },
    root: runtimeBridge.root,
    host: runtimeBridge.host,
    theme,
    markRendered: () => {
      runtimeBridge.markRendered();
    },
    onSurfaceStateChange: (listener) => runtimeBridge.onSurfaceStateChange(listener),
  };

  contextCache.set(runtimeBridge, context);
  return context;
}
