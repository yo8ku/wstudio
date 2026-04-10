/**
 * Smoke test for the external-facing WStudio sample plugin starter.
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

function createFakeApp(manifest) {
  const appState = {
    commandMap: new Map(),
    savedData: null,
    settingTabs: [],
    ribbonIcons: [],
    ribbonIconCallbacks: [],
    statusItems: [],
    registeredViews: 0,
    registeredExtensions: 0,
    markdownProcessors: 0,
    intervalHandles: [],
    clearedIntervalHandles: [],
  };

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
        appState.registeredExtensions += 1;
        return createDisposable(() => {
          appState.registeredExtensions -= 1;
        });
      },
    },
    hover: {
      registerHoverLinkSource() {
        return createDisposable(() => undefined);
      },
    },
    markdown: {
      registerPostProcessor() {
        appState.markdownProcessors += 1;
        return createDisposable(() => {
          appState.markdownProcessors -= 1;
        });
      },
      registerCodeBlockProcessor() {
        appState.markdownProcessors += 1;
        return createDisposable(() => {
          appState.markdownProcessors -= 1;
        });
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
          settingTab,
          containerEl,
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
        appState.registeredViews += 1;
        return createDisposable(() => {
          appState.registeredViews -= 1;
        });
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
    manifest,
  };
}

async function main() {
  assert.ok(fs.existsSync(sampleEntryPath), 'Sample plugin entry is missing.');
  assert.ok(fs.existsSync(sampleManifestPath), 'Sample plugin manifest is missing.');

  const manifest = JSON.parse(fs.readFileSync(sampleManifestPath, 'utf8'));
  const samplePluginModule = loadSamplePluginModule();
  const capturedLogs = [];
  const originalConsoleLog = console.log;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const originalDocumentAddEventListener = document.addEventListener.bind(document);
  const originalDocumentRemoveEventListener = document.removeEventListener.bind(document);
  const documentClickListeners = new Set();

  console.log = (...args) => {
    capturedLogs.push(args.map((arg) => String(arg)).join(' '));
  };

  assert.equal(typeof samplePluginModule.default, 'function', 'Sample plugin must export a default class.');
  assert.ok(
    samplePluginModule.default.prototype instanceof pluginSdk.Plugin,
    'Sample plugin default export must extend the SDK Plugin base class.',
  );

  const { app, appState } = createFakeApp(manifest);

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
    assert.equal(appState.registeredViews, 0, 'Sample plugin should not register custom views.');
    assert.equal(appState.registeredExtensions, 0, 'Sample plugin should not register view extensions.');
    assert.equal(appState.markdownProcessors, 0, 'Sample plugin should not register markdown processors.');
    assert.equal(appState.intervalHandles.length, 1, 'Sample plugin should register one global interval.');

    const [registeredTab] = appState.settingTabs;
    registeredTab.settingTab.display();
    assert.ok(
      registeredTab.containerEl.textContent.includes('WStudio Plugin Sample'),
      'Setting tab display should render plugin title.',
    );
    assert.ok(
      registeredTab.containerEl.textContent.includes('Ribbon Notice Message'),
      'Setting tab display should render the sample setting option.',
    );

    await appState.ribbonIconCallbacks[0]();
    assert.ok(document.body.children.length > 0, 'Ribbon icon click should add DOM content to the body.');
    assert.ok(
      document.body.textContent.includes('Sample ribbon icon clicked.'),
      'Ribbon icon click should show the configured notice message.',
    );

    await plugin.updateRibbonNoticeMessage('Updated notice from smoke test.');
    assert.equal(
      appState.savedData.ribbonNoticeMessage,
      'Updated notice from smoke test.',
      'Updating the sample setting should persist the new notice message.',
    );

    const bodyChildCountBeforeModal = document.body.children.length;
    await appState.commandMap.get('open-simple-modal').callback();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    assert.equal(
      document.body.children.length,
      bodyChildCountBeforeModal + 1,
      'Modal command should append a modal container to the document body.',
    );
    const modalOverlay = document.body.children[document.body.children.length - 1];
    assert.ok(
      modalOverlay.textContent.includes('Simple Modal'),
      'Modal command should render the modal title.',
    );
    assert.ok(
      modalOverlay.textContent.includes('Updated notice from smoke test.'),
      'Modal content should reflect the persisted ribbon notice message.',
    );
    assert.ok(
      modalOverlay.textContent.includes('This modal is rendered by React.'),
      'Modal content should be rendered by the built-in React starter.',
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
  }

  console.log('wstudio-plugin-sample smoke test passed');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
