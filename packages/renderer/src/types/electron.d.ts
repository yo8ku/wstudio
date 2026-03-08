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
    executeCommand: (command: string, ...args: unknown[]) => Promise<unknown>;
    sendMessage: (extensionId: string, message: unknown) => Promise<unknown>;
    onExtensionActivated: (callback: (data: unknown) => void) => void;
    onExtensionDeactivated: (callback: (data: unknown) => void) => void;
    onMessage: (callback: (data: unknown) => void) => void;
    onExtensionInstalled: (callback: (data: { extensionId: string; extension: unknown }) => void) => void;
  };
  marketplace: {
    search: (query: string, pageSize?: number) => Promise<APIResponse<IExtensionInfo[]>>;
    install: (extensionId: string, version?: string) => Promise<InstallResult>;
    getDetails: (extensionId: string) => Promise<APIResponse<IExtensionInfo>>;
  };
  settings?: {
    getAll: () => Promise<APIResponse<Record<string, unknown>>>;
    get: (key: string) => Promise<APIResponse<unknown>>;
    getPlugin: (key: string) => Promise<APIResponse<unknown>>;
    update: (key: string, value: unknown, target?: 'user' | 'workspace') => Promise<APIResponse>;
    updateMany: (updates: Record<string, unknown>, target?: 'user' | 'workspace') => Promise<APIResponse>;
    reset: (key?: string) => Promise<APIResponse>;
    getPath: (target?: 'user' | 'workspace') => Promise<APIResponse<string>>;
    openJson: (target?: 'user' | 'workspace') => Promise<APIResponse<FileData>>;
    import: (settingsJson: string, target?: 'user' | 'workspace') => Promise<APIResponse>;
    export: () => Promise<APIResponse<string>>;
    getDefaults: () => Promise<APIResponse<Record<string, unknown>>>;
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
    updateUserModelConfigs: (configs: Array<{
      modelId: string;
      configName: string;
      apiKey: string;
      apiEndpoint: string;
      providerId: string;
      temperature?: number;
    }>) => Promise<{ success: boolean; count?: number }>;
  };
  // 窗口焦点状态监听
  onWindowFocus?: (callback: (focused: boolean) => void) => void;
  onWindowBlur?: (callback: (focused: boolean) => void) => void;
  
  // 打开视频文件对话框
  openVideoFile?: () => Promise<{ canceled: boolean; filePath?: string }>;
  
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

/**
 * 表单分组数据接口
 */
export interface FormGroupData {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
}

/**
 * 表单数据接口
 */
export interface FormTableData {
  id: string;
  name: string;
  groupId: string | null;
  data: string; // JSON 字符串，包含 columns 和 rows
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type FormQueryWhereOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts_with'
  | 'ends_with';

export interface FormQueryWhere {
  column: string;
  op: FormQueryWhereOperator;
  value: unknown;
}

export interface FormQueryParams {
  formId: string;
  query?: string;
  where?: FormQueryWhere | null;
  columns?: string[];
  limit?: number;
  offset?: number;
  rowIds?: string[];
}

export interface FormQueryColumn {
  id: string;
  name: string;
}

export interface FormQueryRow {
  id: string;
  cells: Record<string, unknown>;
}

export interface FormQueryResult {
  formId: string;
  formName: string;
  allColumns: FormQueryColumn[];
  selectedColumns: FormQueryColumn[];
  rows: FormQueryRow[];
  matchedTotal: number;
  returnedCount: number;
  totalRows: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number;
  appliedWhere: FormQueryWhere | null;
  whereInferred: boolean;
}

export interface ElectronIPC {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
    once: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
    removeListener: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  };
  builtinAI?: {
    getModels: () => Promise<string[]>;
    refreshModels: () => Promise<{ success: boolean; models?: string[]; error?: string }>;
    updateUserModels: (models: string[]) => Promise<{ success: boolean; count?: number }>;
    updateUserModelConfigs: (configs: Array<{
      modelId: string;
      configName: string;
      apiKey: string;
      apiEndpoint: string;
      providerId: string;
      temperature?: number;
    }>) => Promise<{ success: boolean; count?: number }>;
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
    saveAs: (
      content: string,
      options?: {
        defaultPath?: string;
      }
    ) => Promise<FileResult>;
    showOpenDialog: (options: {
      title?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    }) => Promise<{ canceled: boolean; filePaths: string[] }>;
    readBinary: (filePath: string) => Promise<Uint8Array>;
  };
  image?: {
    open: () => Promise<FileResult>;
  };
  video?: {
    open: () => Promise<FileResult>;
    saveToCache: (sourcePath: string) => Promise<APIResponse<{ path: string }>>;
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
  form?: {
    initialize: () => Promise<APIResponse>;
    // 分组操作
    createGroup: (name: string, parentId: string | null) => Promise<APIResponse<FormGroupData>>;
    getAllGroups: () => Promise<APIResponse<FormGroupData[]>>;
    getGroupsByParent: (parentId: string | null) => Promise<APIResponse<FormGroupData[]>>;
    updateGroup: (id: string, updates: Partial<FormGroupData>) => Promise<APIResponse>;
    deleteGroup: (id: string) => Promise<APIResponse>;
    // 表单操作
    createForm: (name: string, groupId: string | null, data?: string) => Promise<APIResponse<FormTableData>>;
    getAllForms: () => Promise<APIResponse<FormTableData[]>>;
    getFormsByGroup: (groupId: string | null) => Promise<APIResponse<FormTableData[]>>;
    getFormById: (id: string) => Promise<APIResponse<FormTableData | null>>;
    queryRows: (params: FormQueryParams) => Promise<APIResponse<FormQueryResult | null>>;
    updateForm: (id: string, updates: Partial<FormTableData>) => Promise<APIResponse>;
    deleteForm: (id: string) => Promise<APIResponse>;
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
  dbConnector?: {
    getSupportedTypes: () => Promise<Array<{ type: string; name: string; description: string }>>;
    selectDatabaseFile: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
    checkFileExists: (filePath: string) => Promise<boolean>;
    testConnection: (config: Record<string, unknown>) => Promise<{ success: boolean; error?: string; version?: string }>;
    createConnection: (id: string, config: Record<string, unknown>, autoConnect?: boolean) => Promise<{ success: boolean; error?: string }>;
    getConnectionStatus: (id: string) => Promise<{ connected: boolean; connectedAt?: Date; error?: string; version?: string } | undefined>;
    getAllConnections: () => Promise<Array<{ id: string; config: Record<string, unknown>; status: Record<string, unknown> }>>;
    removeConnection: (id: string) => Promise<boolean>;
    reconnect: (id: string) => Promise<boolean>;
    getTables: (id: string) => Promise<{ success: boolean; data?: Array<{ name: string; schema?: string; type: 'table' | 'view'; rowCount?: number }>; error?: string }>;
    getColumns: (id: string, tableName: string) => Promise<{ success: boolean; data?: Array<{ name: string; dataType: string; nullable: boolean; isPrimaryKey: boolean; defaultValue?: string; comment?: string }>; error?: string }>;
    query: (id: string, sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: { rows: Record<string, unknown>[]; affectedRows?: number; executionTime?: number }; error?: string }>;
    execute: (id: string, sql: string, params?: unknown[]) => Promise<{ success: boolean; data?: { rows: Record<string, unknown>[]; affectedRows?: number; executionTime?: number }; error?: string }>;
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

// ==================== 笔记系统类型定义 ====================

/**
 * 笔记类型
 */
export type NoteType = 'daily' | 'quick' | 'normal';

/**
 * 笔记数据接口
 */
export interface NoteItem {
  id: string;
  title: string;
  content: string;
  path: string;
  type: NoteType;
  isFavorite: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: string;
}

/**
 * 标签数据接口
 */
export interface TagItem {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  createdAt: number;
}

/**
 * 链接数据接口
 */
export type LinkTargetKind = 'note' | 'heading' | 'block';

export interface LinkItem {
  id: string;
  sourceId: string;
  targetId?: string;
  targetTitle: string;
  context: string;
  displayText?: string;
  targetKind?: LinkTargetKind;
  targetAnchor?: string;
  sourceStart?: number;
  sourceEnd?: number;
  sourceNoteTitle?: string;
  sourceLine?: number;
  isResolved?: boolean;
  createdAt: number;
}

/**
 * 未链接提及数据接口
 */
export interface UnlinkedMentionItem {
  noteId: string;
  noteTitle: string;
  context: string;
  matchedText: string;
  position: {
    start: number;
    end: number;
    line: number;
  };
}

export interface LinkTargetSuggestionItem {
  noteId: string;
  title: string;
  path: string;
  aliases: string[];
}

export interface LinkAnchorSuggestionItem {
  noteId: string;
  kind: Exclude<LinkTargetKind, 'note'>;
  reference: string;
  preview: string;
  line: number;
}

/**
 * 模板数据接口
 */
export interface TemplateItem {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 笔记系统 IPC API 接口
 */
export interface NoteSystemAPI {
  note: {
    create: (data: Partial<NoteItem>) => Promise<NoteItem>;
    update: (id: string, updates: Partial<NoteItem>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    get: (id: string) => Promise<NoteItem | null>;
    getAll: () => Promise<NoteItem[]>;
    search: (query: string) => Promise<NoteItem[]>;
    getDailyNote: (date: string) => Promise<NoteItem | null>;
    createDailyNote: (date: string, template?: string) => Promise<NoteItem>;
    getFavorites: () => Promise<NoteItem[]>;
    toggleFavorite: (id: string) => Promise<boolean>;
    getByTitle: (title: string) => Promise<NoteItem | null>;
  };
  tag: {
    create: (name: string, parentId?: string) => Promise<TagItem>;
    update: (id: string, name: string) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getAll: () => Promise<TagItem[]>;
    getNotesByTag: (tagId: string) => Promise<NoteItem[]>;
  };
  link: {
    getOutlinks: (noteId: string) => Promise<LinkItem[]>;
    getBacklinks: (noteId: string) => Promise<LinkItem[]>;
    getAllLinks: () => Promise<LinkItem[]>;
    findUnlinkedMentions: (noteId: string) => Promise<UnlinkedMentionItem[]>;
    convertUnlinkedMention: (
      sourceNoteId: string,
      targetNoteId: string,
      position: { start: number; end: number },
      matchedText?: string
    ) => Promise<boolean>;
    searchTargets: (query: string) => Promise<LinkTargetSuggestionItem[]>;
    getAnchors: (targetReference: string, query?: string) => Promise<LinkAnchorSuggestionItem[]>;
    create: (sourceId: string, targetTitle: string, context?: string) => Promise<LinkItem>;
    delete: (id: string) => Promise<boolean>;
  };
  template: {
    create: (template: Partial<TemplateItem>) => Promise<TemplateItem>;
    update: (id: string, updates: Partial<TemplateItem>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    getAll: () => Promise<TemplateItem[]>;
    get: (id: string) => Promise<TemplateItem | null>;
  };
}



