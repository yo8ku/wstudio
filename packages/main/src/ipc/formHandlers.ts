/**
 * 表单 IPC 处理器
 * 功能：处理渲染进程与主进程之间的表单数据通信
 */

import { ipcMain } from 'electron';
import { getFormDatabase, type FormGroup, type FormData } from '../services/FormDatabase';

/**
 * 注册表单相关的 IPC 处理器
 */
export function registerFormHandlers(): void {
  const db = getFormDatabase();

  // 初始化数据库
  ipcMain.handle('form:initialize', async () => {
    try {
      await db.initialize();
      return { success: true };
    } catch (error) {
      console.error('[FormHandlers] 初始化失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // ==================== 分组操作 ====================

  // 创建分组
  ipcMain.handle('form:createGroup', async (_, name: string, parentId: string | null) => {
    try {
      const group = await db.createGroup(name, parentId);
      return { success: true, data: group };
    } catch (error) {
      console.error('[FormHandlers] 创建分组失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取所有分组
  ipcMain.handle('form:getAllGroups', async () => {
    try {
      const groups = await db.getAllGroups();
      return { success: true, data: groups };
    } catch (error) {
      console.error('[FormHandlers] 获取分组失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取指定父级下的分组
  ipcMain.handle('form:getGroupsByParent', async (_, parentId: string | null) => {
    try {
      const groups = await db.getGroupsByParent(parentId);
      return { success: true, data: groups };
    } catch (error) {
      console.error('[FormHandlers] 获取分组失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 更新分组
  ipcMain.handle('form:updateGroup', async (_, id: string, updates: Partial<FormGroup>) => {
    try {
      const success = await db.updateGroup(id, updates);
      return { success };
    } catch (error) {
      console.error('[FormHandlers] 更新分组失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 删除分组
  ipcMain.handle('form:deleteGroup', async (_, id: string) => {
    try {
      const success = await db.deleteGroup(id);
      return { success };
    } catch (error) {
      console.error('[FormHandlers] 删除分组失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // ==================== 表单操作 ====================

  // 创建表单
  ipcMain.handle('form:createForm', async (_, name: string, groupId: string | null, data?: string) => {
    try {
      const form = await db.createForm(name, groupId, data);
      return { success: true, data: form };
    } catch (error) {
      console.error('[FormHandlers] 创建表单失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取所有表单
  ipcMain.handle('form:getAllForms', async () => {
    try {
      const forms = await db.getAllForms();
      return { success: true, data: forms };
    } catch (error) {
      console.error('[FormHandlers] 获取表单失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取指定分组下的表单
  ipcMain.handle('form:getFormsByGroup', async (_, groupId: string | null) => {
    try {
      const forms = await db.getFormsByGroup(groupId);
      return { success: true, data: forms };
    } catch (error) {
      console.error('[FormHandlers] 获取表单失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 根据ID获取表单
  ipcMain.handle('form:getFormById', async (_, id: string) => {
    try {
      const form = await db.getFormById(id);
      return { success: true, data: form };
    } catch (error) {
      console.error('[FormHandlers] 获取表单失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 更新表单
  ipcMain.handle('form:updateForm', async (_, id: string, updates: Partial<FormData>) => {
    try {
      const success = await db.updateForm(id, updates);
      return { success };
    } catch (error) {
      console.error('[FormHandlers] 更新表单失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 删除表单
  ipcMain.handle('form:deleteForm', async (_, id: string) => {
    try {
      console.log('[FormHandlers] 删除表单, id:', id);
      const success = await db.deleteForm(id);
      console.log('[FormHandlers] 删除表单结果:', success);
      return { success };
    } catch (error) {
      console.error('[FormHandlers] 删除表单失败:', error);
      return { success: false, error: String(error) };
    }
  });
}
