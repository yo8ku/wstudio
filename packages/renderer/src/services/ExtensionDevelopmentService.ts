/**
 * 插件开发调试服务。
 */

import type {
  ExtensionDevelopmentReloadResponse,
  ExtensionDevelopmentReloadResult,
} from '@note-studio/shared';

class ExtensionDevelopmentService {
  public async reloadPlugins(): Promise<ExtensionDevelopmentReloadResult> {
    const response: ExtensionDevelopmentReloadResponse | undefined =
      await window.electron?.ipcRenderer.invoke('extensions:development:reload-plugins');

    if (!response) {
      throw new Error('重新加载插件时没有收到宿主响应');
    }

    if (!response.success || !response.data) {
      throw new Error(response.error?.message ?? '重新加载插件失败');
    }

    return response.data;
  }
}

export const extensionDevelopmentService = new ExtensionDevelopmentService();
