/**
 * Electron Preload 脚本
 * 在渲染进程中安全地暴露 Electron API
 */

const { contextBridge, ipcRenderer } = require('electron');

const subscribeIpcChannel = (channel, listener) => {
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // IPC 渲染器通用接口
  ipcRenderer: {
    send: (channel, ...args) => {
      ipcRenderer.send(channel, ...args);
    },
    invoke: (channel, ...args) => {
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel, callback) => {
      const subscription = (event, ...args) => callback(event, ...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    once: (channel, callback) => {
      const subscription = (event, ...args) => callback(event, ...args);
      ipcRenderer.once(channel, subscription);
    },
    removeListener: (channel, callback) => {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  
  // 文件操作 API
  file: {
    open: () => ipcRenderer.invoke('file:open'),
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    save: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
    saveAs: (content, options) => ipcRenderer.invoke('file:save-as', content, options),
    showOpenDialog: (options) => ipcRenderer.invoke('file:show-open-dialog', options),
    readBinary: (filePath) => ipcRenderer.invoke('file:read-binary', filePath)
  },
  
  // 图片操作 API
  image: {
    open: () => ipcRenderer.invoke('image:open')
  },
  
  // 视频操作 API
  video: {
    open: () => ipcRenderer.invoke('video:open'),
    saveToCache: (sourcePath) => ipcRenderer.invoke('video:save-to-cache', sourcePath)
  },
  
  // 文件夹操作 API
  folder: {
    open: () => ipcRenderer.invoke('folder:open'),
    readTree: (folderPath) => ipcRenderer.invoke('folder:read-tree', folderPath),
    expand: (folderPath, rootPath) => ipcRenderer.invoke('folder:expand', folderPath, rootPath),
    createFile: (parentPath, fileName) => ipcRenderer.invoke('folder:create-file', parentPath, fileName),
    createFolder: (parentPath, folderName) => ipcRenderer.invoke('folder:create-folder', parentPath, folderName),
    rename: (oldPath, newName) => ipcRenderer.invoke('folder:rename', oldPath, newName),
    delete: (path) => ipcRenderer.invoke('folder:delete', path),
    revealInExplorer: (path) => ipcRenderer.invoke('folder:reveal-in-explorer', path),
    ensureDir: (dirPath) => ipcRenderer.invoke('folder:ensure-dir', dirPath),
    getAllNotes: (folderPath) => ipcRenderer.invoke('folder:get-all-notes', folderPath),
    copyToFolder: (sourcePath, targetFolderPath) => ipcRenderer.invoke('file:copy-to-folder', sourcePath, targetFolderPath)
  },
  
  // 工作区 API
  workspace: {
    getDir: () => ipcRenderer.invoke('workspace:get-dir'),
    getRootDirectories: () => ipcRenderer.invoke('workspace:get-root-directories'),
    getSearchBlockKeywords: (request) => ipcRenderer.invoke('workspace:get-search-block-keywords', request),
    getSearchTags: (request) => ipcRenderer.invoke('workspace:get-search-tags', request),
    getRecentFiles: () => ipcRenderer.invoke('workspace:get-recent-files'),
    getOpenCanvasFiles: () => ipcRenderer.invoke('workspace:get-open-canvas-files'),
    getOpenCanvasLayout: () => ipcRenderer.invoke('workspace:get-open-canvas-layout'),
    getLastOpened: () => ipcRenderer.invoke('workspace:get-last-opened'),
    addRecentFile: (filePath) => ipcRenderer.invoke('workspace:add-recent-file', filePath),
    clearRecentFiles: () => ipcRenderer.invoke('workspace:clear-recent-files'),
    setOpenCanvasFiles: (filePaths) => ipcRenderer.invoke('workspace:set-open-canvas-files', filePaths),
    setOpenCanvasLayout: (layoutItems) => ipcRenderer.invoke('workspace:set-open-canvas-layout', layoutItems),
    searchText: (request) => ipcRenderer.invoke('workspace:search-text', request),
    replaceText: (request) => ipcRenderer.invoke('workspace:replace-text', request),
    startSearchSession: (request) => ipcRenderer.invoke('workspace:search-start', request),
    cancelSearchSession: (sessionId) => ipcRenderer.invoke('workspace:search-cancel', sessionId),
    onSearchBatch: (callback) => {
      const subscription = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-search:batch', subscription);
      return () => ipcRenderer.removeListener('workspace-search:batch', subscription);
    },
    onSearchComplete: (callback) => {
      const subscription = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-search:complete', subscription);
      return () => ipcRenderer.removeListener('workspace-search:complete', subscription);
    },
    onSearchError: (callback) => {
      const subscription = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-search:error', subscription);
      return () => ipcRenderer.removeListener('workspace-search:error', subscription);
    }
  },

  // 知识库 API
  knowledgeBase: {
    openFolder: () => ipcRenderer.invoke('knowledge-base:open-folder')
  },
  
  // 设置相关 API
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    update: (key, value, target) => ipcRenderer.invoke('settings:update', key, value, target),
    updateMany: (updates, target) => ipcRenderer.invoke('settings:update-many', updates, target),
    reset: (key) => ipcRenderer.invoke('settings:reset', key),
    getPath: (target) => ipcRenderer.invoke('settings:get-path', target),
    openJson: (target) => ipcRenderer.invoke('settings:open-json', target),
    import: (settingsJson, target) => ipcRenderer.invoke('settings:import', settingsJson, target),
    export: () => ipcRenderer.invoke('settings:export'),
    getDefaults: () => ipcRenderer.invoke('settings:get-defaults')
  },
  
  // 内置AI相关 API
  builtinAI: {
    isConnected: () => ipcRenderer.invoke('builtin-ai:is-connected'),
    initialize: () => ipcRenderer.invoke('builtin-ai:initialize'),
    getModels: () => ipcRenderer.invoke('builtin-ai:get-models'),
    updateModels: (models) => ipcRenderer.invoke('builtin-ai:update-models', models),
    updateUserModels: (models) => ipcRenderer.invoke('builtin-ai:update-user-models', models),
    updateUserModelConfigs: (configs) => ipcRenderer.invoke('builtin-ai:update-user-model-configs', configs),
    chat: (model, messages) => ipcRenderer.invoke('builtin-ai:chat', { model, messages })
  },
  
  // 片段数据库 API
  
  // 终端 API
  terminal: {
    create: (cols, rows, cwd, shell) => ipcRenderer.invoke('terminal:create', { cols, rows, cwd, shell }),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    clear: (id) => ipcRenderer.invoke('terminal:clear', id),
    destroy: (id) => ipcRenderer.invoke('terminal:destroy', id),
    onData: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('terminal:data', subscription);
      return () => ipcRenderer.removeListener('terminal:data', subscription);
    },
    onExit: (callback) => {
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on('terminal:exit', subscription);
      return () => ipcRenderer.removeListener('terminal:exit', subscription);
    }
  },
  
  // 文件引用 API
  fileReference: {
    add: (filePath, content, options) => 
      ipcRenderer.invoke('file-reference:add', filePath, content, options),
    search: (query, options) => 
      ipcRenderer.invoke('file-reference:search', query, options)
  },
  
  // 工作区向量索引 API
  workspaceVectorIndex: {
    start: (workspacePath) => ipcRenderer.invoke('workspace-vector-index:start', workspacePath),
    stop: () => ipcRenderer.invoke('workspace-vector-index:stop'),
    getProgress: () => ipcRenderer.invoke('workspace-vector-index:get-progress'),
    deleteFile: (filePath) => ipcRenderer.invoke('workspace-vector-index:delete-file', filePath),
    deleteDirectory: (dirPath) => ipcRenderer.invoke('workspace-vector-index:delete-directory', dirPath),
    indexFile: (filePath) => ipcRenderer.invoke('workspace-vector-index:index-file', filePath),
    checkAutoIndex: (workspacePath) => ipcRenderer.invoke('workspace-vector-index:check-auto-index', workspacePath),
    // 监听索引进度事件
    onProgress: (callback) => {
      const subscription = (event, progress) => callback(progress);
      ipcRenderer.on('workspace-vector-index:progress', subscription);
      return () => ipcRenderer.removeListener('workspace-vector-index:progress', subscription);
    }
  },
  
  // 应用路径 API
  app: {
    getAppPath: () => ipcRenderer.invoke('app:get-app-path')
  },
  
  // Shell API
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
  },

  // 书签分组弹出选择器 API
  bookmarkGroupPicker: {
    prepare: () => ipcRenderer.invoke('bookmark-group-picker:prepare'),
    open: (request) => ipcRenderer.invoke('bookmark-group-picker:open', request),
    getState: () => ipcRenderer.invoke('bookmark-group-picker:get-state'),
    select: (groupId) => ipcRenderer.invoke('bookmark-group-picker:select', groupId),
    cancel: () => ipcRenderer.invoke('bookmark-group-picker:cancel'),
    onStateChanged: (callback) => {
      const subscription = (_event, nextState) => callback(nextState);
      ipcRenderer.on('bookmark-group-picker:state-changed', subscription);
      return () => ipcRenderer.removeListener('bookmark-group-picker:state-changed', subscription);
    }
  },
  
  // 表单 API
  form: {
    initialize: () => ipcRenderer.invoke('form:initialize'),
    // 分组操作
    createGroup: (name, parentId) => ipcRenderer.invoke('form:createGroup', name, parentId),
    getAllGroups: () => ipcRenderer.invoke('form:getAllGroups'),
    getGroupsByParent: (parentId) => ipcRenderer.invoke('form:getGroupsByParent', parentId),
    updateGroup: (id, updates) => ipcRenderer.invoke('form:updateGroup', id, updates),
    deleteGroup: (id) => ipcRenderer.invoke('form:deleteGroup', id),
    // 表单操作
    createForm: (name, groupId, data) => ipcRenderer.invoke('form:createForm', name, groupId, data),
    getAllForms: () => ipcRenderer.invoke('form:getAllForms'),
    getFormsByGroup: (groupId) => ipcRenderer.invoke('form:getFormsByGroup', groupId),
    getFormById: (id) => ipcRenderer.invoke('form:getFormById', id),
    queryRows: (params) => ipcRenderer.invoke('form:queryRows', params),
    updateForm: (id, updates) => ipcRenderer.invoke('form:updateForm', id, updates),
    deleteForm: (id) => ipcRenderer.invoke('form:deleteForm', id),
  },
  
  // Embedding 服务 API（本地）
  embedding: {
    generate: (text) => ipcRenderer.invoke('embedding:generate', text),
    generateBatch: (texts) => ipcRenderer.invoke('embedding:generate-batch', texts)
  },

  // 云端 Embedding API
  cloudEmbedding: {
    getProviders: () => ipcRenderer.invoke('cloud-embedding:get-providers'),
    getModels: () => ipcRenderer.invoke('cloud-embedding:get-models'),
    setApiKey: (providerId, apiKey) => ipcRenderer.invoke('cloud-embedding:set-api-key', providerId, apiKey),
    getApiKey: (providerId) => ipcRenderer.invoke('cloud-embedding:get-api-key', providerId),
    getProviderEndpoint: (providerId) => ipcRenderer.invoke('cloud-embedding:get-provider-endpoint', providerId),
    setProviderEndpoint: (providerId, endpoint) => ipcRenderer.invoke('cloud-embedding:set-provider-endpoint', providerId, endpoint),
    setModel: (modelId, providerId) => ipcRenderer.invoke('cloud-embedding:set-model', modelId, providerId),
    getCurrentModel: () => ipcRenderer.invoke('cloud-embedding:get-current-model'),
    generate: (text) => ipcRenderer.invoke('cloud-embedding:generate', text),
    generateBatch: (texts) => ipcRenderer.invoke('cloud-embedding:generate-batch', texts),
    testConnection: (providerId, apiKey, modelId) => ipcRenderer.invoke('cloud-embedding:test-connection', providerId, apiKey, modelId),
    hasValidApiKey: () => ipcRenderer.invoke('cloud-embedding:has-valid-api-key'),
    setCustomConfig: (config) => ipcRenderer.invoke('cloud-embedding:set-custom-config', config),
    getCustomConfig: () => ipcRenderer.invoke('cloud-embedding:get-custom-config')
  },

  // 数据库连接器 API
  dbConnector: {
    getSupportedTypes: () => ipcRenderer.invoke('db-connector:get-supported-types'),
    selectDatabaseFile: () => ipcRenderer.invoke('db-connector:select-database-file'),
    checkFileExists: (filePath) => ipcRenderer.invoke('db-connector:check-file-exists', filePath),
    testConnection: (config) => ipcRenderer.invoke('db-connector:test-connection', config),
    createConnection: (id, config, autoConnect) => ipcRenderer.invoke('db-connector:create-connection', id, config, autoConnect),
    getConnectionStatus: (id) => ipcRenderer.invoke('db-connector:get-connection-status', id),
    getAllConnections: () => ipcRenderer.invoke('db-connector:get-all-connections'),
    removeConnection: (id) => ipcRenderer.invoke('db-connector:remove-connection', id),
    reconnect: (id) => ipcRenderer.invoke('db-connector:reconnect', id),
    getTables: (id) => ipcRenderer.invoke('db-connector:get-tables', id),
    getColumns: (id, tableName) => ipcRenderer.invoke('db-connector:get-columns', id, tableName),
    query: (id, sql, params) => ipcRenderer.invoke('db-connector:query', id, sql, params),
    execute: (id, sql, params) => ipcRenderer.invoke('db-connector:execute', id, sql, params)
  },

  createNewWindow: () => ipcRenderer.invoke('window:create-new-instance'),
  openNoteInNewWindow: (payload) => ipcRenderer.invoke('window:open-note-in-new-window', payload),
  onOpenNoteInNewWindow: (callback) => {
    const subscription = (_event, payload) => callback(payload);
    ipcRenderer.on('window:open-note-in-new-window', subscription);
    return () => ipcRenderer.removeListener('window:open-note-in-new-window', subscription);
  },
  notifyEditorReady: () => ipcRenderer.send('window:editor-ready'),
});

// 保持向后兼容
contextBridge.exposeInMainWorld('electronAPI', {
  // AI 相关 API
  ai: {
    fetch: (url, options) => ipcRenderer.invoke('ai:fetch', url, options)
  },

  // 事件监听 API
  on: (channel, callback) => {
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // 设置相关 API
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value, target) => ipcRenderer.invoke('settings:update', key, value, target),
    update: (key, value, target) => ipcRenderer.invoke('settings:update', key, value, target),
    updateMany: (updates, target) => ipcRenderer.invoke('settings:update-many', updates, target),
    reset: (key) => ipcRenderer.invoke('settings:reset', key),
    getPath: (target) => ipcRenderer.invoke('settings:get-path', target),
    openJson: (target) => ipcRenderer.invoke('settings:open-json', target),
    import: (settingsJson, target) => ipcRenderer.invoke('settings:import', settingsJson, target),
    export: () => ipcRenderer.invoke('settings:export'),
    getDefaults: () => ipcRenderer.invoke('settings:get-defaults')
  },

  // 文件系统 API
  fs: {
    readFile: (filePath, encoding) => ipcRenderer.invoke('fs:read-file', filePath, encoding),
    writeFile: (filePath, content, encoding) => ipcRenderer.invoke('fs:write-file', filePath, content, encoding),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath)
  },

  // 内置 AI 服务 API
  builtinAI: {
    getModels: () => ipcRenderer.invoke('builtin-ai:get-models'),
    refreshModels: () => ipcRenderer.invoke('builtin-ai:refresh-models'),
    updateUserModels: (models) => ipcRenderer.invoke('builtin-ai:update-user-models', models),
    updateUserModelConfigs: (configs) => ipcRenderer.invoke('builtin-ai:update-user-model-configs', configs)
  },

  // 聊天历史 API
  chatHistory: {
    init: () => ipcRenderer.invoke('chat-history:init'),
    createSession: (session) => ipcRenderer.invoke('chat-history:create-session', session),
    updateSession: (id, title) => ipcRenderer.invoke('chat-history:update-session', id, title),
    deleteSession: (id) => ipcRenderer.invoke('chat-history:delete-session', id),
    getSessions: () => ipcRenderer.invoke('chat-history:get-sessions'),
    addMessage: (message) => ipcRenderer.invoke('chat-history:add-message', message),
    getMessages: (sessionId) => ipcRenderer.invoke('chat-history:get-messages', sessionId),
    clearAll: () => ipcRenderer.invoke('chat-history:clear-all')
  },

  version: process.versions.electron,

  // 窗口控制 API
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('close-window'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  // 窗口状态监听
  onWindowFocus: (callback) => {
    const listener = () => callback(true);
    return subscribeIpcChannel('window-focus', listener);
  },
  onWindowBlur: (callback) => {
    const listener = () => callback(false);
    return subscribeIpcChannel('window-blur', listener);
  },
  onWindowMaximizedStateChanged: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    return subscribeIpcChannel('window-maximized-state-changed', listener);
  },

  // 打开视频文件对话框
  openVideoFile: async () => {
    const result = await ipcRenderer.invoke('video:open');
    if (result.success && result.data) {
      return { canceled: false, filePath: result.data.path };
    }
    return { canceled: true };
  }
});
