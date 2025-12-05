/**
 * PythonBridge IPC 处理器
 * 功能：在主进程中处理 PythonBridge 相关请求，供渲染进程调用
 */

import { ipcMain, dialog } from 'electron';

// 使用动态导入来导入 ES 模块
type PythonBridgeType = typeof import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } })['PythonBridge'];
type PythonServiceRequestType = import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } }).PythonServiceRequest;
type PythonServiceResponseType = import('@note-studio/global-rag', { with: { 'resolution-mode': 'import' } }).PythonServiceResponse;

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
    try {
      // 使用 Function 构造函数来创建动态导入，避免 TypeScript 编译为 require()
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      
      // 尝试使用文件 URL 导入，确保使用 ES 模块
      let module;
      try {
        // 首先尝试使用包名导入
        module = await dynamicImport('@note-studio/global-rag');
      } catch (packageError) {
        // 如果包名导入失败，尝试使用文件路径
        console.warn('[PythonBridge IPC] 包名导入失败，尝试使用文件路径:', packageError);
        const path = await import('path');
        const fs = await import('fs');
        
        // 计算全局RAG模块的路径
        // 在编译后的 CommonJS 代码中，__dirname 可用
        // 使用 require 来获取 __dirname（在运行时可用）
        // @ts-ignore - __dirname 在运行时可用（编译后的 CommonJS 代码中）
        const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
        
        // 尝试多个可能的路径
        // 实际编译后的路径: packages/main/dist/main/main/src/ipc
        // 需要向上 7 级到达项目根目录: ../../../../../../ -> 项目根目录
        const possiblePaths = [
          // 从项目根目录（最可靠的方式）
          path.default.resolve(process.cwd(), 'packages/global-rag/dist/index.js'),
          // 从 packages/main/dist/main/main/src/ipc 到 packages/global-rag/dist/index.js
          path.default.resolve(currentDir, '../../../../../../packages/global-rag/dist/index.js'),
          // 从 packages/main/dist/main/src/ipc 到 packages/global-rag/dist/index.js（旧路径，兼容性）
          path.default.resolve(currentDir, '../../../../../packages/global-rag/dist/index.js'),
        ];
        
        let globalRagPath: string | undefined;
        for (const testPath of possiblePaths) {
          if (fs.default.existsSync(testPath)) {
            globalRagPath = testPath;
            console.log(`[PythonBridge IPC] 找到 global-rag 模块: ${globalRagPath}`);
            break;
          }
        }
        
        if (!globalRagPath) {
          throw new Error(
            `Global RAG module not found. Tried paths:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}`
          );
        }
        
        // 转换为 file:// URL（Windows 需要特殊处理）
        let fileUrl: string;
        if (process.platform === 'win32') {
          // Windows: file:///C:/path/to/file.js
          const normalizedPath = globalRagPath.replace(/\\/g, '/');
          // 确保路径以 / 开头
          fileUrl = normalizedPath.startsWith('/') 
            ? `file://${normalizedPath}` 
            : `file:///${normalizedPath}`;
        } else {
          // Unix: file:///path/to/file.js
          fileUrl = `file://${globalRagPath}`;
        }
        
        try {
          module = await dynamicImport(fileUrl);
        } catch (importError) {
          // 如果 file:// URL 导入失败，尝试直接使用路径（某些环境可能支持）
          console.warn('[PythonBridge IPC] file:// URL 导入失败，尝试直接路径:', importError);
          module = await dynamicImport(globalRagPath);
        }
      }
      
      if (!module || !module.PythonBridge) {
        throw new Error('PythonBridge not found in @note-studio/global-rag module');
      }
      
      PythonBridgeClass = module.PythonBridge;
    } catch (error) {
      console.error('[PythonBridge IPC] 加载模块失败:', error);
      throw error;
    }
  }
  return PythonBridgeClass as PythonBridgeType;
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

  // 在应用启动时静默后台检查 Python 依赖
  (async () => {
    try {
      const bridge = await getPythonBridge();
      // 静默后台执行，不阻塞应用启动
      bridge.checkAndInstallDependencies().catch((error) => {
        console.warn('[PythonBridge IPC] 启动时依赖检查失败:', error);
      });
    } catch (error) {
      console.warn('[PythonBridge IPC] 无法在启动时检查依赖:', error);
    }
  })();

  // 启动 Python 服务
  ipcMain.handle('python-bridge:start', async () => {
    try {
      const bridge = await getPythonBridge();
      
      // 添加超时机制，防止 Promise 一直挂起
      const startPromise = bridge.start();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('启动 Python 服务超时（30秒）'));
        }, 30000); // 30秒超时
      });
      
      await Promise.race([startPromise, timeoutPromise]);
      console.log('[PythonBridge IPC] Python 服务已启动');
      return { success: true };
    } catch (error) {
      console.error('[PythonBridge IPC] 启动 Python 服务失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 如果是 Python 相关错误，显示友好的错误对话框
      if (errorMessage.includes('python') || errorMessage.includes('Python') || errorMessage.includes('ENOENT') || errorMessage.includes('找不到') || errorMessage.includes('超时')) {
        try {
          // 检查错误消息是否已经包含友好的提示
          let title = 'Python 环境错误';
          let message = '无法启动 Python 服务';
          let detail = errorMessage;
          
          // 如果错误消息已经包含友好的提示，直接使用
          if (!errorMessage.includes('可能的原因:') && !errorMessage.includes('解决方案:')) {
            if (errorMessage.includes('超时')) {
              detail = `错误: ${errorMessage}\n\n` +
                `可能的原因:\n` +
                `1. Python 进程启动时间过长\n` +
                `2. Python 环境文件损坏\n` +
                `3. 系统资源不足\n\n` +
                `解决方案:\n` +
                `1. 检查应用程序目录是否包含 python_bundle 文件夹\n` +
                `2. 重新安装应用程序\n` +
                `3. 检查系统资源使用情况`;
            } else {
              detail = `错误: ${errorMessage}\n\n` +
                `可能的原因:\n` +
                `1. 应用程序安装不完整，缺少内置 Python 环境\n` +
                `2. Python 环境文件被意外删除或移动\n` +
                `3. 应用程序路径不正确\n\n` +
                `解决方案:\n` +
                `1. 重新安装应用程序\n` +
                `2. 检查应用程序目录是否包含 python_bundle 文件夹\n` +
                `3. 联系技术支持\n\n` +
                `注意: 本应用程序使用内置的独立 Python 环境，不需要用户本地安装 Python。`;
            }
          }
          
          // 显示错误对话框
          dialog.showErrorBox(title, `${message}\n\n${detail}`);
        } catch (dialogError) {
          console.error('[PythonBridge IPC] 无法显示错误对话框:', dialogError);
        }
      }
      
      return {
        success: false,
        error: errorMessage
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
        // 启动 Python 服务（异步执行，不阻塞主进程事件循环）
        await bridge.start();
      }
      // 发送请求到 Python 服务（Python 服务在独立进程中运行，不会阻塞主进程）
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


