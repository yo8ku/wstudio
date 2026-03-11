/**
 * 主题系统 IPC 通信处理器
 * 提供渲染进程访问主题服务的 IPC 接口
 */

import { ipcMain, BrowserWindow } from 'electron';
import { ThemeService } from '../services/ThemeService';
import {
  THEME_CHANNELS,
  type SetThemeParams,
  type ThemeData,
} from '@note-studio/shared';

// 防止重复注册的标志
let isRegistered = false;

const DEFAULT_DARK_BACKGROUND = '#1e1e1e';
const DEFAULT_LIGHT_BACKGROUND = '#ffffff';

function clampColorChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(color: string): { red: number; green: number; blue: number; alpha: number } | null {
  const hex = color.replace('#', '').trim();
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const normalizedHex = hex.length <= 4
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const hasAlpha = normalizedHex.length === 8;
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const alpha = hasAlpha ? Number.parseInt(normalizedHex.slice(6, 8), 16) / 255 : 1;

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    red,
    green,
    blue,
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  };
}

function parseRgbColor(color: string): { red: number; green: number; blue: number; alpha: number } | null {
  const match = color.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([0-9.]+))?\s*\)$/i
  );

  if (!match) {
    return null;
  }

  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  return {
    red: clampColorChannel(Number.parseFloat(match[1])),
    green: clampColorChannel(Number.parseFloat(match[2])),
    blue: clampColorChannel(Number.parseFloat(match[3])),
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  };
}

function toOpaqueHex(color: string, fallbackColor: string): string {
  const fallback = parseHexColor(fallbackColor) || {
    red: 30,
    green: 30,
    blue: 30,
    alpha: 1
  };
  const normalizedColor = color.trim().toLowerCase();
  const parsedColor = normalizedColor.startsWith('#')
    ? parseHexColor(normalizedColor)
    : normalizedColor.startsWith('rgb')
      ? parseRgbColor(normalizedColor)
      : null;
  const source = parsedColor || fallback;
  const alpha = Math.max(0, Math.min(1, source.alpha ?? 1));
  const red = clampColorChannel(source.red * alpha + fallback.red * (1 - alpha));
  const green = clampColorChannel(source.green * alpha + fallback.green * (1 - alpha));
  const blue = clampColorChannel(source.blue * alpha + fallback.blue * (1 - alpha));

  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}

function resolveWindowBackgroundColor(theme: ThemeData | null): string {
  const isLightTheme = theme?.type === 'light' || theme?.type === 'hcLight';
  const fallbackColor = isLightTheme ? DEFAULT_LIGHT_BACKGROUND : DEFAULT_DARK_BACKGROUND;
  const themeColor = theme?.colors?.['editor.background']
    || theme?.colors?.['sideBar.background']
    || fallbackColor;

  return toOpaqueHex(themeColor, fallbackColor);
}

function syncWindowBackgroundColor(theme: ThemeData | null): void {
  const backgroundColor = resolveWindowBackgroundColor(theme);

  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(backgroundColor);
    }
  });
}

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
        syncWindowBackgroundColor(theme);
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
          syncWindowBackgroundColor(theme);
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
            syncWindowBackgroundColor(currentTheme);
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
            syncWindowBackgroundColor(theme);
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
          syncWindowBackgroundColor(theme);
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




