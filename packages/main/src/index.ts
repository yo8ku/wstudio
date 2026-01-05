/**
 * 主进程入口
 */

import { BrowserWindow } from 'electron';
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
import { registerWorkspaceVectorIndexHandlers, setWorkspaceVectorIndexMainWindow } from './ipc/workspaceVectorIndexHandlers';
import { registerWorkspaceIndexDbHandlers } from './ipc/workspaceIndexDbHandlers';
import { ThemeService } from './services/ThemeService';
import { TerminalService } from './services/terminal';
import * as path from 'path';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerNoteSystemHandlers } from './note-system';
import { registerDatabaseConnectorHandlers, cleanupDatabaseConnections } from './ipc/databaseConnectorHandlers';
import { registerFormHandlers } from './ipc/formHandlers';

// 插件系统路径
// 使用多种方式尝试找到项目根目录，确保路径正确
const getProjectRoot = (): string => {
  // 尝试多个可能的项目根目录路径
  const possibleRoots = [
    // 从 __dirname 向上 7 级（到达 packages 目录，然后需要再上一级）
    path.resolve(__dirname, '../../../../../../'),
    // 从 __dirname 向上 6 级（到达 packages 目录）
    path.resolve(__dirname, '../../../../../'),
    // 使用 process.cwd()（当前工作目录，通常是项目根）
    process.cwd(),
  ];
  
  // 查找包含 packages/extensions/builtin 的根目录
  for (const root of possibleRoots) {
    const testPath = path.join(root, 'packages', 'extensions', 'builtin');
    try {
      if (require('fs').existsSync(testPath)) {
        return root;
      }
    } catch {
      // 继续尝试下一个路径
    }
  }
  
  // 如果都找不到，使用 process.cwd() 作为后备
  return process.cwd();
};

const projectRoot = getProjectRoot();
const builtinPluginsPath = path.join(projectRoot, 'packages', 'extensions', 'builtin');
console.log('[Main] 项目根目录:', projectRoot);
console.log('[Main] 内置插件目录:', builtinPluginsPath);

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

export async function initializeExtensions(mainWindow?: BrowserWindow | null): Promise<void> {
  // 注册 electron-store IPC 处理器
  registerStoreHandlers();
  
  // 注册设置相关 IPC 处理器
  registerSettingsHandlers(settingsManager, workspaceManager, mainWindow || null);
  
  // 注册片段数据库 IPC 处理器
  registerSnippetHandlers();
  
  // 注册文件操作 IPC 处理器
  registerFileHandlers();
  
  // 注册主题 IPC 处理器
  registerThemeHandlers();
  
  // 注册聊天历史 IPC 处理器
  registerChatHistoryHandlers();
  
  // 注册内联聊天历史 IPC 处理器
  registerInlineChatHistoryHandlers();
  
  // 注册 AI 模型配置 IPC 处理器
  registerAIModelHandlers();
  
  // 注册文件引用 IPC 处理器
  registerFileReferenceHandlers();
  
  // 注册工作区向量索引 IPC 处理器
  registerWorkspaceVectorIndexHandlers();
  
  // 注册工作区索引数据库 IPC 处理器
  registerWorkspaceIndexDbHandlers();
  
  // 注册笔记系统 IPC 处理器
  registerNoteSystemHandlers();
  
  // 注册数据库连接器 IPC 处理器
  registerDatabaseConnectorHandlers();
  
  // 注册表单 IPC 处理器
  registerFormHandlers();
  
  // 注册终端 IPC 处理器
  registerTerminalHandlers();
  
  // 初始化终端服务（只在有 mainWindow 时）
  if (mainWindow && !terminalService) {
    terminalService = new TerminalService(mainWindow);
    registerTerminalHandlers(terminalService);
    console.log('[Main] 终端服务已初始化');
  }
  
  // 初始化主题服务
  const themeService = ThemeService.getInstance();
  await themeService.initialize();
  
  // 初始化工作区
  await workspaceManager.initialize();
  
  // 如果提供了主窗口，设置索引服务的主窗口（用于发送进度事件）
  if (mainWindow) {
    console.log('[Main] 设置向量索引服务的主窗口');
    setWorkspaceVectorIndexMainWindow(mainWindow);
  } else {
    console.log('[Main] mainWindow 为空，跳过设置向量索引服务的主窗口');
  }

  // 工作区向量索引由 MainLayout.tsx 在渲染进程启动时触发
  // 不在这里自动启动，避免重复索引
  console.log('[Main] RAG 服务已初始化（本地模式）');
  
  // 初始化设置管理器
  await settingsManager.initialize();
  
  // 初始化内置AI服务（独立于用户配置）
  await builtinAI.initialize();
  console.log('[Main] 内置AI服务已初始化');
  
  // 创建共享的 API 适配器（即使 mainWindow 为 null，也要创建以注册 IPC 处理器）
  if (!sharedAPIAdapter) {
    sharedAPIAdapter = new PluginAPIAdapter(mainWindow || null);
    sharedAPIAdapter.setSettingsManager(settingsManager);
    sharedAPIAdapter.setWorkspaceManager(workspaceManager);
  } else if (mainWindow) {
    // 如果之前创建时 mainWindow 为 null，现在更新它
    sharedAPIAdapter.setMainWindow(mainWindow);
  }
  
  // 插件管理器关联 API 适配器
  pluginManager.setSharedAPIAdapter(sharedAPIAdapter);
 
  
  // 初始化插件系统
  await pluginManager.initialize();
  
  const allPlugins = pluginManager.getAllExtensions();
  
  // 激活所有设置为始终激活（"*"）的插件
  for (const plugin of allPlugins) {
    if (plugin.activationEvents?.includes('*')) {
      try {
        await pluginManager.loadExtension(plugin.id);
      } catch (error) {
        console.error(`[Main]  激活插件失败: ${plugin.name}`, error);
      }
    }
  }

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
    // 如果插件需要自动激活
    if (plugin.activationEvents?.includes('*')) {
      try {
        await pluginManager.loadExtension(plugin.id);
      } catch (error) {
        console.error(`[Main] 激活新插件失败: ${plugin.name}`, error);
      }
    }
  });

  pluginManager.on('extension-removed', (event: any) => {
    const plugin = event.extension;
  });

}

export { pluginManager, settingsManager, workspaceManager, builtinAI };

// 导出设置管理器
export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';

// 导出文件引用服务
export { FileReferenceService } from './services/FileReferenceService';
export type { FileReference } from './services/FileReferenceService';

// 导出数据库连接清理函数
export { cleanupDatabaseConnections } from './ipc/databaseConnectorHandlers';
