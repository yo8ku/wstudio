/**
 * 主进程入口
 */

import { ExtensionManager } from './extensions/ExtensionManager';
import { ThemeManager } from './extensions/ThemeManager';
import { SettingsManager } from './config/SettingsManager';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { BuiltinAI } from './services/BuiltinAI';
import * as path from 'path';

// 从 dist 目录往上找到项目根目录下的 extensions
// __dirname: packages/main/dist/main/src
// ../../.. -> packages/main/dist
// ../../../.. -> packages/main
// ../../../../.. -> packages
// ../../../../../ -> 项目根目录
const extensionsPath = path.join(__dirname, '../../../../../extensions');
// 内置扩展路径 (dist/src -> dist -> main -> packages/builtin-extensions)
const builtinExtensionsPath = path.join(__dirname, '../../../builtin-extensions');

const extensionManager = new ExtensionManager(extensionsPath);
const builtinExtensionManager = new ExtensionManager(builtinExtensionsPath);
const themeManager = new ThemeManager();
const settingsManager = new SettingsManager();
const workspaceManager = new WorkspaceManager();
const builtinAI = new BuiltinAI();

export async function initializeExtensions(): Promise<void> {
  // 初始化工作区
  await workspaceManager.initialize();
  console.log('[Main] 工作区已初始化');
  
  // 初始化设置管理器
  await settingsManager.initialize();
  console.log('[Main] 设置管理器已初始化');
  
  // 初始化内置AI服务（独立于用户配置）
  await builtinAI.initialize();
  console.log('[Main] 内置AI服务已初始化');
  
  // 初始化内置扩展
  await builtinExtensionManager.initialize();
  console.log('[Main] 内置扩展系统已初始化');
  
  // 初始化根目录下的扩展（主题扩展位置）
  await extensionManager.initialize();
  console.log('[Main] 主题扩展系统已初始化');
  
  // 合并所有扩展（内置 + 主题扩展）
  const allExtensions = [
    ...builtinExtensionManager.getAllExtensions(),
    ...extensionManager.getAllExtensions()
  ];
  
  console.log(`[Main] 共加载 ${allExtensions.length} 个扩展 (内置: ${builtinExtensionManager.getAllExtensions().length}, 主题: ${extensionManager.getAllExtensions().length})`);
  
  // 激活所有设置为始终激活（"*"）的扩展
  for (const ext of allExtensions) {
    if (ext.activationEvents?.includes('*')) {
      console.log(`[Main] 自动激活扩展: ${ext.name}`);
      try {
        // 判断扩展属于哪个管理器
        let manager;
        if (builtinExtensionManager.getAllExtensions().includes(ext)) {
          manager = builtinExtensionManager;
        } else {
          manager = extensionManager;
        }
        await manager.loadExtension(ext.id);
      } catch (error) {
        console.error(`[Main] 激活扩展失败: ${ext.name}`, error);
      }
    }
  }
  
  // 加载所有扩展的主题
  for (const ext of allExtensions) {
    const extPath = ext.extensionPath || path.join(extensionsPath, ext.id);
    try {
      const count = await themeManager.registerThemesFromExtension(extPath);
      if (count > 0) {
        console.log(`[Main] 从 ${ext.name} 加载了 ${count} 个主题`);
      }
    } catch (error) {
      // 忽略没有主题的扩展
    }
  }
  
  // 显示主题统计
  const stats = themeManager.getStats();
  console.log(`[Main] 主题系统已初始化，共 ${stats.total} 个主题 (浅色: ${stats.light}, 深色: ${stats.dark})`);

  // 监听扩展变化，自动加载新主题
  setupExtensionWatcher();
}

/**
 * 设置扩展监听器 - 自动处理新安装的扩展和主题
 */
function setupExtensionWatcher(): void {
  // 监听用户扩展目录的变化
  extensionManager.on('extension-added', async (event: any) => {
    const ext = event.extension;
    console.log(`[Main] 检测到新扩展安装: ${ext.name}`);
    
    // 尝试从新扩展加载主题
    try {
      const count = await themeManager.registerThemesFromExtension(ext.extensionPath);
      if (count > 0) {
        console.log(`[Main] 从新扩展 ${ext.name} 加载了 ${count} 个主题`);
        
        // 触发主题列表更新事件
        themeManager.emit('themes-updated');
      }
    } catch (error) {
      console.log(`[Main] 扩展 ${ext.name} 不包含主题`);
    }
    
    // 如果扩展需要自动激活
    if (ext.activationEvents?.includes('*')) {
      try {
        await extensionManager.loadExtension(ext.id);
        console.log(`[Main] 已自动激活新扩展: ${ext.name}`);
      } catch (error) {
        console.error(`[Main] 激活新扩展失败: ${ext.name}`, error);
      }
    }
  });

  extensionManager.on('extension-removed', (event: any) => {
    const ext = event.extension;
    console.log(`[Main] 检测到扩展已卸载: ${ext.name}`);
    
    // 触发主题列表更新事件（ThemeManager 会处理主题移除）
    themeManager.emit('themes-updated');
  });

  console.log('[Main] 扩展监听器已启动，将自动检测新安装的扩展和主题');
}

export { extensionManager, builtinExtensionManager, themeManager, settingsManager, workspaceManager, builtinAI };

// 导出主题相关类型和类
export { ThemeManager } from './extensions/ThemeManager';
export { VSCodeThemeLoader, ITheme, ThemeColors } from './extensions/vscode-adapter/ThemeLoader';

// 导出设置管理器
export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';
