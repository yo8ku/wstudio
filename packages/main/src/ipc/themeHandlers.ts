/**
 * 主题系统 IPC 通信处理器
 * 提供渲染进程访问主题服务的 IPC 接口
 */

import { ipcMain, BrowserWindow } from 'electron';
import { ThemeService } from '../services/ThemeService';
import {
  THEME_CHANNELS,
  type SetThemeParams,
} from '@note-studio/shared';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册主题相关的 IPC 处理器
 */
export function registerThemeHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = Object.values(THEME_CHANNELS) as string[];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler as string);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  const themeService = ThemeService.getInstance();

  // ==================== 查询操作 ====================

  /**
   * 获取所有主题列表
   */
  ipcMain.handle(THEME_CHANNELS.GET_ALL_THEMES, async () => {
    try {
      const themes = themeService.getAllThemes();
      console.log('[Theme IPC] 返回主题列表，数量:', themes.length);
      return themes;
    } catch (error) {
      console.error('[Theme IPC] 获取主题列表失败:', error);
      throw error;
    }
  });

  /**
   * 获取主题列表（轻量版）
   */
  ipcMain.handle(THEME_CHANNELS.GET_THEME_LIST, async () => {
    try {
      const themes = themeService.getAllThemes();
      console.log('[Theme IPC] 返回主题列表（轻量版），数量:', themes.length);
      return themes;
    } catch (error) {
      console.error('[Theme IPC] 获取主题列表失败:', error);
      throw error;
    }
  });

  /**
   * 获取单个主题详情
   */
  ipcMain.handle(THEME_CHANNELS.GET_THEME, async (event, themeId: string) => {
    try {
      const theme = themeService.getTheme(themeId);
      if (!theme) {
        throw new Error(`主题不存在: ${themeId}`);
      }
      console.log('[Theme IPC] 返回主题详情:', themeId);
      return theme;
    } catch (error) {
      console.error('[Theme IPC] 获取主题详情失败:', error);
      throw error;
    }
  });

  /**
   * 获取最新的用户自定义主题文件
   */
  ipcMain.handle(THEME_CHANNELS.GET_LATEST_USER_THEME_FILE, async () => {
    try {
      const result = await themeService.getLatestUserThemeFile();
      console.log('[Theme IPC] 返回最新用户主题文件:', result?.path || '无');
      return result;
    } catch (error) {
      console.error('[Theme IPC] 获取最新用户主题文件失败:', error);
      throw error;
    }
  });

  /**
   * 获取当前主题
   */
  ipcMain.handle(THEME_CHANNELS.GET_CURRENT_THEME, async () => {
    try {
      const theme = await themeService.getCurrentTheme();
      console.log('[Theme IPC] 返回当前主题:', theme?.id);
      return theme;
    } catch (error) {
      console.error('[Theme IPC] 获取当前主题失败:', error);
      throw error;
    }
  });

  /**
   * 获取主题配置
   */
  ipcMain.handle(THEME_CHANNELS.GET_THEME_CONFIG, async () => {
    try {
      const config = themeService.getThemeConfig();
      console.log('[Theme IPC] 返回主题配置');
      return config;
    } catch (error) {
      console.error('[Theme IPC] 获取主题配置失败:', error);
      throw error;
    }
  });

  // ==================== 设置操作 ====================

  /**
   * 设置当前主题
   */
  ipcMain.handle(THEME_CHANNELS.SET_THEME, async (event, params: SetThemeParams) => {
    try {
      console.log('[Theme IPC] 设置主题:', params.themeId);
      const success = await themeService.setTheme(params.themeId, params.customColors);

      if (success) {
        // 通知所有窗口主题已更改
        const theme = await themeService.getCurrentTheme();
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(THEME_CHANNELS.THEME_CHANGED, theme);
        });
      }

      return { success };
    } catch (error) {
      console.error('[Theme IPC] 设置主题失败:', error);
      throw error;
    }
  });

  /**
   * 设置自定义颜色
   */
  ipcMain.handle(
    THEME_CHANNELS.SET_CUSTOM_COLORS,
    async (event, customColors: Record<string, string>) => {
      try {
        console.log('[Theme IPC] 设置自定义颜色');
        const success = await themeService.setCustomColors(customColors);

        if (success) {
          // 通知所有窗口主题已更改
          const theme = await themeService.getCurrentTheme();
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send(THEME_CHANNELS.THEME_CHANGED, theme);
          });
        }

        return { success };
      } catch (error) {
        console.error('[Theme IPC] 设置自定义颜色失败:', error);
        throw error;
      }
    }
  );

  // ==================== 主题管理 ====================

  /**
   * 保存主题
   */
  ipcMain.handle(
    THEME_CHANNELS.SAVE_THEME,
    async (event, themeData: Record<string, unknown>, options?: { setAsActive?: boolean }) => {
      try {
        console.log('[Theme IPC] 保存主题:', themeData.id);
        const result = await themeService.saveTheme(themeData as Parameters<typeof themeService.saveTheme>[0], options);

        if (result.success) {
          // 通知所有窗口主题列表已更新
          const themes = themeService.getAllThemes();
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send(THEME_CHANNELS.THEME_LIST_UPDATED, themes);
          });

          // 如果设置为活动主题，通知主题已更改
          if (options?.setAsActive) {
            const currentTheme = await themeService.getCurrentTheme();
            BrowserWindow.getAllWindows().forEach((window) => {
              window.webContents.send(THEME_CHANNELS.THEME_CHANGED, currentTheme);
            });
          }
        }

        return result;
      } catch (error) {
        console.error('[Theme IPC] 保存主题失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '保存主题失败',
        };
      }
    }
  );

  /**
   * 删除主题
   */
  ipcMain.handle(THEME_CHANNELS.DELETE_THEME, async (event, themeId: string) => {
    try {
      console.log('[Theme IPC] 删除主题:', themeId);
      const success = await themeService.deleteTheme(themeId);

      if (success) {
        // 通知所有窗口主题列表已更新
        const themes = themeService.getAllThemes();
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send(THEME_CHANNELS.THEME_LIST_UPDATED, themes);
        });
      }

      return { success };
    } catch (error) {
      console.error('[Theme IPC] 删除主题失败:', error);
      throw error;
    }
  });

  // ==================== 主题覆盖操作 ====================

  /**
   * 保存主题颜色覆盖
   */
  ipcMain.handle(
    THEME_CHANNELS.SAVE_OVERRIDE,
    async (event, data: { baseThemeId: string; colors: Record<string, string> }) => {
      try {
        console.log('[Theme IPC] 保存主题覆盖:', data.baseThemeId);
        const result = await themeService.saveThemeOverride(data.baseThemeId, data.colors);

        if (result.success) {
          // 通知所有窗口主题已更新（因为颜色被覆盖）
          const theme = themeService.getTheme(data.baseThemeId);
          if (theme) {
            BrowserWindow.getAllWindows().forEach((window) => {
              window.webContents.send(THEME_CHANNELS.THEME_CHANGED, theme);
            });
          }
        }

        return result;
      } catch (error) {
        console.error('[Theme IPC] 保存主题覆盖失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '保存主题覆盖失败',
        };
      }
    }
  );

  /**
   * 获取主题颜色覆盖
   */
  ipcMain.handle(THEME_CHANNELS.GET_THEME_OVERRIDE, async (event, baseThemeId: string) => {
    try {
      console.log('[Theme IPC] 获取主题覆盖:', baseThemeId);
      const result = await themeService.getThemeOverride(baseThemeId);
      return result;
    } catch (error) {
      console.error('[Theme IPC] 获取主题覆盖失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取主题覆盖失败',
      };
    }
  });

  /**
   * 删除主题颜色覆盖
   */
  ipcMain.handle(THEME_CHANNELS.DELETE_OVERRIDE, async (event, baseThemeId: string) => {
    try {
      console.log('[Theme IPC] 删除主题覆盖:', baseThemeId);
      const result = await themeService.deleteThemeOverride(baseThemeId);

      if (result.success) {
        // 通知所有窗口主题已更新（因为覆盖被移除）
        const theme = themeService.getTheme(baseThemeId);
        if (theme) {
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.send(THEME_CHANNELS.THEME_CHANGED, theme);
          });
        }
      }

      return result;
    } catch (error) {
      console.error('[Theme IPC] 删除主题覆盖失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除主题覆盖失败',
      };
    }
  });

  console.log('[Theme IPC] 所有主题 IPC 处理器已注册');
}




