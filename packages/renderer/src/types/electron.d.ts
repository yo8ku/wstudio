/**
 * Electron API 类型定义
 */

/**
 * 扩展信息接口
 */
export interface IExtensionInfo {
  extensionId: string;
  extensionName: string;
  displayName: string;
  publisher: {
    publisherId: string;
    publisherName: string;
    displayName: string;
  };
  version: string;
  description: string;
  installCount: number;
  rating: number;
  ratingCount: number;
  categories: string[];
  tags: string[];
  versions: IExtensionVersion[];
  icon?: string;
  publishedDate?: string;
  lastUpdated?: string;
}

export interface IExtensionVersion {
  version: string;
  lastUpdated: string;
  assetUri: string;
  fallbackAssetUri: string;
}

/**
 * 安装结果接口
 */
export interface InstallResult {
  success: boolean;
  extensionId: string;
  extension?: any;
  error?: string;
}

/**
 * API 响应接口
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 主题接口
 */
export interface ITheme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc';
  colors: Record<string, string>;
  tokenColors?: any[];
  semanticTokenColors?: Record<string, any>;
}

export interface ElectronAPI {
  extension: {
    list: () => Promise<any[]>;
    executeCommand: (command: string, ...args: any[]) => Promise<any>;
    sendMessage: (extensionId: string, message: any) => Promise<any>;
    onExtensionActivated: (callback: (data: any) => void) => void;
    onExtensionDeactivated: (callback: (data: any) => void) => void;
    onMessage: (callback: (data: any) => void) => void;
    onExtensionInstalled: (callback: (data: { extensionId: string; extension: any }) => void) => void;
  };
  marketplace: {
    search: (query: string, pageSize?: number) => Promise<APIResponse<IExtensionInfo[]>>;
    install: (extensionId: string, version?: string) => Promise<InstallResult>;
    getDetails: (extensionId: string) => Promise<APIResponse<IExtensionInfo>>;
  };
  vsix: {
    install: (vsixPath: string) => Promise<InstallResult>;
  };
  theme: {
    list: () => Promise<APIResponse<ITheme[]>>;
    apply: (themeId: string) => Promise<APIResponse>;
    getCurrent: () => Promise<APIResponse<ITheme>>;
  };
  settings?: {
    getAll: () => Promise<APIResponse<Record<string, any>>>;
    get: (key: string) => Promise<APIResponse<any>>;
    update: (key: string, value: any, target?: 'user' | 'workspace') => Promise<APIResponse>;
    updateMany: (updates: Record<string, any>, target?: 'user' | 'workspace') => Promise<APIResponse>;
    reset: (key?: string) => Promise<APIResponse>;
    getPath: (target?: 'user' | 'workspace') => Promise<APIResponse<string>>;
    openJson: (target?: 'user' | 'workspace') => Promise<APIResponse<FileData>>;
    import: (settingsJson: string, target?: 'user' | 'workspace') => Promise<APIResponse>;
    export: () => Promise<APIResponse<string>>;
    getDefaults: () => Promise<APIResponse<Record<string, any>>>;
  };
  fs?: {
    readFile: (filePath: string, encoding?: string) => Promise<string>;
    writeFile: (filePath: string, content: string, encoding?: string) => Promise<{ success: boolean }>;
    exists: (filePath: string) => Promise<boolean>;
  };
  ai?: {
    fetch: (url: string, options?: RequestInit) => Promise<{
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
    }>;
  };
  builtinAI?: {
    getModels: () => Promise<string[]>;
    refreshModels: () => Promise<{ success: boolean; models?: string[]; error?: string }>;
  };
  on?: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
  off?: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  platform: string;
  version: string;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

export interface FileData {
  path: string;
  content?: string;
  name: string;
  language?: string;
}

export interface FileResult {
  success: boolean;
  data?: FileData;
  error?: string;
}

/**
 * 聊天模型接口
 */
export interface ChatModel {
  name: string;
  displayName?: string;
}

/**
 * AI 模型配置接口
 */
export interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  chatModels?: ChatModel[];  // 可选的聊天模型列表
  
  // 🧠 模型参数（核心）
  parameters?: {
    temperature?: number;        // 0-2，创造性，0=确定，2=随机
    maxTokens?: number;          // 1-128000，最大输出长度
    topP?: number;               // 0-1，核采样，控制词汇多样性
    frequencyPenalty?: number;   // -2 到 2，频率惩罚，减少重复内容
    presencePenalty?: number;    // -2 到 2，鼓励新话题
  };
  
  // ⚙️ 高级配置（可选）
  advanced?: {
    timeout?: number;            // 请求超时（毫秒）
    maxRetries?: number;         // 重试次数
    stream?: boolean;            // 流式传输
    proxy?: string;              // 代理设置
    costControl?: {
      maxCostPerRequest?: number;  // 单次请求最大成本（美元）
      dailyLimit?: number;         // 每日成本限制（美元）
    };
  };
}

export interface ElectronIPC {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
    removeListener: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  };
  file?: {
    open: () => Promise<FileResult>;
    read: (filePath: string) => Promise<FileResult>;
    save: (filePath: string, content: string) => Promise<APIResponse>;
    saveAs: (content: string) => Promise<FileResult>;
  };
  image?: {
    open: () => Promise<FileResult>;
  };
  folder?: {
    open: () => Promise<FileResult>;
    readTree: (folderPath: string) => Promise<APIResponse<any[]>>;
    expand: (folderPath: string, rootPath: string) => Promise<APIResponse<any[]>>;
    createFile: (parentPath: string, fileName: string) => Promise<APIResponse<{ path: string; name: string }>>;
    createFolder: (parentPath: string, folderName: string) => Promise<APIResponse<{ path: string; name: string }>>;
    ensureDir: (dirPath: string) => Promise<APIResponse<{ path: string }>>;
    getAllNotes: (folderPath: string) => Promise<APIResponse<any[]>>;
    copyToFolder: (sourcePath: string, targetFolderPath: string) => Promise<APIResponse<{ path: string; name: string }>>;
  };
  workspace?: {
    getDir: () => Promise<APIResponse<string>>;
    getRecentFiles: () => Promise<APIResponse<string[]>>;
    getLastOpened: () => Promise<FileResult>;
    clearRecentFiles: () => Promise<APIResponse>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    electron?: ElectronIPC;
  }
}



