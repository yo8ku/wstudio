/**
 * API 工厂 - 为扩展创建原生 API 实例
 */

import * as nativeApi from '../types/native-api';

export class APIFactory {
  createNativeAPI(extensionId: string) {
    return nativeApi;
  }
}



