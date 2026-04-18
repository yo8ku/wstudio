/**
 * AI 网络代理 IPC 处理器
 * 功能：在主进程中代理 AI HTTP 请求，避免渲染进程受到浏览器 CORS 限制。
 */

import { app, ipcMain, net, type WebContents } from 'electron';

const AI_FETCH_TIMEOUT_MS = 30000;

interface AIProxyRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface AIProxyFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface AIProxyStreamRequest {
  requestId: string;
  url: string;
  options?: AIProxyRequestOptions;
}

interface AIProxyStreamChunkPayload {
  requestId: string;
  chunk: string;
}

interface AIProxyStreamErrorPayload {
  requestId: string;
  error: string;
}

interface AIProxyStreamStatePayload {
  requestId: string;
}

let isRegistered = false;
const activeStreamControllers = new Map<string, AbortController>();

async function ensureAppReady(): Promise<void> {
  if (!app.isReady()) {
    await app.whenReady();
  }
}

function assertHttpUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AI proxy only supports http and https URLs');
  }
}

function buildFetchOptions(
  options: AIProxyRequestOptions | undefined,
  signal?: AbortSignal,
): {
  method: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
} {
  return {
    method: options?.method ?? 'GET',
    headers: options?.headers,
    body: options?.body,
    signal,
  };
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    record[key] = value;
  });
  return record;
}

function normalizeErrorMessage(error: Error | string): string {
  return typeof error === 'string' ? error : error.message;
}

function sendStreamChunk(target: WebContents, payload: AIProxyStreamChunkPayload): void {
  target.send('ai:stream-chunk', payload);
}

function sendStreamComplete(target: WebContents, payload: AIProxyStreamStatePayload): void {
  target.send('ai:stream-complete', payload);
}

function sendStreamAborted(target: WebContents, payload: AIProxyStreamStatePayload): void {
  target.send('ai:stream-aborted', payload);
}

function sendStreamError(target: WebContents, payload: AIProxyStreamErrorPayload): void {
  target.send('ai:stream-error', payload);
}

async function proxyBufferedFetch(
  url: string,
  options?: AIProxyRequestOptions,
): Promise<AIProxyFetchResponse> {
  await ensureAppReady();
  assertHttpUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

  try {
    const response = await net.fetch(url, buildFetchOptions(options, controller.signal));
    const body = await response.text();

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headersToRecord(response.headers),
      body,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function pumpProxyStream(
  target: WebContents,
  requestId: string,
  url: string,
  options?: AIProxyRequestOptions,
): Promise<void> {
  await ensureAppReady();
  assertHttpUrl(url);

  const controller = new AbortController();
  activeStreamControllers.set(requestId, controller);

  try {
    const response = await net.fetch(url, buildFetchOptions(options, controller.signal));
    if (!response.ok) {
      const errorBody = await response.text();
      const fallbackError = `HTTP ${response.status}: ${response.statusText}`;
      sendStreamError(target, {
        requestId,
        error: errorBody || fallbackError,
      });
      return;
    }

    if (!response.body) {
      sendStreamError(target, {
        requestId,
        error: 'Response body is empty',
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          sendStreamChunk(target, { requestId, chunk });
        }
      }

      const tail = decoder.decode();
      if (tail) {
        sendStreamChunk(target, { requestId, chunk: tail });
      }
    } finally {
      reader.releaseLock();
    }

    sendStreamComplete(target, { requestId });
  } catch (error) {
    if (controller.signal.aborted) {
      sendStreamAborted(target, { requestId });
      return;
    }

    sendStreamError(target, {
      requestId,
      error: normalizeErrorMessage(error instanceof Error ? error : 'AI stream request failed'),
    });
  } finally {
    activeStreamControllers.delete(requestId);
  }
}

export function registerAIProxyHandlers(): void {
  if (isRegistered) {
    return;
  }

  const handlersToRemove = [
    'ai:fetch',
    'ai:stream-start',
    'ai:stream-abort',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // Ignore handlers that were not registered before.
    }
  }

  isRegistered = true;

  ipcMain.handle(
    'ai:fetch',
    async (_event, url: string, options?: AIProxyRequestOptions): Promise<AIProxyFetchResponse> => {
      return proxyBufferedFetch(url, options);
    },
  );

  ipcMain.handle(
    'ai:stream-start',
    async (event, request: AIProxyStreamRequest): Promise<{ started: boolean }> => {
      if (activeStreamControllers.has(request.requestId)) {
        throw new Error(`Duplicate AI stream request: ${request.requestId}`);
      }

      void pumpProxyStream(event.sender, request.requestId, request.url, request.options);
      return { started: true };
    },
  );

  ipcMain.handle(
    'ai:stream-abort',
    async (_event, requestId: string): Promise<{ aborted: boolean }> => {
      const controller = activeStreamControllers.get(requestId);
      if (!controller) {
        return { aborted: false };
      }

      controller.abort();
      return { aborted: true };
    },
  );

  console.log('[AIProxy IPC] AI network proxy handlers registered');
}
