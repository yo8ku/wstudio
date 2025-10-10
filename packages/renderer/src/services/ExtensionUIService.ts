/**
 * 扩展 UI 服务
 */

export class ExtensionUIService {
  registerView(viewId: string, provider: any): void {
    console.log('[ExtensionUIService] 注册视图:', viewId);
  }

  showView(viewId: string): void {
    console.log('[ExtensionUIService] 显示视图:', viewId);
  }

  hideView(viewId: string): void {
    console.log('[ExtensionUIService] 隐藏视图:', viewId);
  }
}



