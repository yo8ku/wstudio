/**
 * Electron API 类型定义
 */

/**
 * 主题接口
 */
export interface ITheme {
  id: string;
  name: string;
  type: 'dark' | 'light' | 'hc';
  colors: Record<string, string>;
  path?: string;
}

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
  settings?: {
    getAll: () => Promise<APIResponse<Record<string, any>>>;
    get: (key: string) => Promise<APIResponse<any>>;
    getPlugin: (key: string) => Promise<APIResponse<any>>;
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
    updateUserModels: (models: string[]) => Promise<{ success: boolean; count?: number }>;
  };
  // 窗口焦点状态监听
  onWindowFocus?: (callback: (focused: boolean) => void) => void;
  onWindowBlur?: (callback: (focused: boolean) => void) => void;
  
  chatHistory?: {
    init: () => Promise<APIResponse>;
    createSession: (session: ChatSessionData) => Promise<APIResponse>;
    updateSession: (id: string, title: string) => Promise<APIResponse>;
    deleteSession: (id: string) => Promise<APIResponse>;
    getSessions: () => Promise<APIResponse<ChatSessionData[]>>;
    addMessage: (message: ChatMessageData) => Promise<APIResponse>;
    getMessages: (sessionId: string) => Promise<APIResponse<ChatMessageData[]>>;
    clearAll: () => Promise<APIResponse>;
  };
  readSnippetsConfig?: () => Promise<string>;
  saveSnippetsConfig?: (content: string) => Promise<APIResponse>;
  theme?: {
    list: () => Promise<APIResponse<ITheme[]>>;
    getCurrent: () => Promise<APIResponse<ITheme>>;
    apply: (themeId: string) => Promise<APIResponse>;
  };
  on?: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
  off?: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  platform: string;
  version: string;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  toggleDevTools?: () => void;
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
  id: string;
  name: string;
  displayName?: string;
  enabled?: boolean;
  capabilities?: {
    thinking?: boolean;
    tool_calls?: string[];
  };
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

/**
 * 片段接口
 * 注意：从 shared 包导入以确保类型一致性
 */
export interface Snippet {
  id?: number;
  name: string;          // 片段名称，用于显示和区分片段
  prefix: string;        // 触发前缀（必填），用于自动补全
  body: string;
  description?: string;
  language?: string;
  tags?: string;
}

export interface SnippetQuery {
  prefix?: string;
  language?: string;
  tags?: string[];
  limit?: number;
}

export interface ElectronIPC {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
    removeListener: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  };
  fs?: {
    readFile: (filePath: string, encoding?: string) => Promise<string>;
    writeFile: (filePath: string, content: string, encoding?: string) => Promise<{ success: boolean }>;
    exists: (filePath: string) => Promise<boolean>;
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
    rename: (oldPath: string, newName: string) => Promise<APIResponse<{ path: string; name: string }>>;
    delete: (path: string) => Promise<APIResponse<{ success: boolean }>>;
    revealInExplorer: (path: string) => Promise<APIResponse<void>>;
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
  knowledgeBase?: {
    openFolder: () => Promise<FileResult>;
  };
  shell?: {
    openExternal: (url: string) => Promise<APIResponse>;
  };
  snippet?: {
    initialize: () => Promise<APIResponse>;
    add: (snippet: Snippet) => Promise<APIResponse<number>>;
    update: (id: number, snippet: Partial<Snippet>) => Promise<APIResponse<boolean>>;
    delete: (id: number) => Promise<APIResponse<boolean>>;
    get: (id: number) => Promise<APIResponse<Snippet>>;
    query: (query: SnippetQuery) => Promise<APIResponse<Snippet[]>>;
    getAll: (limit?: number) => Promise<APIResponse<Snippet[]>>;
    import: (snippets: Snippet[]) => Promise<APIResponse<number>>;
    clearAll: () => Promise<APIResponse>;
  };
  terminal: {
    create: (cols: number, rows: number, cwd?: string) => Promise<{ success: boolean; terminalId?: string; error?: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    destroy: (id: string) => Promise<void>;
    onData: (callback: (terminalId: string, data: string) => void) => () => void;
    onExit: (callback: (terminalId: string, exitCode: number) => void) => () => void;
  };
  fileReference?: {
    add: (filePath: string, content: string, options?: {
      modelName?: string;
    }) => Promise<APIResponse<string[]>>;
    search: (query: string, options?: {
      topK?: number;
      modelName?: string;
      filterMetadata?: Record<string, unknown>;
    }) => Promise<APIResponse<unknown[]>>;
  };
  embedding?: {
    generate: (text: string) => Promise<APIResponse<{ vectors: number[] }>>;
    generateBatch: (texts: string[]) => Promise<APIResponse<{ vectors: number[][] }>>;
  };
  cloudEmbedding?: {
    getProviders: () => Promise<APIResponse<EmbeddingProviderConfig[]>>;
    getModels: () => Promise<APIResponse<EmbeddingModelConfig[]>>;
    setApiKey: (providerId: string, apiKey: string) => Promise<APIResponse>;
    getApiKey: (providerId: string) => Promise<APIResponse<string | undefined>>;
    setModel: (modelId: string) => Promise<APIResponse>;
    getCurrentModel: () => Promise<APIResponse<EmbeddingModelConfig | undefined>>;
    generate: (text: string) => Promise<APIResponse<EmbeddingResult>>;
    generateBatch: (texts: string[]) => Promise<APIResponse<EmbeddingResult>>;
    testConnection: (providerId: string, apiKey: string, modelId?: string) => Promise<APIResponse<{ success: boolean; message: string; dimensions?: number }>>;
    hasValidApiKey: () => Promise<APIResponse<boolean>>;
    setCustomConfig: (config: CustomEmbeddingConfig) => Promise<APIResponse>;
    getCustomConfig: () => Promise<APIResponse<CustomEmbeddingConfig | undefined>>;
  };
  workspaceIndex?: {
    initialize: () => Promise<APIResponse>;
    indexWorkspace: (workspacePath: string) => Promise<APIResponse<{
      totalFiles: number;
      indexedFiles: number;
      errors: string[];
    }>>;
    getProgress: () => Promise<APIResponse<{
      totalFiles: number;
      processedFiles: number;
      currentFile?: string;
    } | null>>;
    isIndexing: () => Promise<APIResponse<boolean>>;
    search: (options: {
      query: string;
      fileExtension?: string;
      language?: string;
      limit?: number;
    }) => Promise<APIResponse<Array<{
      filePath: string;
      fileName: string;
      fileExtension: string;
      contentPreview: string;
      language: string;
      score?: number;
      matches?: string[];
    }>>>;
    updateFile: (filePath: string) => Promise<APIResponse>;
    deleteFile: (filePath: string) => Promise<APIResponse>;
    getStats: () => Promise<APIResponse<{
      totalFiles: number;
      totalSize: number;
      languages: Record<string, number>;
    }>>;
    clear: () => Promise<APIResponse>;
  };
  workspaceVectorIndex?: {
    start: (workspacePath: string) => Promise<APIResponse>;
    stop: () => Promise<APIResponse>;
    getProgress: () => Promise<APIResponse<{
      totalFiles: number;
      processedFiles: number;
      currentFile: string | null;
      status: 'idle' | 'scanning' | 'indexing' | 'completed' | 'error';
      errorMessage?: string;
    }>>;
    checkAutoIndex: (workspacePath: string) => Promise<APIResponse<{ message: string }>>;
    onProgress: (callback: (progress: {
      totalFiles: number;
      processedFiles: number;
      currentFile: string | null;
      status: 'idle' | 'scanning' | 'indexing' | 'completed' | 'error';
      errorMessage?: string;
    }) => void) => () => void;
  };
}

/**
 * 聊天消息数据接口
 */
export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string; // 深度推理内容（仅 assistant 角色）
}

/**
 * 聊天会话数据接口
 */
export interface ChatSessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

/**
 * Embedding 模型配置接口
 */
export interface EmbeddingModelConfig {
  id: string;
  name: string;
  displayName: string;
  providerId: string;
  apiEndpoint: string;
  dimensions: number;
  maxTokens: number;
  supportsBatch: boolean;
  maxBatchSize: number;
  pricePerMillion?: number;
  currency?: 'USD' | 'CNY';
  enabled: boolean;
  description?: string;
}

/**
 * Embedding 服务商配置接口
 */
export interface EmbeddingProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  defaultEndpoint: string;
  apiKeyUrl: string;
  models: EmbeddingModelConfig[];
}

/**
 * Embedding 结果接口
 */
export interface EmbeddingResult {
  success: boolean;
  vectors?: number[][];
  error?: string;
  tokensUsed?: number;
  model?: string;
}

/**
 * 自定义 Embedding 模型配置接口
 */
export interface CustomEmbeddingConfig {
  apiEndpoint: string;
  modelName: string;
  dimensions: number;
  maxTokens: number;
}

/**
 * NoteStudio API 接口（通过 preload 暴露）
 */
export interface NoteStudioAPI {
  embedding: {
    generate: (text: string) => Promise<APIResponse<{ vectors: number[] }>>;
    generateBatch: (texts: string[]) => Promise<APIResponse<{ vectors: number[][] }>>;
  };
  cloudEmbedding: {
    getProviders: () => Promise<APIResponse<EmbeddingProviderConfig[]>>;
    getModels: () => Promise<APIResponse<EmbeddingModelConfig[]>>;
    setApiKey: (providerId: string, apiKey: string) => Promise<APIResponse>;
    getApiKey: (providerId: string) => Promise<APIResponse<string | undefined>>;
    setModel: (modelId: string) => Promise<APIResponse>;
    getCurrentModel: () => Promise<APIResponse<EmbeddingModelConfig | undefined>>;
    generate: (text: string) => Promise<APIResponse<EmbeddingResult>>;
    generateBatch: (texts: string[]) => Promise<APIResponse<EmbeddingResult>>;
    testConnection: (providerId: string, apiKey: string, modelId?: string) => Promise<APIResponse<{ success: boolean; message: string; dimensions?: number }>>;
    hasValidApiKey: () => Promise<APIResponse<boolean>>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    electron?: ElectronIPC;
    noteStudioAPI?: NoteStudioAPI;
  }
}



