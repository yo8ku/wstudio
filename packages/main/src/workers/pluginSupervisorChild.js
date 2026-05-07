/**
 * Shared plugin supervisor utility-process worker.
 * This is the phase-2 foundation worker that owns plugin descriptor state and
 * responds to health and synchronization requests before plugin lifecycle
 * execution migrates out of the Electron main process.
 */

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getRegisteredIconSvgContent } = require('@note-studio/plugin/internal/icons');

const descriptorRegistry = new Map();
const startedAt = Date.now();
const loadedPluginRuntimes = new Map();
const loadedViewInstances = new Map();
const pendingManualViewInstances = new Map();
const pluginRuntimeStates = new Map();
const pluginRuntimeDescriptorKeys = new Map();
const pendingHostRequests = new Map();
const hostSyncedCommands = new Map();
const supervisorOwnedCommands = new Map();
const supervisorOwnedSettingTabs = new Map();
const supervisorOwnedViews = new Map();
const supervisorOwnedResourceExplorerItems = new Map();
const resourceExplorerItemUnsupportedStyleFields = Object.freeze([
  'style',
  'styles',
  'class',
  'className',
  'css',
  'cssText',
]);
const supervisorOwnedExtensions = new Map();
const supervisorOwnedProtocols = new Map();
const supervisorOwnedUiEntries = new Map();
const supervisorOwnedUiEntryHandlers = new Map();
let nextPendingManualViewInstanceId = 0;
const HOST_PLUGIN_SDK_ALIASES = new Set([
  '@note-studio/plugin',
  'wstudio-api',
]);
const PLUGIN_UI_ENTRY_LOCATIONS = new Set([
  'activityBar',
  'titleBar',
  'statusBar',
  'editorTabBar',
  'canvasToolbar',
  'canvasTitleBar',
  'canvasContextMenu',
]);
const COMPONENT_INTERNAL_LOAD = Symbol.for('wstudio.component.internal.load');
const COMPONENT_INTERNAL_UNLOAD = Symbol.for('wstudio.component.internal.unload');
const PLUGIN_INTERNAL_LOAD = Symbol.for('wstudio.plugin.internal.load');
const PLUGIN_INTERNAL_ENABLE = Symbol.for('wstudio.plugin.internal.enable');
const PLUGIN_INTERNAL_UNLOAD = Symbol.for('wstudio.plugin.internal.unload');
const PLUGIN_INTERNAL_FAIL = Symbol.for('wstudio.plugin.internal.fail');
const SUPERVISOR_PLUGIN_PRIME_YIELD_MS = 120;
let nextHostRequestId = 0;
let hostIsDarkMode = null;
let pluginSdkAliasInstalled = false;
let localStorageCache = new Map();
let supervisorWorkspaceDir = '';

class SyntheticEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const existingListeners = this.listeners.get(type) ?? [];
    existingListeners.push(listener);
    this.listeners.set(type, existingListeners);
  }

  removeEventListener(type, listener) {
    const existingListeners = this.listeners.get(type);

    if (existingListeners === undefined) {
      return;
    }

    this.listeners.set(type, existingListeners.filter((candidate) => candidate !== listener));
  }

  dispatchEvent(event) {
    if (event === null || typeof event !== 'object') {
      return true;
    }

    const eventType = typeof event.type === 'string' ? event.type : '';
    const listeners = this.listeners.get(eventType) ?? [];

    for (const listener of listeners) {
      listener.call(this, event);
    }

    return true;
  }
}

class SyntheticNode extends SyntheticEventTarget {
  constructor(nodeType, ownerDocument = null) {
    super();
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.childNodes = [];
    this.parentElement = null;
    this.textContent = null;
  }

  appendChild(node) {
    const normalizedNode = normalizeSyntheticNode(node, this.ownerDocument);

    normalizedNode.parentElement = this.nodeType === 1 ? this : this.parentElement;
    this.childNodes.push(normalizedNode);
    return normalizedNode;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  replaceChildren(...nodes) {
    this.childNodes = [];

    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  remove() {
    if (this.parentElement === null) {
      return;
    }

    this.parentElement.childNodes = this.parentElement.childNodes.filter((candidate) => candidate !== this);
    this.parentElement = null;
  }
}

class SyntheticText extends SyntheticNode {
  constructor(text = '', ownerDocument = null) {
    super(3, ownerDocument);
    this.data = text;
    this.textContent = text;
  }
}

class SyntheticDocumentFragment extends SyntheticNode {
  constructor(ownerDocument = null) {
    super(11, ownerDocument);
  }
}

class SyntheticElement extends SyntheticNode {
  constructor(tagName = 'div', ownerDocument = null) {
    super(1, ownerDocument);
    this.tagName = String(tagName).toUpperCase();
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.tabIndex = -1;
    this.title = '';
    this.value = '';
    this.checked = false;
  }

  setAttribute(name, value) {
    const normalizedName = String(name);
    const normalizedValue = String(value);

    this.attributes.set(normalizedName, normalizedValue);

    if (normalizedName === 'class') {
      this.className = normalizedValue;
    }
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  querySelector() {
    return null;
  }

  focus() {
    return undefined;
  }

  blur() {
    return undefined;
  }
}

class SyntheticDocument extends SyntheticEventTarget {
  constructor() {
    super();
    this.body = new SyntheticElement('body', this);
    this.documentElement = new SyntheticElement('html', this);
    this.documentElement.append(this.body);
  }

  createElement(tagName) {
    return new SyntheticElement(tagName, this);
  }

  createElementNS(_namespace, tagName) {
    return new SyntheticElement(tagName, this);
  }

  createDocumentFragment() {
    return new SyntheticDocumentFragment(this);
  }

  createTextNode(text) {
    return new SyntheticText(String(text), this);
  }

  querySelector() {
    return null;
  }
}

class SyntheticWindow extends SyntheticEventTarget {
  constructor(documentRef) {
    super();
    this.document = documentRef;
  }
}

function normalizeSyntheticNode(node, ownerDocument) {
  if (node instanceof SyntheticNode) {
    return node;
  }

  if (typeof node === 'string') {
    return new SyntheticText(node, ownerDocument);
  }

  return new SyntheticText('', ownerDocument);
}

function installHeadlessDomGlobals() {
  if (typeof globalThis.document !== 'undefined' && typeof globalThis.window !== 'undefined') {
    return;
  }

  const documentRef = new SyntheticDocument();
  const windowRef = new SyntheticWindow(documentRef);

  if (typeof globalThis.Node === 'undefined') {
    globalThis.Node = SyntheticNode;
  }

  if (typeof globalThis.Text === 'undefined') {
    globalThis.Text = SyntheticText;
  }

  if (typeof globalThis.HTMLElement === 'undefined') {
    globalThis.HTMLElement = SyntheticElement;
  }

  if (typeof globalThis.DocumentFragment === 'undefined') {
    globalThis.DocumentFragment = SyntheticDocumentFragment;
  }

  if (typeof globalThis.document === 'undefined') {
    globalThis.document = documentRef;
  }

  if (typeof globalThis.window === 'undefined') {
    globalThis.window = windowRef;
  }
}

function sendMessage(message) {
  if (typeof process.parentPort === 'undefined') {
    throw new Error('Plugin supervisor worker requires Electron utilityProcess parentPort.');
  }

  process.parentPort.postMessage(message);
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNoticeLevel(value) {
  return value === 'success'
    || value === 'error'
    || value === 'warning'
    || value === 'info'
    ? value
    : 'info';
}

function cloneJsonValue(value) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }

  const result = {};

  for (const [key, entry] of Object.entries(value)) {
    result[key] = cloneJsonValue(entry);
  }

  return result;
}

function normalizeVaultPath(targetPath) {
  const normalized = normalizeString(targetPath).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');

  if (normalized === '.' || normalized === '') {
    return '';
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function resolveWorkspacePath(baseDir, targetPath) {
  const normalized = normalizeVaultPath(targetPath);
  return normalized.length === 0 ? baseDir : path.join(baseDir, normalized);
}

function getParentVaultPath(targetPath) {
  const normalized = normalizeVaultPath(targetPath);
  const parentPath = path.posix.dirname(normalized);
  return parentPath === '.' ? '' : parentPath;
}

function getFileNameFromVaultPath(targetPath) {
  return path.posix.basename(normalizeVaultPath(targetPath));
}

function getVaultFileParts(targetPath) {
  const fileName = getFileNameFromVaultPath(targetPath);
  const extensionWithDot = path.posix.extname(fileName);

  if (extensionWithDot.length === 0) {
    return {
      basename: fileName,
      extension: '',
    };
  }

  return {
    basename: fileName.slice(0, -extensionWithDot.length),
    extension: extensionWithDot.slice(1).toLowerCase(),
  };
}

function createFileStats(stats) {
  return {
    ctime: stats.ctimeMs,
    mtime: stats.mtimeMs,
    size: stats.size,
  };
}

function emitNonFatalError(message) {
  sendMessage({
    type: 'error',
    data: {
      message: normalizeString(message, 'Plugin supervisor worker failed.'),
      fatal: false,
    },
  });
}

function createDisposable(callback) {
  let disposed = false;

  return {
    dispose() {
      if (disposed) {
        return undefined;
      }

      disposed = true;
      return callback();
    },
  };
}

function createNoopDisposable() {
  return createDisposable(() => undefined);
}

function createManagedSyntheticElement(tagName) {
  const element = document.createElement(tagName);
  element.dispose = () => {
    element.remove();
  };
  return element;
}

function createUnsupportedCapabilityProxy(label) {
  const errorMessage = `Plugin supervisor runtime does not support ${label}.`;
  const unsupported = () => {
    throw new Error(errorMessage);
  };

  return new Proxy(unsupported, {
    get(_target, property) {
      if (property === 'then') {
        return undefined;
      }

      if (property === Symbol.toPrimitive) {
        return () => errorMessage;
      }

      if (property === 'toString') {
        return () => errorMessage;
      }

      return createUnsupportedCapabilityProxy(`${label}.${String(property)}`);
    },
    apply() {
      throw new Error(errorMessage);
    },
    construct() {
      throw new Error(errorMessage);
    },
  });
}

function buildSupervisorFolderTree(pluginSdk, vault, workspaceDir, normalizedPath, parent) {
  const fullPath = resolveWorkspacePath(workspaceDir, normalizedPath);

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return null;
  }

  const children = [];
  const folder = new pluginSdk.TFolder(
    vault,
    normalizedPath,
    normalizedPath.length === 0 ? vault.getName() : getFileNameFromVaultPath(normalizedPath),
    children,
    parent,
  );

  for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
    const childPath = normalizedPath.length === 0
      ? normalizeVaultPath(entry.name)
      : normalizeVaultPath(`${normalizedPath}/${entry.name}`);

    if (entry.isDirectory()) {
      const childFolder = buildSupervisorFolderTree(pluginSdk, vault, workspaceDir, childPath, folder);

      if (childFolder !== null) {
        children.push(childFolder);
      }

      continue;
    }

    const childStats = fs.statSync(resolveWorkspacePath(workspaceDir, childPath));
    const parts = getVaultFileParts(childPath);
    children.push(new pluginSdk.TFile(
      vault,
      childPath,
      entry.name,
      createFileStats(childStats),
      parts.basename,
      parts.extension,
      folder,
    ));
  }

  return folder;
}

function createSupervisorVault(pluginSdk) {
  class SupervisorVault extends pluginSdk.Vault {
    constructor(workspaceDir) {
      super();
      this.workspaceDir = workspaceDir;
      this.adapter = {
        getName() {
          return 'filesystem';
        },
        getResourcePath(normalizedPath) {
          return pathToFileURL(resolveWorkspacePath(workspaceDir, normalizedPath)).toString();
        },
      };
      this.configDir = '.wstudio';
    }

    getName() {
      return path.basename(this.workspaceDir);
    }

    resolveAbsolutePath(pathValue) {
      return resolveWorkspacePath(this.workspaceDir, normalizeVaultPath(pathValue));
    }

    createFolderReference(pathValue) {
      const normalized = normalizeVaultPath(pathValue);
      const fullPath = resolveWorkspacePath(this.workspaceDir, normalized);

      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
        return null;
      }

      if (normalized.length === 0) {
        return new pluginSdk.TFolder(this, '', this.getName(), [], null);
      }

      const parentPath = getParentVaultPath(normalized);
      const parent = this.createFolderReference(parentPath);
      return new pluginSdk.TFolder(
        this,
        normalized,
        getFileNameFromVaultPath(normalized),
        [],
        parent,
      );
    }

    getFileByPath(pathValue) {
      const normalized = normalizeVaultPath(pathValue);
      const fullPath = resolveWorkspacePath(this.workspaceDir, normalized);

      if (!fs.existsSync(fullPath)) {
        return null;
      }

      const stats = fs.statSync(fullPath);

      if (!stats.isFile()) {
        return null;
      }

      const parent = this.createFolderReference(getParentVaultPath(normalized));
      const parts = getVaultFileParts(normalized);
      return new pluginSdk.TFile(
        this,
        normalized,
        getFileNameFromVaultPath(normalized),
        createFileStats(stats),
        parts.basename,
        parts.extension,
        parent,
      );
    }

    getFolderByPath(pathValue) {
      const normalized = normalizeVaultPath(pathValue);
      const parent = normalized.length === 0 ? null : this.createFolderReference(getParentVaultPath(normalized));
      return buildSupervisorFolderTree(pluginSdk, this, this.workspaceDir, normalized, parent);
    }

    getAbstractFileByPath(pathValue) {
      return this.getFileByPath(pathValue) ?? this.getFolderByPath(pathValue);
    }

    getRoot() {
      return this.getFolderByPath('') ?? new pluginSdk.TFolder(this, '', this.getName(), [], null);
    }

    async create(pathValue, data, options) {
      void options;
      const absolutePath = this.resolveAbsolutePath(pathValue);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, normalizeString(data), 'utf8');
      const file = this.getFileByPath(pathValue);

      if (file === null) {
        throw new Error(`Failed to create file "${pathValue}".`);
      }

      this.trigger('create', file);
      return file;
    }

    async createBinary(pathValue, data, options) {
      void options;
      const absolutePath = this.resolveAbsolutePath(pathValue);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const buffer = Buffer.from(data);
      fs.writeFileSync(absolutePath, buffer);
      const file = this.getFileByPath(pathValue);

      if (file === null) {
        throw new Error(`Failed to create binary file "${pathValue}".`);
      }

      this.trigger('create', file);
      return file;
    }

    async createFolder(pathValue) {
      fs.mkdirSync(this.resolveAbsolutePath(pathValue), { recursive: true });
      const folder = this.getFolderByPath(pathValue);

      if (folder === null) {
        throw new Error(`Failed to create folder "${pathValue}".`);
      }

      this.trigger('create', folder);
      return folder;
    }

    async read(file) {
      return fs.readFileSync(this.resolveAbsolutePath(file.path), 'utf8');
    }

    async cachedRead(file) {
      return this.read(file);
    }

    async readBinary(file) {
      const buffer = fs.readFileSync(this.resolveAbsolutePath(file.path));
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }

    getResourcePath(file) {
      return pathToFileURL(this.resolveAbsolutePath(file.path)).toString();
    }

    async delete(file, force) {
      const absolutePath = this.resolveAbsolutePath(file.path);

      if (file instanceof pluginSdk.TFolder) {
        fs.rmSync(absolutePath, {
          recursive: force === true,
          force: true,
        });
      } else {
        fs.rmSync(absolutePath, {
          force: true,
        });
      }

      this.trigger('delete', file);
    }

    async trash(file, system) {
      void system;
      await this.delete(file, true);
    }

    async rename(file, newPath) {
      const oldPath = file.path;
      fs.mkdirSync(path.dirname(this.resolveAbsolutePath(newPath)), { recursive: true });
      fs.renameSync(this.resolveAbsolutePath(file.path), this.resolveAbsolutePath(newPath));
      this.trigger('rename', this.getAbstractFileByPath(newPath) ?? file, oldPath);
    }

    async modify(file, data, options) {
      void options;
      fs.writeFileSync(this.resolveAbsolutePath(file.path), normalizeString(data), 'utf8');
      this.trigger('modify', this.getFileByPath(file.path) ?? file);
    }

    async modifyBinary(file, data, options) {
      void options;
      fs.writeFileSync(this.resolveAbsolutePath(file.path), Buffer.from(data));
      this.trigger('modify', this.getFileByPath(file.path) ?? file);
    }

    async append(file, data, options) {
      void options;
      fs.appendFileSync(this.resolveAbsolutePath(file.path), normalizeString(data), 'utf8');
      this.trigger('modify', this.getFileByPath(file.path) ?? file);
    }

    async process(file, mutator, options) {
      void options;
      const current = await this.read(file);
      const next = mutator(current);
      await this.modify(file, next);
      return next;
    }

    async copy(file, newPath) {
      fs.mkdirSync(path.dirname(this.resolveAbsolutePath(newPath)), { recursive: true });
      fs.cpSync(this.resolveAbsolutePath(file.path), this.resolveAbsolutePath(newPath), {
        recursive: file instanceof pluginSdk.TFolder,
      });
      const copied = this.getAbstractFileByPath(newPath);

      if (copied === null) {
        throw new Error(`Failed to copy "${file.path}" to "${newPath}".`);
      }

      this.trigger('create', copied);
      return copied;
    }

    getAllLoadedFiles() {
      const files = [];
      const visit = (folder) => {
        for (const child of folder.children) {
          files.push(child);

          if (child instanceof pluginSdk.TFolder) {
            visit(child);
          }
        }
      };
      const root = this.getRoot();
      visit(root);
      return files;
    }

    getAllFolders(includeRoot = false) {
      const folders = [];
      const visit = (folder) => {
        if (includeRoot || folder.parent !== null) {
          folders.push(folder);
        }

        for (const child of folder.children) {
          if (child instanceof pluginSdk.TFolder) {
            visit(child);
          }
        }
      };
      visit(this.getRoot());
      return folders;
    }

    getMarkdownFiles() {
      return this.getFiles().filter((file) => file.extension === 'md' || file.extension === 'markdown');
    }

    getFiles() {
      return this.getAllLoadedFiles().filter((entry) => entry instanceof pluginSdk.TFile);
    }
  }

  return new SupervisorVault(supervisorWorkspaceDir);
}

function resolveSupervisorWorkspaceLeafMode(newLeaf) {
  if (newLeaf === true) {
    return 'force-new';
  }

  if (newLeaf === 'tab' || newLeaf === 'split' || newLeaf === 'window') {
    return newLeaf;
  }

  return 'default';
}

function createSupervisorWorkspace(pluginSdk) {
  const createLeafViewPlaceholder = () => {
    return createUnsupportedCapabilityProxy('app.workspace.leaf.view');
  };

  class SupervisorWorkspaceLeaf extends pluginSdk.WorkspaceLeaf {
    constructor(app, mode, workspace) {
      super();
      this.app = app;
      this.workspace = workspace;
      this.id = '';
      this.mode = mode;
      this.parent = createUnsupportedCapabilityProxy('app.workspace.leaf.parent');
      this.hoverPopover = null;
      this.isDeferred = false;
      this.view = createLeafViewPlaceholder();
      this.viewState = {
        type: 'empty',
      };
      this.ephemeralState = null;
      this.displayText = '';
      this.icon = '';
    }

    applySnapshot(snapshot, activeLeafId) {
      this.id = normalizeString(snapshot?.id).trim();
      this.viewState = {
        type: normalizeString(snapshot?.viewType, 'empty').trim() || 'empty',
        active: this.id.length > 0 && this.id === activeLeafId ? true : undefined,
        pinned: snapshot?.pinned === true ? true : undefined,
        state: snapshot?.state !== null && typeof snapshot?.state === 'object' && !Array.isArray(snapshot.state)
          ? snapshot.state
          : undefined,
      };
      this.ephemeralState = snapshot?.ephemeralState ?? null;
      this.displayText = normalizeString(snapshot?.displayText);
      this.icon = normalizeString(snapshot?.icon);
    }

    applyViewInstanceSnapshot(snapshot) {
      const normalizedViewType = normalizeString(snapshot?.viewType, this.viewState.type).trim() || 'empty';
      this.viewState = {
        ...this.viewState,
        type: normalizedViewType,
        state: snapshot?.state !== null && typeof snapshot?.state === 'object' && !Array.isArray(snapshot.state)
          ? snapshot.state
          : {},
      };
      this.displayText = normalizeString(snapshot?.displayText, this.displayText);
      this.icon = normalizeString(snapshot?.icon, this.icon);
    }

    setRuntimeViewInstance(view, snapshot) {
      this.view = view;
      this.applyViewInstanceSnapshot(snapshot);
    }

    clearRuntimeViewInstance() {
      this.view = createLeafViewPlaceholder();
    }

    async openFile(file, openState) {
      const filePath = normalizeString(file?.path).trim();

      if (filePath.length === 0) {
        throw new Error('Plugin supervisor workspace leaf requires a file path.');
      }

      const response = await requestHost({
        kind: 'workspace:leaf-open-file',
        newLeafMode: this.mode,
        filePath,
        active: openState?.active !== false,
      });

      if (response.kind !== 'workspace:leaf-open-file') {
        throw new Error('Plugin supervisor workspace leaf received an unexpected open-file response.');
      }

      if (typeof response.leafId === 'string' && response.leafId.trim().length > 0) {
        this.workspace.registerLeafReference(this, response.leafId);
      }

      this.workspace.applySnapshot(response.snapshot);
    }

    async open(view) {
      const viewType = normalizeString(view?.getViewType?.()).trim();
      const runtime = this.app?.__pluginRuntime ?? null;
      const registeredViewCreator = runtime?.views?.getRegisteredViewCreator?.(viewType) ?? null;

      if (viewType.length === 0) {
        throw new Error('Plugin supervisor workspace leaf requires a custom view type.');
      }

      if (typeof registeredViewCreator !== 'function') {
        throw new Error(`Plugin supervisor workspace leaf cannot open unregistered view "${viewType}".`);
      }

      const pendingViewInstanceId = createPendingManualViewInstanceId();
      pendingManualViewInstances.set(pendingViewInstanceId, {
        leaf: this,
        view,
        viewType,
      });

      try {
        const response = await requestHost({
          kind: 'workspace:leaf-set-view-state',
          leafId: this.id.trim().length > 0 ? this.id : null,
          newLeafMode: this.mode,
          viewType,
          active: this.viewState.active === true,
          pinned: this.viewState.pinned === true,
          state: view?.getState?.() ?? null,
          ephemeralState: this.ephemeralState,
          pendingViewInstanceId,
        });

        if (response.kind !== 'workspace:leaf-set-view-state') {
          throw new Error('Plugin supervisor workspace leaf received an unexpected set-view-state response.');
        }

        if (typeof response.leafId === 'string' && response.leafId.trim().length > 0) {
          this.workspace.registerLeafReference(this, response.leafId);
        }

        this.workspace.applySnapshot(response.snapshot);
        return this.view;
      } finally {
        pendingManualViewInstances.delete(pendingViewInstanceId);
      }
    }

    getViewState() {
      return this.viewState;
    }

    async setViewState(viewState, ephemeralState) {
      const response = await requestHost({
        kind: 'workspace:leaf-set-view-state',
        leafId: this.id.trim().length > 0 ? this.id : null,
        newLeafMode: this.mode,
        viewType: normalizeString(viewState?.type, 'empty').trim() || 'empty',
        active: viewState?.active === true,
        pinned: viewState?.pinned === true,
        state: viewState?.state ?? null,
        ephemeralState: ephemeralState ?? null,
        pendingViewInstanceId: null,
      });

      if (response.kind !== 'workspace:leaf-set-view-state') {
        throw new Error('Plugin supervisor workspace leaf received an unexpected set-view-state response.');
      }

      if (typeof response.leafId === 'string' && response.leafId.trim().length > 0) {
        this.workspace.registerLeafReference(this, response.leafId);
      }

      this.workspace.applySnapshot(response.snapshot);
    }

    async loadIfDeferred() {
      return undefined;
    }

    getEphemeralState() {
      return this.ephemeralState;
    }

    setEphemeralState(state) {
      this.ephemeralState = state ?? null;
    }

    togglePinned() {
      return undefined;
    }

    setPinned(pinned) {
      void pinned;
    }

    setGroupMember(other) {
      void other;
    }

    setGroup(group) {
      void group;
    }

    detach() {
      return undefined;
    }

    getIcon() {
      return this.icon;
    }

    getDisplayText() {
      return this.displayText;
    }

    onResize() {
      return undefined;
    }
  }

  class SupervisorWorkspaceWindow extends pluginSdk.WorkspaceWindow {
    constructor(parent) {
      super();
      this.parent = parent;
      this.win = globalThis.window;
      this.doc = globalThis.document;
    }
  }

  class SupervisorWorkspace extends pluginSdk.Workspace {
    constructor(app) {
      super();
      this.app = app;
      this.leftSplit = createUnsupportedCapabilityProxy('app.workspace.leftSplit');
      this.rightSplit = createUnsupportedCapabilityProxy('app.workspace.rightSplit');
      this.leftRibbon = new pluginSdk.WorkspaceRibbon();
      this.rightRibbon = new pluginSdk.WorkspaceRibbon();
      this.rootSplit = createUnsupportedCapabilityProxy('app.workspace.rootSplit');
      this.activeLeaf = null;
      this.activeEditor = null;
      this.layoutReady = true;
      this.activeFilePath = null;
      this.lastOpenFiles = [];
      this.leafRegistry = new Map();
      this.pendingLeafReferences = new Map();
    }

    initializeSnapshot() {
      void this.refreshSnapshot().catch((error) => {
        emitNonFatalError(
          error instanceof Error
            ? error.message
            : 'Plugin supervisor failed to initialize workspace snapshot.',
        );
      });
    }

    registerLeafReference(leaf, leafId) {
      const normalizedLeafId = normalizeString(leafId).trim();

      if (normalizedLeafId.length === 0) {
        return;
      }

      leaf.id = normalizedLeafId;
      this.pendingLeafReferences.set(normalizedLeafId, leaf);
    }

    applySnapshot(snapshot) {
      const nextLeafRegistry = new Map();
      const activeLeafId = normalizeString(snapshot?.activeLeafId).trim();
      const rawLeaves = Array.isArray(snapshot?.leaves) ? snapshot.leaves : [];

      for (const leafSnapshot of rawLeaves) {
        const leafId = normalizeString(leafSnapshot?.id).trim();

        if (leafId.length === 0) {
          continue;
        }

        const existingLeaf = this.leafRegistry.get(leafId)
          ?? this.pendingLeafReferences.get(leafId)
          ?? new SupervisorWorkspaceLeaf(this.app, 'default', this);
        existingLeaf.applySnapshot(leafSnapshot, activeLeafId);
        nextLeafRegistry.set(leafId, existingLeaf);
        this.pendingLeafReferences.delete(leafId);
      }

      this.leafRegistry = nextLeafRegistry;
      this.activeLeaf = activeLeafId.length > 0
        ? this.leafRegistry.get(activeLeafId) ?? null
        : null;
      this.activeFilePath = normalizeString(snapshot?.activeFilePath).trim() || null;
      this.lastOpenFiles = Array.isArray(snapshot?.lastOpenFiles)
        ? snapshot.lastOpenFiles
          .map((filePath) => normalizeString(filePath).trim())
          .filter((filePath) => filePath.length > 0)
        : [];
      this.activeEditor = null;
    }

    async refreshSnapshot() {
      const response = await requestHost({
        kind: 'workspace:get-snapshot',
      });

      if (response.kind !== 'workspace:get-snapshot') {
        throw new Error('Plugin supervisor workspace received an unexpected snapshot response.');
      }

      this.applySnapshot(response.snapshot);
      return response.snapshot;
    }

    onLayoutReady(callback) {
      callback();
    }

    createLeafInParent(parent, index) {
      void parent;
      void index;
      return new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
    }

    createLeafBySplit(leaf, direction, before) {
      void leaf;
      void direction;
      void before;
      return new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
    }

    splitActiveLeaf(direction) {
      void direction;
      return new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
    }

    async duplicateLeaf(leaf, leafTypeOrDirection, direction) {
      void leafTypeOrDirection;
      void direction;
      const nextLeaf = new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
      await nextLeaf.setViewState(leaf.getViewState(), leaf.getEphemeralState());
      return nextLeaf;
    }

    getUnpinnedLeaf() {
      return [...this.leafRegistry.values()]
        .find((leaf) => leaf.getViewState().pinned !== true)
        ?? new SupervisorWorkspaceLeaf(
          this.app,
          'force-new',
          this,
        );
    }

    getMostRecentLeaf(root) {
      void root;
      return this.activeLeaf;
    }

    getLeftLeaf(split) {
      void split;
      return this.activeLeaf;
    }

    getRightLeaf(split) {
      void split;
      return this.activeLeaf;
    }

    getLeaf(newLeaf) {
      if (newLeaf === undefined || newLeaf === false) {
        return this.activeLeaf ?? new SupervisorWorkspaceLeaf(
          this.app,
          'default',
          this,
        );
      }

      return new SupervisorWorkspaceLeaf(
        this.app,
        resolveSupervisorWorkspaceLeafMode(newLeaf),
        this,
      );
    }

    openPopoutLeaf(data) {
      void data;
      return new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
    }

    moveLeafToPopout(leaf, data) {
      void leaf;
      void data;
      return new SupervisorWorkspaceWindow(this.rootSplit);
    }

    async openLinkText(linktext, sourcePath, newLeaf, openViewState) {
      const cleanLink = normalizeVaultPath(linktext.split('#')[0] ?? linktext);
      const sourceParent = getParentVaultPath(sourcePath);
      const candidateBase = sourceParent.length === 0
        ? cleanLink
        : normalizeVaultPath(path.posix.join(sourceParent, cleanLink));
      const candidates = [candidateBase, `${candidateBase}.md`, `${candidateBase}.markdown`];

      for (const candidate of candidates) {
        const file = this.app?.vault?.getFileByPath(candidate) ?? null;

        if (file !== null) {
          await this.getLeaf(newLeaf).openFile(file, openViewState);
          return;
        }
      }
    }

    setActiveLeaf(leaf, paramsOrPushHistory, focus) {
      void paramsOrPushHistory;
      void focus;
      this.activeLeaf = leaf ?? null;
      this.trigger('active-leaf-change', leaf);

      const leafId = normalizeString(leaf?.id).trim();

      if (leafId.length === 0) {
        return;
      }

      void this.revealLeaf(leaf).catch((error) => {
        emitNonFatalError(
          error instanceof Error
            ? error.message
            : `Plugin supervisor failed to reveal active leaf "${leafId}".`,
          );
        });
    }

    requestSaveLayout() {
      return undefined;
    }

    updateOptions() {
      return undefined;
    }

    handleLinkContextMenu(menu, linktext, sourcePath, leaf) {
      void menu;
      void linktext;
      void sourcePath;
      void leaf;
      return false;
    }

    async changeLayout(workspace) {
      void workspace;
    }

    async revealLeaf(leaf) {
      const leafId = normalizeString(leaf?.id).trim();

      if (leafId.length === 0) {
        return;
      }

      const response = await requestHost({
        kind: 'workspace:reveal-leaf',
        leafId,
      });

      if (response.kind !== 'workspace:reveal-leaf') {
        throw new Error('Plugin supervisor workspace received an unexpected reveal-leaf response.');
      }

      this.applySnapshot(response.snapshot);
    }

    getLeafById(id) {
      return this.leafRegistry.get(normalizeString(id).trim()) ?? null;
    }

    getGroupLeaves(group) {
      const normalizedGroup = normalizeString(group).trim();
      return [...this.leafRegistry.values()]
        .filter((leaf) => leaf.id === normalizedGroup);
    }

    async ensureSideLeaf(type, side, options) {
      void side;
      void options?.split;
      void options?.reveal;
      const leaf = new SupervisorWorkspaceLeaf(
        this.app,
        'force-new',
        this,
      );
      await leaf.setViewState({
        type,
        active: options?.active,
        state: options?.state,
      });
      return leaf;
    }

    getActiveFile() {
      if (this.activeFilePath === null || this.activeFilePath.length === 0) {
        return null;
      }

      return this.app?.vault?.getFileByPath(this.activeFilePath) ?? null;
    }

    iterateRootLeaves(callback) {
      for (const leaf of this.leafRegistry.values()) {
        callback(leaf);
      }
    }

    iterateAllLeaves(callback) {
      for (const leaf of this.leafRegistry.values()) {
        callback(leaf);
      }
    }

    getLeavesOfType(viewType) {
      const normalizedViewType = normalizeString(viewType).trim();
      return [...this.leafRegistry.values()]
        .filter((leaf) => leaf.getViewState().type === normalizedViewType);
    }

    async getTabs() {
      const response = await requestHost({
        kind: 'workspace:get-tabs',
      });

      if (response.kind !== 'workspace:get-tabs') {
        throw new Error('Plugin supervisor workspace received an unexpected get-tabs response.');
      }

      const activeLeafId = this.activeLeaf?.id ?? '';
      const tabs = [];

      for (const leafSnapshot of response.tabs) {
        const leafId = normalizeString(leafSnapshot?.id).trim();

        if (leafId.length === 0) {
          continue;
        }

        const leaf = this.leafRegistry.get(leafId)
          ?? this.pendingLeafReferences.get(leafId)
          ?? new SupervisorWorkspaceLeaf(this.app, 'default', this);
        leaf.applySnapshot(leafSnapshot, activeLeafId);
        tabs.push(leaf);
      }

      return tabs;
    }

    getActiveViewOfType(type) {
      const activeView = this.activeLeaf?.view ?? null;

      if (typeof type !== 'function' || activeView === null) {
        return null;
      }

      return activeView instanceof type ? activeView : null;
    }

    detachLeavesOfType(viewType) {
      const normalizedViewType = normalizeString(viewType).trim();

      if (normalizedViewType.length === 0) {
        return;
      }

      void requestHost({
        kind: 'workspace:detach-leaves-of-type',
        viewType: normalizedViewType,
      }).then((response) => {
        if (response.kind !== 'workspace:detach-leaves-of-type') {
          throw new Error('Plugin supervisor workspace received an unexpected detach-leaves response.');
        }

        this.applySnapshot(response.snapshot);
      }).catch((error) => {
        emitNonFatalError(
          error instanceof Error
            ? error.message
            : `Plugin supervisor failed to detach leaves of type "${normalizedViewType}".`,
        );
      });
    }

    getLastOpenFiles() {
      return [...this.lastOpenFiles];
    }
  }

  return new SupervisorWorkspace(null);
}

function loadPluginSdk() {
  return require('@note-studio/plugin');
}

function installPluginSdkAlias(pluginSdk) {
  if (pluginSdkAliasInstalled) {
    return;
  }

  const originalLoad = Module._load.bind(Module);

  Module._load = (request, parent, isMain) => {
    if (HOST_PLUGIN_SDK_ALIASES.has(request)) {
      return pluginSdk;
    }

    return originalLoad(request, parent, isMain);
  };

  pluginSdkAliasInstalled = true;
}

function clearPluginModuleCache(rootDirectory) {
  const normalizedRoot = normalizeString(rootDirectory).replace(/\\/g, '/').toLowerCase();

  if (normalizedRoot.length === 0) {
    return;
  }

  for (const cachedPath of Object.keys(require.cache)) {
    if (cachedPath.replace(/\\/g, '/').toLowerCase().startsWith(normalizedRoot)) {
      delete require.cache[cachedPath];
    }
  }
}

async function loadPluginModule(entryPath) {
  if (entryPath.endsWith('.mjs')) {
    return import(pathToFileURL(entryPath).toString());
  }

  const requireForEntry = Module.createRequire(entryPath);
  return requireForEntry(entryPath);
}

function loadPluginManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function resolvePluginMethod(instance, primaryKey, fallbackKey) {
  const candidate = instance[primaryKey] ?? instance[fallbackKey];
  return typeof candidate === 'function' ? candidate : null;
}

function resolveCommandSnapshot(commandRegistry, commandId) {
  return commandRegistry.get(commandId)
    ?? [...commandRegistry.values()].find((entry) => entry.commandId === commandId)
    ?? null;
}

function resolveRegisteredCommand(commandId) {
  return resolveCommandSnapshot(supervisorOwnedCommands, commandId)
    ?? resolveCommandSnapshot(hostSyncedCommands, commandId);
}

function resolveRegisteredProtocol(action) {
  return [...supervisorOwnedProtocols.values()]
    .filter((entry) => entry.action === action)
    .at(-1) ?? null;
}

function getPublishedCommands() {
  const result = [...hostSyncedCommands.values()]
    .filter((entry) => !supervisorOwnedCommands.has(`${entry.pluginId}:${entry.commandId}`));

  result.push(...supervisorOwnedCommands.values());
  return result;
}

function createCommandSnapshot(pluginId, command) {
  return {
    pluginId,
    commandId: normalizeString(command?.id),
    title: normalizeString(command?.name),
    category: typeof command?.category === 'string' ? command.category : null,
    icon: typeof command?.icon === 'string' ? command.icon : null,
  };
}

function resolvePluginUiEntryIconSvg(iconId) {
  const normalizedIconId = normalizeString(iconId).trim();

  if (normalizedIconId.length === 0) {
    return null;
  }

  const iconSvgContent = getRegisteredIconSvgContent(normalizedIconId);

  if (iconSvgContent === null) {
    return null;
  }

  return iconSvgContent.trim().length > 0 ? iconSvgContent : null;
}

function normalizePluginUiEntryLocation(location, fallbackLocation = 'activityBar') {
  const normalizedLocation = normalizeString(location).trim();
  return PLUGIN_UI_ENTRY_LOCATIONS.has(normalizedLocation) ? normalizedLocation : fallbackLocation;
}

function normalizePluginUiEntryScope(scope) {
  if (scope === null || typeof scope !== 'object') {
    return null;
  }

  const viewType = normalizeString(scope.viewType).trim();
  const fileExtensions = Array.isArray(scope.fileExtensions)
    ? scope.fileExtensions
      .map((extension) => normalizeString(extension).trim().toLowerCase())
      .filter((extension, index, entries) => extension.length > 0 && entries.indexOf(extension) === index)
    : [];

  if (viewType.length === 0 && fileExtensions.length === 0) {
    return null;
  }

  return {
    viewType: viewType.length > 0 ? viewType : undefined,
    fileExtensions: fileExtensions.length > 0 ? fileExtensions : undefined,
  };
}

function createUiEntrySnapshot({
  entryId,
  pluginId,
  location,
  kind,
  title,
  text = null,
  icon = null,
  scope = null,
}) {
  const normalizedTitle = normalizeString(title).trim();
  const normalizedIcon = normalizeString(icon).trim();

  return {
    id: normalizeString(entryId),
    pluginId: normalizeString(pluginId),
    location: normalizePluginUiEntryLocation(location),
    kind,
    title: normalizedTitle,
    tooltip: normalizedTitle.length > 0 ? normalizedTitle : null,
    text: text === null ? null : normalizeString(text).trim(),
    icon: normalizedIcon.length > 0 ? normalizedIcon : null,
    iconSvg: resolvePluginUiEntryIconSvg(normalizedIcon),
    scope: normalizePluginUiEntryScope(scope),
  };
}

function createSyntheticClickEvent() {
  return {
    type: 'click',
    button: 0,
    preventDefault() {
      return undefined;
    },
    stopPropagation() {
      return undefined;
    },
  };
}

function createSettingTabSnapshot(profile, settingTab, tabIndex) {
  const constructorName = normalizeString(settingTab?.constructor?.name).trim();
  const title = constructorName.length > 0 ? constructorName : profile.pluginDisplayName;

  return {
    id: `${profile.pluginId}:setting-tab:${tabIndex}`,
    pluginId: profile.pluginId,
    title,
  };
}

function createViewSnapshot(pluginId, viewType) {
  return {
    pluginId: normalizeString(pluginId),
    viewType: normalizeString(viewType).trim(),
  };
}

function createResourceExplorerItemSnapshot(pluginId, itemId, registration) {
  const normalizedIcon = normalizeString(registration?.icon).trim();
  const normalizedDirectoryPath = normalizeString(registration?.path).trim();
  const ignoredStyleFields = resourceExplorerItemUnsupportedStyleFields.filter((field) => (
    registration !== null
    && typeof registration === 'object'
    && Object.prototype.hasOwnProperty.call(registration, field)
  ));

  if (ignoredStyleFields.length > 0) {
    console.warn(
      `[PluginSupervisor] Ignoring style fields on resource explorer item "${normalizeString(pluginId)}:${normalizeString(itemId).trim()}": ${ignoredStyleFields.join(', ')}`,
    );
  }

  return {
    pluginId: normalizeString(pluginId),
    itemId: normalizeString(itemId).trim(),
    title: normalizeString(registration?.title).trim(),
    icon: normalizedIcon.length > 0 ? normalizedIcon : null,
    viewType: normalizeString(registration?.viewType).trim(),
    directoryPath: normalizedDirectoryPath,
    retainContextWhenHidden: registration?.retainContextWhenHidden === true,
  };
}

function createExtensionSnapshot(pluginId, extension, viewType) {
  return {
    pluginId: normalizeString(pluginId),
    extension: normalizeString(extension).trim().toLowerCase(),
    viewType: normalizeString(viewType).trim(),
  };
}

function invokeComponentLifecycle(target, symbolKey, fallbackName) {
  const symbolMethod = target?.[symbolKey] ?? null;

  if (typeof symbolMethod === 'function') {
    return symbolMethod.call(target);
  }

  const fallbackMethod = target?.[fallbackName] ?? null;

  if (typeof fallbackMethod === 'function') {
    return Promise.resolve(fallbackMethod.call(target));
  }

  throw new Error(`Component lifecycle method "${fallbackName}" is not available.`);
}

function summarizeBasesOption(option) {
  if (option?.type === 'group') {
    const groupLabel = normalizeString(option.displayName).trim();
    const groupLines = groupLabel.length > 0 ? [groupLabel] : [];
    const groupItems = Array.isArray(option.items)
      ? option.items.flatMap((item) => summarizeBasesOption(item))
      : [];
    return [...groupLines, ...groupItems];
  }

  const line = normalizeString(option?.displayName).trim();
  return line.length > 0 ? [line] : [];
}

function createProtocolSnapshot(pluginId, action) {
  return {
    pluginId: normalizeString(pluginId),
    action: normalizeString(action).trim(),
  };
}

const SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND = Object.freeze({
  SIMPLE_COMMAND: 'simple-command',
  BASES_VIEW: 'bases-view',
  SETTING_TAB: 'setting-tab',
  PROTOCOL: 'protocol',
  UI_ENTRY: 'ui-entry',
  RESOURCE_EXPLORER_ITEM: 'resource-explorer-item',
});

const SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND = Object.freeze({
  INVALID_BASES_VIEW: 'invalid-bases-view',
  EDITOR_COMMAND: 'editor-command',
  EDITOR_EXTENSION: 'editor-extension',
  EDITOR_SUGGEST: 'editor-suggest',
  INVALID_EXTENSION_BINDING: 'invalid-extension-binding',
  EXTENSION_BINDING: 'extension-binding',
  HOVER_LINK_SOURCE: 'hover-link-source',
  MARKDOWN_POST_PROCESSOR: 'markdown-post-processor',
  MARKDOWN_CODE_BLOCK_PROCESSOR: 'markdown-code-block-processor',
  INVALID_PROTOCOL: 'invalid-protocol',
  UNSUPPORTED_SETTING_TAB: 'unsupported-setting-tab',
  RIBBON_ICON: 'ribbon-icon',
  STATUS_BAR_ITEM: 'status-bar-item',
  INVALID_VIEW: 'invalid-view',
  VIEW: 'view',
  INVALID_RESOURCE_EXPLORER_ITEM: 'invalid-resource-explorer-item',
  RESOURCE_EXPLORER_ITEM: 'resource-explorer-item',
});

function createSupervisorRuntimeProfile(descriptor) {
  const runtimeSettingsEntry = descriptor?.uiEntrypoints?.settings ?? null;

  return {
    pluginId: normalizeString(descriptor?.pluginId),
    pluginDisplayName: normalizeString(descriptor?.displayName, normalizeString(descriptor?.pluginId)),
    encounteredUnsupportedRegistration: false,
    simpleCommandCount: 0,
    basesViewCount: 0,
    uiEntryCount: 0,
    commandSnapshots: new Map(),
    nextSettingTabId: 0,
    nextUiEntryId: 0,
    settingTabSnapshots: new Map(),
    viewSnapshots: new Map(),
    resourceExplorerItemSnapshots: new Map(),
    extensionSnapshots: new Map(),
    protocolSnapshots: new Map(),
    uiEntrySnapshots: new Map(),
    uiEntryHandlers: new Map(),
    supportsSettingTabs: typeof runtimeSettingsEntry === 'string' && runtimeSettingsEntry.trim().length > 0,
  };
}

function noteSupervisorUnsupportedContribution(profile, contributionKind) {
  switch (contributionKind) {
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_BASES_VIEW:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_COMMAND:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_EXTENSION:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_SUGGEST:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_EXTENSION_BINDING:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EXTENSION_BINDING:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.HOVER_LINK_SOURCE:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.MARKDOWN_POST_PROCESSOR:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.MARKDOWN_CODE_BLOCK_PROCESSOR:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_PROTOCOL:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.UNSUPPORTED_SETTING_TAB:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.RIBBON_ICON:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.STATUS_BAR_ITEM:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_VIEW:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.VIEW:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_RESOURCE_EXPLORER_ITEM:
    case SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.RESOURCE_EXPLORER_ITEM:
      break;
    default:
      throw new Error(`Unsupported supervisor contribution kind: ${normalizeString(contributionKind)}.`);
  }

  profile.encounteredUnsupportedRegistration = true;
}

function addSupervisorSupportedContribution(profile, contributionKind, entryKey = null, entryValue = null) {
  switch (contributionKind) {
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SIMPLE_COMMAND:
      profile.simpleCommandCount += 1;
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.BASES_VIEW:
      profile.basesViewCount += 1;
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SETTING_TAB:
      if (entryKey === null || entryValue === null) {
        throw new Error('Setting tab contribution requires a snapshot key and value.');
      }
      profile.settingTabSnapshots.set(entryKey, entryValue);
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.PROTOCOL:
      if (entryKey === null || entryValue === null) {
        throw new Error('Protocol contribution requires a snapshot key and value.');
      }
      profile.protocolSnapshots.set(entryKey, entryValue);
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY:
      profile.uiEntryCount += 1;
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.RESOURCE_EXPLORER_ITEM:
      if (entryKey === null || entryValue === null) {
        throw new Error('Resource explorer item contribution requires a snapshot key and value.');
      }
      profile.resourceExplorerItemSnapshots.set(entryKey, entryValue);
      return;
    default:
      throw new Error(`Unsupported supervisor supported contribution kind: ${normalizeString(contributionKind)}.`);
  }
}

function removeSupervisorSupportedContribution(profile, contributionKind, entryKey = null, expectedValue = null) {
  switch (contributionKind) {
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SIMPLE_COMMAND:
      profile.simpleCommandCount = Math.max(profile.simpleCommandCount - 1, 0);
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.BASES_VIEW:
      profile.basesViewCount = Math.max(profile.basesViewCount - 1, 0);
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SETTING_TAB:
      if (entryKey === null) {
        throw new Error('Setting tab contribution removal requires a snapshot key.');
      }
      if (expectedValue === null || profile.settingTabSnapshots.get(entryKey) === expectedValue) {
        profile.settingTabSnapshots.delete(entryKey);
      }
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.PROTOCOL:
      if (entryKey === null) {
        throw new Error('Protocol contribution removal requires a snapshot key.');
      }
      if (expectedValue === null || profile.protocolSnapshots.get(entryKey) === expectedValue) {
        profile.protocolSnapshots.delete(entryKey);
      }
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY:
      profile.uiEntryCount = Math.max(profile.uiEntryCount - 1, 0);
      return;
    case SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.RESOURCE_EXPLORER_ITEM:
      if (entryKey === null) {
        throw new Error('Resource explorer item contribution removal requires a snapshot key.');
      }
      if (expectedValue === null || profile.resourceExplorerItemSnapshots.get(entryKey) === expectedValue) {
        profile.resourceExplorerItemSnapshots.delete(entryKey);
      }
      return;
    default:
      throw new Error(`Unsupported supervisor supported contribution kind: ${normalizeString(contributionKind)}.`);
  }
}

function hasSupervisorOwnerEligibleContribution(profile) {
  return profile.simpleCommandCount > 0
    || profile.basesViewCount > 0
    || profile.settingTabSnapshots.size > 0
    || profile.protocolSnapshots.size > 0
    || profile.viewSnapshots.size > 0
    || profile.resourceExplorerItemSnapshots.size > 0
    || profile.uiEntryCount > 0;
}

function resolveSupervisorRuntimeOwner(profile) {
  return profile.encounteredUnsupportedRegistration === false
    && hasSupervisorOwnerEligibleContribution(profile)
    ? 'supervisor'
    : 'main';
}

function syncLocalStorageCache(entries) {
  const nextCache = new Map();

  for (const [key, value] of Object.entries(entries)) {
    nextCache.set(key, cloneJsonValue(value));
  }

  localStorageCache = nextCache;
}

async function refreshLocalStorageCache() {
  const response = await requestHost({
    kind: 'storage:snapshot-local',
  });

  if (response.kind !== 'storage:snapshot-local') {
    return;
  }

  syncLocalStorageCache(response.entries);
}

function updateLocalStorageCacheEntry(key, value) {
  if (value === null) {
    localStorageCache.delete(key);
    return;
  }

  localStorageCache.set(key, cloneJsonValue(value));
}

function createSupervisorCommandRuntime(profile, pluginSdk) {
  const basesViewRegistry = new Map();
  const commandRegistry = new Map();
  const protocolRegistry = new Map();
  const viewCreatorRegistry = new Map();

  const isRuntimeOwnedBySupervisor = () => {
    return (loadedPluginRuntimes.get(profile.pluginId)?.owner ?? 'main') === 'supervisor';
  };

  const syncUiEntrySnapshot = (entryId, snapshot) => {
    if (snapshot === null) {
      profile.uiEntrySnapshots.delete(entryId);

      if (isRuntimeOwnedBySupervisor()) {
        removeSupervisorOwnedUiEntrySnapshot(entryId);
      }
      return;
    }

    profile.uiEntrySnapshots.set(entryId, snapshot);

    if (isRuntimeOwnedBySupervisor()) {
      setSupervisorOwnedUiEntrySnapshot(entryId, snapshot);
    }
  };

  const syncUiEntryHandler = (entryId, execute) => {
    if (typeof execute !== 'function') {
      profile.uiEntryHandlers.delete(entryId);

      if (isRuntimeOwnedBySupervisor()) {
        supervisorOwnedUiEntryHandlers.delete(entryId);
      }
      return;
    }

    const handlerEntry = {
      pluginId: profile.pluginId,
      execute,
    };
    profile.uiEntryHandlers.set(entryId, handlerEntry);

    if (isRuntimeOwnedBySupervisor()) {
      supervisorOwnedUiEntryHandlers.set(entryId, handlerEntry);
    }
  };

  const syncViewSnapshot = (viewType, snapshot) => {
    if (snapshot === null) {
      profile.viewSnapshots.delete(viewType);

      if (isRuntimeOwnedBySupervisor() && supervisorOwnedViews.delete(viewType)) {
        publishViews();
      }
      return;
    }

    profile.viewSnapshots.set(viewType, snapshot);

    if (isRuntimeOwnedBySupervisor()) {
      if (supervisorOwnedViews.get(viewType) !== snapshot) {
        supervisorOwnedViews.set(viewType, snapshot);
        publishViews();
      }
    }
  };

  const syncResourceExplorerItemSnapshot = (itemKey, snapshot) => {
    if (snapshot === null) {
      profile.resourceExplorerItemSnapshots.delete(itemKey);

      if (isRuntimeOwnedBySupervisor() && supervisorOwnedResourceExplorerItems.delete(itemKey)) {
        publishResourceExplorerItems();
      }
      return;
    }

    profile.resourceExplorerItemSnapshots.set(itemKey, snapshot);

    if (isRuntimeOwnedBySupervisor()) {
      if (supervisorOwnedResourceExplorerItems.get(itemKey) !== snapshot) {
        supervisorOwnedResourceExplorerItems.set(itemKey, snapshot);
        publishResourceExplorerItems();
      }
    }
  };

  const supportsRuntimeView = (pluginId, viewType) => {
    const descriptor = descriptorRegistry.get(normalizeString(pluginId)) ?? null;
    const runtimeSurfaceEntry = descriptor?.uiEntrypoints?.views?.[viewType] ?? null;
    return typeof runtimeSurfaceEntry === 'string' && runtimeSurfaceEntry.trim().length > 0;
  };

  const resolveCommand = (commandId) => {
    return commandRegistry.get(commandId)
      ?? [...commandRegistry.values()].find((entry) => entry.command.id === commandId)
      ?? null;
  };

  const executeSimpleCommand = async (commandId, executionState) => {
    const entry = resolveCommand(commandId);

    if (entry === null) {
      return {
        handled: false,
        result: null,
        fallbackToMain: true,
      };
    }

    if (entry.command.editorCallback !== undefined || entry.command.editorCheckCallback !== undefined) {
      return {
        handled: false,
        result: null,
        fallbackToMain: true,
      };
    }

    if (entry.command.checkCallback !== undefined) {
      executionState.stage = 'check-callback';
      const allowed = await entry.command.checkCallback(false);

      if (allowed === false) {
        return {
          handled: true,
          result: null,
          fallbackToMain: false,
        };
      }
    }

    if (entry.command.callback !== undefined) {
      executionState.stage = 'command-callback';
      await entry.command.callback();
      return {
        handled: true,
        result: null,
        fallbackToMain: false,
      };
    }

    return {
      handled: true,
      result: null,
      fallbackToMain: false,
    };
  };

  const dispatchProtocol = async (protocolData, executionState) => {
    const action = normalizeString(protocolData?.action).trim();
    const entry = [...protocolRegistry.values()]
      .filter((candidate) => candidate.action === action)
      .at(-1) ?? null;

    if (entry === null) {
      return {
        handled: false,
        fallbackToMain: true,
      };
    }

    executionState.stage = 'protocol-callback';
    await entry.handler(protocolData);
    return {
      handled: true,
      fallbackToMain: false,
    };
  };

  const renderRegisteredBasesView = async (pluginId, viewId, executionState, runtime) => {
    const registryKey = `${normalizeString(pluginId)}:${normalizeString(viewId).trim()}`;
    const entry = basesViewRegistry.get(registryKey) ?? null;

    if (entry === null) {
      return {
        handled: false,
        snapshot: null,
        fallbackToMain: true,
      };
    }

    executionState.stage = 'bases-view-factory';
    const controller = new pluginSdk.QueryController(runtime.app);
    const containerEl = document.createElement('div');
    const view = entry.registration.factory(controller, containerEl);

    executionState.stage = 'bases-view-load';
    await invokeComponentLifecycle(controller, COMPONENT_INTERNAL_LOAD, 'onload');
    await invokeComponentLifecycle(view, COMPONENT_INTERNAL_LOAD, 'onload');

    try {
      executionState.stage = 'bases-view-render';
      view.onDataUpdated();

      const datasetEntries = Object.fromEntries(
        Object.entries(containerEl.dataset).filter((entry) => entry[1] !== undefined),
      );

      return {
        handled: true,
        snapshot: {
          registrationName: normalizeString(entry.registration.name),
          icon: normalizeString(entry.registration.icon),
          textContent: normalizeString(containerEl.textContent).trim(),
          dataset: datasetEntries,
          optionSummary: (entry.registration.options?.() ?? []).flatMap((option) => summarizeBasesOption(option)),
        },
        fallbackToMain: false,
      };
    } finally {
      await invokeComponentLifecycle(view, COMPONENT_INTERNAL_UNLOAD, 'onunload');
      await invokeComponentLifecycle(controller, COMPONENT_INTERNAL_UNLOAD, 'onunload');
    }
  };

  const runtime = {
    bases: {
      registerBasesView(pluginId, viewId, registration) {
        const normalizedViewId = normalizeString(viewId).trim();

        if (normalizedViewId.length === 0 || typeof registration?.factory !== 'function') {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_BASES_VIEW);
          return createNoopDisposable();
        }

        const registryKey = `${normalizeString(pluginId)}:${normalizedViewId}`;
        basesViewRegistry.set(registryKey, {
          pluginId: normalizeString(pluginId),
          viewId: normalizedViewId,
          registration,
        });
        addSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.BASES_VIEW);
        return createDisposable(() => {
          const currentEntry = basesViewRegistry.get(registryKey) ?? null;

          if (currentEntry?.registration === registration) {
            basesViewRegistry.delete(registryKey);
            removeSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.BASES_VIEW);
          }
        });
      },
      renderRegisteredView(pluginId, viewId, executionState) {
        return renderRegisteredBasesView(pluginId, viewId, executionState, runtime);
      },
    },
    commands: {
      registerCommand(pluginId, command) {
        const registryKey = `${pluginId}:${command.id}`;
        const commandSnapshot = createCommandSnapshot(pluginId, command);

        commandRegistry.set(registryKey, {
          pluginId,
          command,
        });
        profile.commandSnapshots.set(registryKey, commandSnapshot);

        if (command.editorCallback === undefined && command.editorCheckCallback === undefined) {
          addSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SIMPLE_COMMAND);
        } else {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_COMMAND);
        }

        return createDisposable(() => {
          const current = commandRegistry.get(registryKey);

          if (current?.command === command) {
            commandRegistry.delete(registryKey);
            profile.commandSnapshots.delete(registryKey);

            if (command.editorCallback === undefined && command.editorCheckCallback === undefined) {
              removeSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SIMPLE_COMMAND);
            }
          }
        });
      },
      removeCommand(commandId) {
        if (commandRegistry.delete(commandId)) {
          profile.commandSnapshots.delete(commandId);
          return;
        }

        for (const [registryKey, entry] of [...commandRegistry.entries()]) {
          if (entry.command.id === commandId) {
            commandRegistry.delete(registryKey);
            profile.commandSnapshots.delete(registryKey);
          }
        }
      },
      async executeCommand(commandId) {
        await executeSimpleCommand(commandId, {
          stage: 'dispatch',
        });
      },
      executeSimpleCommand,
    },
    data: {
      async loadData(pluginId) {
        const response = await requestHost({
          kind: 'data:load',
          pluginId,
        });

        return response.kind === 'data:load' ? cloneJsonValue(response.value) : null;
      },
      async saveData(pluginId, value) {
        await requestHost({
          kind: 'data:save',
          pluginId,
          value: cloneJsonValue(value),
        });
      },
      async deleteData(pluginId) {
        await requestHost({
          kind: 'data:delete',
          pluginId,
        });
      },
    },
    editors: {
      registerEditorExtension() {
        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_EXTENSION);
        return createNoopDisposable();
      },
      registerEditorSuggest() {
        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EDITOR_SUGGEST);
        return createNoopDisposable();
      },
    },
    extensions: {
      registerExtensions(pluginId, extensions, viewType) {
        const normalizedViewType = normalizeString(viewType).trim();
        const normalizedExtensions = Array.isArray(extensions)
          ? extensions
            .map((extension) => normalizeString(extension).trim().toLowerCase())
            .filter((extension) => extension.length > 0)
          : [];

        if (normalizedViewType.length === 0 || normalizedExtensions.length === 0) {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_EXTENSION_BINDING);
          return createNoopDisposable();
        }

        const extensionSnapshots = normalizedExtensions.map((extension) => {
          const snapshot = createExtensionSnapshot(pluginId, extension, normalizedViewType);
          profile.extensionSnapshots.set(extension, snapshot);
          return snapshot;
        });

        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.EXTENSION_BINDING);

        return createDisposable(() => {
          for (const snapshot of extensionSnapshots) {
            if (profile.extensionSnapshots.get(snapshot.extension) === snapshot) {
              profile.extensionSnapshots.delete(snapshot.extension);
            }
          }
        });
      },
    },
    hover: {
      registerHoverLinkSource() {
        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.HOVER_LINK_SOURCE);
        return createNoopDisposable();
      },
    },
    markdown: {
      registerPostProcessor() {
        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.MARKDOWN_POST_PROCESSOR);
        return createNoopDisposable();
      },
      registerCodeBlockProcessor() {
        noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.MARKDOWN_CODE_BLOCK_PROCESSOR);
        return createNoopDisposable();
      },
    },
    protocols: {
      registerAppProtocolHandler(pluginId, action, handler) {
        const normalizedAction = normalizeString(action).trim();

        if (normalizedAction.length === 0) {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_PROTOCOL);
          return createNoopDisposable();
        }

        const protocolKey = `${pluginId}:${normalizedAction}`;
        const protocolSnapshot = createProtocolSnapshot(pluginId, normalizedAction);
        protocolRegistry.set(protocolKey, {
          pluginId,
          action: normalizedAction,
          handler,
        });
        addSupervisorSupportedContribution(
          profile,
          SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.PROTOCOL,
          protocolKey,
          protocolSnapshot,
        );

        return createDisposable(() => {
          const currentEntry = protocolRegistry.get(protocolKey) ?? null;

          if (currentEntry?.handler === handler) {
            protocolRegistry.delete(protocolKey);
            removeSupervisorSupportedContribution(
              profile,
              SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.PROTOCOL,
              protocolKey,
              protocolSnapshot,
            );
          }
        });
      },
      dispatchProtocol,
    },
    settings: {
      registerSettingTab(pluginId, settingTab) {
        if (!profile.supportsSettingTabs) {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.UNSUPPORTED_SETTING_TAB);
          return createNoopDisposable();
        }

        profile.nextSettingTabId += 1;
        const snapshot = createSettingTabSnapshot(profile, settingTab, profile.nextSettingTabId);
        addSupervisorSupportedContribution(
          profile,
          SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SETTING_TAB,
          snapshot.id,
          snapshot,
        );

        return createDisposable(() => {
          removeSupervisorSupportedContribution(
            profile,
            SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.SETTING_TAB,
            snapshot.id,
            snapshot,
          );
        });
      },
    },
    resourceExplorer: {
      registerResourceExplorerItem(pluginId, itemId, registration) {
        const normalizedItemId = normalizeString(itemId).trim();
        const normalizedTitle = normalizeString(registration?.title).trim();
        const normalizedDirectoryPath = normalizeString(registration?.path).trim();

        if (
          normalizedItemId.length === 0
          || normalizedTitle.length === 0
          || normalizedDirectoryPath.length === 0
        ) {
          noteSupervisorUnsupportedContribution(
            profile,
            SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_RESOURCE_EXPLORER_ITEM,
          );
          return createNoopDisposable();
        }

        const itemKey = `${normalizeString(pluginId)}:${normalizedItemId}`;
        const snapshot = createResourceExplorerItemSnapshot(pluginId, normalizedItemId, registration);
        addSupervisorSupportedContribution(
          profile,
          SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.RESOURCE_EXPLORER_ITEM,
          itemKey,
          snapshot,
        );
        syncResourceExplorerItemSnapshot(itemKey, snapshot);

        return createDisposable(() => {
          syncResourceExplorerItemSnapshot(itemKey, null);
          removeSupervisorSupportedContribution(
            profile,
            SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.RESOURCE_EXPLORER_ITEM,
            itemKey,
            snapshot,
          );
        });
      },
    },
    ui: {
      addRibbonIcon(pluginId, spec) {
        profile.nextUiEntryId += 1;
        const normalizedPluginId = normalizeString(pluginId);
        const entryId = `${normalizedPluginId}:ui:${profile.nextUiEntryId}`;
        const snapshot = createUiEntrySnapshot({
          entryId,
          pluginId: normalizedPluginId,
          location: spec?.location,
          kind: 'iconButton',
          title: spec?.title,
          icon: spec?.icon,
          scope: spec?.scope ?? null,
        });
        const execute = typeof spec?.onClick === 'function'
          ? () => {
            return Promise.resolve(spec.onClick(createSyntheticClickEvent()));
          }
          : null;

        addSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY);
        syncUiEntrySnapshot(entryId, snapshot);
        syncUiEntryHandler(entryId, execute);
        const element = createManagedSyntheticElement('div');
        element.className = 'ns-plugin-ribbon-icon';
        element.dataset.pluginId = normalizedPluginId;
        element.dataset.icon = normalizeString(spec?.icon);
        element.title = snapshot.title;

        return Object.assign(element, createDisposable(() => {
          syncUiEntrySnapshot(entryId, null);
          syncUiEntryHandler(entryId, null);
          removeSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY);
        }));
      },
      createStatusBarItem(pluginId) {
        profile.nextUiEntryId += 1;
        const normalizedPluginId = normalizeString(pluginId);
        const entryId = `${normalizedPluginId}:ui:${profile.nextUiEntryId}`;
        const state = {
          title: '',
          text: '',
          visible: true,
        };
        const buildSnapshot = () => {
          if (!state.visible) {
            return null;
          }

          return createUiEntrySnapshot({
            entryId,
            pluginId: normalizedPluginId,
            location: 'statusBar',
            kind: 'statusBarItem',
            title: state.title,
            text: state.text,
          });
        };

        addSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY);
        syncUiEntrySnapshot(entryId, buildSnapshot());
        const element = createManagedSyntheticElement('div');
        element.className = 'ns-plugin-status-bar-item';
        element.dataset.pluginId = normalizedPluginId;
        element.setText = (text) => {
          state.text = normalizeString(text);
          element.textContent = state.text;
          syncUiEntrySnapshot(entryId, buildSnapshot());
        };
        element.show = () => {
          state.visible = true;
          element.hidden = false;
          delete element.style.display;
          syncUiEntrySnapshot(entryId, buildSnapshot());
        };
        element.hide = () => {
          state.visible = false;
          element.hidden = true;
          element.style.display = 'none';
          syncUiEntrySnapshot(entryId, null);
        };
        return Object.assign(element, createDisposable(() => {
          syncUiEntrySnapshot(entryId, null);
          syncUiEntryHandler(entryId, null);
          removeSupervisorSupportedContribution(profile, SUPERVISOR_SUPPORTED_CONTRIBUTION_KIND.UI_ENTRY);
        }));
      },
    },
    views: {
      registerView(pluginId, type, viewCreator) {
        const viewType = normalizeString(type).trim();

        if (viewType.length === 0 || typeof viewCreator !== 'function') {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.INVALID_VIEW);
          return createNoopDisposable();
        }

        if (!supportsRuntimeView(pluginId, viewType)) {
          noteSupervisorUnsupportedContribution(profile, SUPERVISOR_UNSUPPORTED_CONTRIBUTION_KIND.VIEW);
          return createNoopDisposable();
        }

        const snapshot = createViewSnapshot(pluginId, viewType);
        viewCreatorRegistry.set(viewType, {
          pluginId: normalizeString(pluginId),
          creator: viewCreator,
        });
        syncViewSnapshot(viewType, snapshot);

        return createDisposable(() => {
          const currentEntry = viewCreatorRegistry.get(viewType) ?? null;

          if (currentEntry?.creator === viewCreator) {
            viewCreatorRegistry.delete(viewType);
            syncViewSnapshot(viewType, null);
          }
        });
      },
      getRegisteredViewCreator(viewType) {
        return viewCreatorRegistry.get(normalizeString(viewType).trim())?.creator ?? null;
      },
    },
  };

  return runtime;
}

function createSupervisorCommandApp(pluginSdk, runtime) {
  const app = Object.create(pluginSdk.App.prototype);
  const workspace = createSupervisorWorkspace(pluginSdk);
  const vault = createSupervisorVault(pluginSdk);
  runtime.app = app;
  workspace.app = app;
  workspace.initializeSnapshot();

  return Object.assign(app, {
    __pluginRuntime: runtime,
    keymap: new pluginSdk.Keymap(),
    scope: new pluginSdk.Scope(),
    workspace,
    vault,
    metadataCache: createUnsupportedCapabilityProxy('app.metadataCache'),
    fileManager: createUnsupportedCapabilityProxy('app.fileManager'),
    urlMetadata: createUnsupportedCapabilityProxy('app.urlMetadata'),
    shell: createUnsupportedCapabilityProxy('app.shell'),
    lastEvent: null,
    renderContext: createUnsupportedCapabilityProxy('app.renderContext'),
    isDarkMode() {
      return hostIsDarkMode === true;
    },
    loadLocalStorage(key) {
      const normalizedKey = normalizeString(key);
      const value = localStorageCache.get(normalizedKey);
      return value === undefined ? null : cloneJsonValue(value);
    },
    saveLocalStorage(key, data) {
      const normalizedKey = normalizeString(key);

      if (normalizedKey.length === 0) {
        return;
      }

      updateLocalStorageCacheEntry(normalizedKey, data);
      void requestHost({
        kind: 'storage:save-local',
        key: normalizedKey,
        value: data === null ? null : cloneJsonValue(data),
      }).catch((error) => {
        emitNonFatalError(
          error instanceof Error
            ? error.message
            : `Plugin supervisor failed to persist localStorage key "${normalizedKey}".`,
        );
      });
    },
  });
}

function canFallbackToMainForStage(stage) {
  return stage !== 'check-callback'
    && stage !== 'command-callback'
    && stage !== 'protocol-callback'
    && stage !== 'bases-view-factory'
    && stage !== 'bases-view-load'
    && stage !== 'bases-view-render';
}

function publishRuntimeStates() {
  sendMessage({
    type: 'runtime-states-updated',
    data: {
      plugins: [...pluginRuntimeStates.values()],
    },
  });
}

function setPluginRuntimeState(pluginId, status, failureMessage = null, owner = null) {
  const normalizedPluginId = normalizeString(pluginId);

  if (normalizedPluginId.length === 0) {
    return;
  }

  const nextFailureMessage = status === 'failed'
    ? normalizeString(failureMessage)
    : null;
  const currentState = pluginRuntimeStates.get(normalizedPluginId) ?? null;
  const nextOwner = owner ?? currentState?.owner ?? 'main';

  if (
    currentState !== null
    && currentState.status === status
    && currentState.failureMessage === nextFailureMessage
    && currentState.owner === nextOwner
  ) {
    return;
  }

  pluginRuntimeStates.set(normalizedPluginId, {
    pluginId: normalizedPluginId,
    status,
    failureMessage: nextFailureMessage,
    owner: nextOwner,
  });
  publishRuntimeStates();
}

function syncDescriptorRuntimeStates(descriptors) {
  let changed = false;
  const nextDescriptorKeys = new Map();

  for (const descriptor of descriptors) {
    if (
      descriptor !== null
      && typeof descriptor === 'object'
      && typeof descriptor.pluginId === 'string'
      && descriptor.pluginId.trim().length > 0
    ) {
      const descriptorKey = getDescriptorRuntimeKey(descriptor);
      nextDescriptorKeys.set(descriptor.pluginId, descriptorKey);
      const currentDescriptorKey = pluginRuntimeDescriptorKeys.get(descriptor.pluginId) ?? null;

      if (!pluginRuntimeStates.has(descriptor.pluginId) || currentDescriptorKey !== descriptorKey) {
        const runtimeOwner = resolveDescriptorRuntimeOwner(descriptor);
        pluginRuntimeStates.set(descriptor.pluginId, {
          pluginId: descriptor.pluginId,
          status: 'idle',
          failureMessage: null,
          owner: runtimeOwner,
        });
        pluginRuntimeDescriptorKeys.set(descriptor.pluginId, descriptorKey);
        changed = true;
        continue;
      }

      pluginRuntimeDescriptorKeys.set(descriptor.pluginId, descriptorKey);
    }
  }

  for (const pluginId of [...pluginRuntimeStates.keys()]) {
    if (!nextDescriptorKeys.has(pluginId)) {
      pluginRuntimeStates.delete(pluginId);
      pluginRuntimeDescriptorKeys.delete(pluginId);
      changed = true;
    }
  }

  if (changed) {
    publishRuntimeStates();
  }
}

function getDescriptorRuntimeKey(descriptor) {
  return [
    normalizeString(descriptor?.pluginId),
    normalizeString(descriptor?.version),
    normalizeString(descriptor?.rootDirectory),
    normalizeString(descriptor?.entryPath),
    normalizeString(descriptor?.manifestPath),
  ].join('|');
}

function removeSupervisorOwnedCommandsForPlugin(pluginId) {
  let changed = false;

  for (const registryKey of [...supervisorOwnedCommands.keys()]) {
    if (registryKey.startsWith(`${pluginId}:`)) {
      supervisorOwnedCommands.delete(registryKey);
      changed = true;
    }
  }

  if (changed) {
    publishCommands();
  }
}

function publishSettingTabs() {
  sendMessage({
    type: 'setting-tabs-updated',
    data: {
      settingTabs: [...supervisorOwnedSettingTabs.values()],
    },
  });
}

function publishViews() {
  sendMessage({
    type: 'views-updated',
    data: {
      views: [...supervisorOwnedViews.values()],
    },
  });
}

function publishResourceExplorerItems() {
  sendMessage({
    type: 'resource-explorer-items-updated',
    data: {
      items: [...supervisorOwnedResourceExplorerItems.values()],
    },
  });
}

function publishExtensions() {
  sendMessage({
    type: 'extensions-updated',
    data: {
      extensions: [...supervisorOwnedExtensions.values()],
    },
  });
}

function publishUiEntries() {
  sendMessage({
    type: 'ui-entries-updated',
    data: {
      entries: [...supervisorOwnedUiEntries.values()],
    },
  });
}

function setSupervisorOwnedUiEntrySnapshot(entryId, snapshot) {
  if (supervisorOwnedUiEntries.get(entryId) === snapshot) {
    return;
  }

  supervisorOwnedUiEntries.set(entryId, snapshot);
  publishUiEntries();
}

function removeSupervisorOwnedUiEntrySnapshot(entryId) {
  if (supervisorOwnedUiEntries.delete(entryId)) {
    publishUiEntries();
  }
}

function removeSupervisorOwnedProtocolsForPlugin(pluginId) {
  for (const protocolKey of [...supervisorOwnedProtocols.keys()]) {
    if (protocolKey.startsWith(`${pluginId}:`)) {
      supervisorOwnedProtocols.delete(protocolKey);
    }
  }
}

function removeSupervisorOwnedSettingTabsForPlugin(pluginId) {
  let changed = false;

  for (const settingTabId of [...supervisorOwnedSettingTabs.keys()]) {
    if (settingTabId.startsWith(`${pluginId}:setting-tab:`)) {
      supervisorOwnedSettingTabs.delete(settingTabId);
      changed = true;
    }
  }

  if (changed) {
    publishSettingTabs();
  }
}

function removeSupervisorOwnedViewsForPlugin(pluginId) {
  let changed = false;

  for (const viewType of [...supervisorOwnedViews.keys()]) {
    if ((supervisorOwnedViews.get(viewType)?.pluginId ?? null) === pluginId) {
      supervisorOwnedViews.delete(viewType);
      changed = true;
    }
  }

  if (changed) {
    publishViews();
  }
}

function removeSupervisorOwnedResourceExplorerItemsForPlugin(pluginId) {
  let changed = false;

  for (const itemKey of [...supervisorOwnedResourceExplorerItems.keys()]) {
    if ((supervisorOwnedResourceExplorerItems.get(itemKey)?.pluginId ?? null) === pluginId) {
      supervisorOwnedResourceExplorerItems.delete(itemKey);
      changed = true;
    }
  }

  if (changed) {
    publishResourceExplorerItems();
  }
}

function removeSupervisorOwnedExtensionsForPlugin(pluginId) {
  let changed = false;

  for (const extension of [...supervisorOwnedExtensions.keys()]) {
    if ((supervisorOwnedExtensions.get(extension)?.pluginId ?? null) === pluginId) {
      supervisorOwnedExtensions.delete(extension);
      changed = true;
    }
  }

  if (changed) {
    publishExtensions();
  }
}

function removeSupervisorOwnedUiEntriesForPlugin(pluginId) {
  let changed = false;

  for (const entryId of [...supervisorOwnedUiEntries.keys()]) {
    if (entryId.startsWith(`${pluginId}:ui:`)) {
      supervisorOwnedUiEntries.delete(entryId);
      changed = true;
    }
  }

  for (const entryId of [...supervisorOwnedUiEntryHandlers.keys()]) {
    if (entryId.startsWith(`${pluginId}:ui:`)) {
      supervisorOwnedUiEntryHandlers.delete(entryId);
    }
  }

  if (changed) {
    publishUiEntries();
  }
}

function commitSupervisorOwnedCommands(record) {
  let changed = false;

  for (const [registryKey, commandSnapshot] of record.commandSnapshots.entries()) {
    if (supervisorOwnedCommands.get(registryKey) !== commandSnapshot) {
      supervisorOwnedCommands.set(registryKey, commandSnapshot);
      changed = true;
    }
  }

  if (changed) {
    publishCommands();
  }
}

function commitSupervisorOwnedSettingTabs(record) {
  let changed = false;

  for (const [settingTabId, settingTabSnapshot] of record.settingTabSnapshots.entries()) {
    if (supervisorOwnedSettingTabs.get(settingTabId) !== settingTabSnapshot) {
      supervisorOwnedSettingTabs.set(settingTabId, settingTabSnapshot);
      changed = true;
    }
  }

  if (changed) {
    publishSettingTabs();
  }
}

function commitSupervisorOwnedViews(record) {
  let changed = false;

  for (const [viewType, viewSnapshot] of record.viewSnapshots.entries()) {
    if (supervisorOwnedViews.get(viewType) !== viewSnapshot) {
      supervisorOwnedViews.set(viewType, viewSnapshot);
      changed = true;
    }
  }

  if (changed) {
    publishViews();
  }
}

function commitSupervisorOwnedResourceExplorerItems(record) {
  let changed = false;

  for (const [itemKey, itemSnapshot] of record.resourceExplorerItemSnapshots.entries()) {
    if (supervisorOwnedResourceExplorerItems.get(itemKey) !== itemSnapshot) {
      supervisorOwnedResourceExplorerItems.set(itemKey, itemSnapshot);
      changed = true;
    }
  }

  if (changed) {
    publishResourceExplorerItems();
  }
}

function commitSupervisorOwnedExtensions(record) {
  let changed = false;

  for (const [extension, extensionSnapshot] of record.extensionSnapshots.entries()) {
    if (supervisorOwnedExtensions.get(extension) !== extensionSnapshot) {
      supervisorOwnedExtensions.set(extension, extensionSnapshot);
      changed = true;
    }
  }

  if (changed) {
    publishExtensions();
  }
}

function commitSupervisorOwnedProtocols(record) {
  for (const [protocolKey, protocolSnapshot] of record.protocolSnapshots.entries()) {
    supervisorOwnedProtocols.set(protocolKey, protocolSnapshot);
  }
}

function commitSupervisorOwnedUiEntries(record) {
  let changed = false;

  for (const [entryId, entrySnapshot] of record.uiEntrySnapshots.entries()) {
    if (supervisorOwnedUiEntries.get(entryId) !== entrySnapshot) {
      supervisorOwnedUiEntries.set(entryId, entrySnapshot);
      changed = true;
    }
  }

  for (const [entryId, handlerEntry] of record.uiEntryHandlers.entries()) {
    supervisorOwnedUiEntryHandlers.set(entryId, handlerEntry);
  }

  if (changed) {
    publishUiEntries();
  }
}

function createSupervisorViewInstanceSnapshot(leafId, view) {
  return {
    leafId,
    viewType: normalizeString(view?.getViewType?.()).trim(),
    displayText: normalizeString(view?.getDisplayText?.()).trim(),
    icon: normalizeString(view?.getIcon?.()).trim(),
    state: cloneJsonValue(view?.getState?.() ?? {}),
  };
}

function createPendingManualViewInstanceId() {
  nextPendingManualViewInstanceId += 1;
  return `plugin-supervisor-pending-view:${nextPendingManualViewInstanceId}`;
}

function consumePendingManualViewInstance(pendingViewInstanceId, viewType) {
  const normalizedPendingViewInstanceId = normalizeString(pendingViewInstanceId).trim();
  const normalizedViewType = normalizeString(viewType).trim();

  if (normalizedPendingViewInstanceId.length === 0 || normalizedViewType.length === 0) {
    return null;
  }

  const pendingEntry = pendingManualViewInstances.get(normalizedPendingViewInstanceId) ?? null;

  if (pendingEntry === null || pendingEntry.viewType !== normalizedViewType) {
    return null;
  }

  pendingManualViewInstances.delete(normalizedPendingViewInstanceId);
  return pendingEntry;
}

async function closeLoadedViewInstance(leafId) {
  const normalizedLeafId = normalizeString(leafId).trim();
  const entry = loadedViewInstances.get(normalizedLeafId) ?? null;

  if (entry === null) {
    return false;
  }

  loadedViewInstances.delete(normalizedLeafId);
  entry.leaf.clearRuntimeViewInstance();
  await invokeComponentLifecycle(entry.view, COMPONENT_INTERNAL_UNLOAD, 'onunload');
  return true;
}

async function closeLoadedViewInstancesForPlugin(pluginId) {
  const normalizedPluginId = normalizeString(pluginId).trim();

  for (const [leafId, entry] of [...loadedViewInstances.entries()]) {
    if (normalizeString(entry.pluginId).trim() === normalizedPluginId) {
      await closeLoadedViewInstance(leafId);
    }
  }
}

async function unloadLoadedPluginRuntime(record, reason) {
  loadedPluginRuntimes.delete(record.pluginId);
  if (record.owner === 'supervisor') {
    removeSupervisorOwnedCommandsForPlugin(record.pluginId);
    removeSupervisorOwnedSettingTabsForPlugin(record.pluginId);
    removeSupervisorOwnedViewsForPlugin(record.pluginId);
    removeSupervisorOwnedResourceExplorerItemsForPlugin(record.pluginId);
    removeSupervisorOwnedExtensionsForPlugin(record.pluginId);
    removeSupervisorOwnedProtocolsForPlugin(record.pluginId);
    removeSupervisorOwnedUiEntriesForPlugin(record.pluginId);
  }

  try {
    await closeLoadedViewInstancesForPlugin(record.pluginId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${record.pluginId}" failed while closing supervisor views (${reason}).`,
    );
  }

  try {
    await record.unload.call(record.instance);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${record.pluginId}" failed while unloading supervisor runtime (${reason}).`,
    );
  }

  if (reason !== 'command-failure') {
    setPluginRuntimeState(record.pluginId, 'idle', null, record.owner);
  }
}

async function unloadStalePluginRuntimes(nextDescriptors) {
  const nextDescriptorKeys = new Map();

  for (const descriptor of nextDescriptors) {
    if (
      descriptor !== null
      && typeof descriptor === 'object'
      && typeof descriptor.pluginId === 'string'
      && descriptor.pluginId.trim().length > 0
    ) {
      nextDescriptorKeys.set(descriptor.pluginId, getDescriptorRuntimeKey(descriptor));
    }
  }

  for (const [pluginId, record] of [...loadedPluginRuntimes.entries()]) {
    const nextDescriptorKey = nextDescriptorKeys.get(pluginId);

    if (nextDescriptorKey === undefined) {
      await unloadLoadedPluginRuntime(record, 'descriptor-removed');
      continue;
    }

    if (nextDescriptorKey !== record.descriptorKey) {
      await unloadLoadedPluginRuntime(record, 'descriptor-updated');
    }
  }
}

async function shutdownLoadedPluginRuntimes() {
  for (const record of [...loadedPluginRuntimes.values()].reverse()) {
    await unloadLoadedPluginRuntime(record, 'worker-shutdown');
  }
}

function resolveDescriptorRuntimeOwner(descriptor) {
  return descriptor?.runtimeOwner === 'supervisor' ? 'supervisor' : 'main';
}

function shouldLoadPluginInSupervisor(descriptor) {
  return resolveDescriptorRuntimeOwner(descriptor) === 'supervisor'
    && typeof descriptor?.entryPath === 'string'
    && descriptor.entryPath.trim().length > 0;
}

function resolveDescriptorForViewType(viewType) {
  const normalizedViewType = normalizeString(viewType).trim();

  if (normalizedViewType.length === 0) {
    return null;
  }

  const registeredView = supervisorOwnedViews.get(normalizedViewType) ?? null;

  if (registeredView !== null) {
    return descriptorRegistry.get(registeredView.pluginId) ?? null;
  }

  for (const descriptor of descriptorRegistry.values()) {
    if (!shouldLoadPluginInSupervisor(descriptor)) {
      continue;
    }

    if (descriptor?.uiEntrypoints?.views?.[normalizedViewType] !== undefined) {
      return descriptor;
    }
  }

  return null;
}

async function ensureSupervisorPluginRuntimeLoaded(descriptor, options = {}) {
  const probeOwnership = options.probeOwnership === true;
  const descriptorRuntimeOwner = resolveDescriptorRuntimeOwner(descriptor);

  if (typeof descriptor?.entryPath !== 'string' || descriptor.entryPath.trim().length === 0) {
    return {
      record: null,
      fallbackToMain: descriptorRuntimeOwner === 'main',
      owner: descriptorRuntimeOwner,
    };
  }

  const descriptorKey = getDescriptorRuntimeKey(descriptor);
  const existingRecord = loadedPluginRuntimes.get(descriptor.pluginId) ?? null;

  if (existingRecord !== null && existingRecord.descriptorKey === descriptorKey) {
    return {
      record: existingRecord,
      fallbackToMain: false,
      owner: existingRecord.owner,
    };
  }

  if (existingRecord !== null) {
    await unloadLoadedPluginRuntime(existingRecord, 'descriptor-replaced-before-reload');
  }

  const pluginSdk = loadPluginSdk();
  installPluginSdkAlias(pluginSdk);
  clearPluginModuleCache(descriptor.rootDirectory);

  const executionState = {
    stage: 'bootstrap',
  };
  const runtimeProfile = createSupervisorRuntimeProfile(descriptor);
  const runtime = createSupervisorCommandRuntime(runtimeProfile, pluginSdk);
  const app = createSupervisorCommandApp(pluginSdk, runtime);
  const manifest = loadPluginManifest(descriptor.manifestPath);
  const pluginModule = await loadPluginModule(descriptor.entryPath);
  const pluginConstructor = pluginModule?.default ?? pluginModule;

  if (typeof pluginConstructor !== 'function') {
    throw new Error(`Plugin "${descriptor.pluginId}" does not export a default plugin class.`);
  }

  const instance = new pluginConstructor(app, manifest);

  if (!(instance instanceof pluginSdk.Plugin)) {
    throw new Error(`Plugin "${descriptor.pluginId}" must extend the host Plugin base class.`);
  }

  const load = resolvePluginMethod(instance, PLUGIN_INTERNAL_LOAD, PLUGIN_INTERNAL_LOAD);
  const enable = resolvePluginMethod(instance, PLUGIN_INTERNAL_ENABLE, PLUGIN_INTERNAL_ENABLE);
  const unload = resolvePluginMethod(instance, PLUGIN_INTERNAL_UNLOAD, PLUGIN_INTERNAL_UNLOAD);
  const fail = resolvePluginMethod(instance, PLUGIN_INTERNAL_FAIL, PLUGIN_INTERNAL_FAIL);

  if (load === null || enable === null || unload === null) {
    throw new Error(`Plugin "${descriptor.pluginId}" is missing internal lifecycle handlers.`);
  }

  try {
    executionState.stage = 'load';
    await load.call(instance);
    executionState.stage = 'enable';
    await enable.call(instance);
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor runtime bootstrap.`);
    const fallbackToMain = descriptorRuntimeOwner === 'supervisor'
      ? false
      : canFallbackToMainForStage(executionState.stage);

    try {
      await unload.call(instance);
    } catch (unloadError) {
      emitNonFatalError(
        unloadError instanceof Error
          ? unloadError.message
          : `Plugin "${descriptor.pluginId}" failed while cleaning up bootstrap failure.`,
      );
    }

    if (!fallbackToMain && fail !== null) {
      try {
        await fail.call(instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so bootstrap cleanup can continue.
      }
    }

    if (!probeOwnership && descriptorRuntimeOwner === 'supervisor') {
      setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
      emitNonFatalError(normalizedError.message);
    } else {
      setPluginRuntimeState(descriptor.pluginId, 'idle', null, 'main');
    }

    return {
      record: null,
      fallbackToMain,
      owner: descriptorRuntimeOwner,
    };
  }

  const owner = descriptorRuntimeOwner === 'supervisor'
    ? 'supervisor'
    : resolveSupervisorRuntimeOwner(runtimeProfile);

  const record = {
    pluginId: descriptor.pluginId,
    descriptorKey,
    instance,
    runtime,
    unload,
    fail,
    owner,
    commandSnapshots: runtimeProfile.commandSnapshots,
    settingTabSnapshots: runtimeProfile.settingTabSnapshots,
    viewSnapshots: runtimeProfile.viewSnapshots,
    resourceExplorerItemSnapshots: runtimeProfile.resourceExplorerItemSnapshots,
    extensionSnapshots: runtimeProfile.extensionSnapshots,
    protocolSnapshots: runtimeProfile.protocolSnapshots,
    uiEntrySnapshots: runtimeProfile.uiEntrySnapshots,
    uiEntryHandlers: runtimeProfile.uiEntryHandlers,
  };
  loadedPluginRuntimes.set(descriptor.pluginId, record);

  if (owner === 'supervisor') {
    commitSupervisorOwnedCommands(record);
    commitSupervisorOwnedSettingTabs(record);
    commitSupervisorOwnedViews(record);
    commitSupervisorOwnedResourceExplorerItems(record);
    commitSupervisorOwnedExtensions(record);
    commitSupervisorOwnedProtocols(record);
    commitSupervisorOwnedUiEntries(record);
    setPluginRuntimeState(descriptor.pluginId, 'enabled', null, 'supervisor');
  } else {
    setPluginRuntimeState(descriptor.pluginId, 'idle', null, 'main');
  }

  return {
    record,
    fallbackToMain: false,
    owner,
  };
}

async function executePluginCommandInSupervisorRuntime(descriptor, commandId) {
  if (typeof descriptor?.entryPath !== 'string' || descriptor.entryPath.trim().length === 0) {
    return {
      handled: false,
      result: null,
      fallbackToMain: true,
    };
  }

  try {
    await refreshLocalStorageCache();
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${descriptor.pluginId}" failed to refresh localStorage cache.`,
    );
  }

  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
      result: null,
      fallbackToMain: loadResult.fallbackToMain,
    };
  }

  try {
    await loadResult.record.runtime.app.workspace.refreshSnapshot();
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${descriptor.pluginId}" failed to refresh workspace snapshot.`,
    );
  }

  const executionState = {
    stage: 'dispatch',
  };

  try {
    return await loadResult.record.runtime.commands.executeSimpleCommand(commandId, executionState);
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor command execution.`);
    const fallbackToMain = canFallbackToMainForStage(executionState.stage);

    if (!fallbackToMain && loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (!fallbackToMain) {
      if (loadResult.record.owner === 'supervisor') {
        setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
      }
      emitNonFatalError(normalizedError.message);
      await unloadLoadedPluginRuntime(loadResult.record, 'command-failure');
    }

    return {
      handled: false,
      result: null,
      fallbackToMain,
    };
  }
}

async function executePluginProtocolInSupervisorRuntime(descriptor, protocolData) {
  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
      fallbackToMain: loadResult.fallbackToMain,
    };
  }

  const executionState = {
    stage: 'protocol-dispatch',
  };

  try {
    return await loadResult.record.runtime.protocols.dispatchProtocol(protocolData, executionState);
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor protocol execution.`);
    const fallbackToMain = canFallbackToMainForStage(executionState.stage);

    if (!fallbackToMain && loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (!fallbackToMain) {
      if (loadResult.record.owner === 'supervisor') {
        setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
      }
      emitNonFatalError(normalizedError.message);
      await unloadLoadedPluginRuntime(loadResult.record, 'protocol-failure');
    }

    return {
      handled: false,
      fallbackToMain,
    };
  }
}

async function executePluginBasesViewInSupervisorRuntime(descriptor, pluginId, viewId) {
  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
      snapshot: null,
      fallbackToMain: loadResult.fallbackToMain,
    };
  }

  const executionState = {
    stage: 'bases-view-dispatch',
  };

  try {
    return await loadResult.record.runtime.bases.renderRegisteredView(pluginId, viewId, executionState);
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor bases view rendering.`);
    const fallbackToMain = canFallbackToMainForStage(executionState.stage);

    if (!fallbackToMain && loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (!fallbackToMain) {
      if (loadResult.record.owner === 'supervisor') {
        setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
      }
      emitNonFatalError(normalizedError.message);
      await unloadLoadedPluginRuntime(loadResult.record, 'bases-view-failure');
    }

    return {
      handled: false,
      snapshot: null,
      fallbackToMain,
    };
  }
}

async function executePluginUiEntryInSupervisorRuntime(entryId) {
  const registeredEntry = supervisorOwnedUiEntryHandlers.get(entryId) ?? null;

  if (registeredEntry === null) {
    return {
      handled: false,
    };
  }

  const descriptor = descriptorRegistry.get(registeredEntry.pluginId) ?? null;

  if (descriptor === null || descriptor.entryPath === null) {
    return {
      handled: false,
    };
  }

  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
    };
  }

  const activeEntry = supervisorOwnedUiEntryHandlers.get(entryId) ?? null;

  if (activeEntry === null) {
    return {
      handled: false,
    };
  }

  try {
    await activeEntry.execute();
    return {
      handled: true,
    };
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${activeEntry.pluginId}" failed during supervisor UI entry execution.`);

    if (loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (loadResult.record.owner === 'supervisor') {
      setPluginRuntimeState(activeEntry.pluginId, 'failed', normalizedError.message, 'supervisor');
    }

    emitNonFatalError(normalizedError.message);
    await unloadLoadedPluginRuntime(loadResult.record, 'ui-entry-failure');

    return {
      handled: false,
    };
  }
}

function normalizeSupervisorViewState(state) {
  if (state === null || Array.isArray(state) || typeof state !== 'object') {
    return {};
  }

  return cloneJsonValue(state);
}

async function openPluginViewInSupervisorRuntime(descriptor, leafId, viewType, pendingViewInstanceId = null) {
  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
      snapshot: null,
    };
  }

  const normalizedLeafId = normalizeString(leafId).trim();
  const normalizedViewType = normalizeString(viewType).trim();
  const pendingManualViewInstance = consumePendingManualViewInstance(
    pendingViewInstanceId,
    normalizedViewType,
  );
  const executionState = {
    stage: 'view-open-dispatch',
  };

  try {
    if (pendingManualViewInstance !== null) {
      loadResult.record.runtime.app.workspace.registerLeafReference(
        pendingManualViewInstance.leaf,
        normalizedLeafId,
      );
    }

    await loadResult.record.runtime.app.workspace.refreshSnapshot();
    const leaf = loadResult.record.runtime.app.workspace.getLeafById(normalizedLeafId);
    const creator = loadResult.record.runtime.views.getRegisteredViewCreator(normalizedViewType);

    if (leaf === null || (pendingManualViewInstance === null && typeof creator !== 'function')) {
      return {
        handled: false,
        snapshot: null,
      };
    }

    executionState.stage = 'view-close-previous';
    await closeLoadedViewInstance(normalizedLeafId);
    const view = pendingManualViewInstance?.view ?? creator(leaf);
    leaf.view = view;

    try {
      executionState.stage = 'view-load';
      await invokeComponentLifecycle(view, COMPONENT_INTERNAL_LOAD, 'onload');
    } catch (error) {
      leaf.clearRuntimeViewInstance();
      throw error;
    }

    const snapshot = createSupervisorViewInstanceSnapshot(normalizedLeafId, view);
    leaf.setRuntimeViewInstance(view, snapshot);
    loadedViewInstances.set(normalizedLeafId, {
      pluginId: loadResult.record.pluginId,
      leaf,
      view,
      viewType: normalizedViewType,
    });
    return {
      handled: true,
      snapshot,
    };
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor view open.`);

    if (loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (loadResult.record.owner === 'supervisor') {
      setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
    }

    emitNonFatalError(normalizedError.message);
    await unloadLoadedPluginRuntime(loadResult.record, 'view-open-failure');
    return {
      handled: false,
      snapshot: null,
    };
  }
}

async function updatePluginViewInSupervisorRuntime(descriptor, leafId, viewType, state) {
  const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);

  if (loadResult.record === null) {
    return {
      handled: false,
      snapshot: null,
    };
  }

  const normalizedLeafId = normalizeString(leafId).trim();
  const normalizedViewType = normalizeString(viewType).trim();
  const normalizedState = normalizeSupervisorViewState(state);

  try {
    let activeViewEntry = loadedViewInstances.get(normalizedLeafId) ?? null;

    if (activeViewEntry === null || activeViewEntry.viewType !== normalizedViewType) {
      const openResult = await openPluginViewInSupervisorRuntime(descriptor, normalizedLeafId, normalizedViewType);

      if (!openResult.handled) {
        return openResult;
      }

      activeViewEntry = loadedViewInstances.get(normalizedLeafId) ?? null;
    }

    if (activeViewEntry === null) {
      return {
        handled: false,
        snapshot: null,
      };
    }

    await activeViewEntry.view.setState(normalizedState, { history: true });
    const snapshot = createSupervisorViewInstanceSnapshot(normalizedLeafId, activeViewEntry.view);
    activeViewEntry.leaf.applyViewInstanceSnapshot(snapshot);
    return {
      handled: true,
      snapshot,
    };
  } catch (error) {
    const normalizedError = error instanceof Error
      ? error
      : new Error(`Plugin "${descriptor.pluginId}" failed during supervisor view update.`);

    if (loadResult.record.fail !== null) {
      try {
        await loadResult.record.fail.call(loadResult.record.instance, normalizedError);
      } catch {
        // Ignore plugin failure handler errors so failed instances can still be torn down.
      }
    }

    if (loadResult.record.owner === 'supervisor') {
      setPluginRuntimeState(descriptor.pluginId, 'failed', normalizedError.message, 'supervisor');
    }

    emitNonFatalError(normalizedError.message);
    await unloadLoadedPluginRuntime(loadResult.record, 'view-update-failure');
    return {
      handled: false,
      snapshot: null,
    };
  }
}

async function resizePluginViewInSupervisorRuntime(leafId) {
  const normalizedLeafId = normalizeString(leafId).trim();
  const activeViewEntry = loadedViewInstances.get(normalizedLeafId) ?? null;

  if (activeViewEntry === null) {
    return {
      handled: false,
      snapshot: null,
    };
  }

  activeViewEntry.view.onResize();
  const snapshot = createSupervisorViewInstanceSnapshot(normalizedLeafId, activeViewEntry.view);
  activeViewEntry.leaf.applyViewInstanceSnapshot(snapshot);
  return {
    handled: true,
    snapshot,
  };
}

async function closePluginViewInSupervisorRuntime(leafId) {
  return {
    handled: await closeLoadedViewInstance(leafId),
  };
}

function publishCommands() {
  sendMessage({
    type: 'commands-updated',
    data: {
      commands: getPublishedCommands(),
    },
  });
}

function createHostRequestId(prefix) {
  nextHostRequestId += 1;
  return `plugin-supervisor-host:${prefix}:${nextHostRequestId}`;
}

function requestHost(request) {
  const requestId = createHostRequestId(request.kind);

  return new Promise((resolve, reject) => {
    pendingHostRequests.set(requestId, {
      resolve,
      reject,
    });

    sendMessage({
      type: 'host-request',
      data: {
        requestId,
        request,
      },
    });
  });
}

function resolveHostResponse(requestId, payload) {
  const pendingRequest = pendingHostRequests.get(requestId);

  if (pendingRequest === undefined) {
    return;
  }

  pendingHostRequests.delete(requestId);
  pendingRequest.resolve(payload);
}

function rejectHostResponse(requestId, message) {
  const pendingRequest = pendingHostRequests.get(requestId);

  if (pendingRequest === undefined) {
    return;
  }

  pendingHostRequests.delete(requestId);
  pendingRequest.reject(new Error(message));
}

function installHostUiBridge() {
  globalThis.__wstudioPluginHostUiBridge = {
    showNotice(payload) {
      void requestHost({
        kind: 'ui:show-notice',
        message: normalizeString(payload?.message),
        level: normalizeNoticeLevel(payload?.level),
        duration: typeof payload?.duration === 'number' ? payload.duration : undefined,
      }).catch((error) => {
        const message = error instanceof Error
          ? error.message
          : 'Plugin supervisor failed to forward notice to the host.';

        sendMessage({
          type: 'error',
          data: {
            message,
            fatal: false,
          },
        });
      });
    },
    openModal() {
      throw new Error('Plugin supervisor host UI bridge does not support modal execution yet.');
    },
    closeModal() {
      return undefined;
    },
    openPopover() {
      throw new Error('Plugin supervisor host UI bridge does not support popover execution yet.');
    },
    updatePopover() {
      return undefined;
    },
    closePopover() {
      return undefined;
    },
    openMenu() {
      throw new Error('Plugin supervisor host UI bridge does not support menu execution yet.');
    },
    closeMenu() {
      return undefined;
    },
  };
}

async function handleInitialize(message) {
  const hostAppPath = normalizeString(message?.data?.hostAppPath);

  if (hostAppPath.length === 0) {
    sendMessage({
      type: 'error',
      data: {
        message: 'Plugin supervisor initialize request is missing hostAppPath.',
        fatal: false,
      },
    });
  }

  try {
    installHeadlessDomGlobals();
    installHostUiBridge();

    const workspaceResponse = await requestHost({
      kind: 'workspace:get-dir',
    });
    supervisorWorkspaceDir = workspaceResponse.kind === 'workspace:get-dir'
      ? normalizeString(workspaceResponse.directory).trim()
      : '';

    const appearanceResponse = await requestHost({
      kind: 'app:is-dark-mode',
    });

    hostIsDarkMode = appearanceResponse.kind === 'app:is-dark-mode'
      ? appearanceResponse.isDarkMode
      : null;
    await refreshLocalStorageCache();
  } catch (error) {
    sendMessage({
      type: 'error',
      data: {
        message: error instanceof Error
          ? error.message
          : 'Plugin supervisor failed to load host appearance state.',
        fatal: false,
      },
    });
  }

  sendMessage({
    type: 'ready',
    data: {
      startedAt,
    },
  });
  publishCommands();
  publishSettingTabs();
  publishViews();
  publishExtensions();
  publishUiEntries();
  publishRuntimeStates();
}

function handlePing(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const sentAt = typeof message?.data?.sentAt === 'number' ? message.data.sentAt : Date.now();

  sendMessage({
    type: 'pong',
    data: {
      requestId,
      sentAt,
      receivedAt: Date.now(),
    },
  });
}

async function handleSyncDescriptors(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const descriptors = Array.isArray(message?.data?.descriptors) ? message.data.descriptors : [];

  await unloadStalePluginRuntimes(descriptors);

  descriptorRegistry.clear();

  for (const descriptor of descriptors) {
    if (
      descriptor
      && typeof descriptor === 'object'
      && typeof descriptor.pluginId === 'string'
      && descriptor.pluginId.trim().length > 0
    ) {
      descriptorRegistry.set(descriptor.pluginId, descriptor);
    }
  }

  syncDescriptorRuntimeStates(descriptors);

  sendMessage({
    type: 'sync-complete',
    data: {
      requestId,
      pluginCount: descriptorRegistry.size,
    },
  });
  publishCommands();
}

async function handleStartPlugin(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const pluginId = normalizeString(message?.data?.pluginId).trim();
  const descriptor = pluginId.length === 0
    ? null
    : descriptorRegistry.get(pluginId) ?? null;

  let handled = false;

  if (descriptor !== null && shouldLoadPluginInSupervisor(descriptor)) {
    try {
      const loadResult = await ensureSupervisorPluginRuntimeLoaded(descriptor);
      handled = loadResult.record !== null;
    } catch (error) {
      emitNonFatalError(
        error instanceof Error
          ? error.message
          : `Plugin "${pluginId}" failed during supervisor activation.`,
      );
    }
  }

  sendMessage({
    type: 'plugin-started',
    data: {
      requestId,
      handled,
    },
  });
}

function handleSyncCommands(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const commands = Array.isArray(message?.data?.commands) ? message.data.commands : [];

  hostSyncedCommands.clear();

  for (const command of commands) {
    if (
      command !== null
      && typeof command === 'object'
      && typeof command.pluginId === 'string'
      && command.pluginId.trim().length > 0
      && typeof command.commandId === 'string'
      && command.commandId.trim().length > 0
      && typeof command.title === 'string'
      && command.title.trim().length > 0
    ) {
      hostSyncedCommands.set(`${command.pluginId}:${command.commandId}`, {
        pluginId: command.pluginId,
        commandId: command.commandId,
        title: command.title,
        category: typeof command.category === 'string' ? command.category : null,
        icon: typeof command.icon === 'string' ? command.icon : null,
      });
    }
  }

  sendMessage({
    type: 'commands-sync-complete',
    data: {
      requestId,
      commandCount: hostSyncedCommands.size,
    },
  });
  publishCommands();
}

async function handleExecuteCommand(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const commandId = normalizeString(message?.data?.commandId);
  const args = Array.isArray(message?.data?.args) ? message.data.args : [];
  const command = resolveRegisteredCommand(commandId);

  void args;

  if (command === null) {
    sendMessage({
      type: 'command-executed',
      data: {
        requestId,
        handled: false,
        result: null,
        fallbackToMain: true,
      },
    });
    return;
  }

  const descriptor = descriptorRegistry.get(command.pluginId) ?? null;

  if (descriptor === null || descriptor.entryPath === null) {
    sendMessage({
      type: 'command-executed',
      data: {
        requestId,
        handled: false,
        result: null,
        fallbackToMain: true,
      },
    });
    return;
  }

  let result = {
    handled: false,
    result: null,
    fallbackToMain: true,
  };

  try {
    result = await executePluginCommandInSupervisorRuntime(descriptor, command.commandId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${command.pluginId}" failed during supervisor command execution.`,
    );
  }

  sendMessage({
    type: 'command-executed',
    data: {
      requestId,
      handled: result.handled,
      result: result.result,
      fallbackToMain: result.fallbackToMain,
    },
  });
}

async function handleExecuteProtocol(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const protocolData = message?.data?.protocolData ?? null;
  const action = normalizeString(protocolData?.action).trim();
  const registeredProtocol = resolveRegisteredProtocol(action);

  if (registeredProtocol === null) {
    sendMessage({
      type: 'protocol-executed',
      data: {
        requestId,
        handled: false,
        fallbackToMain: true,
      },
    });
    return;
  }

  const descriptor = descriptorRegistry.get(registeredProtocol.pluginId) ?? null;

  if (descriptor === null || descriptor.entryPath === null) {
    sendMessage({
      type: 'protocol-executed',
      data: {
        requestId,
        handled: false,
        fallbackToMain: true,
      },
    });
    return;
  }

  let result = {
    handled: false,
    fallbackToMain: true,
  };

  try {
    result = await executePluginProtocolInSupervisorRuntime(descriptor, protocolData);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${registeredProtocol.pluginId}" failed during supervisor protocol execution.`,
    );
  }

  sendMessage({
    type: 'protocol-executed',
    data: {
      requestId,
      handled: result.handled,
      fallbackToMain: result.fallbackToMain,
    },
  });
}

async function handleExecuteBasesView(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const pluginId = normalizeString(message?.data?.pluginId);
  const viewId = normalizeString(message?.data?.viewId).trim();
  const descriptor = descriptorRegistry.get(pluginId) ?? null;

  if (pluginId.length === 0 || viewId.length === 0 || descriptor === null || descriptor.entryPath === null) {
    sendMessage({
      type: 'bases-view-rendered',
      data: {
        requestId,
        handled: false,
        snapshot: null,
        fallbackToMain: true,
      },
    });
    return;
  }

  let result = {
    handled: false,
    snapshot: null,
    fallbackToMain: true,
  };

  try {
    result = await executePluginBasesViewInSupervisorRuntime(descriptor, pluginId, viewId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin "${pluginId}" failed during supervisor bases view rendering.`,
    );
  }

  sendMessage({
    type: 'bases-view-rendered',
    data: {
      requestId,
      handled: result.handled,
      snapshot: result.snapshot,
      fallbackToMain: result.fallbackToMain,
    },
  });
}

async function handleExecuteUiEntry(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const entryId = normalizeString(message?.data?.entryId);

  if (entryId.trim().length === 0) {
    sendMessage({
      type: 'ui-entry-executed',
      data: {
        requestId,
        handled: false,
      },
    });
    return;
  }

  let result = {
    handled: false,
  };

  try {
    result = await executePluginUiEntryInSupervisorRuntime(entryId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin UI entry "${entryId}" failed during supervisor execution.`,
    );
  }

  sendMessage({
    type: 'ui-entry-executed',
    data: {
      requestId,
      handled: result.handled,
    },
  });
}

async function handleOpenViewInstance(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const leafId = normalizeString(message?.data?.leafId);
  const viewType = normalizeString(message?.data?.viewType);
  const pendingViewInstanceId = normalizeString(message?.data?.pendingViewInstanceId);
  const descriptor = resolveDescriptorForViewType(viewType);

  let result = {
    handled: false,
    snapshot: null,
  };

  if (descriptor !== null) {
    try {
      result = await openPluginViewInSupervisorRuntime(
        descriptor,
        leafId,
        viewType,
        pendingViewInstanceId,
      );
    } catch (error) {
      emitNonFatalError(
        error instanceof Error
          ? error.message
          : `Plugin view "${viewType}" failed during supervisor open.`,
      );
    }
  }

  sendMessage({
    type: 'view-instance-opened',
    data: {
      requestId,
      handled: result.handled,
      snapshot: result.snapshot,
    },
  });
}

async function handleUpdateViewInstance(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const leafId = normalizeString(message?.data?.leafId);
  const viewType = normalizeString(message?.data?.viewType);
  const descriptor = resolveDescriptorForViewType(viewType);

  let result = {
    handled: false,
    snapshot: null,
  };

  if (descriptor !== null) {
    try {
      result = await updatePluginViewInSupervisorRuntime(
        descriptor,
        leafId,
        viewType,
        message?.data?.state ?? null,
      );
    } catch (error) {
      emitNonFatalError(
        error instanceof Error
          ? error.message
          : `Plugin view "${viewType}" failed during supervisor update.`,
      );
    }
  }

  sendMessage({
    type: 'view-instance-updated',
    data: {
      requestId,
      handled: result.handled,
      snapshot: result.snapshot,
    },
  });
}

async function handleResizeViewInstance(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const leafId = normalizeString(message?.data?.leafId);
  let result = {
    handled: false,
    snapshot: null,
  };

  try {
    result = await resizePluginViewInSupervisorRuntime(leafId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin view for leaf "${leafId}" failed during supervisor resize.`,
    );
  }

  sendMessage({
    type: 'view-instance-resized',
    data: {
      requestId,
      handled: result.handled,
      snapshot: result.snapshot,
    },
  });
}

async function handleCloseViewInstance(message) {
  const requestId = normalizeString(message?.data?.requestId);
  const leafId = normalizeString(message?.data?.leafId);
  let result = {
    handled: false,
  };

  try {
    result = await closePluginViewInSupervisorRuntime(leafId);
  } catch (error) {
    emitNonFatalError(
      error instanceof Error
        ? error.message
        : `Plugin view for leaf "${leafId}" failed during supervisor close.`,
    );
  }

  sendMessage({
    type: 'view-instance-closed',
    data: {
      requestId,
      handled: result.handled,
    },
  });
}

async function handleShutdown(message) {
  const requestId = normalizeString(message?.data?.requestId);

  await shutdownLoadedPluginRuntimes();

  sendMessage({
    type: 'shutdown-complete',
    data: {
      requestId,
    },
  });

  process.exit(0);
}

async function handleMessage(message) {
  if (message === null || typeof message !== 'object' || typeof message.type !== 'string') {
    sendMessage({
      type: 'error',
      data: {
        message: 'Plugin supervisor received an invalid message.',
        fatal: false,
      },
    });
    return;
  }

  switch (message.type) {
    case 'initialize':
      await handleInitialize(message);
      return;
    case 'ping':
      handlePing(message);
      return;
    case 'sync-descriptors':
      await handleSyncDescriptors(message);
      return;
    case 'start-plugin':
      await handleStartPlugin(message);
      return;
    case 'sync-commands':
      handleSyncCommands(message);
      return;
    case 'shutdown':
      await handleShutdown(message);
      return;
    case 'execute-command':
      await handleExecuteCommand(message);
      return;
    case 'execute-protocol':
      await handleExecuteProtocol(message);
      return;
    case 'execute-bases-view':
      await handleExecuteBasesView(message);
      return;
    case 'execute-ui-entry':
      await handleExecuteUiEntry(message);
      return;
    case 'open-view-instance':
      await handleOpenViewInstance(message);
      return;
    case 'update-view-instance':
      await handleUpdateViewInstance(message);
      return;
    case 'resize-view-instance':
      await handleResizeViewInstance(message);
      return;
    case 'close-view-instance':
      await handleCloseViewInstance(message);
      return;
    case 'host-response':
      resolveHostResponse(
        normalizeString(message?.data?.requestId),
        message?.data?.response ?? null,
      );
      return;
    case 'host-response-error':
      rejectHostResponse(
        normalizeString(message?.data?.requestId),
        normalizeString(message?.data?.message, 'Plugin supervisor host request failed.'),
      );
      return;
    default:
      sendMessage({
        type: 'error',
        data: {
          message: `Plugin supervisor received an unsupported message type: ${message.type}`,
          fatal: false,
        },
      });
  }
}

process.parentPort.on('message', (event) => {
  void handleMessage(event.data);
});

sendMessage({
  type: 'started',
});
