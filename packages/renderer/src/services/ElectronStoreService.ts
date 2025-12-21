/**
 * ElectronStoreService - 渲染进程端的 electron-store 服务封装
 * 通过 IPC 与主进程的 electron-store 通信
 */

// 定义存储数据的类型（与主进程保持一致）
interface StoreSchema {
  // AI 模型配置缓存
  'model-cache': Array<{
    modelId: string;          // 格式：配置名:模型名
    configName: string;       // AI配置名称
    apiKey: string;           // API密钥
    apiEndpoint: string;      // API端点
    providerId: string;       // 提供商ID
    temperature?: number;     // 温度参数
    id?: string;              // 模型ID（可选）
    name?: string;            // 模型名称（可选）
    maxTokens?: number;       // 最大令牌数（可选）
  }>;
  
  // 命令中心历史记录
  'command-history': Array<{
    command: string;
    timestamp: number;
    type?: string;
  }>;
  
  // 知识库数据
  'knowledge-base': {
    spaces: Array<{
      id: string;
      name: string;
      type: 'local' | 'cloud';
      createdAt: number;
      updatedAt: number;
      documents?: any[];
    }>;
    settings?: {
      defaultSpace?: string;
      autoSync?: boolean;
    };
  };
  
  // 背景图片配置
  'background-cover-config': {
    enabled: boolean;
    imageUrl?: string;
    opacity?: number;
    blur?: number;
  };
  
  // 主题配置
  'theme-config': {
    currentTheme?: string;
    customColors?: Record<string, string>;
  };
  
  // 用户偏好设置
  'user-preferences': {
    language?: string;
    fontSize?: number;
    editorSettings?: Record<string, any>;
  };
  
  // 资源管理器配置
  'explorer-config': {
    showOpenEditors?: boolean;
  };
  
  // AI 智能体配置
  'ai-agents': Array<{
    id: string;
    name: string;
    emoji: string;
    prompt: string;
    knowledgeBaseIds: string[];
    category?: string;  // 分类：'my' | 'featured' | 'profession' 等
    createdAt: number;
    updatedAt: number;
  }>;
  
  // AI 聊天设置
  'ai-chat-settings': {
    temperature: number;
    maxTokens: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
  };
  
  // 工作区向量索引信息
  'workspace-vector-index': {
    [workspaceHash: string]: {
      [filePath: string]: {
        filePath: string;
        lastModified: number;
        size: number;
        indexed: boolean;
        indexedAt?: number;
      };
    };
  };
  
  // Embedding 自动索引开关
  'embedding-auto-index': boolean;
  
  // 笔记编辑器设置
  'note-editor-settings': {
    defaultEditor: 'tiptap' | 'monaco';
    showEditorSwitch: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
  };
}

/**
 * ElectronStoreService 类
 * 提供类型安全的存储操作
 */
class ElectronStoreService {
  private static instance: ElectronStoreService;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ElectronStoreService {
    if (!ElectronStoreService.instance) {
      ElectronStoreService.instance = new ElectronStoreService();
    }
    return ElectronStoreService.instance;
  }

  /**
   * 获取存储值
   */
  public async get<K extends keyof StoreSchema>(key: K): Promise<StoreSchema[K] | undefined> {
    try {
      return await window.electron?.ipcRenderer.invoke('store:get', key);
    } catch (error) {
      console.error('[ElectronStore] 获取值失败', error);
      return undefined;
    }
  }

  /**
   * 设置存储值
   */
  public async set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke('store:set', key, value);
      return result.success;
    } catch (error) {
      console.error('[ElectronStore] 设置值失败', error);
      return false;
    }
  }

  /**
   * 删除存储值
   */
  public async delete<K extends keyof StoreSchema>(key: K): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke('store:delete', key);
      return result.success;
    } catch (error) {
      console.error('[ElectronStore] 删除值失败', error);
      return false;
    }
  }

  /**
   * 检查键是否存在
   */
  public async has<K extends keyof StoreSchema>(key: K): Promise<boolean> {
    try {
      return await window.electron?.ipcRenderer.invoke('store:has', key);
    } catch (error) {
      console.error('[ElectronStore] 检查键存在失败:', error);
      return false;
    }
  }

  /**
   * 清除所有存储数据
   */
  public async clear(): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke('store:clear');
      return result.success;
    } catch (error) {
      console.error('[ElectronStore] 清除存储失败:', error);
      return false;
    }
  }

  /**
   * 获取所有键值对
   */
  public async getAll(): Promise<Partial<StoreSchema>> {
    try {
      return await window.electron?.ipcRenderer.invoke('store:getAll');
    } catch (error) {
      console.error('[ElectronStore] 获取所有数据失败', error);
      return {};
    }
  }

  /**
   * 批量设置多个值
   */
  public async setMultiple(data: Partial<StoreSchema>): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke('store:setMultiple', data);
      return result?.success ?? false;
    } catch (error) {
      console.error('[ElectronStore] 批量设置失败:', error);
      return false;
    }
  }

  /**
   * 重置为默认值
   */
  public async reset<K extends keyof StoreSchema>(key: K): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke('store:reset', key);
      return result?.success ?? false;
    } catch (error) {
      console.error('[ElectronStore] 重置失败:', error);
      return false;
    }
  }

  /**
   * 获取存储文件路径
   */
  public async getPath(): Promise<string> {
    try {
      return await window.electron?.ipcRenderer.invoke('store:getPath') ?? '';
    } catch (error) {
      console.error('[ElectronStore] 获取路径失败:', error);
      return '';
    }
  }
}

// 导出单例实例
export const electronStore = ElectronStoreService.getInstance();
export type { StoreSchema };

