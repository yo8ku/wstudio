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
import * as path from 'path';

let backgroundManager: BackgroundManager | null = null;

interface UserBackgroundImage {
  imagePath: string;
  date: string;
}

const USER_IMAGES_STORAGE_KEY = 'backgroundImageUserImages';

const loadUserImages = async (api: PluginAPI): Promise<UserBackgroundImage[]> => {
  try {
    const result = await api.storage.get<UserBackgroundImage[]>(USER_IMAGES_STORAGE_KEY);
    if (!result || !Array.isArray(result)) {
      return [];
    }
    return result
      .filter(
        (item) =>
          item &&
          typeof item.imagePath === 'string' &&
          item.imagePath &&
          typeof item.date === 'string'
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch (error) {
    console.warn('[BackgroundImage Plugin] 读取用户背景图片缓存失败，将使用空列表', error);
    return [];
  }
};

const saveUserImages = async (api: PluginAPI, images: UserBackgroundImage[]): Promise<void> => {
  try {
    await api.storage.set(USER_IMAGES_STORAGE_KEY, images);
  } catch (error) {
    console.error('[BackgroundImage Plugin] 保存用户背景图片缓存失败', error);
  }
};

/**
 * 插件激活函数
 * 当插件被激活时调用
 */
export async function activate(context: PluginContext, api: PluginAPI): Promise<void> {
  console.log('Background Image Plugin activated');

  // 创建背景管理器
  backgroundManager = new BackgroundManager(api);
  await backgroundManager.initialize();

  // 注意：设置面板功能在渲染进程中实现（BackgroundImageSettings 组件）

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
            if (!filePath) {
              return '';
            }
            
            // 如果已经是 local-file:// 协议，直接返回
            if (filePath.startsWith('local-file://')) {
              return filePath;
            }
            
            // 如果已经是 file:// 协议，先移除它
            let cleanPath = filePath;
            if (filePath.startsWith('file://')) {
              // 移除 file:// 或 file:/// 前缀
              cleanPath = filePath.replace(/^file:\/\/\/?/, '');
              // 如果是 Windows 路径，可能需要移除开头的斜杠
              if (cleanPath.match(/^\/[a-zA-Z]:/)) {
                cleanPath = cleanPath.substring(1);
              }
            }
            
            // 规范化路径（转换为正斜杠）
            let normalizedPath = cleanPath.replace(/\\/g, '/');
            
            // 如果路径已经被编码过，先尝试解码
            // 注意：需要先检查路径格式，避免错误解码
            try {
              // 检查是否包含编码字符（%XX格式）
              if (normalizedPath.includes('%')) {
                // 尝试解码整个路径
                const decoded = decodeURIComponent(normalizedPath);
                // 如果解码成功且路径格式正确，使用解码后的路径
                if (decoded && decoded.length > 0) {
                  // 验证解码后的路径是否包含有效的路径分隔符
                  if (decoded.includes('/') || decoded.match(/^[a-zA-Z]:/)) {
                    normalizedPath = decoded.replace(/\\/g, '/');
                  }
                }
              }
            } catch (e) {
              // 解码失败，使用原始路径
              console.warn('[BackgroundImage Plugin] 路径解码失败，使用原始路径:', e, '原始路径:', normalizedPath);
            }
            
            // Windows 路径格式: local-file://D:/path/to/file.png
            // Unix 路径格式: local-file:///path/to/file.png
            if (normalizedPath.match(/^[a-zA-Z]:/)) {
              // Windows 绝对路径
              const driveLetter = normalizedPath.substring(0, 2);
              const pathWithoutDrive = normalizedPath.substring(2);
              
              // 确保路径以 / 开头
              const pathWithSlash = pathWithoutDrive.startsWith('/') ? pathWithoutDrive : `/${pathWithoutDrive}`;
              
              // 分割路径并编码每个部分（保留斜杠）
              const pathParts = pathWithSlash.split('/').filter(part => part.length > 0);
              const encodedParts = pathParts.map(part => {
                try {
                  const decoded = decodeURIComponent(part);
                  return encodeURIComponent(decoded);
                } catch (e) {
                  return encodeURIComponent(part);
                }
              });
              
              const encodedPath = encodedParts.join('/');
              return `local-file://${driveLetter}/${encodedPath}`;
            } else {
              // Unix 绝对路径
              const pathWithSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
              const pathParts = pathWithSlash.split('/').filter(part => part.length > 0);
              const encodedParts = pathParts.map(part => {
                try {
                  const decoded = decodeURIComponent(part);
                  return encodeURIComponent(decoded);
                } catch (e) {
                  return encodeURIComponent(part);
                }
              });
              const encodedPath = encodedParts.join('/');
              return `local-file:///${encodedPath}`;
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

  // 注册命令：获取用户背景图片缓存列表
  context.subscriptions.push(
    api.commands.registerCommand({
      id: 'background-image:get-user-images',
      title: '获取用户背景图片缓存列表',
      category: '背景图片',
      handler: async () => {
        const images = await loadUserImages(api);
        return images;
      },
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
    })
  );

  // 监听来自渲染进程的配置更新请求
  context.subscriptions.push(
    api.events.on('background-image:update-config', async (newConfig: any) => {
      if (backgroundManager) {
        try {
          await backgroundManager.updateConfig(newConfig);
        } catch (error) {
          console.error('[BackgroundImage Plugin] ❌ backgroundManager.updateConfig 执行失败:', error);
          console.error('[BackgroundImage Plugin] 错误堆栈:', (error as Error).stack);
        }
        // updateConfig 内部已经通过 saveConfig -> notifyRenderer 发送了转换后的配置
        // 不需要再次发送，避免覆盖正确的配置
      } else {
        console.error('[BackgroundImage Plugin] ❌ backgroundManager 不存在，无法更新配置！');
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
          const sourcePath = result[0];
          console.log('[BackgroundImage] 用户选择了图片:', sourcePath);

          // 记录到用户背景图片缓存列表
          try {
            const current = await loadUserImages(api);
            const now = new Date().toISOString();
            const filtered = current.filter((item) => item.imagePath !== sourcePath);
            const updated: UserBackgroundImage[] = [{ imagePath: sourcePath, date: now }, ...filtered];
            await saveUserImages(api, updated);
          } catch (error) {
            console.warn('[BackgroundImage] 更新用户背景图片缓存失败:', error);
          }

          // 将用户选择的原始图片路径发送回渲染进程
          api.events.emit('background-image:image-selected', sourcePath);
        }
      } catch (error) {
        console.error('[BackgroundImage] 选择图片失败:', error);
        api.window.showErrorMessage('选择图片失败: ' + (error instanceof Error ? error.message : String(error)));
      }
    })
  );

  // 监听渲染进程准备就绪事件，自动发送当前配置
  context.subscriptions.push(
    api.events.on('background-image:renderer-ready', async () => {
      // 确保 backgroundManager 已初始化
      if (!backgroundManager) {
        console.warn('[BackgroundImage] backgroundManager 未初始化，等待初始化...');
        // 等待一小段时间后重试
        setTimeout(async () => {
          if (backgroundManager) {
            const config = backgroundManager.getConfig();
            if (config) {
              // 延迟一点发送，确保渲染进程的监听器已完全注册
              setTimeout(() => {
                if (backgroundManager) {
                  (backgroundManager as any).notifyRenderer();
                }
              }, 100);
            }
          } else {
            console.error('[BackgroundImage] backgroundManager 仍然未初始化');
          }
        }, 500);
        return;
      }
      
      // 重新加载配置，确保获取最新配置
      try {
        await backgroundManager.initialize();
      } catch (error) {
        console.error('[BackgroundImage] 重新加载配置失败:', error);
      }
      
      const config = backgroundManager.getConfig();
      if (config) {
        // 延迟一点发送，确保渲染进程的监听器已完全注册
        setTimeout(() => {
          // 让 BackgroundManager 的 notifyRenderer 方法处理转换和发送
          // 总是发送配置，即使配置为空，以确保渲染进程状态同步
          if (backgroundManager) {
            // 直接调用 notifyRenderer 方法
            (backgroundManager as any).notifyRenderer();
          }
        }, 100);
      } else {
        console.warn('[BackgroundImage] 无法获取配置，backgroundManager 未初始化');
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

  // 清理背景管理器
  if (backgroundManager) {
    backgroundManager.dispose();
    backgroundManager = null;
  }
}

