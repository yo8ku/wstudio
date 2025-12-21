/**
 * templateHandlers.ts
 * 模板系统 IPC 处理器
 * 功能：处理渲染进程的模板相关请求
 * 描述：提供模板的增删改查 IPC 接口
 */

import { ipcMain } from 'electron';
import { noteDatabase } from '../services/NoteDatabase';
import { TemplateItem } from '../types';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册模板相关的 IPC 处理器
 */
export function registerTemplateHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'template:create',
    'template:update',
    'template:delete',
    'template:get',
    'template:getAll'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  // 创建模板
  ipcMain.handle('template:create', async (_event, data: Partial<TemplateItem>) => {
    try {
      await noteDatabase.initialize();
      const template = await noteDatabase.createTemplate(data);
      console.log('[Template IPC] 创建模板成功:', template.name);
      return template;
    } catch (error) {
      console.error('[Template IPC] 创建模板失败:', error);
      throw error;
    }
  });

  // 更新模板
  ipcMain.handle('template:update', async (_event, id: string, updates: Partial<TemplateItem>) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.updateTemplate(id, updates);
      return success;
    } catch (error) {
      console.error('[Template IPC] 更新模板失败:', error);
      throw error;
    }
  });

  // 删除模板
  ipcMain.handle('template:delete', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.deleteTemplate(id);
      return success;
    } catch (error) {
      console.error('[Template IPC] 删除模板失败:', error);
      throw error;
    }
  });

  // 获取单个模板
  ipcMain.handle('template:get', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const template = await noteDatabase.getTemplate(id);
      return template;
    } catch (error) {
      console.error('[Template IPC] 获取模板失败:', error);
      throw error;
    }
  });

  // 获取所有模板
  ipcMain.handle('template:getAll', async () => {
    try {
      await noteDatabase.initialize();
      const templates = await noteDatabase.getAllTemplates();
      return templates;
    } catch (error) {
      console.error('[Template IPC] 获取所有模板失败:', error);
      throw error;
    }
  });

  console.log('[Template IPC] 模板 IPC 处理器已注册');
}
