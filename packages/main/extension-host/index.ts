/**
 * 扩展宿主进程入口
 * ⭐ VSCode 扩展的隔离运行环境
 */

import { ExtensionHostMain } from './ExtensionHostMain';

// 从启动参数获取扩展 ID
const extensionIdIndex = process.argv.indexOf('--extension-id');
const extensionId = extensionIdIndex >= 0 ? process.argv[extensionIdIndex + 1] : 'unknown';

console.log(`[ExtensionHost] 启动扩展宿主进程: ${extensionId}`);
console.log(`[ExtensionHost] PID: ${process.pid}`);

const host = new ExtensionHostMain();

process.on('message', (message: any) => {
  host.handleMessage(message);
});

process.on('disconnect', () => {
  console.log('[ExtensionHost] 父进程断开连接');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[ExtensionHost] 未捕获的异常:', error);
  if (process.send) {
    process.send({
      type: 'error',
      payload: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[ExtensionHost] 未处理的 Promise 拒绝:', reason);
  if (process.send) {
    process.send({
      type: 'error',
      payload: {
        message: String(reason),
      },
    });
  }
});

// 初始化并通知主进程就绪
host.initialize().then(() => {
  console.log('[ExtensionHost] 宿主进程已初始化');
  
  // ⭐ 发送就绪消息
  if (process.send) {
    process.send({ type: 'ready', payload: { extensionId } });
  }
}).catch(error => {
  console.error('[ExtensionHost] 初始化失败:', error);
  process.exit(1);
});



