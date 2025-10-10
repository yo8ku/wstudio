/**
 * Webview 预加载脚本
 */

import { apiBridge } from './api-bridge';

// 将 API 注入到 webview 上下文
(window as any).vscode = apiBridge;



