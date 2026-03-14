/**
 * Electron API 绫诲瀷瀹氫箟
 */

/**
 * 涓婚鎺ュ彛
 */
export interface ITheme {
  id: string;
  name: string;
  type: 'dark' | 'light' | 'hc';
  colors: Record<string, string>;
  path?: string;
}

/**
 * 鎵╁睍淇℃伅鎺ュ彛
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
 * 瀹夎缁撴灉鎺ュ彛
 */
export interface InstallResult {
  success: boolean;
  extensionId: string;
  extension?: any;
  error?: string;
}

/**
 * API 鍝嶅簲鎺ュ彛
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TerminalPtyInfo {
  backend: 'conpty' | 'winpty';
  buildNumber?: number;
}

export interface TerminalOperationResult {
  success: boolean;
  error?: string;
}

export interface TerminalCreateResult extends TerminalOperationResult {
  terminalId?: string;
  ptyInfo?: TerminalPtyInfo;
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
  // 绐楀彛鐒︾偣鐘舵€佺洃鍚?
  onWindowFocus?: (callback: (focused: boolean) => void) => void;
  onWindowBlur?: (callback: (focused: boolean) => void) => void;
  
  // 鎵撳紑瑙嗛鏂囦欢瀵硅瘽妗?
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
 * 鑱婂ぉ妯″瀷鎺ュ彛
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
 * AI 妯″瀷閰嶇疆鎺ュ彛
 */
export interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  chatModels?: ChatModel[];  // 鍙€夌殑鑱婂ぉ妯″瀷鍒楄〃
  
  // 馃 妯″瀷鍙傛暟锛堟牳蹇冿級
  parameters?: {
    temperature?: number;        // 0-2锛屽垱閫犳€э紝0=纭畾锛?=闅忔満
    maxTokens?: number;          // 1-128000锛屾渶澶ц緭鍑洪暱搴?
    topP?: number;               // 0-1锛屾牳閲囨牱锛屾帶鍒惰瘝姹囧鏍锋€?
    frequencyPenalty?: number;   // -2 鍒?2锛岄鐜囨儵缃氾紝鍑忓皯閲嶅鍐呭
    presencePenalty?: number;    // -2 鍒?2锛岄紦鍔辨柊璇濋
  };
  
  // 鈿欙笍 楂樼骇閰嶇疆锛堝彲閫夛級
  advanced?: {
    timeout?: number;            // 璇锋眰瓒呮椂锛堟绉掞級
    maxRetries?: number;         // 閲嶈瘯娆℃暟
    stream?: boolean;            // 娴佸紡浼犺緭
    proxy?: string;              // 浠ｇ悊璁剧疆
    costControl?: {
      maxCostPerRequest?: number;  // 鍗曟璇锋眰鏈€澶ф垚鏈紙缇庡厓锛?
      dailyLimit?: number;         // 姣忔棩鎴愭湰闄愬埗锛堢編鍏冿級
    };
  };
}

/**
 * 鐗囨鎺ュ彛
 * 娉ㄦ剰锛氫粠 shared 鍖呭鍏ヤ互纭繚绫诲瀷涓€鑷存€?
 */
export interface Snippet {
  id?: number;
  name: string;          // 鐗囨鍚嶇О锛岀敤浜庢樉绀哄拰鍖哄垎鐗囨
  prefix: string;        // 瑙﹀彂鍓嶇紑锛堝繀濉級锛岀敤浜庤嚜鍔ㄨˉ鍏?
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
 * 琛ㄥ崟鍒嗙粍鏁版嵁鎺ュ彛
 */
export interface FormGroupData {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
}

/**
 * 琛ㄥ崟鏁版嵁鎺ュ彛
 */
export interface FormTableData {
  id: string;
  name: string;
  groupId: string | null;
  data: string; // JSON 瀛楃涓诧紝鍖呭惈 columns 鍜?rows
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
    // 鍒嗙粍鎿嶄綔
    createGroup: (name: string, parentId: string | null) => Promise<APIResponse<FormGroupData>>;
    getAllGroups: () => Promise<APIResponse<FormGroupData[]>>;
    getGroupsByParent: (parentId: string | null) => Promise<APIResponse<FormGroupData[]>>;
    updateGroup: (id: string, updates: Partial<FormGroupData>) => Promise<APIResponse>;
    deleteGroup: (id: string) => Promise<APIResponse>;
    // 琛ㄥ崟鎿嶄綔
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
    create: (cols: number, rows: number, cwd?: string, shell?: string) => Promise<TerminalCreateResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => Promise<TerminalOperationResult>;
    clear: (id: string) => Promise<TerminalOperationResult>;
    destroy: (id: string) => Promise<TerminalOperationResult>;
    onData: (callback: (terminalId: string, data: string) => void) => () => void;
    onExit: (callback: (terminalId: string, exitCode: number) => void) => () => void;
  };
  createNewWindow: () => Promise<{ success: boolean; windowId?: number; error?: string }>;
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
 * 鑱婂ぉ娑堟伅鏁版嵁鎺ュ彛
 */
export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string; // 娣卞害鎺ㄧ悊鍐呭锛堜粎 assistant 瑙掕壊锛?
}

/**
 * 鑱婂ぉ浼氳瘽鏁版嵁鎺ュ彛
 */
export interface ChatSessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

/**
 * Embedding 妯″瀷閰嶇疆鎺ュ彛
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
 * Embedding 鏈嶅姟鍟嗛厤缃帴鍙?
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
 * Embedding 缁撴灉鎺ュ彛
 */
export interface EmbeddingResult {
  success: boolean;
  vectors?: number[][];
  error?: string;
  tokensUsed?: number;
  model?: string;
}


/**
 * 鑷畾涔?Embedding 妯″瀷閰嶇疆鎺ュ彛
 */
export interface CustomEmbeddingConfig {
  apiEndpoint: string;
  modelName: string;
  dimensions: number;
  maxTokens: number;
}

/**
 * NoteStudio API 鎺ュ彛锛堥€氳繃 preload 鏆撮湶锛?
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

// ==================== 绗旇绯荤粺绫诲瀷瀹氫箟 ====================

/**
 * 绗旇绫诲瀷
 */
export type NoteType = 'daily' | 'quick' | 'normal';

/**
 * 绗旇鏁版嵁鎺ュ彛
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
 * 鏍囩鏁版嵁鎺ュ彛
 */
export interface TagItem {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  createdAt: number;
}

/**
 * 閾炬帴鏁版嵁鎺ュ彛
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
 * 鏈摼鎺ユ彁鍙婃暟鎹帴鍙?
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
 * 妯℃澘鏁版嵁鎺ュ彛
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
 * 绗旇绯荤粺 IPC API 鎺ュ彛
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


