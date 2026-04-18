/**
 * Electron API 缁鐎风€规矮绠?
 */

/**
 * 娑撳顣介幒銉ュ經
 */
import type {
  BookmarkGroupPickerActionResult,
  BookmarkGroupPickerRequest,
  BookmarkGroupPickerResult,
  BookmarkGroupPickerState,
} from './bookmarkGroupPicker';

export interface ITheme {
  id: string;
  name: string;
  type: 'dark' | 'light' | 'hc';
  colors: Record<string, string>;
  path?: string;
}

/**
 * API 閸濆秴绨查幒銉ュ經
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
  settings?: {
    getAll: () => Promise<APIResponse<Record<string, unknown>>>;
    get: (key: string) => Promise<APIResponse<unknown>>;
    set: (key: string, value: unknown, target?: 'user' | 'workspace') => Promise<APIResponse>;
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
  // 缁愭褰涢悞锔惧仯閻樿埖鈧胶娲冮崥?
  onWindowFocus?: (callback: (focused: boolean) => void) => (() => void);
  onWindowBlur?: (callback: (focused: boolean) => void) => (() => void);
  onWindowMaximizedStateChanged?: (callback: (isMaximized: boolean) => void) => (() => void);
  
  // 閹垫挸绱戠憴鍡涱暥閺傚洣娆㈢€电鐦藉?
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
  theme?: {
    list: () => Promise<APIResponse<ITheme[]>>;
    getCurrent: () => Promise<APIResponse<ITheme>>;
    apply: (themeId: string) => Promise<APIResponse>;
  };
  on?: (channel: string, callback: (event: any, ...args: any[]) => void) => () => void;
  off?: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  version: string;
  minimizeWindow: () => void;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => void;
  isWindowMaximized: () => Promise<boolean>;
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

export type WorkspaceLastOpenedResult = APIResponse<string> | FileResult;

export type WorkspaceCanvasPaneId = 'left-top' | 'left-bottom' | 'right-top' | 'right-bottom';

export interface WorkspaceOpenCanvasLayoutItem {
  path: string;
  paneId: WorkspaceCanvasPaneId;
  active: boolean;
}

export interface OpenNoteInNewWindowPayload {
  path: string;
  content: string;
  name: string;
  language: string;
  lineNumber?: number;
  column?: number;
}

export interface WindowOperationResult {
  success: boolean;
  windowId?: number;
  error?: string;
}

export interface WorkspaceTextSearchRequest {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  includePattern?: string;
  excludePattern?: string;
  maxResults?: number;
}

export interface WorkspaceTextReplaceTarget {
  absolutePath: string;
  line: number;
  column: number;
  source?: 'workspace-file' | 'note';
  noteId?: string;
}

export interface WorkspaceTextReplaceRequest extends WorkspaceTextSearchRequest {
  replace: string;
  replaceAll?: boolean;
  target?: WorkspaceTextReplaceTarget;
}

export interface WorkspaceTextSearchMatch {
  absolutePath: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
  matchedText?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface WorkspaceTextSearchGroupCount {
  groupKey: string;
  totalMatches: number;
}

export interface WorkspaceTextSearchResponse {
  items: WorkspaceTextSearchMatch[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
  groupCounts: WorkspaceTextSearchGroupCount[];
}

export interface WorkspaceTextReplaceUpdatedTarget {
  absolutePath: string;
  editorPath: string;
  relativePath: string;
  content: string;
  replacedCount: number;
  source?: 'workspace-file' | 'note';
  noteId?: string;
  title?: string;
}

export interface WorkspaceTextReplaceResponse {
  replacedCount: number;
  fileCount: number;
  updatedTargets: WorkspaceTextReplaceUpdatedTarget[];
}

export interface WorkspaceSearchSessionStartResult {
  sessionId: string;
}

export interface WorkspaceSearchTagRequest {
  includePattern?: string;
  excludePattern?: string;
}

export interface WorkspaceSearchBlockCandidate {
  keyword: string;
  preview: string;
}

export interface WorkspaceSearchBatchEvent {
  sessionId: string;
  items: WorkspaceTextSearchMatch[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

export interface WorkspaceSearchCompleteEvent {
  sessionId: string;
  groupCounts: WorkspaceTextSearchGroupCount[];
  limitHit: boolean;
  totalCount: number;
  totalFiles: number;
}

export interface WorkspaceSearchErrorEvent {
  sessionId: string;
  error: string;
}

/**
 * 閼卞﹤銇夊Ο鈥崇€烽幒銉ュ經
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
 * AI 濡€崇€烽柊宥囩枂閹恒儱褰?
 */
export interface AIModelConfig {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
  chatModels?: ChatModel[];  // 閸欘垶鈧娈戦懕濠傘亯濡€崇€烽崚妤勩€?
  
  // 棣冾潵 濡€崇€烽崣鍌涙殶閿涘牊鐗宠箛鍐跨礆
  parameters?: {
    temperature?: number;        // 0-2閿涘苯鍨遍柅鐘斥偓褝绱?=绾喖鐣鹃敍?=闂呭繑婧€
    maxTokens?: number;          // 1-128000閿涘本娓舵径褑绶崙娲毐鎼?
    topP?: number;               // 0-1閿涘本鐗抽柌鍥ㄧ壉閿涘本甯堕崚鎯扮槤濮瑰洤顦块弽閿嬧偓?
    frequencyPenalty?: number;   // -2 閸?2閿涘矂顣堕悳鍥ㄥ劦缂冩熬绱濋崙蹇撶毌闁插秴顦查崘鍛啇
    presencePenalty?: number;    // -2 閸?2閿涘矂绱﹂崝杈ㄦ煀鐠囨繈顣?
  };
  
  // 閳挎瑱绗?妤傛楠囬柊宥囩枂閿涘牆褰查柅澶涚礆
  advanced?: {
    timeout?: number;            // 鐠囬攱鐪扮搾鍛閿涘牊顕犵粔鎺炵礆
    maxRetries?: number;         // 闁插秷鐦▎鈩冩殶
    stream?: boolean;            // 濞翠礁绱℃导鐘虹翻
    proxy?: string;              // 娴狅絿鎮婄拋鍓х枂
    costControl?: {
      maxCostPerRequest?: number;  // 閸楁洘顐肩拠閿嬬湴閺堚偓婢堆勫灇閺堫剨绱欑紘搴″帗閿?
      dailyLimit?: number;         // 濮ｅ繑妫╅幋鎰拱闂勬劕鍩楅敍鍫㈢法閸忓喛绱?
    };
  };
}

/**
 * 鐞涖劌宕熼崚鍡欑矋閺佺増宓侀幒銉ュ經
 */
export interface FormGroupData {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
}

/**
 * 鐞涖劌宕熼弫鐗堝祦閹恒儱褰?
 */
export interface FormTableData {
  id: string;
  name: string;
  groupId: string | null;
  data: string; // JSON 鐎涙顑佹稉璇х礉閸栧懎鎯?columns 閸?rows
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
    getRootDirectories: () => Promise<APIResponse<string[]>>;
    getSearchBlockKeywords: (
      request?: WorkspaceSearchTagRequest,
    ) => Promise<APIResponse<WorkspaceSearchBlockCandidate[]>>;
    getSearchTags: (request?: WorkspaceSearchTagRequest) => Promise<APIResponse<string[]>>;
    getRecentFiles: () => Promise<APIResponse<string[]>>;
    getOpenCanvasFiles: () => Promise<APIResponse<string[]>>;
    getOpenCanvasLayout: () => Promise<APIResponse<WorkspaceOpenCanvasLayoutItem[]>>;
    getLastOpened: () => Promise<WorkspaceLastOpenedResult>;
    addRecentFile: (filePath: string) => Promise<APIResponse>;
    clearRecentFiles: () => Promise<APIResponse>;
    setOpenCanvasFiles: (filePaths: string[]) => Promise<APIResponse>;
    setOpenCanvasLayout: (layoutItems: WorkspaceOpenCanvasLayoutItem[]) => Promise<APIResponse>;
    searchText: (request: WorkspaceTextSearchRequest) => Promise<APIResponse<WorkspaceTextSearchResponse>>;
    replaceText: (request: WorkspaceTextReplaceRequest) => Promise<APIResponse<WorkspaceTextReplaceResponse>>;
    startSearchSession: (request: WorkspaceTextSearchRequest) => Promise<APIResponse<WorkspaceSearchSessionStartResult>>;
    cancelSearchSession: (sessionId: string) => Promise<APIResponse<{ cancelled: boolean }>>;
    onSearchBatch: (callback: (payload: WorkspaceSearchBatchEvent) => void) => (() => void);
    onSearchComplete: (callback: (payload: WorkspaceSearchCompleteEvent) => void) => (() => void);
    onSearchError: (callback: (payload: WorkspaceSearchErrorEvent) => void) => (() => void);
  };
  knowledgeBase?: {
    openFolder: () => Promise<FileResult>;
  };
  shell?: {
    openExternal: (url: string) => Promise<APIResponse>;
  };
  bookmarkGroupPicker?: {
    prepare: () => Promise<BookmarkGroupPickerActionResult>;
    open: (request: BookmarkGroupPickerRequest) => Promise<BookmarkGroupPickerResult>;
    getState: () => Promise<BookmarkGroupPickerState | null>;
    select: (groupId: string | null) => Promise<BookmarkGroupPickerActionResult>;
    cancel: () => Promise<BookmarkGroupPickerActionResult>;
    onStateChanged: (callback: (state: BookmarkGroupPickerState) => void) => (() => void);
  };
  form?: {
    initialize: () => Promise<APIResponse>;
    // 閸掑棛绮嶉幙宥勭稊
    createGroup: (name: string, parentId: string | null) => Promise<APIResponse<FormGroupData>>;
    getAllGroups: () => Promise<APIResponse<FormGroupData[]>>;
    getGroupsByParent: (parentId: string | null) => Promise<APIResponse<FormGroupData[]>>;
    updateGroup: (id: string, updates: Partial<FormGroupData>) => Promise<APIResponse>;
    deleteGroup: (id: string) => Promise<APIResponse>;
    // 鐞涖劌宕熼幙宥勭稊
    createForm: (name: string, groupId: string | null, data?: string) => Promise<APIResponse<FormTableData>>;
    getAllForms: () => Promise<APIResponse<FormTableData[]>>;
    getFormsByGroup: (groupId: string | null) => Promise<APIResponse<FormTableData[]>>;
    getFormById: (id: string) => Promise<APIResponse<FormTableData | null>>;
    queryRows: (params: FormQueryParams) => Promise<APIResponse<FormQueryResult | null>>;
    updateForm: (id: string, updates: Partial<FormTableData>) => Promise<APIResponse>;
    deleteForm: (id: string) => Promise<APIResponse>;
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
  createNewWindow: () => Promise<WindowOperationResult>;
  openNoteInNewWindow: (payload: OpenNoteInNewWindowPayload) => Promise<WindowOperationResult>;
  onOpenNoteInNewWindow: (callback: (payload: OpenNoteInNewWindowPayload) => void) => () => void;
  notifyEditorReady: () => void;
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
    getProviderEndpoint: (providerId: string) => Promise<APIResponse<string>>;
    setProviderEndpoint: (providerId: string, endpoint: string) => Promise<APIResponse>;
    setModel: (modelId: string, providerId?: string) => Promise<APIResponse>;
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
 * 閼卞﹤銇夊☉鍫熶紖閺佺増宓侀幒銉ュ經
 */
export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string; // 濞ｅ崬瀹抽幒銊ф倞閸愬懎顔愰敍鍫滅矌 assistant 鐟欐帟澹婇敍?
}

/**
 * 閼卞﹤銇夋导姘崇樈閺佺増宓侀幒銉ュ經
 */
export interface ChatSessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

/**
 * Embedding 濡€崇€烽柊宥囩枂閹恒儱褰?
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
 * Embedding 閺堝秴濮熼崯鍡涘帳缂冾喗甯撮崣?
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
 * Embedding 缂佹挻鐏夐幒銉ュ經
 */
export interface EmbeddingResult {
  success: boolean;
  vectors?: number[][];
  error?: string;
  tokensUsed?: number;
  model?: string;
}


/**
 * 閼奉亜鐣炬稊?Embedding 濡€崇€烽柊宥囩枂閹恒儱褰?
 */
export interface CustomEmbeddingConfig {
  apiEndpoint: string;
  modelName: string;
  dimensions: number;
  maxTokens: number;
}

/**
 * NoteStudio API 閹恒儱褰涢敍鍫モ偓姘崇箖 preload 閺嗘挳婀堕敍?
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
    getProviderEndpoint: (providerId: string) => Promise<APIResponse<string>>;
    setProviderEndpoint: (providerId: string, endpoint: string) => Promise<APIResponse>;
    setModel: (modelId: string, providerId?: string) => Promise<APIResponse>;
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

// ==================== 缁楁棁顔囩化鑽ょ埠缁鐎风€规矮绠?====================

/**
 * 缁楁棁顔囩猾璇茬€?
 */
export type NoteType = 'daily' | 'quick' | 'normal';

/**
 * 缁楁棁顔囬弫鐗堝祦閹恒儱褰?
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
 * 閺嶅洨顒烽弫鐗堝祦閹恒儱褰?
 */
export interface TagItem {
  id: string;
  name: string;
  parentId?: string;
  noteCount: number;
  createdAt: number;
}

/**
 * 闁剧偓甯撮弫鐗堝祦閹恒儱褰?
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
 * 閺堫亪鎽奸幒銉﹀絹閸欏﹥鏆熼幑顔藉复閸?
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
 * 濡剝婢橀弫鐗堝祦閹恒儱褰?
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
 * 缁楁棁顔囩化鑽ょ埠 IPC API 閹恒儱褰?
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

