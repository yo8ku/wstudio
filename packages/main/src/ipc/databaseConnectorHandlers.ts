/**
 * 数据库连接器 IPC 处理器
 * 功能：处理渲染进程的数据库连接请求
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { ConnectionManager, ConnectorFactory } from '../services/database-connector';
import type { ConnectionConfig } from '../services/database-connector';

const connectionManager = ConnectionManager.getInstance();
let handlersRegistered = false;

/**
 * 注册数据库连接器 IPC 处理器
 */
export function registerDatabaseConnectorHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  
  // 获取支持的数据库类型
  ipcMain.handle('db-connector:get-supported-types', () => {
    return ConnectorFactory.getSupportedTypes();
  });

  // 选择数据库文件（SQLite）
  ipcMain.handle('db-connector:select-database-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: '选择数据库文件',
      filters: [
        { name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    return {
      success: true,
      path: result.filePaths[0]
    };
  });

  // 检查文件是否存在
  ipcMain.handle('db-connector:check-file-exists', async (_event, filePath: string) => {
    if (!filePath || !filePath.trim()) {
      return false;
    }
    try {
      const fs = await import('fs');
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });

  // 测试连接
  ipcMain.handle('db-connector:test-connection', async (_event, config: ConnectionConfig) => {
    return connectionManager.testConnection(config);
  });

  // 创建连接
  ipcMain.handle(
    'db-connector:create-connection',
    async (_event, id: string, config: ConnectionConfig, autoConnect = true) => {
      try {
        await connectionManager.createConnection(id, config, autoConnect);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // 获取连接状态
  ipcMain.handle('db-connector:get-connection-status', (_event, id: string) => {
    return connectionManager.getConnectionStatus(id);
  });

  // 获取所有连接
  ipcMain.handle('db-connector:get-all-connections', () => {
    return connectionManager.getAllConnections();
  });

  // 移除连接
  ipcMain.handle('db-connector:remove-connection', async (_event, id: string) => {
    return connectionManager.removeConnection(id);
  });

  // 重新连接
  ipcMain.handle('db-connector:reconnect', async (_event, id: string) => {
    return connectionManager.reconnect(id);
  });

  // 获取表列表
  ipcMain.handle('db-connector:get-tables', async (_event, id: string) => {
    try {
      const tables = await connectionManager.getTables(id);
      return { success: true, data: tables };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取列信息
  ipcMain.handle('db-connector:get-columns', async (_event, id: string, tableName: string) => {
    try {
      const columns = await connectionManager.getColumns(id, tableName);
      return { success: true, data: columns };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 执行查询
  ipcMain.handle(
    'db-connector:query',
    async (_event, id: string, sql: string, params?: unknown[]) => {
      try {
        const result = await connectionManager.query(id, sql, params);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // 执行非查询语句
  ipcMain.handle(
    'db-connector:execute',
    async (_event, id: string, sql: string, params?: unknown[]) => {
      try {
        const result = await connectionManager.execute(id, sql, params);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  handlersRegistered = true;
  console.log('[IPC] 数据库连接器处理器已注册');
}

/**
 * 清理数据库连接
 */
export async function cleanupDatabaseConnections(): Promise<void> {
  await connectionManager.removeAllConnections();
  console.log('[IPC] 所有数据库连接已清理');
}
