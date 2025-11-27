/**
 * 主进程入口
 */

import { ExtensionManager } from './extensions/ExtensionManager';
import { SettingsManager } from './config/SettingsManager';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { BuiltinAI } from './services/BuiltinAI';
import { PluginAPIAdapter } from './extensions/PluginAPIAdapter';
import { registerStoreHandlers } from './ipc/storeHandlers';
import { registerSnippetHandlers } from './ipc/snippetHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerThemeHandlers } from './ipc/themeHandlers';
import { registerChatHistoryHandlers } from './ipc/chatHistoryHandlers';
import { registerInlineChatHistoryHandlers } from './ipc/inlineChatHistoryHandlers';
import { registerTerminalHandlers } from './ipc/terminalHandlers';
import { registerAIModelHandlers } from './ipc/aiModelHandlers';
import { registerFileReferenceHandlers } from './ipc/fileReferenceHandlers';
import { registerPythonBridgeHandlers } from './ipc/pythonBridgeHandlers';
import { registerWorkspaceIndexHandlers, setWorkspaceIndexMainWindow, getWorkspaceIndexService } from './ipc/workspaceIndexHandlers';
import { getRAGFileWatcherService } from './ipc/ragFileWatcherHandlers';
import { ThemeService } from './services/ThemeService';
import { TerminalService } from './services/terminal/TerminalService';
import * as path from 'path';
import { registerSettingsHandlers } from './ipc/settingsHandlers';

// 插件系统路径
// __dirname: packages/main/dist/main/src
// ../../../../ -> packages 目录
// ../../../../extensions/builtin -> 内置插件目录
const builtinPluginsPath = path.join(__dirname, '../../../../extensions/builtin');

// 用户插件路径（未来可能使用）
// const userPluginsPath = path.join(__dirname, '../../../../extensions');

// 插件管理器
const pluginManager = new ExtensionManager(builtinPluginsPath);
const settingsManager = new SettingsManager();
const workspaceManager = new WorkspaceManager();
const builtinAI = new BuiltinAI();

// ⭐ 共享的 PluginAPIAdapter 实例（避免重复注册 IPC handlers）
let sharedAPIAdapter: PluginAPIAdapter | null = null;

// ⭐ 终端服务实例
let terminalService: TerminalService | null = null;

export async function initializeExtensions(mainWindow?: any): Promise<void> {
  console.log('[Main] ========== initializeExtensions 开始执行 ==========');
  console.log('[Main] mainWindow:', !!mainWindow);
  
  // 注册 electron-store IPC 处理器
  registerStoreHandlers();
  console.log('[Main] electron-store IPC 处理器已注册');
  
  // 注册设置相关 IPC 处理器
  registerSettingsHandlers(settingsManager, workspaceManager, mainWindow || null);
  console.log('[Main] 设置 IPC 处理器已注册');
  
  // 注册片段数据库 IPC 处理器
  registerSnippetHandlers();
  console.log('[Main] 片段数据库 IPC 处理器已注册');
  
  // 注册文件操作 IPC 处理器
  registerFileHandlers();
  console.log('[Main] 文件操作 IPC 处理器已注册');
  
  // 注册主题 IPC 处理器
  registerThemeHandlers();
  console.log('[Main] 主题 IPC 处理器已注册');
  
  // 注册聊天历史 IPC 处理器
  registerChatHistoryHandlers();
  console.log('[Main] 聊天历史 IPC 处理器已注册');
  
  // 注册内联聊天历史 IPC 处理器
  registerInlineChatHistoryHandlers();
  console.log('[Main] 内联聊天历史 IPC 处理器已注册');
  
  // 注册 AI 模型配置 IPC 处理器
  registerAIModelHandlers();
  console.log('[Main] AI 模型配置 IPC 处理器已注册');
  
  // 注册文件引用 IPC 处理器
  registerFileReferenceHandlers();
  console.log('[Main] 文件引用 IPC 处理器已注册');
  
  // 注册 PythonBridge IPC 处理器
  registerPythonBridgeHandlers();
  console.log('[Main] PythonBridge IPC 处理器已注册');
  
  // 注册工作区索引 IPC 处理器
  registerWorkspaceIndexHandlers();
  console.log('[Main] 工作区索引 IPC 处理器已注册');
  
  // RAG 文件监听服务现在完全由 Python 端处理，不再需要前端 IPC 接口
  
  // 初始化终端服务并注册处理器（只在有 mainWindow 时）
  if (mainWindow && !terminalService) {
    terminalService = new TerminalService(mainWindow);
    registerTerminalHandlers(terminalService);
    console.log('[Main] 终端服务已初始化并注册 IPC 处理器');
  }
  
  // 初始化主题服务
  const themeService = ThemeService.getInstance();
  await themeService.initialize();
  console.log('[Main] 主题服务已初始化');
  
  // 初始化工作区
  await workspaceManager.initialize();
  console.log('[Main] 工作区已初始化');
  
  // 如果提供了主窗口，设置索引服务的主窗口（用于发送进度事件）
  if (mainWindow) {
    setWorkspaceIndexMainWindow(mainWindow);
    // RAG 文件监听服务现在完全由 Python 端处理，不再需要主窗口
  }

  // 检查是否首次启动，如果是则索引工作区
  const workspaceDir = workspaceManager.getWorkspaceDir();
  if (workspaceDir) {
    try {
      // 使用 workspaceIndexHandlers 中的同一个服务实例，确保主窗口设置生效
      const indexService = getWorkspaceIndexService();
      // 如果提供了主窗口，设置主窗口以便发送进度事件
      if (mainWindow) {
        indexService.setMainWindow(mainWindow);
      }
      await indexService.initialize();
      
      // 检查索引是否已存在
      const stats = await indexService.getIndexStats();
      
      // 如果索引为空或文件数量很少，执行索引
      if (stats.totalFiles === 0) {
        console.log('[Main] 检测到首次启动，开始索引工作区...');
        // 在后台异步执行索引，不阻塞应用启动
        indexService.indexWorkspace(workspaceDir).then((result) => {
          console.log(`[Main] 工作区索引完成: 成功 ${result.indexedFiles} 个文件，失败 ${result.errors.length} 个文件`);
        }).catch((error) => {
          console.error('[Main] 工作区索引失败:', error);
        });
      } else {
        console.log(`[Main] 工作区索引已存在，共 ${stats.totalFiles} 个文件`);
      }
      
      // 启动 RAG 文件监听服务
      const ragWatcherService = getRAGFileWatcherService();
      ragWatcherService.setWorkspacePath(workspaceDir);
      console.log('[Main] RAG 文件监听服务已启动');
    } catch (error) {
      console.error('[Main] 初始化工作区索引服务失败:', error);
    }
  }
  
  // 初始化设置管理器
  await settingsManager.initialize();
  console.log('[Main] 设置管理器已初始化');
  
  // 初始化内置AI服务（独立于用户配置）
  await builtinAI.initialize();
  console.log('[Main] 内置AI服务已初始化');
  
  // 创建共享的 API 适配器（即使 mainWindow 为 null，也要创建以注册 IPC 处理器）
  if (!sharedAPIAdapter) {
    console.log('[Main] 创建共享的 PluginAPIAdapter');
    sharedAPIAdapter = new PluginAPIAdapter(mainWindow || null);
    sharedAPIAdapter.setSettingsManager(settingsManager);
    sharedAPIAdapter.setWorkspaceManager(workspaceManager);
  } else if (mainWindow) {
    // 如果之前创建时 mainWindow 为 null，现在更新它
    console.log('[Main] 更新 PluginAPIAdapter 的 mainWindow');
    sharedAPIAdapter.setMainWindow(mainWindow);
  }
  
  // 插件管理器关联 API 适配器
  pluginManager.setSharedAPIAdapter(sharedAPIAdapter);
  console.log('[Main] 插件管理器已关联共享的 API 适配器');
  
  // 调试：打印路径信息
  console.log('[Main] ========== 路径调试信息 ==========');
  console.log('[Main] 当前 __dirname:', __dirname);
  console.log('[Main] 内置插件路径:', builtinPluginsPath);
  console.log('[Main] =====================================');
  
  // 初始化插件系统
  await pluginManager.initialize();
  console.log('[Main] 插件系统已初始化');
  
  const allPlugins = pluginManager.getAllExtensions();
  console.log(`[Main] 共加载 ${allPlugins.length} 个插件`);
  
  // 激活所有设置为始终激活（"*"）的插件
  console.log('[Main] ========== 开始激活插件 ==========');
  for (const plugin of allPlugins) {
    console.log(`[Main] 检查插件: ${plugin.name}, activationEvents:`, plugin.activationEvents);
    if (plugin.activationEvents?.includes('*')) {
      console.log(`[Main]  自动激活插件: ${plugin.name} (${plugin.id})`);
      try {
        await pluginManager.loadExtension(plugin.id);
        console.log(`[Main]  插件激活成功: ${plugin.name}`);
      } catch (error) {
        console.error(`[Main]  激活插件失败: ${plugin.name}`, error);
      }
    }
  }
  console.log('[Main] ========== 插件激活完成 ==========');

  // 监听扩展变化
  setupExtensionWatcher();
}

/**
 * 设置插件监听器 - 自动处理新安装的插件
 */
function setupExtensionWatcher(): void {
  // 监听插件目录的变化
  pluginManager.on('extension-added', async (event: any) => {
    const plugin = event.extension;
    console.log(`[Main] 检测到新插件安装: ${plugin.name}`);
    
    // 如果插件需要自动激活
    if (plugin.activationEvents?.includes('*')) {
      try {
        await pluginManager.loadExtension(plugin.id);
        console.log(`[Main] 已自动激活新插件: ${plugin.name}`);
      } catch (error) {
        console.error(`[Main] 激活新插件失败: ${plugin.name}`, error);
      }
    }
  });

  pluginManager.on('extension-removed', (event: any) => {
    const plugin = event.extension;
    console.log(`[Main] 检测到插件已卸载: ${plugin.name}`);
  });

  console.log('[Main] 插件监听器已启动，将自动检测新安装的插件');
}

export { pluginManager, settingsManager, workspaceManager, builtinAI };

// 导出设置管理器
export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';

// 导出文件引用服务
export { FileReferenceService } from './services/FileReferenceService';
export type { FileReference } from './services/FileReferenceService';
