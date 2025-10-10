import * as vscode from './vscode-compat/vscode';
import * as nativeApi from './native-api';

/**
 * 统一的扩展 API 导出
 */
export { vscode, nativeApi };

/**
 * 创建扩展 API 实例
 */
export function createExtensionAPI() {
  return {
    vscode,
    native: nativeApi
  };
}



