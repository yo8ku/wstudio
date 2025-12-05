/**
 * AI 模型配置 IPC 处理器
 * 功能：处理渲染进程的 AI 模型配置相关请求
 * 描述：提供 AI 模型配置的增删改查 IPC 接口
 */

import { ipcMain } from 'electron';
import { AIModelDatabase } from '../services/AIModelDatabase';

let aiModelDatabase: AIModelDatabase | null = null;

// 防止重复注册的标志
let isRegistered = false;

/**
 * 获取数据库实例
 */
function getDatabase(): AIModelDatabase {
  if (!aiModelDatabase) {
    aiModelDatabase = new AIModelDatabase();
  }
  return aiModelDatabase;
}

/**
 * 注册 AI 模型配置相关的 IPC 处理器
 */
export function registerAIModelHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    console.log('[AIModel IPC] IPC 处理器已注册，跳过重复注册');
    return;
  }

  console.log('[AIModel IPC] 开始注册 AI 模型配置 IPC 处理器...');

  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'ai-model:check-name-exists',
    'ai-model:save',
    'ai-model:list',
    'ai-model:get',
    'ai-model:get-models',
    'ai-model:delete'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  console.log('[AIModel IPC] 已清理旧的 IPC 处理器');
  isRegistered = true;

  // 检查配置名称是否存在
  ipcMain.handle('ai-model:check-name-exists', async (event, name: string, excludeId?: string) => {
    try {
      const db = getDatabase();
      await db.initialize();
      const exists = await db.checkNameExists(name, excludeId);
      return exists;
    } catch (error) {
      console.error('[AIModel IPC] 检查名称失败:', error);
      throw error;
    }
  });

  // 保存配置
  ipcMain.handle('ai-model:save', async (event, data: { config: any; models: any[] }) => {
    try {
      console.log('[AIModel IPC] 收到保存配置请求:', {
        configId: data.config?.id,
        configName: data.config?.name,
        providerId: data.config?.providerId,
        modelsCount: data.models?.length || 0
      });
      
      const db = getDatabase();
      await db.initialize();
      const configId = await db.saveConfig(data.config, data.models);
      
      console.log('[AIModel IPC] 保存配置成功，返回 configId:', configId);
      return configId;
    } catch (error) {
      console.error('[AIModel IPC] 保存配置失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[AIModel IPC] 错误详情:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        configData: {
          id: data.config?.id,
          name: data.config?.name,
          providerId: data.config?.providerId,
          hasApiKey: !!data.config?.apiKey,
          apiEndpoint: data.config?.apiEndpoint,
          isEnabled: data.config?.isEnabled
        }
      });
      throw error;
    }
  });

  // 获取所有配置
  ipcMain.handle('ai-model:list', async () => {
    try {
      const db = getDatabase();
      await db.initialize();
      const configs = await db.getAllConfigs();
      return configs;
    } catch (error) {
      console.error('[AIModel IPC] 获取配置列表失败:', error);
      throw error;
    }
  });

  // 根据ID获取配置
  ipcMain.handle('ai-model:get', async (event, id: string) => {
    try {
      const db = getDatabase();
      await db.initialize();
      const config = await db.getConfigById(id);
      return config;
    } catch (error) {
      console.error('[AIModel IPC] 获取配置失败:', error);
      throw error;
    }
  });

  // 根据配置ID获取模型列表
  ipcMain.handle('ai-model:get-models', async (event, configId: string) => {
    try {
      const db = getDatabase();
      await db.initialize();
      const models = await db.getModelsByConfigId(configId);
      return models;
    } catch (error) {
      console.error('[AIModel IPC] 获取模型列表失败:', error);
      throw error;
    }
  });

  // 删除配置
  ipcMain.handle('ai-model:delete', async (event, id: string) => {
    try {
      const db = getDatabase();
      await db.initialize();
      await db.deleteConfig(id);
      return { success: true };
    } catch (error) {
      console.error('[AIModel IPC] 删除配置失败:', error);
      throw error;
    }
  });

  console.log('[AIModel IPC] AI 模型配置 IPC 处理器已注册');
}

