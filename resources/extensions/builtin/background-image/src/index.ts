/**
 * 背景图片插件 - 主入口
 * 为 Note Studio 提供自定义背景图片功能
 * 
 * 功能特性：
 * - 支持本地图片和网络图片
 * - 可调节透明度和模糊度
 * - 多种缩放模式和位置选项
 * - 配置持久化存储
 * - 可视化设置界面
 */

import type { PluginAPI, PluginContext } from './plugin-api';
import { BackgroundManager } from './BackgroundManager';
import { SettingsPanel } from './SettingsPanel';

let backgroundManager: BackgroundManager | null = null;
let settingsPanel: SettingsPanel | null = null;

/**
 * 插件激活函数
 * 当插件被激活时调用
 */
export async function activate(context: PluginContext, api: PluginAPI): Promise<void> {
  console.log('Background Image Plugin activated');

  // 创建背景管理器
  backgroundManager = new BackgroundManager(api);
  await backgroundManager.initialize();

  // 创建设置面板
  settingsPanel = new SettingsPanel(api, backgroundManager);

  // 注册命令：选择背景图片
  context.subscriptions.push(
    api.commands.registerCommand({
      id: 'background-image.select',
      title: '选择背景图片',
      category: '背景图片',
      handler: async () => {
        try {
          const result = await api.fs.showOpenDialog({
            filters: [
              { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
            ],
            properties: ['openFile']
          });

          if (result && result.length > 0 && backgroundManager) {
            await backgroundManager.setBackgroundImage(result[0]);
          }
        } catch (error) {
          console.error('Failed to select background image:', error);
          api.window.showErrorMessage('选择背景图片失败');
        }
      }
    })
  );

  // 注册命令：移除背景图片
  context.subscriptions.push(
    api.commands.registerCommand({
      id: 'background-image.remove',
      title: '移除背景图片',
      category: '背景图片',
      handler: async () => {
        if (backgroundManager) {
          await backgroundManager.removeBackgroundImage();
        }
      }
    })
  );

  // 注册命令：打开设置面板
  context.subscriptions.push(
    api.commands.registerCommand({
      id: 'background-image.settings',
      title: '背景图片设置',
      category: '背景图片',
      handler: () => {
        // 获取原始配置
        const rawConfig = backgroundManager?.getConfig();
        
        // 转换文件路径为 local-file:// 协议
        let configForRenderer = rawConfig;
        if (rawConfig && rawConfig.imagePath) {
          const convertToLocalFileUrl = (filePath: string): string => {
            // 规范化路径（转换为正斜杠）
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            // Windows 路径格式: local-file://D:/path/to/file.png
            // Unix 路径格式: local-file:///path/to/file.png
            if (normalizedPath.match(/^[a-zA-Z]:/)) {
              // Windows 绝对路径
              const driveLetter = normalizedPath.substring(0, 2);
              const pathWithoutDrive = normalizedPath.substring(2);
              const encodedParts = pathWithoutDrive.split('/').map(part => encodeURIComponent(part));
              const encodedPath = encodedParts.join('/');
              return `local-file://${driveLetter}${encodedPath}`;
            } else {
              // Unix 绝对路径
              const encodedParts = normalizedPath.split('/').map(part => encodeURIComponent(part));
              const encodedPath = encodedParts.join('/');
              return `local-file://${encodedPath}`;
            }
          };
          
          configForRenderer = {
            ...rawConfig,
            imagePath: convertToLocalFileUrl(rawConfig.imagePath)
          };
        }
        
        api.events.emit('background-image:show-settings', configForRenderer);
      }
    })
  );

  // 添加菜单项到视图菜单
  context.subscriptions.push(
    api.ui.registerMenuItem({
      id: 'background-image-menu',
      label: '背景图片',
      submenu: [
        {
          id: 'background-image.select-menu',
          label: '选择背景图片',
          command: 'background-image.select'
        },
        {
          id: 'background-image.settings-menu',
          label: '背景图片设置',
          command: 'background-image.settings'
        },
        {
          id: 'background-image.remove-menu',
          label: '移除背景图片',
          command: 'background-image.remove'
        }
      ],
      group: 'view',
      order: 100
    })
  );

  // 添加状态栏项
  const statusBarItem = api.ui.registerStatusBarItem({
    id: 'background-image-status',
    text: '$(file-media) 背景',
    tooltip: '点击打开背景图片设置',
    command: 'background-image.settings',
    alignment: 'right',
    priority: 100
  });
  context.subscriptions.push(statusBarItem);

  // 监听配置变化
  context.subscriptions.push(
    api.events.on('storage:changed', (event: any) => {
      if (event.key === 'backgroundImageConfig' && backgroundManager) {
        // 配置已在其他地方更改，重新加载
        backgroundManager.initialize();
      }
    })
  );

  // 监听主题变化，确保背景与主题协调
  context.subscriptions.push(
    api.events.on('theme:changed', () => {
      // 主题变化时，可能需要调整背景效果
      console.log('Theme changed, background may need adjustment');
    })
  );

  // 监听来自渲染进程的配置更新请求
  context.subscriptions.push(
    api.events.on('background-image:update-config', async (newConfig: any) => {
      console.log('[BackgroundImage] 收到渲染进程的配置更新请求:', newConfig);
      if (backgroundManager) {
        await backgroundManager.updateConfig(newConfig);
        api.window.showInformationMessage('背景图片设置已应用');
        // 通知渲染进程配置已更新
        api.events.emit('background-image:config-updated', backgroundManager.getConfig());
      }
    })
  );

  // 监听来自渲染进程的图片选择请求
  context.subscriptions.push(
    api.events.on('background-image:browse-image', async () => {
      try {
        const result = await api.fs.showOpenDialog({
          filters: [
            { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
          ],
          properties: ['openFile']
        });

        if (result && result.length > 0) {
          console.log('[BackgroundImage] 用户选择了图片:', result[0]);
          // 将选择的图片路径发送回渲染进程
          api.events.emit('background-image:image-selected', result[0]);
        }
      } catch (error) {
        api.window.showErrorMessage('选择图片失败');
      }
    })
  );

  // 监听渲染进程准备就绪事件，自动发送当前配置
  context.subscriptions.push(
    api.events.on('background-image:renderer-ready', () => {
      console.log('[BackgroundImage] ========== 渲染进程已准备就绪 ==========');
      const config = backgroundManager?.getConfig();
      if (config && config.enabled && config.imagePath) {
        console.log('[BackgroundImage] 原始配置:', config);
        // 延迟一点发送，确保渲染进程的监听器已完全注册
        setTimeout(() => {
          // 让 BackgroundManager 的 notifyRenderer 方法处理转换和发送
          if (backgroundManager) {
            // 直接调用 notifyRenderer 方法
            (backgroundManager as any).notifyRenderer();
            console.log('[BackgroundImage] 配置已发送');
          }
        }, 100);
      } else {
        console.log('[BackgroundImage] 没有需要应用的配置（enabled:', config?.enabled, ', imagePath:', config?.imagePath, ')');
      }
    })
  );

  api.window.showInformationMessage('背景图片插件已加载');
}

/**
 * 插件停用函数
 * 当插件被停用时调用
 */
export async function deactivate(): Promise<void> {
  console.log('Background Image Plugin deactivated');

  // 清理背景管理器
  if (backgroundManager) {
    backgroundManager.dispose();
    backgroundManager = null;
  }

  // 清理设置面板
  if (settingsPanel) {
    settingsPanel.dispose();
    settingsPanel = null;
  }
}

