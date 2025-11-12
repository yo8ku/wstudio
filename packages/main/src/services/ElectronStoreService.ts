/**
 * ElectronStoreService - electron-store 服务封装
 * 提供统一的本地存储接口，用于存储应用配置和用户数据
 * 存储位置：
 * - Windows: C:\Users\username\AppData\Roaming\WiseAI Note Studio
 * - macOS: /Users/username/Library/Application Support/WiseAI Note Studio
 */

import Store from 'electron-store';
import { app } from 'electron';

// 定义存储数据的类型
interface StoreSchema {
  // AI 模型配置缓存
  'model-cache': Array<{
    provider: string;
    id: string;
    name: string;
    description?: string;
    lastUpdated: number;
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
    activeThemeId?: string; // 当前激活的主题 ID
    customColors?: Record<string, string>;
    lastUsedThemes?: string[];
    favoriteThemes?: string[];
  };
  
  // 已下载的主题包
  'downloaded-themes': {
    [themePackId: string]: {
      isDownloaded: boolean;
      downloadedAt: number;
    };
  };
  
  // 用户偏好设置
  'user-preferences': {
    language?: string;
    fontSize?: number;
    editorSettings?: Record<string, any>;
  };
}

/**
 * ElectronStoreService 类
 * 提供类型安全的存储操作
 */
export class ElectronStoreService {
  private store: Store<StoreSchema>;
  private static instance: ElectronStoreService;

  private constructor() {
    console.log('[ElectronStoreService] 开始初始化...');
    console.log('[ElectronStoreService] app.isReady():', app.isReady());
    console.log('[ElectronStoreService] process.cwd():', process.cwd());
    
    // 确保 app 已准备好
    const cwd = app.getPath('userData');
    console.log('[ElectronStoreService] app.getPath(userData):', cwd);
    
    this.store = new Store<StoreSchema>({
      name: 'app-data',
      cwd, // 明确指定存储目录
      // 设置默认值
      defaults: {
        'model-cache': [],
        'command-history': [],
        'knowledge-base': {
          spaces: [],
          settings: {
            autoSync: false
          }
        },
        'background-cover-config': {
          enabled: false
        },
        'theme-config': {},
        'downloaded-themes': {},
        'user-preferences': {}
      },
      // 启用加密（可选）
      encryptionKey: 'wiseai-secure-key-2024'
    });
    
    console.log('[ElectronStoreService] Store 实例创建完成');
    console.log('[ElectronStoreService] 存储文件路径:', this.store.path);
    console.log('[ElectronStoreService] 初始化完成');
  }

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
  public get<K extends keyof StoreSchema>(key: K): StoreSchema[K] | undefined {
    return this.store.get(key);
  }

  /**
   * 设置存储值
   */
  public set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
    this.store.set(key, value);
  }

  /**
   * 删除存储值
   */
  public delete<K extends keyof StoreSchema>(key: K): void {
    this.store.delete(key);
  }

  /**
   * 检查键是否存在
   */
  public has<K extends keyof StoreSchema>(key: K): boolean {
    return this.store.has(key);
  }

  /**
   * 清除所有存储数据
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * 获取存储文件路径
   */
  public getPath(): string {
    return this.store.path;
  }

  /**
   * 获取所有键值对
   */
  public getAll(): Partial<StoreSchema> {
    return this.store.store;
  }

  /**
   * 批量设置多个值
   */
  public setMultiple(data: Partial<StoreSchema>): void {
    Object.entries(data).forEach(([key, value]) => {
      this.store.set(key as keyof StoreSchema, value as any);
    });
  }

  /**
   * 监听存储变化
   */
  public onDidChange<K extends keyof StoreSchema>(
    key: K,
    callback: (newValue?: StoreSchema[K], oldValue?: StoreSchema[K]) => void
  ): () => void {
    return this.store.onDidChange(key, callback);
  }

  /**
   * 重置为默认值
   */
  public reset<K extends keyof StoreSchema>(key: K): void {
    this.store.reset(key);
  }
}

// 导出单例实例的 getter 函数，避免在模块加载时立即初始化
let _electronStoreInstance: ElectronStoreService | null = null;

export function getElectronStore(): ElectronStoreService {
  if (!_electronStoreInstance) {
    _electronStoreInstance = ElectronStoreService.getInstance();
  }
  return _electronStoreInstance;
}

// 为了向后兼容，保留 electronStore 的导出
// 但推荐使用 getElectronStore() 函数
export const electronStore = new Proxy({} as ElectronStoreService, {
  get(target, prop) {
    const instance = getElectronStore();
    return (instance as any)[prop];
  }
});

