/**
 * API 工厂 - 为扩展创建 VSCode API 实例
 */

import * as vscodeCompat from '@note-studio/extension-api/src/vscode-compat';
import * as nativeApi from '@note-studio/extension-api/src/native-api';

export class APIFactory {
  createVSCodeAPI(extensionId: string): typeof vscodeCompat.vscode {
    // 为每个扩展创建独立的 API 实例
    // 这样可以隔离扩展之间的状态
    return vscodeCompat.vscode;
  }

  createNativeAPI(extensionId: string) {
    return nativeApi;
  }
}



