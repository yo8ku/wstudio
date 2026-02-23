/**
 * URL 内容获取工具
 * 功能：获取指定 URL 的网页或 API 内容
 * 描述：通过主进程发起 HTTP 请求，HTML 内容自动转换为纯文本
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, WebFetchToolConfig } from '../base/types';

/** Fetch 结果 */
interface FetchResult {
  content: string;
  contentType: string;
  statusCode: number;
  url: string;
}

/** 默认超时（15秒） */
const DEFAULT_TIMEOUT = 15000;

/** 默认最大响应大小（100KB） */
const DEFAULT_MAX_RESPONSE_SIZE = 100 * 1024;

export class WebFetchTool extends BaseTool<WebFetchToolConfig> {
  readonly name = 'web_fetch';

  readonly description = '获取指定 URL 的内容。支持网页和 API 请求。HTML 内容会自动提取正文文本。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要获取的 URL（必须以 http:// 或 https:// 开头）',
      },
      method: {
        type: 'string',
        description: 'HTTP 方法，默认 GET',
        enum: ['GET', 'POST'],
        default: 'GET',
      },
    },
    required: ['url'],
  };

  readonly metadata: ToolMetadata = {
    category: 'network',
    requiresConfirmation: false,
    readOnly: true,
    priority: 50,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { url, method = 'GET' } = params as {
      url: string;
      method?: string;
    };

    // URL 格式验证
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return this.failure('URL 必须以 http:// 或 https:// 开头');
    }

    // 域名白名单检查
    if (this.config.allowedDomains && this.config.allowedDomains.length > 0) {
      try {
        const urlObj = new URL(url);
        if (!this.config.allowedDomains.includes(urlObj.hostname)) {
          return this.failure(`域名 ${urlObj.hostname} 不在允许列表中`);
        }
      } catch {
        return this.failure('URL 格式无效');
      }
    }

    const timeout = this.config.timeout ?? DEFAULT_TIMEOUT;

    const result = await this.invokeIPC<FetchResult>(
      'agent:network:fetch',
      url,
      { method, timeout }
    );

    if (!result.success) {
      return this.failure(result.error ?? '获取 URL 内容失败');
    }

    return this.success({
      url: result.data?.url ?? url,
      content: result.data?.content ?? '',
      contentType: result.data?.contentType ?? '',
      statusCode: result.data?.statusCode ?? 0,
    });
  }
}
