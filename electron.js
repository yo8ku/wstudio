/**
 * Electron 主进程启动文件
 */

const { app, BrowserWindow, ipcMain, protocol, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');
const http = require('http');
const { initializeExtensions, builtinExtensionManager, themeManager, settingsManager, workspaceManager, builtinAI } = require('./packages/main/dist/main/src/index.js');

let mainWindow;

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1413,
    minHeight: 934,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // 开发模式：加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, 'packages/renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 窗口加载完成后，发送当前主题
  mainWindow.webContents.on('did-finish-load', () => {
    const currentTheme = themeManager.getCurrentTheme();
    if (currentTheme) {
      console.log(`[Electron] 向渲染进程发送当前主题: ${currentTheme.name}`);
      mainWindow.webContents.send('theme:changed', currentTheme);
    }
  });
}

/**
 * 应用程序就绪后初始化
 */
app.whenReady().then(async () => {
  console.log('[Electron] 应用程序启动');
  
  // 注册自定义协议处理函数
  const handleFileProtocol = (protocolName) => (request, callback) => {
    console.log(`[Electron] ========== ${protocolName} 协议请求 ==========`);
    console.log('[Electron] 原始 URL:', request.url);
    
    try {
      // 移除协议前缀
      let url = request.url;
      if (protocolName === 'local-file') {
        // 处理 local-file://D:/path 或 local-file:///D:/path 格式
        url = url.replace(/^local-file:\/\/\/?/, '');
      } else if (protocolName === 'vscode-file') {
        // 处理 vscode-file://vscode-app/path 格式
        url = url.replace(/^vscode-file:\/\/vscode-app\/?/, '');
      }
      
      console.log('[Electron] 移除协议前缀后:', url);
      
      // 对路径的每个部分进行解码
      const decodedParts = url.split('/').map(part => {
        try {
          return decodeURIComponent(part);
        } catch (e) {
          return part;
        }
      });
      
      console.log('[Electron] 解码后的路径段:', decodedParts);
      
      // 使用正斜杠重新连接，然后转换为系统路径
      const decodedPath = decodedParts.join('/');
      console.log('[Electron] 连接后的路径:', decodedPath);
      
      // 规范化路径（将正斜杠转换为反斜杠）
      const normalizedPath = path.normalize(decodedPath);
      console.log('[Electron] 路径规范化后:', normalizedPath);
      
      // 检查文件是否存在
      if (fs.existsSync(normalizedPath)) {
        console.log('[Electron] ✅ 文件存在，返回路径:', normalizedPath);
        return callback({ path: normalizedPath });
      } else {
        console.error('[Electron] ❌ 文件不存在:', normalizedPath);
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
    } catch (error) {
      console.error('[Electron] ❌ 加载本地文件失败:', error);
      console.error('[Electron] 错误堆栈:', error.stack);
      return callback({ error: -2 }); // net::ERR_FAILED
    }
  };
  
  // 注册 local-file:// 协议用于加载本地文件
  protocol.registerFileProtocol('local-file', handleFileProtocol('local-file'));
  console.log('[Electron] ✅ local-file:// 协议已注册');
  
  // 注册 vscode-file:// 协议作为备用（兼容旧版扩展）
  protocol.registerFileProtocol('vscode-file', handleFileProtocol('vscode-file'));
  console.log('[Electron] ✅ vscode-file:// 协议已注册');
  
  // 初始化扩展系统（包括内置AI服务）
  try {
    await initializeExtensions();
    console.log('[Electron] 扩展系统初始化成功');
    
    // 应用默认主题
    const currentTheme = themeManager.getCurrentTheme();
    if (!currentTheme) {
      console.log('[Electron] 未设置主题，应用默认主题');
      const allThemes = themeManager.getAllThemes();
      const defaultTheme = allThemes.find(t => t.id.includes('default-dark')) || allThemes[0];
      if (defaultTheme) {
        await themeManager.applyTheme(defaultTheme.id);
        console.log(`[Electron] 已应用默认主题: ${defaultTheme.name}`);
      }
    }
    
    // 初始化工作区
    await workspaceManager.initialize();
    console.log('[Electron] 工作区初始化成功');
    
    // 检查内置AI服务状态（已在 initializeExtensions 中初始化）
    const models = builtinAI.getAvailableModels();
    console.log('[Electron] 📦 内置AI可用模型数量:', models.length);
  } catch (error) {
    console.error('[Electron] 扩展系统初始化失败:', error);
  }
  
  // 创建窗口
  createWindow();

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
 * 内置AI服务
 * 注意：已从 packages/main/dist/src/index.js 导入
 * 使用预定义的模型列表，不需要动态获取
 */

/**
 * 内置AI相关 IPC 处理
 * 注意：所有 IPC handlers 已在 BuiltinAI.ts 的 setupIPC() 方法中注册
 * 这里不需要重复注册，避免 "Attempted to register a second handler" 错误
 */

// 所有内置AI相关的 IPC 处理器已在 BuiltinAI.ts 中注册：
// - builtin-ai:get-models (获取可用模型列表)
// - builtin-ai:refresh-models (刷新模型列表)
// - builtin-ai:chat (AI聊天)

/**
 * IPC 通信处理
 */
ipcMain.handle('extension:list', async () => {
  // 获取所有扩展（builtin-extensions + extensions 目录）
  const builtinExtensions = builtinExtensionManager.getAllExtensions();
  const { extensionManager } = require('./packages/main/dist/main/src/index.js');
  const userExtensions = extensionManager.getAllExtensions();
  
  // 合并所有扩展
  const allExtensions = [...builtinExtensions, ...userExtensions];
  
  // 过滤掉 TypeScript 相关的扩展
  const filteredExtensions = allExtensions.filter(ext => {
    const name = (ext.name || '').toLowerCase();
    const id = (ext.id || '').toLowerCase();
    return !name.includes('typescript') && 
           !id.includes('typescript') &&
           !name.includes('ts-language') &&
           !id.includes('vscode.typescript');
  });
  
  console.log(`[IPC] 返回扩展列表: ${filteredExtensions.length} 个扩展 (内置: ${builtinExtensions.length}, 用户: ${userExtensions.length}, 已过滤 TypeScript 相关)`);
  
  return filteredExtensions;
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
 */
ipcMain.handle('theme:list', async () => {
  try {
    const themes = themeManager.getAllThemes();
    console.log('[IPC] 获取主题列表:', themes.length, '个主题');
    return { success: true, data: themes };
  } catch (error) {
    console.error('[IPC] 获取主题列表失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('theme:apply', async (event, themeId) => {
  try {
    console.log('[IPC] 应用主题:', themeId);
    const theme = themeManager.getThemeById(themeId);
    
    if (!theme) {
      throw new Error(`主题不存在: ${themeId}`);
    }
    
    await themeManager.applyTheme(themeId);
    
    // 广播主题变化事件到所有渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('theme:changed', theme);
    }
    
    return { success: true, theme };
  } catch (error) {
    console.error('[IPC] 应用主题失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('theme:current', async () => {
  try {
    const currentTheme = themeManager.getCurrentTheme();
    return { success: true, data: currentTheme };
  } catch (error) {
    console.error('[IPC] 获取当前主题失败:', error);
    return { success: false, error: error.message };
  }
});

// 监听主题列表更新事件，并通知渲染进程
themeManager.on('themes-updated', () => {
  console.log('[IPC] 主题列表已更新，通知渲染进程');
  if (mainWindow) {
    const themes = themeManager.getAllThemes();
    mainWindow.webContents.send('themes:list-updated', themes);
  }
});

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

// 打开文件夹对话框
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
    const settings = settingsManager.getAllWithDefaults();
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
 * 工作区相关 IPC 处理
 */

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

// AI API 请求代理 - 通过主进程发送请求以避免 SSL 问题
ipcMain.handle('ai:fetch', async (event, url, options) => {
  try {
    console.log('[IPC] AI API 请求:', url);
    
    // 动态导入 node-fetch (如果使用 Node.js 18+，fetch 是内置的)
    const fetch = globalThis.fetch || require('node-fetch');
    
    const response = await fetch(url, options);
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    const text = await response.text();
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: text
    };
  } catch (error) {
    console.error('[IPC] AI API 请求失败:', error);
    throw error;
  }
});
