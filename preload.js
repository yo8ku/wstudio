/**
 * Electron Preload 脚本
 * 在渲染进程中安全地暴露 Electron API
 */

const { contextBridge, ipcRenderer } = require('electron');

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
    saveAs: (content) => ipcRenderer.invoke('file:save-as', content)
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
    getRecentFiles: () => ipcRenderer.invoke('workspace:get-recent-files'),
    getLastOpened: () => ipcRenderer.invoke('workspace:get-last-opened'),
    addRecentFile: (filePath) => ipcRenderer.invoke('workspace:add-recent-file', filePath),
    clearRecentFiles: () => ipcRenderer.invoke('workspace:clear-recent-files')
  },
  
  // 知识库 API
  knowledgeBase: {
    openFolder: () => ipcRenderer.invoke('knowledge-base:open-folder')
  },
  
  // 设置相关 API
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    getPlugin: (key) => ipcRenderer.invoke('settings:get-plugin', key),
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
    chat: (model, messages) => ipcRenderer.invoke('builtin-ai:chat', { model, messages })
  },
  
  // 片段数据库 API
  snippet: {
    initialize: () => ipcRenderer.invoke('snippet:initialize'),
    add: (snippet) => ipcRenderer.invoke('snippet:add', snippet),
    update: (id, snippet) => ipcRenderer.invoke('snippet:update', id, snippet),
    delete: (id) => ipcRenderer.invoke('snippet:delete', id),
    get: (id) => ipcRenderer.invoke('snippet:get', id),
    query: (query) => ipcRenderer.invoke('snippet:query', query),
    getAll: (limit) => ipcRenderer.invoke('snippet:getAll', limit),
    import: (snippets) => ipcRenderer.invoke('snippet:import', snippets),
    clearAll: () => ipcRenderer.invoke('snippet:clearAll')
  },
  
  // 终端 API
  terminal: {
    create: (cols, rows, cwd) => ipcRenderer.invoke('terminal:create', { cols, rows, cwd }),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
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
    setModel: (modelId) => ipcRenderer.invoke('cloud-embedding:set-model', modelId),
    getCurrentModel: () => ipcRenderer.invoke('cloud-embedding:get-current-model'),
    generate: (text) => ipcRenderer.invoke('cloud-embedding:generate', text),
    generateBatch: (texts) => ipcRenderer.invoke('cloud-embedding:generate-batch', texts),
    testConnection: (providerId, apiKey, modelId) => ipcRenderer.invoke('cloud-embedding:test-connection', providerId, apiKey, modelId),
    hasValidApiKey: () => ipcRenderer.invoke('cloud-embedding:has-valid-api-key'),
    setCustomConfig: (config) => ipcRenderer.invoke('cloud-embedding:set-custom-config', config),
    getCustomConfig: () => ipcRenderer.invoke('cloud-embedding:get-custom-config')
  }
});

// 保持向后兼容
contextBridge.exposeInMainWorld('electronAPI', {
  // 扩展相关 API
  extension: {
    list: () => ipcRenderer.invoke('extension:list'),
    toggle: (extensionId, enabled) => ipcRenderer.invoke('extension:toggle', extensionId, enabled),
    executeCommand: (command, ...args) => 
      ipcRenderer.invoke('extension:execute-command', command, ...args),
    sendMessage: (extensionId, message) => 
      ipcRenderer.invoke('extension:send-message', extensionId, message),
    
    // 监听扩展事件
    onExtensionActivated: (callback) => {
      ipcRenderer.on('extension:activated', (event, data) => callback(data));
    },
    onExtensionDeactivated: (callback) => {
      ipcRenderer.on('extension:deactivated', (event, data) => callback(data));
    },
    onMessage: (callback) => {
      ipcRenderer.on('extension:message', (event, data) => callback(data));
    },
    onExtensionInstalled: (callback) => {
      ipcRenderer.on('extension:installed', (event, data) => callback(data));
    }
  },
  
  // 市场相关 API
  marketplace: {
    search: (query, pageSize) => ipcRenderer.invoke('marketplace:search', query, pageSize),
    install: (extensionId, version) => ipcRenderer.invoke('marketplace:install', extensionId, version),
    getDetails: (extensionId) => ipcRenderer.invoke('marketplace:get-details', extensionId)
  },
  
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
  
  // 设置相关 API
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    getPlugin: (key) => ipcRenderer.invoke('settings:get-plugin', key),
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
  
  // AI API 请求代理
  ai: {
    fetch: (url, options) => ipcRenderer.invoke('ai:fetch', url, options)
  },
  
  // 内置AI服务 API（独立于用户AI配置）
  builtinAI: {
    getModels: () => ipcRenderer.invoke('builtin-ai:get-models'),
    refreshModels: () => ipcRenderer.invoke('builtin-ai:refresh-models'),
    updateUserModels: (models) => ipcRenderer.invoke('builtin-ai:update-user-models', models)
  },
  
  // 聊天历史 API（SQLite）
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
  
  // 常用片段配置 API
  readSnippetsConfig: () => ipcRenderer.invoke('snippets:read-config'),
  saveSnippetsConfig: (content) => ipcRenderer.invoke('snippets:save-config', content),
  
  // 系统信息
  platform: process.platform,
  version: process.versions.electron,
  
  // 窗口控制 API
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // 窗口焦点状态监听
  onWindowFocus: (callback) => {
    ipcRenderer.on('window-focus', () => callback(true));
  },
  onWindowBlur: (callback) => {
    ipcRenderer.on('window-blur', () => callback(false));
  }
});
