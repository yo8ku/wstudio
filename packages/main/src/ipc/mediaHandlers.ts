/**
 * 素材管理 IPC 处理器
 * 处理图片、视频素材的导入、管理等操作
 */

import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Store from 'electron-store';

/** 素材项接口 */
interface MediaItem {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video';
  size?: number;
  createdAt: number;
}

/** 素材存储 */
const mediaStore = new Store<{ mediaItems: MediaItem[] }>({
  name: 'media-store',
  defaults: {
    mediaItems: []
  }
});

/** 支持的图片扩展名 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'];

/** 支持的视频扩展名 */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv'];

/**
 * 判断文件类型
 */
function getMediaType(filePath: string): 'image' | 'video' | null {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}

/**
 * 注册素材管理相关的 IPC 处理器
 */
export function registerMediaHandlers(): void {
  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'media:get-list',
    'media:import-files',
    'media:import-folder',
    'media:delete',
    'media:open',
    'media:show-in-explorer',
    'media:rename'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  /**
   * 获取素材列表
   */
  ipcMain.handle('media:get-list', async () => {
    try {
      const items = mediaStore.get('mediaItems', []);
      // 过滤掉不存在的文件
      const validItems: MediaItem[] = [];
      for (const item of items) {
        try {
          await fs.access(item.path);
          validItems.push(item);
        } catch {
          // 文件不存在，跳过
        }
      }
      // 更新存储
      if (validItems.length !== items.length) {
        mediaStore.set('mediaItems', validItems);
      }
      return { success: true, data: validItems };
    } catch (error) {
      console.error('[MediaHandlers] 获取素材列表失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 导入文件
   */
  ipcMain.handle('media:import-files', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: '选择素材文件',
        filters: [
          { name: '媒体文件', extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map(e => e.slice(1)) },
          { name: '图片', extensions: IMAGE_EXTENSIONS.map(e => e.slice(1)) },
          { name: '视频', extensions: VIDEO_EXTENSIONS.map(e => e.slice(1)) }
        ],
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const items = mediaStore.get('mediaItems', []);
      const newItems: MediaItem[] = [];

      for (const filePath of result.filePaths) {
        // 检查是否已存在
        if (items.some(item => item.path === filePath)) {
          continue;
        }

        const mediaType = getMediaType(filePath);
        if (!mediaType) continue;

        try {
          const stat = await fs.stat(filePath);
          newItems.push({
            id: uuidv4(),
            name: path.basename(filePath),
            path: filePath,
            type: mediaType,
            size: stat.size,
            createdAt: Date.now()
          });
        } catch (error) {
          console.error(`[MediaHandlers] 读取文件信息失败: ${filePath}`, error);
        }
      }

      if (newItems.length > 0) {
        mediaStore.set('mediaItems', [...items, ...newItems]);
      }

      return { success: true, data: { imported: newItems.length } };
    } catch (error) {
      console.error('[MediaHandlers] 导入文件失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 导入文件夹
   */
  ipcMain.handle('media:import-folder', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: '选择素材文件夹',
        properties: ['openDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const folderPath = result.filePaths[0];
      const items = mediaStore.get('mediaItems', []);
      const newItems: MediaItem[] = [];

      // 递归扫描文件夹
      async function scanFolder(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scanFolder(fullPath);
          } else if (entry.isFile()) {
            // 检查是否已存在
            if (items.some(item => item.path === fullPath)) {
              continue;
            }

            const mediaType = getMediaType(fullPath);
            if (!mediaType) continue;

            try {
              const stat = await fs.stat(fullPath);
              newItems.push({
                id: uuidv4(),
                name: entry.name,
                path: fullPath,
                type: mediaType,
                size: stat.size,
                createdAt: Date.now()
              });
            } catch (error) {
              console.error(`[MediaHandlers] 读取文件信息失败: ${fullPath}`, error);
            }
          }
        }
      }

      await scanFolder(folderPath);

      if (newItems.length > 0) {
        mediaStore.set('mediaItems', [...items, ...newItems]);
      }

      return { success: true, data: { imported: newItems.length } };
    } catch (error) {
      console.error('[MediaHandlers] 导入文件夹失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除素材（仅从列表中移除，不删除文件）
   */
  ipcMain.handle('media:delete', async (_, ids: string[]) => {
    try {
      const items = mediaStore.get('mediaItems', []);
      const filteredItems = items.filter(item => !ids.includes(item.id));
      mediaStore.set('mediaItems', filteredItems);
      return { success: true, data: { deleted: items.length - filteredItems.length } };
    } catch (error) {
      console.error('[MediaHandlers] 删除素材失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 打开素材文件
   */
  ipcMain.handle('media:open', async (_, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error('[MediaHandlers] 打开文件失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 在资源管理器中显示文件
   */
  ipcMain.handle('media:show-in-explorer', async (_, filePath: string) => {
    try {
      console.log('[MediaHandlers] 在资源管理器中打开:', filePath);
      if (!filePath) {
        return { success: false, error: '文件路径为空' };
      }
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      console.error('[MediaHandlers] 在资源管理器中打开失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 重命名素材
   */
  ipcMain.handle('media:rename', async (_, id: string, newName: string) => {
    try {
      const items = mediaStore.get('mediaItems', []);
      const itemIndex = items.findIndex(item => item.id === id);

      if (itemIndex === -1) {
        return { success: false, error: '素材不存在' };
      }

      const item = items[itemIndex];
      const dir = path.dirname(item.path);
      const newPath = path.join(dir, newName);

      // 检查新文件名是否已存在
      try {
        await fs.access(newPath);
        return { success: false, error: '文件名已存在' };
      } catch {
        // 文件不存在，可以重命名
      }

      // 重命名文件
      await fs.rename(item.path, newPath);

      // 更新存储
      items[itemIndex] = {
        ...item,
        name: newName,
        path: newPath
      };
      mediaStore.set('mediaItems', items);

      return { success: true };
    } catch (error) {
      console.error('[MediaHandlers] 重命名失败:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[MediaHandlers] 素材管理 IPC 处理器已注册');
}
