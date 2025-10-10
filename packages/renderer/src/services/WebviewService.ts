/**
 * Webview 服务
 */

export class WebviewService {
  private webviews: Map<string, any> = new Map();

  createWebview(id: string, options: any): void {
    console.log('[WebviewService] 创建 Webview:', id);
    this.webviews.set(id, options);
  }

  postMessage(id: string, message: any): void {
    console.log('[WebviewService] 发送消息到 Webview:', id, message);
  }

  dispose(id: string): void {
    this.webviews.delete(id);
  }
}



