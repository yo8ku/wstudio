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
import { ThemeService } from './services/ThemeService';
import { TerminalService } from './services/terminal/TerminalService';
import * as path from 'path';

// 插件系统路径
// __dirname: packages/main/dist/main/src
// ../../../../../ -> 项目根目录
// ../../../../../resources/extensions/builtin -> 内置插件目录
const builtinPluginsPath = path.join(__dirname, '../../../../../resources/extensions/builtin');

// 用户插件路径（未来可能使用）
// const userPluginsPath = path.join(__dirname, '../../../../../extensions');

// 只使用内置插件管理器
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
  
  // 初始化设置管理器
  await settingsManager.initialize();
  console.log('[Main] 设置管理器已初始化');
  
  // 初始化内置AI服务（独立于用户配置）
  await builtinAI.initialize();
  console.log('[Main] 内置AI服务已初始化');
  
  // 如果提供了主窗口，创建共享的 API 适配器并设置到插件管理器
  if (mainWindow) {
    if (!sharedAPIAdapter) {
      console.log('[Main] 创建共享的 PluginAPIAdapter');
      sharedAPIAdapter = new PluginAPIAdapter(mainWindow);
      sharedAPIAdapter.setSettingsManager(settingsManager);
    }
    
    // 插件管理器关联 API 适配器
    pluginManager.setSharedAPIAdapter(sharedAPIAdapter);
    console.log('[Main] 插件管理器已关联共享的 API 适配器');
  }
  
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
