/**
 * Smoke test for the external-facing WStudio sample plugin starter.
 * The starter is runtime-only for rich UI surfaces.
 */

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const projectRoot = path.resolve(__dirname, '../..');
const sampleRoot = path.resolve(projectRoot, '..', 'wstudio-sample-plugin');
const sampleEntryPath = path.join(sampleRoot, 'main.js');
const sampleManifestPath = path.join(sampleRoot, 'manifest.json');
const sampleSettingsRuntimePath = path.join(sampleRoot, 'settings.runtime.js');
const sampleModalRuntimePath = path.join(sampleRoot, 'modal.runtime.js');
const pluginSdkEntryPath = path.join(projectRoot, 'packages', 'plugin', 'src', 'index.ts');
const runtimeSymbolsPath = path.join(projectRoot, 'packages', 'plugin', 'src', 'internal', 'runtime.ts');
const domShimPath = path.join(
  projectRoot,
  'packages',
  'main',
  'src',
  'services',
  'plugin-host',
  'MainProcessDomShim.ts',
);

const {
  PLUGIN_INTERNAL_ENABLE,
  PLUGIN_INTERNAL_GET_SNAPSHOT,
  PLUGIN_INTERNAL_LOAD,
  PLUGIN_INTERNAL_UNLOAD,
  SETTING_TAB_INTERNAL_ATTACH,
} = require(runtimeSymbolsPath);
const { installMainProcessDomShim } = require(domShimPath);
const pluginSdk = require(pluginSdkEntryPath);

installMainProcessDomShim();

function createDisposable(callback) {
  return {
    dispose() {
      callback();
    },
  };
}

function createManagedElement(tagName) {
  const element = document.createElement(tagName);
  element.dispose = () => {
    element.remove();
  };
  return element;
}

function loadSamplePluginModule() {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@note-studio/plugin' || request === 'wstudio-api') {
      return pluginSdk;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[sampleEntryPath];
    return require(sampleEntryPath);
  } finally {
    Module._load = originalLoad;
  }
}

function createFakeApp() {
  const appState = {
    bridgeNotices: [],
    closedModalIds: [],
    commandMap: new Map(),
    intervalHandles: [],
    clearedIntervalHandles: [],
    openedModals: [],
    ribbonIcons: [],
    ribbonIconCallbacks: [],
    savedData: null,
    settingTabs: [],
    statusItems: [],
  };

  const hostBridge = {
    showNotice(payload) {
      appState.bridgeNotices.push(payload);
    },
    openModal(payload) {
      const modalId = `modal-${appState.openedModals.length + 1}`;
      appState.openedModals.push({
        id: modalId,
        payload,
      });
      return modalId;
    },
    closeModal(modalId) {
      appState.closedModalIds.push(modalId);
      const openedModal = appState.openedModals.find((modal) => modal.id === modalId);
      openedModal?.payload.onClose?.();
    },
    openPopover() {
      return 'popover-1';
    },
    updatePopover() {
      return undefined;
    },
    closePopover() {
      return undefined;
    },
    openMenu() {
      return 'menu-1';
    },
    closeMenu() {
      return undefined;
    },
  };

  globalThis.__wstudioPluginHostUiBridge = hostBridge;

  const runtime = {
    bases: {
      registerBasesView() {
        return null;
      },
    },
    commands: {
      registerCommand(_pluginId, command) {
        appState.commandMap.set(command.id, command);
        return createDisposable(() => {
          appState.commandMap.delete(command.id);
        });
      },
      removeCommand(commandId) {
        appState.commandMap.delete(commandId);
      },
      executeCommand(commandId) {
        const command = appState.commandMap.get(commandId);

        if (command === undefined || typeof command.callback !== 'function') {
          throw new Error(`Command "${commandId}" is not registered.`);
        }

        return command.callback();
      },
    },
    data: {
      loadData() {
        return Promise.resolve(appState.savedData);
      },
      saveData(_pluginId, data) {
        appState.savedData = data;
        return Promise.resolve();
      },
    },
    editors: {
      registerEditorExtension() {
        return createDisposable(() => undefined);
      },
      registerEditorSuggest() {
        return createDisposable(() => undefined);
      },
    },
    extensions: {
      registerExtensions() {
        return createDisposable(() => undefined);
      },
    },
    hover: {
      registerHoverLinkSource() {
        return createDisposable(() => undefined);
      },
    },
    markdown: {
      registerPostProcessor() {
        return createDisposable(() => undefined);
      },
      registerCodeBlockProcessor() {
        return createDisposable(() => undefined);
      },
    },
    protocols: {
      registerAppProtocolHandler() {
        return createDisposable(() => undefined);
      },
    },
    settings: {
      registerSettingTab(_pluginId, settingTab) {
        const containerEl = document.createElement('div');
        settingTab[SETTING_TAB_INTERNAL_ATTACH](containerEl);
        appState.settingTabs.push({
          containerEl,
          settingTab,
        });
        return createDisposable(() => {
          void settingTab.hide();
        });
      },
    },
    ui: {
      addRibbonIcon(_pluginId, spec) {
        const ribbonIcon = createManagedElement('button');
        ribbonIcon.title = spec.title;
        ribbonIcon.dataset.icon = spec.icon;
        ribbonIcon.addEventListener('click', spec.onClick);
        appState.ribbonIcons.push(ribbonIcon);
        appState.ribbonIconCallbacks.push(spec.onClick);
        return ribbonIcon;
      },
      createStatusBarItem() {
        const statusBarItem = createManagedElement('div');
        appState.statusItems.push(statusBarItem);
        return statusBarItem;
      },
    },
    views: {
      registerView() {
        return createDisposable(() => undefined);
      },
    },
  };

  const app = {
    __pluginRuntime: runtime,
    workspace: {},
    vault: {},
    metadataCache: {},
    fileManager: {},
    keymap: {},
    scope: new pluginSdk.Scope(),
    lastEvent: null,
    renderContext: null,
    loadLocalStorage() {
      return null;
    },
    saveLocalStorage() {
      return undefined;
    },
  };

  return {
    app,
    appState,
  };
}

async function main() {
  assert.ok(fs.existsSync(sampleEntryPath), 'Sample plugin entry is missing.');
  assert.ok(fs.existsSync(sampleManifestPath), 'Sample plugin manifest is missing.');
  assert.ok(fs.existsSync(sampleSettingsRuntimePath), 'Sample settings runtime entry is missing.');
  assert.ok(fs.existsSync(sampleModalRuntimePath), 'Sample modal runtime entry is missing.');

  const manifest = JSON.parse(fs.readFileSync(sampleManifestPath, 'utf8'));
  assert.equal(
    manifest.ui?.settings,
    './settings.runtime.js',
    'Sample plugin should declare ui.settings runtime entry.',
  );
  assert.equal(
    manifest.ui?.modals?.['sample-simple-modal'],
    './modal.runtime.js',
    'Sample plugin should declare ui.modals.sample-simple-modal runtime entry.',
  );

  const samplePluginModule = loadSamplePluginModule();
  const capturedLogs = [];
  const originalConsoleLog = console.log;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalDocumentAddEventListener = document.addEventListener.bind(document);
  const originalDocumentRemoveEventListener = document.removeEventListener.bind(document);
  const originalHostBridge = globalThis.__wstudioPluginHostUiBridge;
  const documentClickListeners = new Set();

  console.log = (...args) => {
    capturedLogs.push(args.map((arg) => String(arg)).join(' '));
  };

  assert.equal(typeof samplePluginModule.default, 'function', 'Sample plugin must export a default class.');
  assert.ok(
    samplePluginModule.default.prototype instanceof pluginSdk.Plugin,
    'Sample plugin default export must extend the SDK Plugin base class.',
  );

  const { app, appState } = createFakeApp();

  global.setInterval = (callback, timeout, ...args) => {
    const handle = {
      id: appState.intervalHandles.length + 1,
      timeout,
      callback,
      args,
    };
    appState.intervalHandles.push(handle);
    return handle;
  };

  global.clearInterval = (handle) => {
    appState.clearedIntervalHandles.push(handle);
  };

  document.addEventListener = (type, listener, options) => {
    if (type === 'click') {
      documentClickListeners.add(listener);
    }

    return originalDocumentAddEventListener(type, listener, options);
  };

  document.removeEventListener = (type, listener, options) => {
    if (type === 'click') {
      documentClickListeners.delete(listener);
    }

    return originalDocumentRemoveEventListener(type, listener, options);
  };

  try {
    const plugin = new samplePluginModule.default(app, manifest);

    await plugin[PLUGIN_INTERNAL_LOAD]();
    await plugin[PLUGIN_INTERNAL_ENABLE]();

    assert.equal(appState.commandMap.size, 1, 'Sample plugin should register one command.');
    assert.equal(appState.settingTabs.length, 1, 'Sample plugin should register one setting tab.');
    assert.equal(appState.ribbonIcons.length, 1, 'Sample plugin should create one ribbon icon.');
    assert.equal(appState.statusItems.length, 0, 'Sample plugin should not create status bar items.');
    assert.equal(appState.intervalHandles.length, 1, 'Sample plugin should register one global interval.');

    const [registeredTab] = appState.settingTabs;
    registeredTab.settingTab.display();
    assert.equal(
      registeredTab.containerEl.childNodes.length,
      0,
      'Sample setting tab shell should not render legacy DOM content.',
    );

    await appState.ribbonIconCallbacks[0]();
    assert.equal(
      appState.bridgeNotices.at(-1)?.message,
      'Sample ribbon icon clicked.',
      'Ribbon icon click should show the configured host notice message.',
    );

    await plugin.updateRibbonNoticeMessage('Updated notice from smoke test.');
    assert.equal(
      appState.savedData.ribbonNoticeMessage,
      'Updated notice from smoke test.',
      'Updating the sample setting should persist the new notice message.',
    );

    await appState.ribbonIconCallbacks[0]();
    assert.equal(
      appState.bridgeNotices.at(-1)?.message,
      'Updated notice from smoke test.',
      'Ribbon icon should use the persisted runtime-only notice message.',
    );

    await appState.commandMap.get('open-simple-modal').callback();
    assert.equal(appState.openedModals.length, 1, 'Modal command should open one runtime modal.');
    assert.equal(
      appState.openedModals[0].payload.surfaceId,
      'sample-simple-modal',
      'Modal command should open the declared runtime modal surface.',
    );
    assert.equal(
      appState.openedModals[0].payload.title,
      'Simple Modal',
      'Modal command should keep the expected modal title.',
    );

    for (const listener of documentClickListeners) {
      if (typeof listener === 'function') {
        listener(new Event('click'));
        continue;
      }

      if (typeof listener.handleEvent === 'function') {
        listener.handleEvent(new Event('click'));
      }
    }

    assert.ok(capturedLogs.includes('click'), 'Global click event should log "click".');

    appState.intervalHandles[0].callback(...appState.intervalHandles[0].args);
    assert.ok(capturedLogs.includes('setInterval'), 'Global interval should log "setInterval".');

    const snapshotAfterEnable = plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]();
    assert.equal(snapshotAfterEnable.state, 'enabled', 'Plugin should be enabled after lifecycle execution.');

    await plugin[PLUGIN_INTERNAL_UNLOAD]();
    assert.equal(appState.clearedIntervalHandles.length, 1, 'Plugin unload should clear the global interval.');

    const snapshotAfterUnload = plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]();
    assert.equal(snapshotAfterUnload.state, 'unloaded', 'Plugin should unload cleanly.');
  } finally {
    console.log = originalConsoleLog;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    document.addEventListener = originalDocumentAddEventListener;
    document.removeEventListener = originalDocumentRemoveEventListener;
    globalThis.__wstudioPluginHostUiBridge = originalHostBridge;
  }

  console.log('wstudio-plugin-sample smoke test passed');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
