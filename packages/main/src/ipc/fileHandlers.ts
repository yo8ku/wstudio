/**
 * 文件操作 IPC 处理器
 * 处理文件读取、写入等操作
 */

import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import iconv from 'iconv-lite';
import type { SettingsManager } from '../config/SettingsManager';
import { workspaceVectorIndexService } from '../services/WorkspaceVectorIndexService';

/** 文件过滤器类型 */
interface FileFilter {
  name: string;
  extensions: string[];
}

/** 打开文件对话框选项 */
interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
}

/** 打开文件对话框结果 */
interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

type TextFileEncoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'gbk';
type FileSystemEncoding = TextFileEncoding | 'base64';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

const normalizeTextEncoding = (
  encoding: string | undefined,
  fallback: TextFileEncoding,
): TextFileEncoding => {
  const normalized = encoding?.trim().toLowerCase().replace(/[-_]/g, '');

  switch (normalized) {
    case 'utf8':
      return 'utf8';
    case 'utf8bom':
      return 'utf8bom';
    case 'utf16':
    case 'utf16le':
      return 'utf16le';
    case 'utf16be':
      return 'utf16be';
    case 'gbk':
    case 'gb2312':
    case 'gb18030':
      return 'gbk';
    default:
      return fallback;
  }
};

const normalizeFileSystemEncoding = (
  encoding: string | undefined,
  fallback: TextFileEncoding,
): FileSystemEncoding => {
  const normalized = encoding?.trim().toLowerCase();

  if (normalized === 'base64') {
    return 'base64';
  }

  return normalizeTextEncoding(encoding, fallback);
};

const stripByteOrderMark = (content: string): string => (
  content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
);

const detectBomEncoding = (buffer: Buffer): TextFileEncoding | null => {
  if (buffer.length >= UTF8_BOM.length && buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    return 'utf8bom';
  }

  if (buffer.length >= UTF16LE_BOM.length && buffer.subarray(0, UTF16LE_BOM.length).equals(UTF16LE_BOM)) {
    return 'utf16le';
  }

  if (buffer.length >= UTF16BE_BOM.length && buffer.subarray(0, UTF16BE_BOM.length).equals(UTF16BE_BOM)) {
    return 'utf16be';
  }

  return null;
};

const decodeTextBuffer = (buffer: Buffer, encoding: TextFileEncoding): string => {
  switch (encoding) {
    case 'utf8':
    case 'utf8bom':
      return stripByteOrderMark(iconv.decode(buffer, 'utf8'));
    case 'utf16le':
      return stripByteOrderMark(iconv.decode(buffer, 'utf16le'));
    case 'utf16be':
      return stripByteOrderMark(iconv.decode(buffer, 'utf16be'));
    case 'gbk':
      return iconv.decode(buffer, 'gbk');
  }
};

const encodeTextContent = (content: string, encoding: TextFileEncoding): Buffer => {
  switch (encoding) {
    case 'utf8':
      return iconv.encode(content, 'utf8');
    case 'utf8bom':
      return Buffer.concat([UTF8_BOM, iconv.encode(content, 'utf8')]);
    case 'utf16le':
      return Buffer.concat([UTF16LE_BOM, iconv.encode(content, 'utf16le')]);
    case 'utf16be':
      return Buffer.concat([UTF16BE_BOM, iconv.encode(content, 'utf16be')]);
    case 'gbk':
      return iconv.encode(content, 'gbk');
  }
};

const getDefaultTextEncoding = (settingsManager: SettingsManager): TextFileEncoding => (
  normalizeTextEncoding(settingsManager.get('files.encoding'), 'utf8')
);

const resolveReadEncoding = (
  buffer: Buffer,
  encoding: string | undefined,
  settingsManager: SettingsManager,
): TextFileEncoding => {
  if (typeof encoding === 'string' && encoding.trim().length > 0) {
    return normalizeTextEncoding(encoding, getDefaultTextEncoding(settingsManager));
  }

  return detectBomEncoding(buffer) ?? getDefaultTextEncoding(settingsManager);
};

const ensureFileAccessible = async (filePath: string): Promise<void> => {
  try {
    await fs.access(filePath);
  } catch (error) {
    console.error('[FileHandlers] 文件不存在:', filePath);
    throw new Error(`文件不存在: ${filePath}`);
  }
};

const readTextFile = async (
  filePath: string,
  encoding: string | undefined,
  settingsManager: SettingsManager,
): Promise<string> => {
  await ensureFileAccessible(filePath);
  const buffer = await fs.readFile(filePath);
  const resolvedEncoding = resolveReadEncoding(buffer, encoding, settingsManager);
  return decodeTextBuffer(buffer, resolvedEncoding);
};

const readFileByEncoding = async (
  filePath: string,
  encoding: string | undefined,
  settingsManager: SettingsManager,
): Promise<string> => {
  await ensureFileAccessible(filePath);
  const buffer = await fs.readFile(filePath);
  const resolvedEncoding = normalizeFileSystemEncoding(encoding, getDefaultTextEncoding(settingsManager));

  if (resolvedEncoding === 'base64') {
    return buffer.toString('base64');
  }

  return decodeTextBuffer(buffer, resolveReadEncoding(buffer, encoding, settingsManager));
};

const ensureParentDirectory = async (filePath: string): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const writeTextFile = async (
  filePath: string,
  content: string,
  encoding: string | undefined,
  settingsManager: SettingsManager,
): Promise<void> => {
  await ensureParentDirectory(filePath);
  const resolvedEncoding = normalizeTextEncoding(encoding, getDefaultTextEncoding(settingsManager));
  await fs.writeFile(filePath, encodeTextContent(content, resolvedEncoding));
};

const writeFileByEncoding = async (
  filePath: string,
  content: string,
  encoding: string | undefined,
  settingsManager: SettingsManager,
): Promise<void> => {
  await ensureParentDirectory(filePath);
  const resolvedEncoding = normalizeFileSystemEncoding(encoding, getDefaultTextEncoding(settingsManager));

  if (resolvedEncoding === 'base64') {
    await fs.writeFile(filePath, Buffer.from(content, 'base64'));
    return;
  }

  await fs.writeFile(filePath, encodeTextContent(content, resolvedEncoding));
};

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册文件操作相关的 IPC 处理器
 */
export function registerFileHandlers(settingsManager: SettingsManager): void {
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'read-file', 'write-file', 'file-exists', 'file-stat', 'folder:rename', 'folder:delete', 'folder:reveal-in-explorer', 'delete-file', 'file:show-open-dialog', 'file:read-binary',
    'fs:read-file', 'fs:write-file', 'fs:exists'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  /**
   * 显示打开文件对话框
   */
  ipcMain.handle('file:show-open-dialog', async (event, options: OpenDialogOptions): Promise<OpenDialogResult> => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        properties: options.properties || ['openFile'],
      });
      
      return {
        canceled: result.canceled,
        filePaths: result.filePaths,
      };
    } catch (error) {
      console.error('[FileHandlers] 显示打开文件对话框失败:', error);
      return {
        canceled: true,
        filePaths: [],
      };
    }
  });

  /**
   * 读取文件为二进制数据
   */
  ipcMain.handle('file:read-binary', async (event, filePath: string): Promise<Uint8Array> => {
    try {
      const buffer = await fs.readFile(filePath);
      return new Uint8Array(buffer);
    } catch (error) {
      console.error('[FileHandlers] 读取二进制文件失败:', error);
      throw error;
    }
  });
  

  /**
   * 读取文件内容
   */
  ipcMain.handle('read-file', async (_event, filePath: string, encoding?: string) => {
    try {
      return await readTextFile(filePath, encoding, settingsManager);
    } catch (error) {
      console.error('[FileHandlers] 读取文件失败:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:read-file', async (_event, filePath: string, encoding?: string) => {
    try {
      return await readFileByEncoding(filePath, encoding, settingsManager);
    } catch (error) {
      console.error('[FileHandlers] 文件系统读取失败:', error);
      throw error;
    }
  });

  /**
   * 写入文件内容
   */
  ipcMain.handle('write-file', async (_event, filePath: string, content: string, encoding?: string) => {
    try {
      await writeTextFile(filePath, content, encoding, settingsManager);
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 写入文件失败:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string, encoding?: string) => {
    try {
      await writeFileByEncoding(filePath, content, encoding, settingsManager);
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 文件系统写入失败:', error);
      throw error;
    }
  });

  /**
   * 检查文件是否存在
   */
  const handleFileExists = async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  };

  ipcMain.handle('file-exists', handleFileExists);
  ipcMain.handle('fs:exists', handleFileExists);

  /**
   * 获取文件信息
   */
  ipcMain.handle('file-stat', async (event, filePath: string) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.getTime(),
        ctime: stats.ctime.getTime(),
      };
    } catch (error) {
      console.error('[FileHandlers] 获取文件信息失败:', error);
      throw error;
    }
  });

  /**
   * 重命名文件或文件夹
   */
  ipcMain.handle('folder:rename', async (event, oldPath: string, newName: string) => {
    try {
      
      // 检查源文件/文件夹是否存在
      try {
        await fs.access(oldPath);
      } catch (error) {
        console.error('[FileHandlers] 源文件不存在:', oldPath);
        return { success: false, error: '源文件或文件夹不存在' };
      }
      
      // 计算新路径
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      
      // 检查目标是否已存在
      try {
        await fs.access(newPath);
        console.error('[FileHandlers] 目标已存在:', newPath);
        return { success: false, error: '目标文件或文件夹已存在' };
      } catch (error) {
        // 目标不存在，可以继续
      }
      
      // 执行重命名
      await fs.rename(oldPath, newPath);
      
      return {
        success: true,
        data: {
          path: newPath,
          name: newName
        }
      };
    } catch (error) {
      console.error('[FileHandlers] 重命名失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除文件或文件夹（移动到回收站）
   */
  const handleDelete = async (event: Electron.IpcMainInvokeEvent, targetPath: string) => {
    try {
      
      // 检查文件/文件夹是否存在
      let isDirectory = false;
      try {
        const stats = await fs.stat(targetPath);
        isDirectory = stats.isDirectory();
      } catch (error) {
        console.error('[FileHandlers] 文件/文件夹不存在:', targetPath);
        return { success: false, error: '文件或文件夹不存在' };
      }
      
      // 使用 Electron 的 shell.trashItem 将文件移动到回收站
      // 这样可以恢复文件，而不是永久删除
      try {
        await shell.trashItem(targetPath);
        console.log('[FileHandlers] 文件已移动到回收站:', targetPath);
      } catch (trashError) {
        // 如果移动到回收站失败（某些系统可能不支持），回退到永久删除
        console.warn('[FileHandlers] 移动到回收站失败，尝试永久删除:', trashError);
        
        if (isDirectory) {
          // 删除文件夹（递归删除所有内容）
          await fs.rm(targetPath, { recursive: true, force: true });
        } else {
          // 删除文件
          await fs.unlink(targetPath);
        }
        
        console.log('[FileHandlers] 文件已永久删除（回收站不可用）:', targetPath);
      }
      
      // 删除对应的索引数据
      try {
        if (isDirectory) {
          await workspaceVectorIndexService.deleteDirectoryIndex(targetPath);
        } else {
          await workspaceVectorIndexService.deleteFileIndex(targetPath);
        }
      } catch (indexError) {
        console.warn('[FileHandlers] 删除索引数据失败:', indexError);
        // 不影响删除操作的成功
      }
      
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 删除失败:', error);
      return { success: false, error: String(error) };
    }
  };

  // 注册 folder:delete 处理器（保持向后兼容）
  ipcMain.handle('folder:delete', handleDelete);

  // 注册 delete-file 处理器（前端使用的名称）
  ipcMain.handle('delete-file', handleDelete);

  /**
   * 在资源管理器中打开文件或文件夹
   */
  ipcMain.handle('folder:reveal-in-explorer', async (event, targetPath: string) => {
    try {
      
      // 检查文件/文件夹是否存在
      try {
        await fs.access(targetPath);
      } catch (error) {
        console.error('[FileHandlers] 文件/文件夹不存在:', targetPath);
        return { success: false, error: '文件或文件夹不存在' };
      }
      
      // 使用 Electron 的 shell.showItemInFolder 在系统文件管理器中显示
      shell.showItemInFolder(targetPath);
      
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 在资源管理器中打开失败:', error);
      return { success: false, error: String(error) };
    }
  });

  isRegistered = true;
}

