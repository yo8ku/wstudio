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
  
  // 显示友好的错误对话框
  try {
    const { dialog } = require('electron');
    const errorMessage = error.message || String(error);
    let title = '应用程序错误';
    let message = '发生了一个未处理的错误';
    let detail = errorMessage;
    
    // 尝试显示错误对话框（如果 app 已初始化）
    if (require('electron').app && !require('electron').app.isReady()) {
      require('electron').app.whenReady().then(() => {
        dialog.showErrorBox(title, `${message}\n\n${detail}`);
      });
    } else if (require('electron').app && require('electron').app.isReady()) {
      dialog.showErrorBox(title, `${message}\n\n${detail}`);
    }
  } catch (dialogError) {
    // 如果无法显示对话框，至少输出到控制台
    console.error('[Electron Main] 无法显示错误对话框:', dialogError);
  }
  
  // 对于非关键错误，不立即退出，让应用继续运行
  // 只有在严重错误时才退出
  if (errorMessage.includes('FATAL') || errorMessage.includes('致命')) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Electron Main] ❌ 未处理的 Promise 拒绝:', reason);
  console.error('[Electron Main] Promise:', promise);
  
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  
  // 显示友好的错误对话框
  try {
    const { dialog } = require('electron');
    let title = '应用程序错误';
    let message = '发生了一个未处理的 Promise 拒绝';
    let detail = errorMessage;
    
    // 尝试显示错误对话框
    if (require('electron').app && !require('electron').app.isReady()) {
      require('electron').app.whenReady().then(() => {
        dialog.showErrorBox(title, `${message}\n\n${detail}`);
      });
    } else if (require('electron').app && require('electron').app.isReady()) {
      dialog.showErrorBox(title, `${message}\n\n${detail}`);
    }
  } catch (dialogError) {
    console.error('[Electron Main] 无法显示错误对话框:', dialogError);
  }
  
  // 对于非关键错误，不立即退出
  if (errorMessage.includes('FATAL') || errorMessage.includes('致命')) {
    process.exit(1);
  }
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

