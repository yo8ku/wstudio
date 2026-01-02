/**
 * Electron 主进程启动文件
 */

const { app, BrowserWindow, ipcMain, protocol, dialog, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const http = require('http');
const { fileURLToPath } = require('url');

// 设置模块解析路径，将 @note-studio 映射到 packages 目录
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain) {
  if (request.startsWith('@note-studio/')) {
    const pkgName = request.replace('@note-studio/', '');
    const pkgPath = path.join(__dirname, 'packages', pkgName.split('/')[0]);
    if (fs.existsSync(pkgPath)) {
      return originalResolveFilename.call(this, pkgPath, parent, isMain);
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain);
};

const { initializeExtensions, pluginManager, settingsManager, workspaceManager, builtinAI } = require('./packages/main/dist/main/src/index.js');
// 使用 Worker 线程版本的 Embedding 服务，避免阻塞主进程
const embeddingService = require('./packages/main/src/services/EmbeddingWorkerService.js');
// 云端 Embedding 服务
const { cloudEmbeddingService } = require('./packages/main/dist/main/src/services/CloudEmbeddingService.js');
const { getAllEmbeddingProviders, getEnabledEmbeddingModels } = require('./packages/main/dist/main/src/services/EmbeddingModelConfig.js');

const logIconPath = path.join(__dirname, 'log', 'log.png');
if (!fs.existsSync(logIconPath)) {
  console.warn('[Electron] 应用图标未找到，预计路径:', logIconPath);
}

// 禁用硬件加速以避免 GPU 进程崩溃
app.disableHardwareAcceleration();
console.log('[Electron] 硬件加速已禁用（避免 GPU 进程崩溃）');

// 注册自定义协议为特权协议（必须在 app.whenReady 之前调用）
// 这样 local-file:// 协议才能在 <video>、<audio>、<img> 等标签中正常使用
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  },
  {
    scheme: 'vscode-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
]);
console.log('[Electron] 自定义协议已注册为特权协议');

let mainWindow;

/**
 * 创建主窗口
 * @param {string} backgroundColor - 窗口背景色（来自当前主题）
 */
function createWindow(backgroundColor = '#1e1e1e') {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden',
    backgroundColor: backgroundColor, // 使用主题背景色，避免白色闪烁
    icon: logIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true // 启用 webview 标签，用于嵌入视频播放器
    }
  });

  // 开发模式：加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    console.log('[Electron] 开发模式：加载 Vite 开发服务器 http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载构建后的文件
    console.log('[Electron] 生产模式：加载构建文件');
    mainWindow.loadFile(path.join(__dirname, 'packages/renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 监听窗口焦点变化
  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window-focus');
  });
  
  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window-blur');
  });
  
  // 窗口加载完成后的处理
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] 渲染进程页面已加载完成');
    // 注意：main-process:ready 事件在 initializeExtensions 完成后发送，不在这里发送
  });
}

/**
 * 应用程序就绪后初始化
 */
app.whenReady().then(async () => {
  
  // 设置应用菜单，启用标准编辑快捷键（Ctrl+X/C/V/A/Z）
  const template = [
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', label: '重做', accelerator: 'CmdOrCtrl+Y' },
        { type: 'separator' },
        { role: 'cut', label: '剪切', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', label: '复制', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', label: '粘贴', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', label: '全选', accelerator: 'CmdOrCtrl+A' },
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  console.log('[Electron] 应用菜单已设置，编辑快捷键已启用');
  
  // 全局设置 Content Security Policy (CSP)
  // 必须在创建窗口之前设置，以确保所有请求都应用 CSP
  const defaultSession = session.defaultSession;
  
  // 定义 CSP 策略
  // 注意：移除 unsafe-eval 可能会影响 Vite HMR，如果遇到问题请恢复
  // 生产模式：移除 unsafe-eval，更安全
  // 允许从 jsdelivr CDN 加载 Monaco Editor 脚本
  // frame-src 允许加载视频平台的嵌入播放器（B站、YouTube、优酷）
  const cspHeader = process.env.NODE_ENV === 'development'
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' http://localhost:* ws://localhost:* https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';";
  
  // 拦截所有响应并添加 CSP 头
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader]
      }
    });
  });
  
  console.log('[Electron] Content Security Policy 已全局设置');
  if (process.env.NODE_ENV === 'development') {
    console.log('[Electron] 开发模式：CSP 已移除 unsafe-eval（如果 Vite HMR 不工作，请恢复 unsafe-eval）');
  }
  
  // 注册自定义协议处理函数
  const ensureExtendedLengthPath = (filePath) => {
    if (process.platform !== 'win32') {
      return filePath;
    }

    if (!filePath || filePath.startsWith('\\\\?\\')) {
      return filePath;
    }

    const isUncPath = filePath.startsWith('\\\\');
    const needsExtendedPrefix = filePath.length >= 260 || isUncPath;

    if (!needsExtendedPrefix) {
      return filePath;
    }

    if (isUncPath) {
      const uncBody = filePath.replace(/^\\\\/, '');
      return `\\\\?\\UNC\\${uncBody}`;
    }

    return `\\\\?\\${filePath}`;
  };

  const toFileUrl = (rawUrl, protocolName) => {
    let normalizedUrl = rawUrl;

    if (protocolName === 'local-file') {
      normalizedUrl = rawUrl.replace(/^local-file:/i, 'file:');
    } else if (protocolName === 'vscode-file') {
      normalizedUrl = rawUrl.replace(/^vscode-file:\/\/vscode-app/i, 'file://');
    }

    if (/^file:\/\/[a-zA-Z]:/.test(normalizedUrl)) {
      normalizedUrl = normalizedUrl.replace(
        /^file:\/\/([a-zA-Z]:)/,
        'file:///$1'
      );
    }

    return normalizedUrl;
  };

  const decodePathFromCustomProtocol = (rawUrl, protocolName) => {
    let url = rawUrl;
    if (protocolName === 'local-file') {
      url = url.replace(/^local-file:\/\/\/?/, '');
    } else if (protocolName === 'vscode-file') {
      url = url.replace(/^vscode-file:\/\/vscode-app\/?/, '');
    }

    const queryIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');
    const cutIndex = (() => {
      if (queryIndex === -1) return hashIndex;
      if (hashIndex === -1) return queryIndex;
      return Math.min(queryIndex, hashIndex);
    })();
    if (cutIndex !== -1) {
      url = url.substring(0, cutIndex);
    }

    url = url.replace(/^[/\\]+([a-zA-Z]:)/, '$1');
    console.log('[Electron] 移除协议前缀和查询参数后:', url);

    const decodedParts = url.split('/').map(part => {
      try {
        return decodeURIComponent(part);
      } catch (e) {
        return part;
      }
    });


    const decodedPath = decodedParts.join('/');

    const normalizedPath = path.normalize(decodedPath);
    return normalizedPath;
  };

  // 获取文件的 MIME 类型
  const getMimeType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      // 视频
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.ogv': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      // 音频
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      // 图片
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      // 其他
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  };

  const handleFileProtocol = (protocolName) => (request, callback) => {
    console.log(`[Electron] ${protocolName} 协议请求:`, request.url);
    
    try {
      let resolvedPath;
      
      // 直接从 URL 中提取路径
      let urlPath = request.url;
      
      // 移除协议前缀 (local-file:// 或 local-file:///)
      if (protocolName === 'local-file') {
        urlPath = urlPath.replace(/^local-file:\/\/\/?/, '');
      } else if (protocolName === 'vscode-file') {
        urlPath = urlPath.replace(/^vscode-file:\/\/vscode-app\/?/, '');
      }
      
      // 移除查询参数和哈希
      const queryIndex = urlPath.indexOf('?');
      const hashIndex = urlPath.indexOf('#');
      if (queryIndex !== -1) urlPath = urlPath.substring(0, queryIndex);
      if (hashIndex !== -1) urlPath = urlPath.substring(0, hashIndex);
      
      // URL 解码整个路径
      try {
        urlPath = decodeURIComponent(urlPath);
      } catch (e) {
        // 如果整体解码失败，尝试逐部分解码
        const parts = urlPath.split('/');
        urlPath = parts.map(part => {
          try {
            return decodeURIComponent(part);
          } catch (e) {
            return part;
          }
        }).join('/');
      }
      
      console.log(`[Electron] URL解码后:`, urlPath);
      
      // Windows 路径处理
      if (process.platform === 'win32') {
        // 处理 /C:/... 格式
        if (/^\/[A-Za-z]:/.test(urlPath)) {
          urlPath = urlPath.substring(1);
        }
        // 处理 c/Users/... 格式（浏览器可能会移除冒号）
        // 检测是否是 "盘符/Users" 或 "盘符/..." 的模式
        else if (/^[A-Za-z]\//.test(urlPath)) {
          // 在盘符后添加冒号: c/Users -> C:/Users
          urlPath = urlPath.charAt(0).toUpperCase() + ':' + urlPath.substring(1);
        }
        
        // 确保盘符大写
        if (/^[a-z]:/.test(urlPath)) {
          urlPath = urlPath.charAt(0).toUpperCase() + urlPath.substring(1);
        }
      }
      
      // 转换为系统路径格式
      resolvedPath = path.normalize(urlPath);
      
      console.log(`[Electron] 解析后的文件路径:`, resolvedPath);
      
      // 检查文件是否存在
      if (fs.existsSync(resolvedPath)) {
        const mimeType = getMimeType(resolvedPath);
        console.log(`[Electron] 文件存在，MIME类型:`, mimeType);
        return callback({ 
          path: resolvedPath,
          mimeType: mimeType
        });
      } else {
        console.log(`[Electron] 文件不存在:`, resolvedPath);
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
    } catch (error) {
      console.error(`[Electron] 协议处理错误:`, error);
      return callback({ error: -2 }); // net::ERR_FAILED
    }
  };
  
  // 注册 local-file:// 协议用于加载本地文件
  protocol.registerFileProtocol('local-file', handleFileProtocol('local-file'));
  // console.log('[Electron]  local-file:// 协议已注册');
  
  // 注册 vscode-file:// 协议作为备用（兼容旧版扩展）
  protocol.registerFileProtocol('vscode-file', handleFileProtocol('vscode-file'));
  // console.log('[Electron]  vscode-file:// 协议已注册');
  
  // ⚡ 先初始化扩展系统（注册所有 IPC 处理器）
  // 注意：必须在创建窗口之前注册 IPC 处理器，否则渲染进程会收到 "No handler registered" 错误
  try {
    await initializeExtensions(null); // 暂时不传递窗口，先注册 IPC 处理器
    
    // 使用默认背景色（主题由渲染进程管理）
    let backgroundColor = '#1e1e1e';
    
    // 创建窗口
    createWindow(backgroundColor);

    // 再次初始化扩展系统，这次传入主窗口以创建 PluginAPIAdapter 和终端服务
    await initializeExtensions(mainWindow);
    console.log('[Electron] 扩展系统初始化完成');
    
    // 🎉 所有初始化完成，等待页面加载后通知渲染进程
    const sendReadyEvent = () => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('main-process:ready');
      }
    };
    
    // 如果页面已加载完成，立即发送；否则等待加载完成后发送
    if (mainWindow && mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendReadyEvent);
    } else {
      sendReadyEvent();
    }
  } catch (error) {
    console.error('[Electron]  扩展系统初始化失败:', error);
    // 即使失败也创建窗口（避免应用卡住），但避免重复创建
    if (!mainWindow) {
      createWindow('#1e1e1e');
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * 所有窗口关闭时退出（macOS 除外）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用退出前清理
 */
app.on('before-quit', () => {
  console.log('[Electron] 应用即将退出，清理资源...');
});

/**
 * IPC 通信处理
 */
ipcMain.handle('extension:list', async () => {
  // 获取所有插件
  const allPlugins = pluginManager.getAllExtensions();
  
  // 过滤掉 TypeScript 相关的插件（如果有）
  const filteredPlugins = allPlugins.filter(plugin => {
    const name = (plugin.name || '').toLowerCase();
    const id = (plugin.id || '').toLowerCase();
    return !name.includes('typescript') && 
           !id.includes('typescript') &&
           !name.includes('ts-language') &&
           !id.includes('vscode.typescript');
  });
  
  console.log(`[IPC] 返回插件列表: ${filteredPlugins.length} 个插件 (总数: ${allPlugins.length})`);
  
  return filteredPlugins;
});

ipcMain.handle('extension:toggle', async (event, extensionId, enabled) => {
  try {
    console.log('[IPC] 切换扩展:', extensionId, enabled ? '启用' : '禁用');
    // TODO: 实现扩展的启用/禁用逻辑
    return { success: true };
  } catch (error) {
    console.error('[IPC] 切换扩展失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 主题相关 IPC 处理
 * 注意：主题 IPC 处理器已在 storeHandlers.ts 中注册，这里只保留事件监听
 */

// 主题系统现在由渲染进程通过 IPC 和新主题数据库管理
// 旧的主题事件监听器已移除

ipcMain.handle('extension:execute-command', async (event, command, ...args) => {
  // 这里需要实现命令执行逻辑
  console.log('[IPC] 执行命令:', command, args);
  return { success: true };
});

/**
 * AI 相关 IPC 处理
 * 代理 fetch 请求，避免渲染进程中的 SSL 协议错误
 */
ipcMain.handle('ai:fetch', async (event, url, options = {}) => {
  console.log('[IPC] AI Fetch 请求:', url);
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      // 准备请求选项
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        // 禁用证书验证，避免自签名证书问题
        rejectUnauthorized: false
      };
      
      // 发起请求
      const req = client.request(requestOptions, (res) => {
        let body = '';
        
        // 设置编码
        res.setEncoding('utf8');
        
        // 收集响应数据
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        // 响应结束
        res.on('end', () => {
          console.log('[IPC] AI Fetch 响应状态:', res.statusCode);
          
          // 将响应转换为可序列化的格式
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || '',
            headers: res.headers,
            body: body
          });
        });
      });
      
      // 错误处理
      req.on('error', (error) => {
        console.error('[IPC] AI Fetch 错误:', error);
        reject(error);
      });
      
      // 发送请求体（如果有）
      if (options.body) {
        req.write(options.body);
      }
      
      // 结束请求
      req.end();
    } catch (error) {
      console.error('[IPC] AI Fetch 异常:', error);
      reject(error);
    }
  });
});

ipcMain.handle('extension:send-message', async (event, extensionId, message) => {
  // 这里需要实现扩展消息发送逻辑
  console.log('[IPC] 发送消息到扩展:', extensionId, message);
  return { success: true };
});

/**
 * 文件操作 IPC 处理
 */

// 打开文件对话框
ipcMain.handle('file:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Supported Files', extensions: ['md', 'markdown', 'json', 'txt'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      
      // 验证文件类型
      if (!workspaceManager.isSupportedFileType(filePath)) {
        return {
          success: false,
          error: '不支持的文件类型。仅支持 .md, .markdown, .json, .txt 文件'
        };
      }
      
      const content = await fsPromises.readFile(filePath, 'utf-8');
      const language = workspaceManager.getFileLanguage(filePath);
      
      // 添加到最近文件列表
      workspaceManager.addRecentFile(filePath);
      workspaceManager.setLastOpenedFile(filePath);
      
      return {
        success: true,
        data: {
          path: filePath,
          content: content,
          name: path.basename(filePath),
          language: language
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 打开视频文件对话框
ipcMain.handle('video:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      return {
        success: true,
        data: {
          path: filePath,
          name: path.basename(filePath),
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开视频文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 读取指定路径的文件（用于文件树双击打开）
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    // 检查文件是否存在
    const stats = await fsPromises.stat(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: '路径不是一个文件'
      };
    }
    
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const language = workspaceManager.getFileLanguage(filePath);
    
    // 添加到最近文件列表
    workspaceManager.addRecentFile(filePath);
    workspaceManager.setLastOpenedFile(filePath);
    
    return {
      success: true,
      data: {
        path: filePath,
        content: content,
        name: path.basename(filePath),
        language: language
      }
    };
  } catch (error) {
    console.error('[IPC] 读取文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 打开图片文件对话框
ipcMain.handle('image:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const imagePath = result.filePaths[0];
      
      return {
        success: true,
        data: {
          path: imagePath,
          name: path.basename(imagePath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开图片失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 打开多文件选择对话框（用于知识库导入）
ipcMain.handle('file:openMultiple', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported Files', extensions: ['md', 'markdown', 'json', 'txt'] },
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      // 过滤文件类型，只返回支持的文件
      const supportedExtensions = ['md', 'markdown', 'json', 'txt'];
      const filteredPaths = result.filePaths.filter(filePath => {
        const ext = path.extname(filePath).toLowerCase().slice(1);
        return supportedExtensions.includes(ext);
      });

      if (filteredPaths.length === 0) {
        return {
          success: false,
          error: '所选文件中没有支持的文件类型。仅支持 .md, .markdown, .json, .txt 文件'
        };
      }

      return {
        success: true,
        data: filteredPaths
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开多文件对话框失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 打开文件夹对话框（用于工作区，会设置工作区目录）
ipcMain.handle('folder:open', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 保存工作区路径
      workspaceManager.setWorkspaceDir(folderPath);
      
      return {
        success: true,
        data: {
          path: folderPath,
          name: path.basename(folderPath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开文件夹失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 打开文件夹对话框（用于知识库导入，不设置工作区目录）
ipcMain.handle('knowledge-base:open-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      
      // 知识库导入文件夹不设置工作区目录，两者完全独立
      
      return {
        success: true,
        data: {
          path: folderPath,
          name: path.basename(folderPath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 打开文件夹失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 扫描文件夹中的支持文件（用于知识库导入）
ipcMain.handle('folder:scanFiles', async (event, folderPath) => {
  try {
    const supportedExtensions = ['md', 'markdown', 'json', 'txt'];
    const filePaths = [];

    // 递归扫描文件夹
    const scanDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 递归扫描子文件夹
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // 检查文件扩展名
          const ext = path.extname(entry.name).toLowerCase().slice(1);
          if (supportedExtensions.includes(ext)) {
            filePaths.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(folderPath);

    return {
      success: true,
      data: filePaths
    };
  } catch (error) {
    console.error('[IPC] 扫描文件夹失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 读取文件夹目录结构
ipcMain.handle('folder:read-tree', async (event, folderPath) => {
  try {
    const readDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const nodes = [];
      
      for (const entry of entries) {
        // 忽略隐藏文件和特殊目录
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(folderPath, fullPath);
        
        if (entry.isDirectory()) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'directory',
            isExpanded: false,
            children: []
          });
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let language = 'text';
          
          // 根据扩展名确定语言
          if (['.js', '.jsx'].includes(ext)) language = 'javascript';
          else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
          else if (['.md', '.markdown'].includes(ext)) language = 'markdown';
          else if (ext === '.json') language = 'json';
          else if (['.css', '.scss', '.sass', '.less'].includes(ext)) language = 'css';
          else if (ext === '.html') language = 'html';
          else if (ext === '.py') language = 'python';
          else if (ext === '.java') language = 'java';
          else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) language = 'cpp';
          
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'file',
            language: language
          });
        }
      }
      
      // 排序：目录在前，文件在后，各自按字母排序
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
      
      return nodes;
    };
    
    const tree = await readDirectory(folderPath);
    
    return {
      success: true,
      data: tree
    };
  } catch (error) {
    console.error('[IPC] 读取文件夹结构失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 递归获取所有笔记文件（过滤掉文件夹）
ipcMain.handle('folder:get-all-notes', async (event, folderPath) => {
  try {
    const allFiles = [];
    
    // 递归读取所有文件
    const readFilesRecursively = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // 忽略隐藏文件和特殊目录
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // 递归处理子目录
          await readFilesRecursively(fullPath);
        } else {
          // 只添加文件（支持的笔记格式）
          const ext = path.extname(entry.name).toLowerCase();
          const supportedExtensions = ['.md', '.markdown', '.txt', '.json'];
          
          if (supportedExtensions.includes(ext)) {
            const relativePath = path.relative(folderPath, fullPath);
            const stats = await fsPromises.stat(fullPath);
            
            // 读取文件第一行
            let firstLine = '';
            try {
              const content = await fsPromises.readFile(fullPath, 'utf-8');
              // 获取第一行非空内容
              const lines = content.split('\n');
              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                  firstLine = trimmedLine;
                  break;
                }
              }
            } catch (error) {
              console.warn(`[IPC] 读取文件第一行失败: ${fullPath}`, error);
            }
            
            allFiles.push({
              id: fullPath,
              name: entry.name,
              path: fullPath,
              relativePath: relativePath,
              type: 'file',
              size: stats.size,
              createdAt: stats.birthtime,
              updatedAt: stats.mtime,
              firstLine: firstLine
            });
          }
        }
      }
    };
    
    await readFilesRecursively(folderPath);
    
    // 按名称排序
    allFiles.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      success: true,
      data: allFiles
    };
  } catch (error) {
    console.error('[IPC] 获取所有笔记文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 创建新文件
ipcMain.handle('folder:create-file', async (event, parentPath, fileName) => {
  try {
    const filePath = path.join(parentPath, fileName);
    
    // 检查文件是否已存在
    try {
      await fsPromises.access(filePath);
      return {
        success: false,
        error: '文件已存在'
      };
    } catch {
      // 文件不存在，继续创建
    }
    
    // 创建空文件
    await fsPromises.writeFile(filePath, '', 'utf-8');
    
    return {
      success: true,
      data: {
        path: filePath,
        name: fileName
      }
    };
  } catch (error) {
    console.error('[IPC] 创建文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 复制文件到目标文件夹
ipcMain.handle('file:copy-to-folder', async (event, sourcePath, targetFolderPath) => {
  try {
    // 确保目标文件夹存在
    await fsPromises.mkdir(targetFolderPath, { recursive: true });
    
    // 获取源文件名
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetFolderPath, fileName);
    
    // 检查目标文件是否已存在
    try {
      await fsPromises.access(targetPath);
      // 文件已存在，生成新文件名
      const ext = path.extname(fileName);
      const nameWithoutExt = path.basename(fileName, ext);
      const timestamp = Date.now();
      const newFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      const newTargetPath = path.join(targetFolderPath, newFileName);
      
      // 复制文件
      await fsPromises.copyFile(sourcePath, newTargetPath);
      
      return {
        success: true,
        data: {
          path: newTargetPath,
          name: newFileName
        }
      };
    } catch {
      // 文件不存在，直接复制
      await fsPromises.copyFile(sourcePath, targetPath);
      
      return {
        success: true,
        data: {
          path: targetPath,
          name: fileName
        }
      };
    }
  } catch (error) {
    console.error('[IPC] 复制文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 创建新文件夹
ipcMain.handle('folder:create-folder', async (event, parentPath, folderName) => {
  try {
    const folderPath = path.join(parentPath, folderName);
    
    // 检查文件夹是否已存在
    try {
      await fsPromises.access(folderPath);
      return {
        success: false,
        error: '文件夹已存在'
      };
    } catch {
      // 文件夹不存在，继续创建
    }
    
    // 创建文件夹
    await fsPromises.mkdir(folderPath, { recursive: false });
    
    return {
      success: true,
      data: {
        path: folderPath,
        name: folderName
      }
    };
  } catch (error) {
    console.error('[IPC] 创建文件夹失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 确保文件夹存在（递归创建）
ipcMain.handle('folder:ensure-dir', async (event, dirPath) => {
  try {
    // 使用 recursive: true 确保所有父文件夹都被创建
    await fsPromises.mkdir(dirPath, { recursive: true });
    
    return {
      success: true,
      data: {
        path: dirPath
      }
    };
  } catch (error) {
    console.error('[IPC] 确保文件夹存在失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 展开文件夹（懒加载子目录）
ipcMain.handle('folder:expand', async (event, folderPath, rootPath) => {
  try {
    const readDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const nodes = [];
      
      for (const entry of entries) {
        // 忽略隐藏文件和特殊目录
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);
        
        if (entry.isDirectory()) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'directory',
            isExpanded: false,
            children: []
          });
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          let language = 'text';
          
          // 根据扩展名确定语言
          if (['.js', '.jsx'].includes(ext)) language = 'javascript';
          else if (['.ts', '.tsx'].includes(ext)) language = 'typescript';
          else if (['.md', '.markdown'].includes(ext)) language = 'markdown';
          else if (ext === '.json') language = 'json';
          else if (['.css', '.scss', '.sass', '.less'].includes(ext)) language = 'css';
          else if (ext === '.html') language = 'html';
          else if (ext === '.py') language = 'python';
          else if (ext === '.java') language = 'java';
          else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) language = 'cpp';
          
          nodes.push({
            id: fullPath,
            name: entry.name,
            path: fullPath,
            relativePath: relativePath,
            type: 'file',
            language: language
          });
        }
      }
      
      // 排序：目录在前，文件在后，各自按字母排序
      nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
      
      return nodes;
    };
    
    const children = await readDirectory(folderPath);
    
    return {
      success: true,
      data: children
    };
  } catch (error) {
    console.error('[IPC] 展开文件夹失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 另存为对话框
ipcMain.handle('file:save-as', async (event, content = '') => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ],
      defaultPath: workspaceManager.getWorkspaceDir()
    });

    if (!result.canceled && result.filePath) {
      await fsPromises.writeFile(result.filePath, content, 'utf-8');
      
      // 添加到最近文件列表
      workspaceManager.addRecentFile(result.filePath);
      
      return {
        success: true,
        data: {
          path: result.filePath,
          name: path.basename(result.filePath),
          language: workspaceManager.getFileLanguage(result.filePath)
        }
      };
    }

    return { success: false, error: 'User canceled' };
  } catch (error) {
    console.error('[IPC] 另存为失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// 保存文件
ipcMain.handle('file:save', async (event, filePath, content) => {
  try {
    await fsPromises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[IPC] 保存文件失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * 窗口控制 IPC 处理
 */
ipcMain.on('minimize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('maximize-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});

/**
 * 设置相关 IPC 处理
 */

// 获取所有设置
ipcMain.handle('settings:get-all', async () => {
  try {
    // 只返回用户实际配置的内容，不包含默认值
    const settings = await settingsManager.getUserConfiguredSettings();
    return { success: true, data: settings };
  } catch (error) {
    console.error('[IPC] 获取设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取单个设置值
ipcMain.handle('settings:get', async (event, key) => {
  try {
    const value = settingsManager.get(key);
    return { success: true, data: value };
  } catch (error) {
    console.error('[IPC] 获取设置值失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取插件设置值
ipcMain.handle('settings:get-plugin', async (event, key) => {
  try {
    const value = settingsManager.getPluginSetting(key);
    return { success: true, data: value };
  } catch (error) {
    console.error('[IPC] 获取插件设置值失败:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// 更新单个设置
ipcMain.handle('settings:update', async (event, key, value, target = 'user') => {
  try {
    await settingsManager.update(key, value, target);
    
    // 广播设置变化事件到所有渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('settings:changed', { key, value });
    }
    
    return { success: true };
  } catch (error) {
    console.error('[IPC] 更新设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 批量更新设置
ipcMain.handle('settings:update-many', async (event, updates, target = 'user') => {
  try {
    await settingsManager.updateMany(updates, target);
    
    // 广播设置变化事件
    if (mainWindow) {
      mainWindow.webContents.send('settings:changed', { updates });
    }
    
    return { success: true };
  } catch (error) {
    console.error('[IPC] 批量更新设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 重置设置
ipcMain.handle('settings:reset', async (event, key) => {
  try {
    await settingsManager.reset(key);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 重置设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取设置文件路径
ipcMain.handle('settings:get-path', async (event, target = 'user') => {
  try {
    const settingsPath = settingsManager.getSettingsPath(target);
    return { success: true, data: settingsPath };
  } catch (error) {
    console.error('[IPC] 获取设置路径失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取应用路径（系统路径）
ipcMain.handle('app:get-path', async (event, name) => {
  try {
    // 支持 Electron app.getPath 的所有路径类型
    // 常见类型：home, appData, userData, temp, exe, module, desktop, documents, downloads, music, pictures, videos
    const pathValue = app.getPath(name);
    return { success: true, data: pathValue };
  } catch (error) {
    console.error('[IPC] 获取应用路径失败:', error);
    return { success: false, error: error.message };
  }
});

// 打开 settings.json 文件
ipcMain.handle('settings:open-json', async (event, target = 'user') => {
  try {
    const settingsPath = settingsManager.getSettingsPath(target);
    
    // 确保文件存在
    if (!fs.existsSync(settingsPath)) {
      // 如果文件不存在，创建默认配置
      const dir = path.dirname(settingsPath);
      if (!fs.existsSync(dir)) {
        await fsPromises.mkdir(dir, { recursive: true });
      }
      await fsPromises.writeFile(settingsPath, JSON.stringify({}, null, 2), 'utf-8');
    }
    
    // 强制重新加载设置到内存（确保内存和磁盘同步）
    await settingsManager.loadSettings();
    
    // 读取文件内容
    const content = await fsPromises.readFile(settingsPath, 'utf-8');
    const language = workspaceManager.getFileLanguage(settingsPath);
    
    // 返回文件数据给渲染进程
    return { 
      success: true, 
      data: {
        path: settingsPath,
        content: content,
        name: path.basename(settingsPath),
        language: language
      }
    };
  } catch (error) {
    console.error('[IPC] 打开设置文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 导入设置
ipcMain.handle('settings:import', async (event, settingsJson, target = 'user') => {
  try {
    await settingsManager.importSettings(settingsJson, target);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 导入设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 导出设置
ipcMain.handle('settings:export', async () => {
  try {
    const settingsJson = settingsManager.exportSettings();
    return { success: true, data: settingsJson };
  } catch (error) {
    console.error('[IPC] 导出设置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取默认设置
ipcMain.handle('settings:get-defaults', async () => {
  try {
    const defaults = settingsManager.getDefaults();
    return { success: true, data: defaults };
  } catch (error) {
    console.error('[IPC] 获取默认设置失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 常用片段配置 IPC 处理
 */

// 读取常用片段配置
ipcMain.handle('snippets:read-config', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const snippetsPath = path.join(userDataPath, 'snippets.json');
    
    // 如果文件不存在，返回默认内容
    if (!fs.existsSync(snippetsPath)) {
      const defaultContent = JSON.stringify({
        "// 常用片段配置": "",
        "snippets": []
      }, null, 2);
      return defaultContent;
    }
    
    const content = await fsPromises.readFile(snippetsPath, 'utf-8');
    return content;
  } catch (error) {
    console.error('[IPC] 读取snippets.json失败:', error);
    // 返回默认内容而不是抛出错误
    return JSON.stringify({
      "// 常用片段配置": "",
      "snippets": []
    }, null, 2);
  }
});

// 保存常用片段配置
ipcMain.handle('snippets:save-config', async (event, content) => {
  try {
    const userDataPath = app.getPath('userData');
    const snippetsPath = path.join(userDataPath, 'snippets.json');
    
    // 确保目录存在
    const dir = path.dirname(snippetsPath);
    if (!fs.existsSync(dir)) {
      await fsPromises.mkdir(dir, { recursive: true });
    }
    
    await fsPromises.writeFile(snippetsPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[IPC] 保存snippets.json失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 工作区相关 IPC 处理
 */

// 获取应用根目录路径
ipcMain.handle('app:get-app-path', async () => {
  try {
    const appPath = app.getAppPath();
    console.log('[IPC] 获取应用路径:', appPath);
    return { success: true, data: appPath };
  } catch (error) {
    console.error('[IPC] 获取应用路径失败:', error);
    return { success: false, error: error.message };
  }
});

// 打开外部链接
ipcMain.handle('shell:open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 打开外部链接失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Embedding 服务相关 IPC 处理
 */

// 生成单个文本的向量
ipcMain.handle('embedding:generate', async (event, text) => {
  try {
    console.log('[IPC-Embedding] 生成向量，文本长度:', text.length, '子进程状态:', embeddingService.isInitialized ? '已初始化' : '未初始化');
    const result = await embeddingService.generateEmbedding(text);
    console.log('[IPC-Embedding] 向量生成完成，维度:', result.vectors?.length);
    return { success: true, data: result };
  } catch (error) {
    console.error('[IPC-Embedding] 生成向量失败:', error);
    return { success: false, error: error.message };
  }
});

// 批量生成向量
ipcMain.handle('embedding:generate-batch', async (event, texts) => {
  try {
    console.log('[IPC] 批量生成向量，数量:', texts.length);
    const results = await embeddingService.generateBatchEmbeddings(texts);
    return { success: true, data: results };
  } catch (error) {
    console.error('[IPC] 批量生成向量失败:', error);
    return { success: false, error: error.message };
  }
});

// ========== 云端 Embedding API ==========

// 获取所有 Embedding 服务商
ipcMain.handle('cloud-embedding:get-providers', async () => {
  try {
    const providers = getAllEmbeddingProviders();
    return { success: true, data: providers };
  } catch (error) {
    console.error('[IPC] 获取 Embedding 服务商失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取所有启用的 Embedding 模型
ipcMain.handle('cloud-embedding:get-models', async () => {
  try {
    const models = getEnabledEmbeddingModels();
    return { success: true, data: models };
  } catch (error) {
    console.error('[IPC] 获取 Embedding 模型失败:', error);
    return { success: false, error: error.message };
  }
});

// 设置 Embedding API Key
ipcMain.handle('cloud-embedding:set-api-key', async (event, providerId, apiKey) => {
  try {
    cloudEmbeddingService.setApiKey(providerId, apiKey);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 设置 Embedding API Key 失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取 Embedding API Key
ipcMain.handle('cloud-embedding:get-api-key', async (event, providerId) => {
  try {
    const apiKey = cloudEmbeddingService.getApiKey(providerId);
    return { success: true, data: apiKey };
  } catch (error) {
    console.error('[IPC] 获取 Embedding API Key 失败:', error);
    return { success: false, error: error.message };
  }
});

// 设置当前 Embedding 模型
ipcMain.handle('cloud-embedding:set-model', async (event, modelId) => {
  try {
    cloudEmbeddingService.setModel(modelId);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 设置 Embedding 模型失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取当前 Embedding 模型
ipcMain.handle('cloud-embedding:get-current-model', async () => {
  try {
    const model = cloudEmbeddingService.getCurrentModel();
    return { success: true, data: model };
  } catch (error) {
    console.error('[IPC] 获取当前 Embedding 模型失败:', error);
    return { success: false, error: error.message };
  }
});

// 云端生成单个向量
ipcMain.handle('cloud-embedding:generate', async (event, text) => {
  try {
    const result = await cloudEmbeddingService.generateEmbedding(text);
    if (result.success) {
      return { success: true, data: result };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('[IPC] 云端生成向量失败:', error);
    return { success: false, error: error.message };
  }
});

// 云端批量生成向量
ipcMain.handle('cloud-embedding:generate-batch', async (event, texts) => {
  try {
    console.log('[IPC] 云端批量生成向量，数量:', texts.length);
    const result = await cloudEmbeddingService.generateBatchEmbeddings(texts);
    if (result.success) {
      return { success: true, data: result };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('[IPC] 云端批量生成向量失败:', error);
    return { success: false, error: error.message };
  }
});

// 测试 Embedding 连接
ipcMain.handle('cloud-embedding:test-connection', async (event, providerId, apiKey, modelId) => {
  try {
    const result = await cloudEmbeddingService.testConnection(providerId, apiKey, modelId);
    return { success: result.success, data: result };
  } catch (error) {
    console.error('[IPC] 测试 Embedding 连接失败:', error);
    return { success: false, error: error.message };
  }
});

// 检查是否已配置有效的 API Key
ipcMain.handle('cloud-embedding:has-valid-api-key', async () => {
  try {
    const hasKey = cloudEmbeddingService.hasValidApiKey();
    return { success: true, data: hasKey };
  } catch (error) {
    console.error('[IPC] 检查 API Key 失败:', error);
    return { success: false, error: error.message };
  }
});

// 设置自定义 Embedding 模型配置
ipcMain.handle('cloud-embedding:set-custom-config', async (event, config) => {
  try {
    cloudEmbeddingService.setCustomConfig(config);
    return { success: true };
  } catch (error) {
    console.error('[IPC] 设置自定义配置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取自定义 Embedding 模型配置
ipcMain.handle('cloud-embedding:get-custom-config', async () => {
  try {
    const config = cloudEmbeddingService.getCustomConfig();
    return { success: true, data: config };
  } catch (error) {
    console.error('[IPC] 获取自定义配置失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取工作区目录
ipcMain.handle('workspace:get-dir', async () => {
  try {
    const workspaceDir = workspaceManager.getWorkspaceDir();
    return { success: true, data: workspaceDir };
  } catch (error) {
    console.error('[IPC] 获取工作区目录失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取最近文件列表
ipcMain.handle('workspace:get-recent-files', async () => {
  try {
    const recentFiles = workspaceManager.getRecentFiles();
    return { success: true, data: recentFiles };
  } catch (error) {
    console.error('[IPC] 获取最近文件失败:', error);
    return { success: false, error: error.message };
  }
});

// 获取上次打开的文件
ipcMain.handle('workspace:get-last-opened', async () => {
  try {
    const lastOpened = workspaceManager.getLastOpenedFile();
    
    if (lastOpened) {
      // 检查文件是否存在
      try {
        await fsPromises.access(lastOpened);
        const content = await fsPromises.readFile(lastOpened, 'utf-8');
        const language = workspaceManager.getFileLanguage(lastOpened);
        
        return {
          success: true,
          data: {
            path: lastOpened,
            content: content,
            name: path.basename(lastOpened),
            language: language
          }
        };
      } catch (fileError) {
        return { success: false, error: 'File not found' };
      }
    }
    
    return { success: false, error: 'No last opened file' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 清除最近文件列表
ipcMain.handle('workspace:clear-recent-files', async () => {
  try {
    workspaceManager.clearRecentFiles();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 文件系统 API - 读取文件
ipcMain.handle('fs:read-file', async (event, filePath, encoding = 'utf-8') => {
  try {
    // 解析路径：如果不是绝对路径，则相对于项目根目录
    let resolvedPath = filePath;
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.join(__dirname, filePath);
    }
    // 规范化路径（解析 ../ 等）
    resolvedPath = path.normalize(resolvedPath);
    
    // 如果是 base64 编码，需要先读取为 Buffer 再转换
    if (encoding === 'base64') {
      const buffer = await fsPromises.readFile(resolvedPath);
      return buffer.toString('base64');
    }
    const content = await fsPromises.readFile(resolvedPath, encoding);
    return content;
  } catch (error) {
    throw error;
  }
});

// 文件系统 API - 写入文件
ipcMain.handle('fs:write-file', async (event, filePath, content, encoding = 'utf-8') => {
  try {
    await fsPromises.writeFile(filePath, content, encoding);
    return { success: true };
  } catch (error) {
    throw error;
  }
});

// 文件系统 API - 检查文件是否存在
ipcMain.handle('fs:exists', async (event, filePath) => {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
});

