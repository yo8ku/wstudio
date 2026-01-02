/**
 * 终端 IPC 处理器
 * 功能：处理渲染进程的终端相关请求
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { TerminalService } from '../services/terminal';
import type { TerminalOptions } from '../services/terminal';

let terminalService: TerminalService | null = null;
let handlersRegistered = false;

/**
 * 设置终端服务实例
 */
export function setTerminalService(service: TerminalService): void {
  terminalService = service;
  console.log('[Terminal IPC] 终端服务已设置');
}

/**
 * 注册终端 IPC 处理器（可以在没有 service 的情况下先注册）
 */
export function registerTerminalHandlers(service?: TerminalService): void {
  if (handlersRegistered) {
    // 如果已注册但传入了新的 service，更新它
    if (service) {
      terminalService = service;
      console.log('[Terminal IPC] 更新终端服务实例');
    }
    return;
  }

  if (service) {
    terminalService = service;
  }

  // 创建终端
  ipcMain.handle('terminal:create', async (event: IpcMainInvokeEvent, options: TerminalOptions) => {
    try {
      if (!terminalService) {
        throw new Error('TerminalService 未初始化，请稍后重试');
      }
      const terminalId = terminalService.createTerminal(options);
      console.log(`[Terminal IPC] 创建终端: ${terminalId}`);
      return { success: true, terminalId };
    } catch (error) {
      console.error('[Terminal IPC] 创建终端失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 写入数据
  ipcMain.handle('terminal:write', async (event: IpcMainInvokeEvent, terminalId: string, data: string) => {
    try {
      if (!terminalService) {
        throw new Error('TerminalService 未初始化');
      }
      terminalService.writeToTerminal(terminalId, data);
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] 写入数据失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 调整大小
  ipcMain.handle('terminal:resize', async (event: IpcMainInvokeEvent, terminalId: string, cols: number, rows: number) => {
    try {
      if (!terminalService) {
        throw new Error('TerminalService 未初始化');
      }
      terminalService.resizeTerminal(terminalId, cols, rows);
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] 调整大小失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 销毁终端
  ipcMain.handle('terminal:destroy', async (event: IpcMainInvokeEvent, terminalId: string) => {
    try {
      if (!terminalService) {
        throw new Error('TerminalService 未初始化');
      }
      terminalService.destroyTerminal(terminalId);
      return { success: true };
    } catch (error) {
      console.error('[Terminal IPC] 销毁终端失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取所有终端 ID
  ipcMain.handle('terminal:list', async (event: IpcMainInvokeEvent) => {
    try {
      if (!terminalService) {
        throw new Error('TerminalService 未初始化');
      }
      const ids = terminalService.getAllTerminalIds();
      return { success: true, terminalIds: ids };
    } catch (error) {
      console.error('[Terminal IPC] 获取终端列表失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  handlersRegistered = true;
  console.log('[Terminal IPC] 处理器已注册');
}

/**
 * 清理所有终端
 */
export function cleanupTerminals(): void {
  if (terminalService) {
    terminalService.destroyAll();
  }
}


