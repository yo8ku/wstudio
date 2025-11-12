/**
 * Electron 主进程启动文件（CommonJS）
 * Electron 需要 CommonJS 格式的主文件
 */

// 立即输出日志，确保能看到启动过程
console.log('========================================');
console.log('[Electron Main] 🚀 启动 Electron 主进程...');
console.log('[Electron Main] NODE_ENV:', process.env.NODE_ENV);
console.log('[Electron Main] 当前工作目录:', process.cwd());
console.log('[Electron Main] __dirname:', __dirname);
console.log('[Electron Main] Electron 版本:', process.versions.electron);
console.log('[Electron Main] Node 版本:', process.versions.node);
console.log('========================================');

// 捕获未处理的错误
process.on('uncaughtException', (error) => {
  console.error('[Electron Main] ❌ 未捕获的异常:', error);
  console.error('[Electron Main] 错误堆栈:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Electron Main] ❌ 未处理的 Promise 拒绝:', reason);
  console.error('[Electron Main] Promise:', promise);
  process.exit(1);
});

try {
  // 直接导入并执行 CommonJS 主文件
  // electron.js 是 CommonJS 模块，会在导入时自动执行
  console.log('[Electron Main] 📦 正在加载 electron.js...');
  require('./electron.js');
  console.log('[Electron Main] ✅ electron.js 加载完成');
} catch (error) {
  console.error('[Electron Main] ❌ 加载 electron.js 失败:', error);
  console.error('[Electron Main] 错误名称:', error.name);
  console.error('[Electron Main] 错误消息:', error.message);
  console.error('[Electron Main] 错误堆栈:', error.stack);
  process.exit(1);
}

