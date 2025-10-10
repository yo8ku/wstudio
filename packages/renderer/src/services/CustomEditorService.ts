/**
 * 自定义编辑器服务
 */

export class CustomEditorService {
  private editors: Map<string, any> = new Map();

  registerCustomEditor(viewType: string, provider: any): void {
    console.log('[CustomEditorService] 注册自定义编辑器:', viewType);
    this.editors.set(viewType, provider);
  }

  openCustomEditor(viewType: string, resource: string): void {
    console.log('[CustomEditorService] 打开自定义编辑器:', viewType, resource);
  }
}



