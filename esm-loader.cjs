/**
 * ESM 加载器 - 处理 electron: 协议
 * 将 electron: 协议转换为 file: 协议
 * 使用 CommonJS 格式，以便 Electron 的 --loader 标志可以加载
 * 
 * 注意：Node.js 的 ESM 加载器 API 要求使用特定的格式
 * 对于 Electron，我们需要确保加载器能够正确处理 electron: 协议
 */

const { pathToFileURL } = require('url');

// 定义加载器钩子
// Node.js 的 ESM 加载器 API 要求这些函数是异步的
async function resolve(specifier, context, nextResolve) {
  // 如果 specifier 是 electron: 协议，转换为 file: 协议
  if (typeof specifier === 'string' && specifier.startsWith('electron:')) {
    try {
      // 移除 electron: 前缀，获取文件路径
      // 处理 electron://path 或 electron:path 格式
      const filePath = specifier.replace(/^electron:\/\/?/, '');
      // 转换为 file: 协议
      const fileUrl = pathToFileURL(filePath).href;
      console.log(`[ESM Loader] 转换 electron: 协议: ${specifier} -> ${fileUrl}`);
      return nextResolve(fileUrl, context);
    } catch (error) {
      console.error('[ESM Loader] 解析 electron: 协议失败:', error);
      throw error;
    }
  }
  
  // 对于其他情况，使用默认解析
  return nextResolve(specifier, context);
}

async function load(url, context, nextLoad) {
  // 如果 URL 是 electron: 协议，转换为 file: 协议
  if (typeof url === 'string' && url.startsWith('electron:')) {
    try {
      // 移除 electron: 前缀，获取文件路径
      const filePath = url.replace(/^electron:\/\/?/, '');
      // 转换为 file: 协议
      const fileUrl = pathToFileURL(filePath).href;
      console.log(`[ESM Loader] 加载 electron: 协议: ${url} -> ${fileUrl}`);
      return nextLoad(fileUrl, context);
    } catch (error) {
      console.error('[ESM Loader] 加载 electron: 协议失败:', error);
      throw error;
    }
  }
  
  // 对于其他情况，使用默认加载
  return nextLoad(url, context);
}

// 导出加载器钩子
// Node.js 的 ESM 加载器 API 要求导出 resolve 和 load 函数
module.exports = { resolve, load };

