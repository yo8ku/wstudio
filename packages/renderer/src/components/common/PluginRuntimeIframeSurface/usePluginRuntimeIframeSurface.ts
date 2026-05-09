/**
 * Hosts plugin runtime surfaces inside renderer-owned sandboxed iframes and
 * bridges iframe requests back into the Electron host IPC layer.
 */

import React from 'react';
import type {
  JsonValue,
  PluginSurfaceRuntimeStatusSnapshot,
  PluginUiRuntimeEditorStateSnapshot,
  PluginUiRuntimeSettingTabSummary,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import {
  capturePluginRuntimeThemeSnapshot,
} from '../../Layout/EditorArea/PluginRuntimeView/pluginRuntimeThemeVariables';

const PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL = 'plugin-runtime:request-activate-view';
const PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL = 'plugin-runtime:request-close-view';
const PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:request-close-overlay-frame';
const PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL = 'plugin-runtime:dispatch-overlay-action';
const PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL = 'plugin-runtime:request-open-workspace-file';
const PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL = 'plugin-runtime:read-entry-source';
const PLUGIN_RUNTIME_MARK_OVERLAY_RUNTIME_ACTIVE_CHANNEL = 'plugin-runtime:mark-overlay-runtime-active';
const PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL = 'plugin-runtime:editor-get-state';
const PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL = 'plugin-runtime:editor-apply-text-edits';
const PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL = 'plugin-runtime:editor-perform-action';
const PLUGIN_RUNTIME_INVOKE_LOGIC_ACTION_CHANNEL = 'plugin-runtime:invoke-logic-action';
const PLUGIN_RUNTIME_DATA_LOAD_CHANNEL = 'plugin-runtime:data-load';
const PLUGIN_RUNTIME_DATA_SAVE_CHANNEL = 'plugin-runtime:data-save';
const PLUGIN_RUNTIME_DATA_DELETE_CHANNEL = 'plugin-runtime:data-delete';
const PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL = 'plugin-runtime:settings-get-tabs';
const PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL = 'plugin-surface:show-notice';
const WORKBENCH_EXECUTE_COMMAND_CHANNEL = 'extensions:workbench:execute-command';
const IFRAME_RUNTIME_PROTOCOL_KEY = '__wstudioPluginRuntimeSurface';

type PluginRuntimeIframeEntrypointStatus = 'idle' | PluginSurfaceRuntimeStatusSnapshot['status'];

interface PluginRuntimeThemeSnapshot {
  readonly info: {
    readonly id: string;
    readonly label: string;
    readonly appearance: 'light' | 'dark';
  };
  readonly tokens: Readonly<Record<string, string>>;
}

interface PluginRuntimeContextSnapshot {
  readonly surfaceInstanceId: string;
  readonly state: JsonValue | null;
  readonly theme: PluginRuntimeThemeSnapshot;
}

interface PluginRuntimeBootstrapContext {
  readonly surfaceInstanceId: string;
  readonly pluginId: string;
  readonly surfaceKind: PluginUiRuntimeSurfaceDescriptor['surfaceKind'];
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly leafId: string | null;
  readonly overlayId: string | null;
}

type PluginRuntimeIframeSerializableResult =
  | JsonValue
  | PluginUiRuntimeEditorStateSnapshot
  | readonly PluginUiRuntimeSettingTabSummary[]
  | {
      readonly canceled: boolean;
      readonly filePaths: readonly string[];
    }
  | null;

type PluginRuntimeHostRequestMethod =
  | 'show-notice'
  | 'execute-command'
  | 'activate-view'
  | 'close-view'
  | 'close-overlay'
  | 'file-show-open-dialog'
  | 'dispatch-overlay-action'
  | 'open-workspace-file'
  | 'editor-get-state'
  | 'editor-apply-text-edits'
  | 'editor-perform-action'
  | 'invoke-logic-action'
  | 'data-load'
  | 'data-save'
  | 'data-delete'
  | 'settings-get-tabs';

interface PluginRuntimeIframeEnvelope {
  readonly [IFRAME_RUNTIME_PROTOCOL_KEY]: true;
  readonly surfaceInstanceId: string;
}

interface PluginRuntimeIframeHostRequestMessage extends PluginRuntimeIframeEnvelope {
  readonly type: 'host-request';
  readonly requestId: string;
  readonly method: PluginRuntimeHostRequestMethod;
  readonly payload: JsonValue;
}

interface PluginRuntimeIframeHostResponseMessage extends PluginRuntimeIframeEnvelope {
  readonly type: 'host-response';
  readonly requestId: string;
  readonly result: PluginRuntimeIframeSerializableResult;
}

interface PluginRuntimeIframeHostResponseErrorMessage extends PluginRuntimeIframeEnvelope {
  readonly type: 'host-response-error';
  readonly requestId: string;
  readonly error: string;
}

interface PluginRuntimeIframeStatusMessage extends PluginRuntimeIframeEnvelope {
  readonly type: 'status';
  readonly status: PluginSurfaceRuntimeStatusSnapshot['status'];
  readonly error: string | null;
}

interface PluginRuntimeIframeContextMessage extends PluginRuntimeIframeEnvelope {
  readonly type: 'runtime-context';
  readonly context: PluginRuntimeContextSnapshot;
}

type PluginRuntimeIframeIncomingMessage =
  | PluginRuntimeIframeHostRequestMessage
  | PluginRuntimeIframeStatusMessage;

type PluginRuntimeIframeMessageData = JsonValue | PluginRuntimeIframeIncomingMessage;

export interface UsePluginRuntimeIframeSurfaceOptions {
  readonly surfaceInstanceId: string;
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
  readonly leafId?: string | null;
  readonly overlayId?: string | null;
  readonly onRuntimeActive?: (() => void) | null;
}

export interface UsePluginRuntimeIframeSurfaceResult {
  readonly iframeRef: React.RefObject<HTMLIFrameElement>;
  readonly srcDoc: string | undefined;
  readonly entrypointStatus: PluginRuntimeIframeEntrypointStatus;
  readonly entrypointError: string | null;
}

function isJsonRecord(
  value: JsonValue | PluginRuntimeIframeSerializableResult | PluginRuntimeIframeIncomingMessage,
): value is Record<string, JsonValue> {
  return value !== null && !Array.isArray(value) && typeof value === 'object';
}

function serializeInlineScriptValue<TValue>(value: TValue): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildPluginRuntimeIframeDocument(
  context: PluginRuntimeBootstrapContext,
  runtimeContext: PluginRuntimeContextSnapshot,
  entrySource: string,
): string {
  const serializedContext = serializeInlineScriptValue(context);
  const serializedRuntimeContext = serializeInlineScriptValue(runtimeContext);
  const serializedEntrySource = serializeInlineScriptValue(entrySource);

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; frame-src http: https: about: blob: data:; img-src http: https: data: blob: wstudio-extension: local-file: local-media:; media-src http: https: data: blob: wstudio-extension: local-file: local-media:; style-src 'unsafe-inline'; script-src 'unsafe-inline' wstudio-extension: local-file: data: blob:; font-src data: wstudio-extension: local-file:;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>plugin-runtime-surface</title>
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
      const PROTOCOL_KEY = ${JSON.stringify(IFRAME_RUNTIME_PROTOCOL_KEY)};
      const context = ${serializedContext};
      let currentRuntimeContext = ${serializedRuntimeContext};
      const ENTRY_SOURCE = ${serializedEntrySource};
      const root = document.getElementById('plugin-surface-root');

      if (!(root instanceof HTMLElement)) {
        throw new Error('Plugin runtime iframe root is missing.');
      }

      let bootstrapStarted = false;
      let rendered = false;
      let bootstrapFailed = false;
      let cleanupHandler = null;
      let cleanupInvoked = false;
      let nextRequestId = 0;
      const pendingRequests = new Map();
      const surfaceStateListeners = new Set();
      const themeListeners = new Set();
      const NON_RENDERABLE_TAGS = new Set(['SCRIPT', 'STYLE']);
      const INTRINSIC_RENDERABLE_TAGS = new Set([
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

      function toRenderableNodes(nodes) {
        return nodes === null || nodes === undefined ? [] : Array.from(nodes);
      }

      function normalizeRenderableTagName(tagName) {
        return typeof tagName === 'string' ? tagName.trim().toUpperCase() : '';
      }

      function nodeHasRenderableContent(node) {
        if (node.nodeType === 3) {
          return (node.textContent ?? '').trim().length > 0;
        }

        if (node.nodeType !== 1) {
          return false;
        }

        const tagName = normalizeRenderableTagName(node.tagName);

        if (NON_RENDERABLE_TAGS.has(tagName)) {
          return false;
        }

        if (INTRINSIC_RENDERABLE_TAGS.has(tagName) || tagName.includes('-')) {
          return true;
        }

        if ((node.textContent ?? '').trim().length > 0) {
          return true;
        }

        return toRenderableNodes(node.childNodes).some((childNode) => nodeHasRenderableContent(childNode));
      }

      function shouldReportRendered() {
        if (rendered || bootstrapFailed) {
          return false;
        }

        const rootHasContent = toRenderableNodes(root.childNodes).some((childNode) => nodeHasRenderableContent(childNode));
        const bodyHasExtraContent = toRenderableNodes(document.body.childNodes)
          .filter((childNode) => childNode !== root)
          .some((childNode) => nodeHasRenderableContent(childNode));

        return rootHasContent || bodyHasExtraContent;
      }

      function postToHost(message) {
        window.parent.postMessage({
          [PROTOCOL_KEY]: true,
          surfaceInstanceId: context.surfaceInstanceId,
          ...message,
        }, '*');
      }

      function reportStatus(status, error = null) {
        postToHost({
          type: 'status',
          status,
          error,
        });
      }

      function invokeHost(method, payload) {
        return new Promise((resolve, reject) => {
          nextRequestId += 1;
          const requestId = String(nextRequestId);
          pendingRequests.set(requestId, {
            resolve,
            reject,
          });
          postToHost({
            type: 'host-request',
            requestId,
            method,
            payload,
          });
        });
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

      function buildRuntimeSurface() {
        return {
          pluginId: context.pluginId,
          surfaceKind: context.surfaceKind,
          surfaceId: context.surfaceId,
          entryUrl: context.entryUrl,
          state: currentRuntimeContext?.state ?? null,
        };
      }

      function notifySurfaceStateListeners() {
        for (const listener of surfaceStateListeners) {
          try {
            listener(buildRuntimeSurface().state);
          } catch (error) {
            console.error('[plugin-runtime-iframe] surface state listener failed', error);
          }
        }
      }

      function notifyThemeListeners() {
        const snapshot = normalizeThemeSnapshot(currentRuntimeContext?.theme ?? null);

        for (const listener of themeListeners) {
          try {
            listener(snapshot);
          } catch (error) {
            console.error('[plugin-runtime-iframe] theme listener failed', error);
          }
        }
      }

      function applyRuntimeContext(nextRuntimeContext) {
        if (nextRuntimeContext === null || typeof nextRuntimeContext !== 'object') {
          return;
        }

        currentRuntimeContext = nextRuntimeContext;
        notifySurfaceStateListeners();
        notifyThemeListeners();
        startBootstrap();
      }

      function commitRendered() {
        if (rendered || bootstrapFailed) {
          return;
        }

        rendered = true;
        reportStatus('rendered');
      }

      function detectRendered() {
        if (!shouldReportRendered()) {
          return;
        }

        commitRendered();
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
          console.error('[plugin-runtime-iframe] cleanup failed', error);
        }
      }

      async function importRuntimeModule() {
        const runtimeReadyEventName = '__wstudio_plugin_runtime_iframe_ready__:' + context.surfaceInstanceId;
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
            finalizeReject(new Error('Plugin runtime iframe inline module script failed to execute.'));
          };

          const handleWindowError = (event) => {
            event.preventDefault();
            finalizeReject(event.error ?? new Error(event.message || 'Plugin runtime iframe inline module failed.'));
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
          runtimeScript.textContent = ENTRY_SOURCE + '\\n'
            + 'const __wstudioPluginSurfaceEntrypoint = typeof mountPluginSurface === "function" ? mountPluginSurface : (typeof mount === "function" ? mount : null);\\n'
            + 'window["' + runtimeEntryGlobalKey + '"] = __wstudioPluginSurfaceEntrypoint === null ? null : { mountPluginSurface: __wstudioPluginSurfaceEntrypoint };\\n'
            + 'window.dispatchEvent(new Event("' + runtimeReadyEventName + '"));\\n'
            + '//# sourceURL=' + context.entryUrl;
          document.body.append(runtimeScript);
        });
      }

      const runtimeBridge = {
        get surface() {
          return buildRuntimeSurface();
        },
        root,
        host: {
          showNotice: (payload) => invokeHost('show-notice', payload).then(() => undefined),
          executeCommand: (commandId, args = []) => invokeHost('execute-command', { commandId, args }),
          activateView: () => invokeHost('activate-view', null).then(() => undefined),
          closeView: () => invokeHost('close-view', null).then(() => undefined),
          closeOverlay: () => invokeHost('close-overlay', null).then(() => undefined),
          showOpenDialog: (options) => invokeHost('file-show-open-dialog', options),
          logic: {
            invoke: (actionId, payload = null) => invokeHost('invoke-logic-action', { actionId, payload }),
          },
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
          getSnapshot: () => normalizeThemeSnapshot(currentRuntimeContext?.theme ?? null),
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

      window.addEventListener('message', (event) => {
        const message = event.data;

        if (
          message === null
          || typeof message !== 'object'
          || message[PROTOCOL_KEY] !== true
          || message.surfaceInstanceId !== context.surfaceInstanceId
        ) {
          return;
        }

        if (message.type === 'runtime-context') {
          applyRuntimeContext(message.context ?? null);
          return;
        }

        if (message.type === 'host-response' || message.type === 'host-response-error') {
          const requestId = typeof message.requestId === 'string' ? message.requestId : '';
          const pendingRequest = pendingRequests.get(requestId);

          if (pendingRequest === undefined) {
            return;
          }

          pendingRequests.delete(requestId);

          if (message.type === 'host-response-error') {
            pendingRequest.reject(new Error(typeof message.error === 'string' ? message.error : 'Plugin runtime iframe host request failed.'));
            return;
          }

          pendingRequest.resolve(message.result ?? null);
        }
      });

      const observer = new MutationObserver(() => {
        detectRendered();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      Object.defineProperty(window, '__WSTUDIO_PLUGIN_RUNTIME_SURFACE__', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: runtimeBridge,
      });

      applyRuntimeContext(currentRuntimeContext);
      window.addEventListener('pagehide', invokeCleanup);
      window.addEventListener('beforeunload', invokeCleanup);
      detectRendered();
    </script>
  </body>
</html>`;
}

function buildRuntimeContextSnapshot(
  surfaceInstanceId: string,
  runtimeSurface: PluginUiRuntimeSurfaceDescriptor,
): PluginRuntimeContextSnapshot {
  return {
    surfaceInstanceId,
    state: runtimeSurface.state,
    theme: capturePluginRuntimeThemeSnapshot(),
  };
}

function createOutgoingEnvelope(
  surfaceInstanceId: string,
): PluginRuntimeIframeEnvelope {
  return {
    [IFRAME_RUNTIME_PROTOCOL_KEY]: true,
    surfaceInstanceId,
  };
}

function isIframeEnvelope(
  value: PluginRuntimeIframeMessageData,
  expectedSurfaceInstanceId: string,
): value is Record<string, JsonValue> {
  if (!isJsonRecord(value)) {
    return false;
  }

  return value[IFRAME_RUNTIME_PROTOCOL_KEY] === true
    && typeof value.surfaceInstanceId === 'string'
    && value.surfaceInstanceId === expectedSurfaceInstanceId
    && typeof value.type === 'string';
}

function isHostRequestMethod(value: string): value is PluginRuntimeHostRequestMethod {
  return value === 'show-notice'
    || value === 'execute-command'
    || value === 'activate-view'
    || value === 'close-view'
    || value === 'close-overlay'
    || value === 'file-show-open-dialog'
    || value === 'dispatch-overlay-action'
    || value === 'open-workspace-file'
    || value === 'editor-get-state'
    || value === 'editor-apply-text-edits'
    || value === 'editor-perform-action'
    || value === 'invoke-logic-action'
    || value === 'data-load'
    || value === 'data-save'
    || value === 'data-delete'
    || value === 'settings-get-tabs';
}

function isHostRequestMessage(
  value: PluginRuntimeIframeMessageData,
  expectedSurfaceInstanceId: string,
): value is PluginRuntimeIframeHostRequestMessage {
  if (!isIframeEnvelope(value, expectedSurfaceInstanceId)) {
    return false;
  }

  return value.type === 'host-request'
    && typeof value.requestId === 'string'
    && typeof value.method === 'string'
    && isHostRequestMethod(value.method)
    && 'payload' in value;
}

function isStatusMessage(
  value: PluginRuntimeIframeMessageData,
  expectedSurfaceInstanceId: string,
): value is PluginRuntimeIframeStatusMessage {
  if (!isIframeEnvelope(value, expectedSurfaceInstanceId)) {
    return false;
  }

  return value.type === 'status'
    && (value.status === 'module-loaded' || value.status === 'rendered' || value.status === 'module-error')
    && (value.error === null || typeof value.error === 'string');
}

function requireElectronIpc(): NonNullable<typeof window.electron>['ipcRenderer'] {
  const ipcRenderer = window.electron?.ipcRenderer;

  if (ipcRenderer === undefined) {
    throw new Error('Electron IPC bridge is unavailable in the renderer.');
  }

  return ipcRenderer;
}

async function resolveHostRequest(
  request: PluginRuntimeIframeHostRequestMessage,
  runtimeSurface: PluginUiRuntimeSurfaceDescriptor,
  leafId: string | null,
  overlayId: string | null,
): Promise<PluginRuntimeIframeSerializableResult> {
  const ipcRenderer = requireElectronIpc();

  if (request.method === 'show-notice') {
    if (!isJsonRecord(request.payload)) {
      throw new Error('Plugin runtime notice payload is required.');
    }

    await ipcRenderer.invoke(PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL, request.payload);
    return null;
  }

  if (request.method === 'execute-command') {
    if (!isJsonRecord(request.payload) || typeof request.payload.commandId !== 'string') {
      throw new Error('Plugin runtime command payload is required.');
    }

    const response = await ipcRenderer.invoke(WORKBENCH_EXECUTE_COMMAND_CHANNEL, {
      commandId: request.payload.commandId,
      args: Array.isArray(request.payload.args) ? request.payload.args : [],
    }) as {
      readonly success: boolean;
      readonly data?: JsonValue | null;
      readonly error?: {
        readonly message?: string;
      };
    };

    if (!response.success) {
      throw new Error(response.error?.message ?? '执行插件命令失败');
    }

    return response.data ?? null;
  }

  if (request.method === 'activate-view') {
    if (leafId === null) {
      throw new Error('Plugin runtime surface is not attached to a workspace leaf.');
    }

    await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL, {
      leafId,
    });
    return null;
  }

  if (request.method === 'close-view') {
    if (leafId === null) {
      throw new Error('Plugin runtime surface is not attached to a workspace leaf.');
    }

    await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL, {
      leafId,
    });
    return null;
  }

  if (request.method === 'close-overlay') {
    if (overlayId === null) {
      throw new Error('Plugin runtime surface is not attached to an overlay.');
    }

    await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL, {
      overlayId,
    });
    return null;
  }

  if (request.method === 'file-show-open-dialog') {
    return await window.electron?.file?.showOpenDialog({
      title: isJsonRecord(request.payload) && typeof request.payload.title === 'string'
        ? request.payload.title
        : undefined,
      defaultPath: isJsonRecord(request.payload) && typeof request.payload.defaultPath === 'string'
        ? request.payload.defaultPath
        : undefined,
      filters: isJsonRecord(request.payload) && Array.isArray(request.payload.filters)
        ? request.payload.filters.flatMap((item) => {
            if (
              !isJsonRecord(item)
              || typeof item.name !== 'string'
              || !Array.isArray(item.extensions)
            ) {
              return [];
            }

            const extensions = item.extensions.filter((entry): entry is string => typeof entry === 'string');
            return [{
              name: item.name,
              extensions,
            }];
          })
        : undefined,
      properties: isJsonRecord(request.payload) && Array.isArray(request.payload.properties)
        ? request.payload.properties.filter((entry): entry is 'openFile' | 'openDirectory' | 'multiSelections' => {
            return entry === 'openFile' || entry === 'openDirectory' || entry === 'multiSelections';
          })
        : undefined,
    }) ?? {
      canceled: true,
      filePaths: [],
    };
  }

  if (request.method === 'dispatch-overlay-action') {
    if (overlayId === null) {
      throw new Error('Plugin runtime surface is not attached to an overlay.');
    }

    await ipcRenderer.invoke(PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL, {
      overlayId,
      action: request.payload,
    });
    return null;
  }

  if (request.method === 'open-workspace-file') {
    if (!isJsonRecord(request.payload) || typeof request.payload.path !== 'string') {
      throw new Error('Plugin runtime workspace file path is required.');
    }

    return await ipcRenderer.invoke(
      PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL,
      request.payload.path,
      isJsonRecord(request.payload.options) ? {
        forceNewLeaf: request.payload.options.forceNewLeaf === true,
      } : undefined,
    ) as JsonValue;
  }

  if (request.method === 'editor-get-state') {
    return await ipcRenderer.invoke(
      PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL,
      isJsonRecord(request.payload) ? request.payload : { documentUri: null },
    ) as PluginUiRuntimeEditorStateSnapshot | null;
  }

  if (request.method === 'editor-apply-text-edits') {
    if (!isJsonRecord(request.payload)) {
      throw new Error('Plugin runtime editor edit payload is required.');
    }

    await ipcRenderer.invoke(
      PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL,
      request.payload,
    );
    return null;
  }

  if (request.method === 'editor-perform-action') {
    if (!isJsonRecord(request.payload)) {
      throw new Error('Plugin runtime editor action payload is required.');
    }

    await ipcRenderer.invoke(
      PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL,
      {
        request: request.payload,
      },
    );
    return null;
  }

  if (request.method === 'invoke-logic-action') {
    if (!isJsonRecord(request.payload) || typeof request.payload.actionId !== 'string') {
      throw new Error('Plugin runtime logic action payload is required.');
    }

    return await ipcRenderer.invoke(
      PLUGIN_RUNTIME_INVOKE_LOGIC_ACTION_CHANNEL,
      {
        pluginId: runtimeSurface.pluginId,
        actionId: request.payload.actionId,
        payload: request.payload.payload ?? null,
      },
    ) as JsonValue | null;
  }

  if (request.method === 'data-load') {
    return await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_LOAD_CHANNEL, {
      pluginId: runtimeSurface.pluginId,
    }) as JsonValue | null;
  }

  if (request.method === 'data-save') {
    await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_SAVE_CHANNEL, {
      pluginId: runtimeSurface.pluginId,
      data: isJsonRecord(request.payload) && 'data' in request.payload
        ? request.payload.data ?? null
        : null,
    });
    return null;
  }

  if (request.method === 'data-delete') {
    await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_DELETE_CHANNEL, {
      pluginId: runtimeSurface.pluginId,
    });
    return null;
  }

  return await ipcRenderer.invoke(PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL, {
    pluginId: runtimeSurface.pluginId,
  }) as readonly PluginUiRuntimeSettingTabSummary[];
}

export function usePluginRuntimeIframeSurface(
  options: UsePluginRuntimeIframeSurfaceOptions,
): UsePluginRuntimeIframeSurfaceResult {
  const {
    surfaceInstanceId,
    runtimeSurface,
    leafId = null,
    overlayId = null,
    onRuntimeActive = null,
  } = options;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const runtimeActivationReportedRef = React.useRef(false);
  const [srcDoc, setSrcDoc] = React.useState<string | undefined>(undefined);
  const [entrypointStatus, setEntrypointStatus] = React.useState<PluginRuntimeIframeEntrypointStatus>('idle');
  const [entrypointError, setEntrypointError] = React.useState<string | null>(null);
  const surfaceIdentity = React.useMemo(() => {
    if (runtimeSurface === null) {
      return null;
    }

    return [
      surfaceInstanceId,
      runtimeSurface.pluginId,
      runtimeSurface.surfaceKind,
      runtimeSurface.surfaceId,
      runtimeSurface.entryUrl,
    ].join('|');
  }, [runtimeSurface, surfaceInstanceId]);

  React.useEffect(() => {
    runtimeActivationReportedRef.current = false;
    setSrcDoc(undefined);
    setEntrypointStatus('idle');
    setEntrypointError(null);
  }, [surfaceIdentity]);

  React.useEffect(() => {
    if (runtimeSurface === null) {
      return undefined;
    }

    let cancelled = false;
    const ipcRenderer = window.electron?.ipcRenderer;

    if (ipcRenderer === undefined) {
      setEntrypointStatus('module-error');
      setEntrypointError('Electron IPC bridge is unavailable in the renderer.');
      return undefined;
    }

    void ipcRenderer.invoke(PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL, runtimeSurface)
      .then((entrySource: string | null | undefined) => {
        if (cancelled) {
          return;
        }

        if (typeof entrySource !== 'string' || entrySource.trim().length === 0) {
          setEntrypointStatus('module-error');
          setEntrypointError('插件 UI runtime 入口源码不可用。');
          return;
        }

        setSrcDoc(buildPluginRuntimeIframeDocument({
          surfaceInstanceId,
          pluginId: runtimeSurface.pluginId,
          surfaceKind: runtimeSurface.surfaceKind,
          surfaceId: runtimeSurface.surfaceId,
          entryUrl: runtimeSurface.entryUrl,
          leafId,
          overlayId,
        }, buildRuntimeContextSnapshot(surfaceInstanceId, runtimeSurface), entrySource));
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }

        setEntrypointStatus('module-error');
        setEntrypointError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [leafId, overlayId, runtimeSurface, surfaceInstanceId]);

  React.useEffect(() => {
    if (runtimeSurface === null) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent<PluginRuntimeIframeMessageData>): void => {
      const iframeWindow = iframeRef.current?.contentWindow;

      if ((iframeWindow === null || iframeWindow === undefined) || event.source !== iframeWindow) {
        return;
      }

      if (isStatusMessage(event.data, surfaceInstanceId)) {
        setEntrypointStatus(event.data.status);
        setEntrypointError(event.data.error);

        if (
          onRuntimeActive !== null
          && !runtimeActivationReportedRef.current
          && (event.data.status === 'module-loaded' || event.data.status === 'rendered')
        ) {
          runtimeActivationReportedRef.current = true;
          onRuntimeActive();
        }

        return;
      }

      if (!isHostRequestMessage(event.data, surfaceInstanceId)) {
        return;
      }

      const hostRequest = event.data;

      void resolveHostRequest(hostRequest, runtimeSurface, leafId, overlayId)
        .then((result) => {
          iframeWindow.postMessage({
            ...createOutgoingEnvelope(surfaceInstanceId),
            type: 'host-response',
            requestId: hostRequest.requestId,
            result,
          } satisfies PluginRuntimeIframeHostResponseMessage, '*');
        })
        .catch((error: Error) => {
          iframeWindow.postMessage({
            ...createOutgoingEnvelope(surfaceInstanceId),
            type: 'host-response-error',
            requestId: hostRequest.requestId,
            error: error.message,
          } satisfies PluginRuntimeIframeHostResponseErrorMessage, '*');
        });
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [leafId, onRuntimeActive, overlayId, runtimeSurface, surfaceInstanceId]);

  React.useEffect(() => {
    if (runtimeSurface === null) {
      return undefined;
    }

    const pushRuntimeContext = (): void => {
      const iframeWindow = iframeRef.current?.contentWindow;

      if (iframeWindow === null || iframeWindow === undefined) {
        return;
      }

      iframeWindow.postMessage({
        ...createOutgoingEnvelope(surfaceInstanceId),
        type: 'runtime-context',
        context: buildRuntimeContextSnapshot(surfaceInstanceId, runtimeSurface),
      } satisfies PluginRuntimeIframeContextMessage, '*');
    };

    pushRuntimeContext();

    const observer = new MutationObserver(() => {
      pushRuntimeContext();
    });
    const observerOptions: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    };

    observer.observe(document.documentElement, observerOptions);

    if (document.body !== null) {
      observer.observe(document.body, observerOptions);
    }

    return () => {
      observer.disconnect();
    };
  }, [runtimeSurface, surfaceInstanceId, runtimeSurface?.state]);

  React.useEffect(() => {
    if (overlayId === null || entrypointStatus !== 'rendered') {
      return;
    }

    const ipcRenderer = window.electron?.ipcRenderer;

    if (ipcRenderer === undefined) {
      return;
    }

    void ipcRenderer.invoke(PLUGIN_RUNTIME_MARK_OVERLAY_RUNTIME_ACTIVE_CHANNEL, {
      overlayId,
    });
  }, [entrypointStatus, overlayId]);

  return {
    iframeRef,
    srcDoc,
    entrypointStatus,
    entrypointError,
  };
}
