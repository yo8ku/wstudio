export interface PluginSurfaceRenderableNodeLike {
  readonly nodeType: number;
  readonly tagName?: string | null;
  readonly textContent?: string | null;
  readonly childNodes?: ArrayLike<PluginSurfaceRenderableNodeLike> | null;
}

export interface PluginSurfaceRenderedDetectionInput {
  readonly rendered: boolean;
  readonly bootstrapFailed: boolean;
  readonly rootNode: PluginSurfaceRenderableNodeLike | null;
  readonly rootNodes: ArrayLike<PluginSurfaceRenderableNodeLike> | null;
  readonly bodyNodes: ArrayLike<PluginSurfaceRenderableNodeLike> | null;
}

const PLUGIN_SURFACE_NON_RENDERABLE_ELEMENT_TAGS = new Set<string>([
  'SCRIPT',
  'STYLE',
]);

const PLUGIN_SURFACE_INTRINSIC_RENDERABLE_ELEMENT_TAGS = new Set<string>([
  'AUDIO',
  'BUTTON',
  'CANVAS',
  'EMBED',
  'IFRAME',
  'IMG',
  'INPUT',
  'METER',
  'OBJECT',
  'PROGRESS',
  'SELECT',
  'SVG',
  'TEXTAREA',
  'VIDEO',
]);

function toPluginSurfaceRenderableNodes(
  nodes: ArrayLike<PluginSurfaceRenderableNodeLike> | null | undefined,
): readonly PluginSurfaceRenderableNodeLike[] {
  return nodes === null || nodes === undefined ? [] : Array.from(nodes);
}

function normalizePluginSurfaceRenderableTagName(tagName: string | null | undefined): string {
  return typeof tagName === 'string' ? tagName.trim().toUpperCase() : '';
}

export function pluginSurfaceNodeHasRenderableContent(node: PluginSurfaceRenderableNodeLike): boolean {
  if (node.nodeType === 3) {
    return (node.textContent ?? '').trim().length > 0;
  }

  if (node.nodeType !== 1) {
    return false;
  }

  const tagName = normalizePluginSurfaceRenderableTagName(node.tagName);

  if (PLUGIN_SURFACE_NON_RENDERABLE_ELEMENT_TAGS.has(tagName)) {
    return false;
  }

  if (
    PLUGIN_SURFACE_INTRINSIC_RENDERABLE_ELEMENT_TAGS.has(tagName)
    || tagName.includes('-')
  ) {
    return true;
  }

  if ((node.textContent ?? '').trim().length > 0) {
    return true;
  }

  return toPluginSurfaceRenderableNodes(node.childNodes).some((childNode) => {
    return pluginSurfaceNodeHasRenderableContent(childNode);
  });
}

export function shouldReportPluginSurfaceRendered(
  input: PluginSurfaceRenderedDetectionInput,
): boolean {
  if (input.rendered || input.bootstrapFailed) {
    return false;
  }

  const rootHasContent = toPluginSurfaceRenderableNodes(input.rootNodes).some((childNode) => {
    return pluginSurfaceNodeHasRenderableContent(childNode);
  });
  const bodyHasExtraContent = toPluginSurfaceRenderableNodes(input.bodyNodes)
    .filter((childNode) => childNode !== input.rootNode)
    .some((childNode) => pluginSurfaceNodeHasRenderableContent(childNode));

  return rootHasContent || bodyHasExtraContent;
}

export function buildPluginSurfaceBootstrapDocument(): string {
  const pluginSurfaceNonRenderableElementTags = JSON.stringify([
    ...PLUGIN_SURFACE_NON_RENDERABLE_ELEMENT_TAGS,
  ]);
  const pluginSurfaceIntrinsicRenderableElementTags = JSON.stringify([
    ...PLUGIN_SURFACE_INTRINSIC_RENDERABLE_ELEMENT_TAGS,
  ]);
  const toPluginSurfaceRenderableNodesSource = toPluginSurfaceRenderableNodes.toString();
  const normalizePluginSurfaceRenderableTagNameSource =
    normalizePluginSurfaceRenderableTagName.toString();
  const pluginSurfaceNodeHasRenderableContentSource =
    pluginSurfaceNodeHasRenderableContent.toString();
  const shouldReportPluginSurfaceRenderedSource =
    shouldReportPluginSurfaceRendered.toString();

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; frame-src http: https: about: blob: data:; img-src http: https: data: blob: wstudio-extension: local-file:; style-src 'unsafe-inline'; script-src 'unsafe-inline' wstudio-extension: local-file: data: blob:; font-src data: wstudio-extension: local-file:;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>plugin-surface</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      html,
      body,
      #plugin-surface-root {
        margin: 0;
        width: 100%;
        height: 100%;
      }

      body {
        overflow: hidden;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <div id="plugin-surface-root"></div>
    <script type="module">
      const PLUGIN_SURFACE_NON_RENDERABLE_ELEMENT_TAGS = new Set(${pluginSurfaceNonRenderableElementTags});
      const PLUGIN_SURFACE_INTRINSIC_RENDERABLE_ELEMENT_TAGS = new Set(${pluginSurfaceIntrinsicRenderableElementTags});
      const toPluginSurfaceRenderableNodes = ${toPluginSurfaceRenderableNodesSource};
      const normalizePluginSurfaceRenderableTagName = ${normalizePluginSurfaceRenderableTagNameSource};
      const pluginSurfaceNodeHasRenderableContent = ${pluginSurfaceNodeHasRenderableContentSource};
      const shouldReportPluginSurfaceRendered = ${shouldReportPluginSurfaceRenderedSource};
      const bridge = globalThis.pluginSurfaceBridge;
      const context = typeof bridge?.getSurfaceContext === 'function'
        ? bridge.getSurfaceContext()
        : null;

      if (context === null) {
        throw new Error('Plugin surface bootstrap context is unavailable.');
      }

      const root = document.getElementById('plugin-surface-root');

      if (!(root instanceof HTMLElement)) {
        throw new Error('Plugin surface root is missing.');
      }

      let bootstrapStarted = false;
      let rendered = false;
      let bootstrapFailed = false;
      let cleanupHandler = null;
      let cleanupInvoked = false;
      let currentRuntimeContext = typeof bridge.getRuntimeContext === 'function'
        ? bridge.getRuntimeContext()
        : null;
      let currentRuntimeSurface = {
        pluginId: context.pluginId,
        surfaceKind: context.surfaceKind,
        surfaceId: context.surfaceId,
        entryUrl: context.entryUrl,
        state: currentRuntimeContext?.state ?? null,
      };
      let currentThemeState = {
        info: currentRuntimeContext?.theme?.info ?? {
          id: 'unknown-theme',
          label: 'unknown-theme',
          appearance: 'dark',
        },
        tokens: currentRuntimeContext?.theme?.tokens ?? {},
      };
      const surfaceStateListeners = new Set();
      const themeListeners = new Set();

      function reportStatus(status, error = null) {
        if (typeof bridge?.reportRuntimeStatus !== 'function') {
          return;
        }

        bridge.reportRuntimeStatus({
          surfaceInstanceId: context.surfaceInstanceId,
          status,
          error,
        });
      }

      function invokeHost(method, payload) {
        if (typeof bridge?.invokeHost !== 'function') {
          return Promise.reject(new Error('Plugin surface host bridge is unavailable.'));
        }

        return bridge.invokeHost(method, payload);
      }

      function normalizeThemeSnapshot(theme) {
        const themeInfo = theme !== null && typeof theme === 'object'
          && theme.info !== null && typeof theme.info === 'object'
          ? theme.info
          : null;
        const themeTokensSource = theme !== null && typeof theme === 'object'
          && theme.tokens !== null && typeof theme.tokens === 'object'
          ? theme.tokens
          : null;
        const nextThemeTokens = {};

        if (themeTokensSource !== null) {
          for (const [tokenName, value] of Object.entries(themeTokensSource)) {
            if (typeof value !== 'string') {
              continue;
            }

            nextThemeTokens[tokenName] = value;
          }
        }

        return {
          info: {
            id: typeof themeInfo?.id === 'string' && themeInfo.id.trim().length > 0
              ? themeInfo.id
              : 'unknown-theme',
            label: typeof themeInfo?.label === 'string' && themeInfo.label.trim().length > 0
              ? themeInfo.label
              : (typeof themeInfo?.id === 'string' && themeInfo.id.trim().length > 0 ? themeInfo.id : 'unknown-theme'),
            appearance: themeInfo?.appearance === 'light' ? 'light' : 'dark',
          },
          tokens: nextThemeTokens,
        };
      }

      function notifySurfaceStateListeners() {
        for (const listener of surfaceStateListeners) {
          try {
            listener(currentRuntimeSurface.state);
          } catch (error) {
            console.error('[plugin-surface-bootstrap] surface state listener failed', error);
          }
        }
      }

      function notifyThemeListeners() {
        for (const listener of themeListeners) {
          try {
            listener(currentThemeState);
          } catch (error) {
            console.error('[plugin-surface-bootstrap] theme listener failed', error);
          }
        }
      }

      function applyRuntimeContext(nextRuntimeContext) {
        if (nextRuntimeContext === null || typeof nextRuntimeContext !== 'object') {
          return;
        }

        currentRuntimeContext = nextRuntimeContext;
        currentRuntimeSurface = {
          ...currentRuntimeSurface,
          state: nextRuntimeContext.state ?? null,
        };

        currentThemeState = normalizeThemeSnapshot(nextRuntimeContext.theme);
        notifySurfaceStateListeners();
        notifyThemeListeners();
        startBootstrap();
      }

      function markRendered() {
        if (rendered || bootstrapFailed) {
          return;
        }

        detectRendered();

        if (rendered || bootstrapFailed) {
          return;
        }

        queueMicrotask(detectRendered);
        window.requestAnimationFrame(detectRendered);
      }

      function commitRendered() {
        if (rendered || bootstrapFailed) {
          return;
        }

        rendered = true;
        reportStatus('rendered');
      }

      function detectRendered() {
        if (!shouldReportPluginSurfaceRendered({
          rendered,
          bootstrapFailed,
          rootNode: root,
          rootNodes: root.childNodes,
          bodyNodes: document.body.childNodes,
        })) {
          return;
        }

        commitRendered();
      }

      function resolveMountFunction(moduleNamespace) {
        if (moduleNamespace !== null && typeof moduleNamespace === 'object') {
          if (typeof moduleNamespace.mountPluginSurface === 'function') {
            return moduleNamespace.mountPluginSurface;
          }

          if (typeof moduleNamespace.mount === 'function') {
            return moduleNamespace.mount;
          }
        }

        if (typeof moduleNamespace === 'function') {
          return moduleNamespace;
        }

        if (
          moduleNamespace !== null
          && typeof moduleNamespace === 'object'
          && typeof moduleNamespace.default === 'function'
        ) {
          return moduleNamespace.default;
        }

        return null;
      }

      function registerCleanup(candidate) {
        if (typeof candidate === 'function') {
          cleanupHandler = candidate;
          cleanupInvoked = false;
          return;
        }

        if (
          candidate !== null
          && typeof candidate === 'object'
          && typeof candidate.unmount === 'function'
        ) {
          cleanupHandler = () => {
            candidate.unmount();
          };
          cleanupInvoked = false;
        }
      }

      function invokeCleanup() {
        if (cleanupInvoked || cleanupHandler === null) {
          return;
        }

        cleanupInvoked = true;
        const targetCleanup = cleanupHandler;
        cleanupHandler = null;

        try {
          targetCleanup();
        } catch (error) {
          console.error('[plugin-surface-bootstrap] cleanup failed', error);
        }
      }

      async function importRuntimeModule() {
        const entrySourceResult = await invokeHost('load-entry-source', null);

        if (typeof entrySourceResult !== 'string' || entrySourceResult.trim().length === 0) {
          throw new Error('Plugin runtime entry source is unavailable.');
        }

        const runtimeReadyEventName = '__wstudio_plugin_surface_ready__:' + context.surfaceInstanceId;
        const runtimeEntryGlobalKey = '__WSTUDIO_PLUGIN_SURFACE_ENTRY__';

        return await new Promise((resolve, reject) => {
          let settled = false;
          const runtimeScript = document.createElement('script');
          runtimeScript.type = 'module';

          const cleanup = () => {
            window.removeEventListener(runtimeReadyEventName, handleReady);
            window.removeEventListener('error', handleWindowError, true);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
            runtimeScript.removeEventListener('error', handleScriptError);
          };

          const finalizeResolve = () => {
            if (settled) {
              return;
            }

            settled = true;
            cleanup();
            resolve(window[runtimeEntryGlobalKey] ?? null);
          };

          const finalizeReject = (error) => {
            if (settled) {
              return;
            }

            settled = true;
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          };

          const handleReady = () => {
            finalizeResolve();
          };

          const handleScriptError = () => {
            finalizeReject(new Error('Plugin surface inline module script failed to execute.'));
          };

          const handleWindowError = (event) => {
            event.preventDefault();
            finalizeReject(event.error ?? new Error(event.message || 'Plugin surface inline module failed.'));
          };

          const handleUnhandledRejection = (event) => {
            event.preventDefault();
            finalizeReject(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
          };

          window[runtimeEntryGlobalKey] = null;
          window.addEventListener(runtimeReadyEventName, handleReady, { once: true });
          window.addEventListener('error', handleWindowError, true);
          window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
          runtimeScript.addEventListener('error', handleScriptError);
          runtimeScript.textContent = entrySourceResult + '\\n'
            + 'const __wstudioPluginSurfaceEntrypoint = typeof mountPluginSurface === "function" ? mountPluginSurface : (typeof mount === "function" ? mount : null);\\n'
            + 'window["' + runtimeEntryGlobalKey + '"] = __wstudioPluginSurfaceEntrypoint === null ? null : { mountPluginSurface: __wstudioPluginSurfaceEntrypoint };\\n'
            + 'window.dispatchEvent(new Event("' + runtimeReadyEventName + '"));\\n'
            + '//# sourceURL=' + context.entryUrl;
          document.body.append(runtimeScript);
        });
      }

      async function startBootstrap() {
        if (bootstrapStarted || currentRuntimeContext === null) {
          return;
        }

        bootstrapStarted = true;

        try {
          const moduleNamespace = await importRuntimeModule();
          const mount = resolveMountFunction(moduleNamespace);

          if (mount !== null) {
            const cleanupCandidate = await mount(runtimeBridge);
            registerCleanup(cleanupCandidate);
          }

          reportStatus('module-loaded');
          markRendered();
        } catch (error) {
          bootstrapFailed = true;
          const errorMessage = error instanceof Error ? error.message : String(error);
          reportStatus('module-error', errorMessage);
        }
      }

      const observer = new MutationObserver(() => {
        detectRendered();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      const runtimeBridge = {
        get surface() {
          return currentRuntimeSurface;
        },
        root,
        host: {
          showNotice: (payload) => invokeHost('show-notice', payload).then(() => undefined),
          executeCommand: (commandId, args = []) => invokeHost('execute-command', { commandId, args }),
          activateView: () => invokeHost('activate-view', null).then(() => undefined),
          closeView: () => invokeHost('close-view', null).then(() => undefined),
          closeOverlay: () => invokeHost('close-overlay', null).then(() => undefined),
          showOpenDialog: (options) => invokeHost('file-show-open-dialog', options),
          overlay: {
            dispatchAction: (action) => invokeHost('dispatch-overlay-action', action).then(() => undefined),
          },
          openWorkspaceFile: (path, options) => invokeHost('open-workspace-file', { path, options }).then((result) => result === true),
          editor: {
            getState: (documentUri = null) => invokeHost('editor-get-state', { documentUri }),
            applyTextEdits: (documentUri, edits) => invokeHost('editor-apply-text-edits', { documentUri, edits }).then(() => undefined),
            performAction: (request) => invokeHost('editor-perform-action', request).then(() => undefined),
          },
          data: {
            load: () => invokeHost('data-load', null),
            save: (data) => invokeHost('data-save', { data }).then(() => undefined),
            delete: () => invokeHost('data-delete', null).then(() => undefined),
          },
          settings: {
            getTabs: () => invokeHost('settings-get-tabs', null),
          },
        },
        theme: {
          getSnapshot: () => currentThemeState,
          onDidChange: (listener) => {
            if (typeof listener !== 'function') {
              return () => undefined;
            }

            themeListeners.add(listener);
            return () => {
              themeListeners.delete(listener);
            };
          },
        },
        markRendered: () => {
          markRendered();
        },
        onSurfaceStateChange: (listener) => {
          if (typeof listener !== 'function') {
            return () => undefined;
          }

          surfaceStateListeners.add(listener);
          return () => {
            surfaceStateListeners.delete(listener);
          };
        },
      };

      Object.defineProperty(window, '__WSTUDIO_PLUGIN_RUNTIME_SURFACE__', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: runtimeBridge,
      });

      if (typeof bridge?.onRuntimeContextChange === 'function') {
        bridge.onRuntimeContextChange((nextRuntimeContext) => {
          applyRuntimeContext(nextRuntimeContext);
        });
      }

      if (currentRuntimeContext !== null) {
        applyRuntimeContext(currentRuntimeContext);
      }

      window.addEventListener('pagehide', invokeCleanup);
      window.addEventListener('beforeunload', invokeCleanup);
      detectRendered();
    </script>
  </body>
</html>`;
}
