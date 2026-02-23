/**
 * Agent 网络 IPC 处理器
 * 功能：为 Agent 提供 HTTP 请求能力
 * 描述：通过 Electron net 模块发起请求，支持 HTML 正文提取和内容截断
 */

import { ipcMain, net } from 'electron';

/** 网络请求结果 */
interface NetworkFetchResult {
  success: boolean;
  data?: {
    content: string;
    contentType: string;
    statusCode: number;
    url: string;
  };
  error?: string;
}

/** 请求选项 */
interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/** 最大响应大小（100KB） */
const MAX_RESPONSE_SIZE = 100 * 1024;

/** 默认超时（15秒） */
const DEFAULT_TIMEOUT = 15000;

/**
 * 从 HTML 中提取正文文本
 */
function extractTextFromHTML(html: string): string {
  let text = html;
  // 移除 script 和 style 标签及内容
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // 移除 HTML 注释
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // 将块级标签替换为换行
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // 移除所有剩余标签
  text = text.replace(/<[^>]+>/g, '');
  // 解码常见 HTML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // 清理多余空白
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  return text.trim();
}

/**
 * 注册 Agent 网络 IPC 处理器
 */
export function registerAgentNetworkHandlers(): void {
  // 移除可能存在的旧处理器
  try {
    ipcMain.removeHandler('agent:network:fetch');
  } catch {
    // 忽略未注册的处理器
  }

  ipcMain.handle(
    'agent:network:fetch',
    async (
      _event: Electron.IpcMainInvokeEvent,
      url: string,
      options?: FetchOptions
    ): Promise<NetworkFetchResult> => {
      try {
        // URL 验证
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return { success: false, error: 'URL 必须以 http:// 或 https:// 开头' };
        }

        const method = options?.method ?? 'GET';
        const timeout = Math.min(options?.timeout ?? DEFAULT_TIMEOUT, 30000);

        console.log('[AgentNetwork] 请求:', method, url);

        // 使用 AbortController 实现超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await net.fetch(url, {
            method,
            signal: controller.signal,
            headers: options?.headers,
          });

          clearTimeout(timeoutId);

          const contentType = response.headers.get('content-type') ?? '';
          const statusCode = response.status;

          // 读取响应体
          const buffer = await response.arrayBuffer();
          let content = new TextDecoder('utf-8').decode(buffer);

          // 如果是 HTML，提取正文
          if (contentType.includes('text/html')) {
            content = extractTextFromHTML(content);
          }

          // 截断过长内容
          if (content.length > MAX_RESPONSE_SIZE) {
            content = content.substring(0, MAX_RESPONSE_SIZE) + '\n\n[内容已截断]';
          }

          console.log('[AgentNetwork] 请求成功:', url, `状态码: ${statusCode}, 内容长度: ${content.length}`);

          return {
            success: true,
            data: { content, contentType, statusCode, url },
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return { success: false, error: `请求超时 (${timeout}ms)` };
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('[AgentNetwork] 请求失败:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  console.log('[AgentNetwork] Agent 网络 IPC 处理器已注册');
}
