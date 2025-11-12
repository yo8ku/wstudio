/**
 * PythonBridge IPC 处理器
 * 功能：在主进程中处理 PythonBridge 相关请求，供渲染进程调用
 */

import { ipcMain } from 'electron';

// 使用动态导入来导入 ES 模块
type PythonBridgeType = typeof import('@note-studio/knowledge-base')['PythonBridge'];
type PythonServiceRequestType = import('@note-studio/knowledge-base').PythonServiceRequest;
type PythonServiceResponseType = import('@note-studio/knowledge-base').PythonServiceResponse;

// 单例 PythonBridge 实例
let pythonBridge: InstanceType<PythonBridgeType> | null = null;

// 缓存的 PythonBridge 类
let PythonBridgeClass: PythonBridgeType | null = null;

// 防止重复注册的标志
let isRegistered = false;

/**
 * 动态加载 PythonBridge 模块
 * 使用 Function 构造函数来确保使用真正的动态 import()，避免 TypeScript 编译为 require()
 */
async function loadPythonBridgeModule(): Promise<PythonBridgeType> {
  if (!PythonBridgeClass) {
    // 使用 Function 构造函数来创建动态导入，避免 TypeScript 编译为 require()
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const module = await dynamicImport('@note-studio/knowledge-base');
    PythonBridgeClass = module.PythonBridge;
  }
  return PythonBridgeClass;
}

/**
 * 获取或创建 PythonBridge 实例
 */
async function getPythonBridge(): Promise<InstanceType<PythonBridgeType>> {
  if (!pythonBridge) {
    const PythonBridge = await loadPythonBridgeModule();
    pythonBridge = new PythonBridge();
  }
  return pythonBridge;
}

/**
 * 注册 PythonBridge 相关的 IPC 处理器
 */
export function registerPythonBridgeHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    console.log('[PythonBridge IPC] IPC 处理器已注册，跳过重复注册');
    return;
  }

  console.log('[PythonBridge IPC] 开始注册 IPC 处理器...');

  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'python-bridge:start',
    'python-bridge:stop',
    'python-bridge:request',
    'python-bridge:is-ready'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  console.log('[PythonBridge IPC] 已清理旧的 IPC 处理器');
  isRegistered = true;

  // 启动 Python 服务
  ipcMain.handle('python-bridge:start', async () => {
    try {
      const bridge = await getPythonBridge();
      await bridge.start();
      console.log('[PythonBridge IPC] Python 服务已启动');
      return { success: true };
    } catch (error) {
      console.error('[PythonBridge IPC] 启动 Python 服务失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 停止 Python 服务
  ipcMain.handle('python-bridge:stop', async () => {
    try {
      if (pythonBridge) {
        await pythonBridge.stop();
        pythonBridge = null;
        console.log('[PythonBridge IPC] Python 服务已停止');
      }
      return { success: true };
    } catch (error) {
      console.error('[PythonBridge IPC] 停止 Python 服务失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 发送请求到 Python 服务
  ipcMain.handle('python-bridge:request', async (_event, request: PythonServiceRequestType) => {
    try {
      const bridge = await getPythonBridge();
      if (!bridge.isServiceReady()) {
        await bridge.start();
      }
      const response = await bridge.request(request);
      return response;
    } catch (error) {
      console.error('[PythonBridge IPC] 请求失败:', error);
      const errorResponse: PythonServiceResponseType = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      return errorResponse;
    }
  });

  // 检查服务是否就绪
  ipcMain.handle('python-bridge:is-ready', async () => {
    try {
      const bridge = await getPythonBridge();
      return { success: true, isReady: bridge.isServiceReady() };
    } catch (error) {
      console.error('[PythonBridge IPC] 检查服务状态失败:', error);
      return {
        success: false,
        isReady: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[PythonBridge IPC] 所有 IPC 处理器注册完成！');
}


