/**
 * Runtime smoke test for the executable @note-studio/plugin API surface.
 *
 * This complements:
 * - plugin:api:audit        -> public surface compatibility against Obsidian
 * - plugin:sample:smoke     -> end-to-end starter plugin integration
 *
 * The goal here is to exercise concrete runtime exports and the core Plugin
 * host contract, not just verify that the names exist.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

require('ts-node/register/transpile-only');

const projectRoot = path.resolve(__dirname, '../..');
const pluginSdkEntryPath = path.join(projectRoot, 'packages', 'plugin', 'src', 'index.ts');
const runtimeSymbolsPath = path.join(
  projectRoot,
  'packages',
  'plugin',
  'src',
  'internal',
  'runtime.ts',
);
const domShimPath = path.join(
  projectRoot,
  'packages',
  'main',
  'src',
  'services',
  'plugin-host',
  'MainProcessDomShim.ts',
);

const { installMainProcessDomShim } = require(domShimPath);
const pluginSdk = require(pluginSdkEntryPath);
const {
  COMPONENT_INTERNAL_ADD_CHILD,
  COMPONENT_INTERNAL_LOAD,
  COMPONENT_INTERNAL_REMOVE_CHILD,
  COMPONENT_INTERNAL_UNLOAD,
  PLUGIN_INTERNAL_DISABLE,
  PLUGIN_INTERNAL_ENABLE,
  PLUGIN_INTERNAL_GET_SNAPSHOT,
  PLUGIN_INTERNAL_LOAD,
  PLUGIN_INTERNAL_UNLOAD,
  SETTING_TAB_INTERNAL_ATTACH,
} = require(runtimeSymbolsPath);

installMainProcessDomShim();

let passed = 0;
let failed = 0;

function flushMicrotasks() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

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

function dispatchHostEvent(target, type, extra = {}) {
  return target.dispatchEvent({
    type,
    currentTarget: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...extra,
  });
}

function resetDocumentBody() {
  document.body.replaceChildren();
}

function arrayBufferToText(buffer) {
  return new TextDecoder().decode(buffer);
}

function textToArrayBuffer(text) {
  return new TextEncoder().encode(text).buffer;
}

async function runTest(name, callback) {
  try {
    resetDocumentBody();
    await callback();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
}

async function withHttpServer(handler, callback) {
  const server = http.createServer(handler);

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Failed to determine local server address.');
  }

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

class TraceComponent extends pluginSdk.Component {
  constructor(log, label) {
    super();
    this.log = log;
    this.label = label;
  }

  onload() {
    this.log.push(`${this.label}:load`);
  }

  onunload() {
    this.log.push(`${this.label}:unload`);
  }
}

class CoverageSettingTab extends pluginSdk.PluginSettingTab {
  display() {
    this.containerEl.replaceChildren();
    const headingEl = document.createElement('h2');
    headingEl.textContent = 'Coverage Settings';
    this.containerEl.append(headingEl);
    new pluginSdk.Setting(this.containerEl)
      .setName('Coverage Toggle')
      .setDesc('Runtime smoke test setting')
      .addToggle((toggle) => {
        toggle.setValue(true);
      });
  }
}

class CoverageEditorSuggest extends pluginSdk.EditorSuggest {
  constructor(app) {
    super(app);
  }

  renderSuggestion(value, el) {
    el.textContent = value;
  }

  selectSuggestion(value) {
    this.lastSelected = value;
  }

  onTrigger(cursor, editor, file) {
    void editor;
    void file;
    return {
      start: cursor,
      end: cursor,
      query: 'coverage',
    };
  }

  getSuggestions() {
    return ['coverage-suggestion'];
  }
}

class CoverageInputSuggest extends pluginSdk.AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
  }

  renderSuggestion(value, el) {
    el.textContent = value;
  }

  getSuggestions(query) {
    if (query.trim().length === 0) {
      return [];
    }

    return ['alpha', 'beta'].filter((value) => value.includes(query.toLowerCase()));
  }
}

class CoverageFuzzySuggestModal extends pluginSdk.FuzzySuggestModal {
  constructor(app) {
    super(app);
    this.selected = null;
  }

  getItems() {
    return ['Alpha', 'Beta', 'Gamma'];
  }

  getItemText(item) {
    return item;
  }

  onChooseItem(item) {
    this.selected = item;
  }
}

class CoverageItemView extends pluginSdk.ItemView {
  getViewType() {
    return 'coverage-item-view';
  }

  getDisplayText() {
    return 'Coverage Item View';
  }
}

class CoverageBasesView extends pluginSdk.BasesView {
  constructor(controller, containerEl) {
    super(controller, containerEl);
    this.type = 'coverage-bases-view';
  }

  onDataUpdated() {
    this.containerEl.dataset.updated = 'true';
  }
}

class ApiCoveragePlugin extends pluginSdk.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.commandExecutions = [];
    this.protocolActions = [];
    this.enableCount = 0;
    this.disableCount = 0;
    this.failureContext = null;
    this.loadedData = null;
    this.ribbonClicks = 0;
  }

  async onload() {
    this.addRibbonIcon(
      'beaker',
      'Coverage Ribbon',
      () => {
        this.ribbonClicks += 1;
      },
      { location: 'titleBar' },
    );

    this.addRibbonIcon(
      'flask',
      'Coverage Status Entry',
      () => {
        this.ribbonClicks += 1;
      },
      { location: 'statusBar' },
    );

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('coverage-ready');
    statusBarItem.hide();
    statusBarItem.show();

    this.addCommand({
      id: 'coverage.command.keep',
      name: 'Keep Coverage Command',
      callback: () => {
        this.commandExecutions.push('keep');
      },
    });

    this.addCommand({
      id: 'coverage.command.remove',
      name: 'Remove Coverage Command',
      callback: () => {
        this.commandExecutions.push('remove');
      },
    });

    this.removeCommand('coverage.command.remove');

    this.addSettingTab(new CoverageSettingTab(this.app, this));

    this.registerView('coverage-view', (leaf) => new CoverageItemView(leaf));
    this.registerHoverLinkSource('coverage-hover', {
      display: 'Coverage Hover',
      defaultMod: false,
    });
    this.registerHoverPreviewSource('coverage-preview', {
      display: 'Coverage Preview',
      defaultMod: true,
    });
    this.registerExtensions(['.coverage'], 'coverage-view');
    this.registerBasesView('coverage-bases', {
      name: 'Coverage Bases',
      icon: 'database',
      factory: (controller, containerEl) => new CoverageBasesView(controller, containerEl),
    });
    this.registerMarkdownPostProcessor((el) => {
      el.dataset.coverage = 'post-processed';
    }, 10);
    this.registerMarkdownCodeBlockProcessor('coverage', async () => undefined, 20);
    this.registerEditorExtension({ id: 'coverage-editor-extension' });
    this.registerEditorSuggest(new CoverageEditorSuggest(this.app));
    this.registerAppProtocolHandler('coverage', () => {
      this.protocolActions.push('coverage');
    });
    this.registerObsidianProtocolHandler('legacy', () => {
      this.protocolActions.push('legacy');
    });

    this.loadedData = await this.loadData();
    await this.saveData({
      saved: true,
      from: 'coverage-plugin',
    });
  }

  onunload() {
    return undefined;
  }

  onEnable() {
    this.enableCount += 1;
  }

  onDisable() {
    this.disableCount += 1;
  }

  onFailed(failure) {
    this.failureContext = failure;
  }
}

class FailingCoveragePlugin extends pluginSdk.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.failureContext = null;
  }

  onload() {
    return undefined;
  }

  onunload() {
    return undefined;
  }

  onEnable() {
    throw new Error('Coverage plugin enable failure');
  }

  onDisable() {
    return undefined;
  }

  onFailed(failure) {
    this.failureContext = failure;
  }
}

function createPluginRuntimeFixture(initialData = null) {
  const appState = {
    basesRegistrations: new Map(),
    commandMap: new Map(),
    editorExtensions: [],
    editorSuggests: [],
    extensionRegistrations: [],
    hoverSources: [],
    markdownCodeBlockRegistrations: [],
    markdownPostProcessorRegistrations: [],
    protocolHandlers: [],
    removedCommands: [],
    ribbonEntries: [],
    savedData: initialData,
    settingTabs: [],
    statusItems: [],
    views: [],
  };

  const runtime = {
    bases: {
      registerBasesView(pluginId, viewId, registration) {
        appState.basesRegistrations.set(`${pluginId}:${viewId}`, registration);
        return createDisposable(() => {
          appState.basesRegistrations.delete(`${pluginId}:${viewId}`);
        });
      },
    },
    commands: {
      registerCommand(pluginId, command) {
        appState.commandMap.set(command.id, {
          pluginId,
          command,
        });
        return createDisposable(() => {
          appState.commandMap.delete(command.id);
        });
      },
      removeCommand(commandId) {
        appState.removedCommands.push(commandId);
        appState.commandMap.delete(commandId);
      },
      async executeCommand(commandId) {
        const record = appState.commandMap.get(commandId);

        if (record === undefined || typeof record.command.callback !== 'function') {
          throw new Error(`Command "${commandId}" is not registered.`);
        }

        await record.command.callback();
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
      deleteData() {
        appState.savedData = null;
        return Promise.resolve();
      },
    },
    editors: {
      registerEditorExtension(pluginId, extension) {
        const record = {
          pluginId,
          extension,
        };
        appState.editorExtensions.push(record);
        return createDisposable(() => {
          const index = appState.editorExtensions.indexOf(record);

          if (index !== -1) {
            appState.editorExtensions.splice(index, 1);
          }
        });
      },
      registerEditorSuggest(pluginId, editorSuggest) {
        const record = {
          pluginId,
          editorSuggest,
        };
        appState.editorSuggests.push(record);
        return createDisposable(() => {
          const index = appState.editorSuggests.indexOf(record);

          if (index !== -1) {
            appState.editorSuggests.splice(index, 1);
          }
        });
      },
    },
    extensions: {
      registerExtensions(pluginId, extensions, viewType) {
        const record = {
          pluginId,
          extensions,
          viewType,
        };
        appState.extensionRegistrations.push(record);
        return createDisposable(() => {
          const index = appState.extensionRegistrations.indexOf(record);

          if (index !== -1) {
            appState.extensionRegistrations.splice(index, 1);
          }
        });
      },
    },
    hover: {
      registerHoverLinkSource(pluginId, id, source) {
        const record = {
          pluginId,
          id,
          source,
        };
        appState.hoverSources.push(record);
        return createDisposable(() => {
          const index = appState.hoverSources.indexOf(record);

          if (index !== -1) {
            appState.hoverSources.splice(index, 1);
          }
        });
      },
    },
    markdown: {
      registerPostProcessor(pluginId, postProcessor) {
        const record = {
          pluginId,
          postProcessor,
        };
        appState.markdownPostProcessorRegistrations.push(record);
        return createDisposable(() => {
          const index = appState.markdownPostProcessorRegistrations.indexOf(record);

          if (index !== -1) {
            appState.markdownPostProcessorRegistrations.splice(index, 1);
          }
        });
      },
      registerCodeBlockProcessor(pluginId, language, handler, postProcessor) {
        const record = {
          pluginId,
          language,
          handler,
          postProcessor,
        };
        appState.markdownCodeBlockRegistrations.push(record);
        return createDisposable(() => {
          const index = appState.markdownCodeBlockRegistrations.indexOf(record);

          if (index !== -1) {
            appState.markdownCodeBlockRegistrations.splice(index, 1);
          }
        });
      },
    },
    protocols: {
      registerAppProtocolHandler(pluginId, action, handler) {
        const record = {
          pluginId,
          action,
          handler,
        };
        appState.protocolHandlers.push(record);
        return createDisposable(() => {
          const index = appState.protocolHandlers.indexOf(record);

          if (index !== -1) {
            appState.protocolHandlers.splice(index, 1);
          }
        });
      },
    },
    settings: {
      registerSettingTab(pluginId, settingTab) {
        const containerEl = document.createElement('div');
        settingTab[SETTING_TAB_INTERNAL_ATTACH](containerEl);
        const record = {
          pluginId,
          settingTab,
          containerEl,
        };
        appState.settingTabs.push(record);
        return createDisposable(() => {
          const index = appState.settingTabs.indexOf(record);

          if (index !== -1) {
            appState.settingTabs.splice(index, 1);
          }

          void settingTab.hide();
        });
      },
    },
    ui: {
      addRibbonIcon(pluginId, spec) {
        const ribbonEl = createManagedElement('button');
        ribbonEl.title = spec.title;
        ribbonEl.dataset.pluginId = pluginId;
        ribbonEl.dataset.icon = spec.icon;
        ribbonEl.dataset.location = spec.location ?? 'activityBar';
        ribbonEl.addEventListener('click', spec.onClick);
        const record = {
          pluginId,
          spec,
          ribbonEl,
        };
        appState.ribbonEntries.push(record);
        return Object.assign(ribbonEl, {
          dispose() {
            const index = appState.ribbonEntries.indexOf(record);

            if (index !== -1) {
              appState.ribbonEntries.splice(index, 1);
            }

            ribbonEl.remove();
          },
        });
      },
      createStatusBarItem(pluginId) {
        const statusEl = createManagedElement('div');
        statusEl.dataset.pluginId = pluginId;
        const statusItem = Object.assign(statusEl, {
          setText(text) {
            statusEl.textContent = text;
          },
          show() {
            statusEl.hidden = false;
          },
          hide() {
            statusEl.hidden = true;
          },
          dispose() {
            const index = appState.statusItems.indexOf(statusItem);

            if (index !== -1) {
              appState.statusItems.splice(index, 1);
            }

            statusEl.remove();
          },
        });
        appState.statusItems.push(statusItem);
        return statusItem;
      },
    },
    views: {
      registerView(pluginId, type, viewCreator) {
        const record = {
          pluginId,
          type,
          viewCreator,
        };
        appState.views.push(record);
        return createDisposable(() => {
          const index = appState.views.indexOf(record);

          if (index !== -1) {
            appState.views.splice(index, 1);
          }
        });
      },
    },
  };

  const app = {
    __pluginRuntime: runtime,
    fileManager: {},
    keymap: new pluginSdk.Keymap(),
    lastEvent: null,
    loadLocalStorage() {
      return null;
    },
    metadataCache: {},
    renderContext: new pluginSdk.RenderContext(),
    saveLocalStorage() {
      return undefined;
    },
    scope: new pluginSdk.Scope(),
    vault: {},
    workspace: {},
  };

  return {
    app,
    appState,
  };
}

async function runComponentTests() {
  await runTest('Component 生命周期、子组件和销毁注册', async () => {
    const log = [];
    const parent = new TraceComponent(log, 'parent');
    const child = new TraceComponent(log, 'child');
    let disposed = 0;

    parent.register(() => {
      disposed += 1;
    });

    await parent[COMPONENT_INTERNAL_LOAD]();
    assert.deepEqual(log, ['parent:load']);

    await parent[COMPONENT_INTERNAL_ADD_CHILD](child);
    assert.deepEqual(log, ['parent:load', 'child:load']);

    await parent[COMPONENT_INTERNAL_REMOVE_CHILD](child);
    assert.deepEqual(log, ['parent:load', 'child:load', 'child:unload']);

    await parent[COMPONENT_INTERNAL_ADD_CHILD](child);
    assert.deepEqual(log, ['parent:load', 'child:load', 'child:unload', 'child:load']);

    await parent[COMPONENT_INTERNAL_UNLOAD]();
    assert.deepEqual(log, [
      'parent:load',
      'child:load',
      'child:unload',
      'child:load',
      'child:unload',
      'parent:unload',
    ]);
    assert.equal(disposed, 1);
  });
}

async function runEventsAndKeymapTests() {
  await runTest('Events 事件注册、触发与释放', async () => {
    const events = new pluginSdk.Events();
    const received = [];
    const callback = (...args) => {
      received.push(args.join(':'));
    };

    const ref = events.on('coverage', callback);
    events.trigger('coverage', 'alpha', 1);
    events.tryTrigger(ref, ['beta', 2]);
    events.off('coverage', callback);
    events.trigger('coverage', 'gamma');
    ref.dispose();

    assert.deepEqual(received, ['alpha:1', 'beta:2']);
  });

  await runTest('Keymap 与 Scope 静态行为', async () => {
    const keymap = new pluginSdk.Keymap();
    const parentScope = new pluginSdk.Scope();
    const childScope = new pluginSdk.Scope(parentScope);
    const handler = childScope.register(['Ctrl', 'Shift'], 'P', () => undefined);

    keymap.pushScope(childScope);
    keymap.popScope(childScope);
    childScope.unregister(handler);

    assert.equal(pluginSdk.Keymap.isModifier({ ctrlKey: true }, 'Ctrl'), true);
    assert.equal(
      pluginSdk.Keymap.isModEvent({ ctrlKey: true, altKey: true, shiftKey: false }),
      'split',
    );
    assert.equal(
      pluginSdk.Keymap.isModEvent({ ctrlKey: true, altKey: false, shiftKey: false }),
      'tab',
    );
  });
}

async function runUiAndMenuTests() {
  await runTest('图标注册与 Tooltip 辅助函数', async () => {
    const target = document.createElement('div');
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';

    pluginSdk.addIcon('coverage-icon', svgContent);
    assert.ok(pluginSdk.getIconIds().includes('coverage-icon'));

    const icon = pluginSdk.getIcon('coverage-icon');

    if (icon !== null) {
      pluginSdk.setIcon(target, 'coverage-icon');
      assert.ok(target.childNodes.length > 0);
    }

    pluginSdk.setTooltip(target, 'Coverage tooltip', {
      placement: 'right',
    });
    assert.equal(target.title, 'Coverage tooltip');
    assert.equal(target.dataset.nsTooltipPlacement, 'right');

    pluginSdk.displayTooltip(target, 'Displayed tooltip');
    assert.equal(target.dataset.nsTooltip, 'Displayed tooltip');

    pluginSdk.removeIcon('coverage-icon');
    assert.equal(pluginSdk.getIcon('coverage-icon'), null);
  });

  await runTest('Menu/MenuItem 行为', async () => {
    const menu = new pluginSdk.Menu();
    let triggered = 0;
    let hidden = 0;
    let itemRef = null;

    menu
      .setNoIcon()
      .setUseNativeMenu(true)
      .addItem((item) => {
        itemRef = item
          .setTitle('Coverage Menu Item')
          .setIcon('beaker')
          .setChecked(true)
          .setWarning(true)
          .setSection('coverage')
          .onClick(() => {
            triggered += 1;
          });
      })
      .addSeparator()
      .showAtPosition({ x: 10, y: 20 })
      .showAtMouseEvent({});

    menu.onHide(() => {
      hidden += 1;
    });

    assert.ok(itemRef !== null);
    itemRef.trigger({});
    itemRef.setDisabled(true);
    itemRef.trigger({});
    menu.hide();
    menu.close();

    assert.equal(triggered, 1);
    assert.equal(hidden, 2);
    assert.ok(pluginSdk.Menu.forEvent({}) instanceof pluginSdk.Menu);
  });
}

async function runNoticeAndModalTests() {
  await runTest('Notice DOM 回退与宿主桥接', async () => {
    const fallbackNotice = new pluginSdk.Notice('Fallback notice', 0);
    assert.ok(document.body.textContent.includes('Fallback notice'));
    fallbackNotice.hide();
    assert.equal(document.body.textContent.includes('Fallback notice'), false);

    const capturedNotices = [];
    globalThis.__wstudioPluginHostUiBridge = {
      showNotice(payload) {
        capturedNotices.push(payload);
      },
      openModal() {
        return undefined;
      },
      closeModal() {
        return undefined;
      },
    };

    const bridgedNotice = new pluginSdk.Notice('Bridged notice', 0);
    bridgedNotice.hide();

    delete globalThis.__wstudioPluginHostUiBridge;

    assert.deepEqual(capturedNotices, [
      {
        message: 'Bridged notice',
        level: 'info',
      },
    ]);
  });

  await runTest('Modal DOM 模式与宿主桥接模式', async () => {
    const app = {
      scope: new pluginSdk.Scope(),
    };

    class TestModal extends pluginSdk.Modal {
      constructor(modalApp) {
        super(modalApp);
        this.openedCount = 0;
        this.closedCount = 0;
      }

      onOpen() {
        this.openedCount += 1;
      }

      onClose() {
        this.closedCount += 1;
      }
    }

    const domModal = new TestModal(app);
    domModal.setTitle('DOM Modal').setContent('DOM content');
    domModal.open();
    assert.ok(document.body.textContent.includes('DOM content'));
    domModal.close();
    assert.equal(domModal.openedCount, 1);
    assert.equal(domModal.closedCount, 1);

    const bridgedPayloads = [];
    let closed = 0;

    globalThis.__wstudioPluginHostUiBridge = {
      showNotice() {
        return undefined;
      },
      openModal(payload) {
        bridgedPayloads.push(payload);
      },
      closeModal() {
        closed += 1;
      },
    };

    const bridgedModal = new TestModal(app);
    bridgedModal.setTitle('Bridge Modal').setContent('Bridge content');
    bridgedModal.open();
    await flushMicrotasks();
    bridgedModal.close();
    delete globalThis.__wstudioPluginHostUiBridge;

    assert.equal(bridgedModal.openedCount, 1);
    assert.equal(bridgedModal.closedCount, 1);
    assert.equal(closed, 1);
    assert.deepEqual(bridgedPayloads, [
      {
        title: 'Bridge Modal',
        description: 'Bridge content',
      },
    ]);
  });
}

async function runSettingsAndControlsTests() {
  await runTest('Setting 与控制组件组合', async () => {
    const containerEl = document.createElement('div');
    const setting = new pluginSdk.Setting(containerEl)
      .setName('Coverage Setting')
      .setDesc('Exercises controls')
      .setClass('coverage-setting')
      .setTooltip('Coverage tooltip')
      .setHeading();

    let buttonClicks = 0;
    let extraButtonClicks = 0;
    let toggleChanges = 0;
    let textChanges = 0;
    let dropdownChanges = 0;
    let sliderChanges = 0;

    setting.addText((component) => {
      component
        .setPlaceholder('Type here')
        .onChange(() => {
          textChanges += 1;
        });
      component.inputEl.value = 'Hello';
      dispatchHostEvent(component.inputEl, 'input');
    });

    setting.addSearch((component) => {
      component.setValue('Coverage');
      component.clearButtonEl.click();
      assert.equal(component.getValue(), '');
    });

    setting.addTextArea((component) => {
      component.setValue('Line 1');
    });

    setting.addMomentFormat((component) => {
      component.setDefaultFormat('YYYY-MM-DD');
      component.setValue('2026-04-03');
      assert.equal(component.sampleEl.textContent, '2026-04-03');
    });

    setting.addDropdown((component) => {
      component
        .addOptions({
          one: 'One',
          two: 'Two',
        })
        .onChange(() => {
          dropdownChanges += 1;
        });
      component.selectEl.value = 'two';
      dispatchHostEvent(component.selectEl, 'change');
    });

    setting.addToggle((component) => {
      component
        .setTooltip('Toggle')
        .onChange(() => {
          toggleChanges += 1;
        });
      component.onClick();
      assert.equal(component.getValue(), true);
    });

    setting.addColorPicker((component) => {
      component.setValueRgb({
        r: 10,
        g: 20,
        b: 30,
      });
      const rgb = component.getValueRgb();
      assert.deepEqual(rgb, {
        r: 10,
        g: 20,
        b: 30,
      });
      component.setValueHsl({
        h: 200,
        s: 50,
        l: 50,
      });
      assert.ok(component.getValue().startsWith('#'));
    });

    setting.addProgressBar((component) => {
      component.setValue(110);
      assert.equal(component.getValue(), 100);
    });

    setting.addSlider((component) => {
      component
        .setLimits(0, 10, 1)
        .setInstant(true)
        .setDynamicTooltip()
        .onChange(() => {
          sliderChanges += 1;
        });
      component.sliderEl.value = '7';
      dispatchHostEvent(component.sliderEl, 'input');
      dispatchHostEvent(component.sliderEl, 'change');
      assert.equal(component.sliderEl.title, '7');
    });

    setting.addButton((component) => {
      component
        .setCta()
        .setIcon('sparkles')
        .setButtonText('Run')
        .onClick(() => {
          buttonClicks += 1;
        });
      component.buttonEl.click();
    });

    setting.addExtraButton((component) => {
      component
        .setIcon('settings')
        .onClick(() => {
          extraButtonClicks += 1;
        });
      component.extraSettingsEl.click();
    });

    setting.setDisabled(true);

    assert.ok(containerEl.textContent.includes('Coverage Setting'));
    assert.equal(setting.settingEl.getAttribute('aria-disabled'), 'true');
    assert.equal(textChanges, 1);
    assert.equal(dropdownChanges, 1);
    assert.equal(toggleChanges, 1);
    assert.ok(sliderChanges >= 1);
    assert.equal(buttonClicks, 1);
    assert.equal(extraButtonClicks, 1);

    setting.clear();
    assert.equal(setting.components.length, 0);
  });

  await runTest('SettingTab attach/display/hide', async () => {
    class TestSettingTab extends pluginSdk.SettingTab {
      display() {
        this.containerEl.replaceChildren();
        const contentEl = document.createElement('div');
        contentEl.textContent = 'Attached setting tab';
        this.containerEl.append(contentEl);
      }
    }

    const tab = new TestSettingTab({
      scope: new pluginSdk.Scope(),
    });
    const containerEl = document.createElement('div');

    tab[SETTING_TAB_INTERNAL_ATTACH](containerEl);
    tab.display();
    assert.ok(containerEl.textContent.includes('Attached setting tab'));

    await tab.hide();
    assert.equal(containerEl.childNodes.length, 0);
  });
}

async function runSuggestAndViewTests() {
  await runTest('AbstractInputSuggest 建议列表交互', async () => {
    const app = {
      scope: new pluginSdk.Scope(),
    };
    const inputEl = document.createElement('input');
    const suggest = new CoverageInputSuggest(app, inputEl);
    let selectedValue = '';

    suggest.onSelect((value) => {
      selectedValue = value;
    });

    inputEl.value = 'a';
    dispatchHostEvent(inputEl, 'input');
    await flushMicrotasks();

    assert.ok(document.body.contains(suggest.containerEl));
    assert.ok(suggest.suggestionsEl.textContent.includes('alpha'));

    const firstSuggestionEl = suggest.suggestionsEl.children[0];
    assert.ok(firstSuggestionEl !== undefined && firstSuggestionEl !== null);
    firstSuggestionEl.click();
    assert.equal(selectedValue, 'alpha');
    assert.equal(document.body.contains(suggest.containerEl), false);
  });

  await runTest('FuzzySuggestModal 基础交互', async () => {
    const app = {
      scope: new pluginSdk.Scope(),
    };
    const modal = new CoverageFuzzySuggestModal(app);

    modal.open();
    modal.inputEl.value = 'alp';
    dispatchHostEvent(modal.inputEl, 'input');
    await flushMicrotasks();

    assert.ok(modal.resultContainerEl.textContent.includes('Alpha'));

    const firstResultEl = modal.resultContainerEl.children[0];
    assert.ok(firstResultEl !== undefined && firstResultEl !== null);
    firstResultEl.click();
    assert.equal(modal.selected, 'Alpha');
    assert.equal(document.body.contains(modal.containerEl), false);
  });

  await runTest('View / ItemView / HoverPopover', async () => {
    const containerEl = document.createElement('div');
    const leaf = {
      app: {
        scope: new pluginSdk.Scope(),
      },
      containerEl,
    };
    const view = new CoverageItemView(leaf);
    let actionClicks = 0;

    const actionEl = view.addAction('beaker', 'Coverage Action', () => {
      actionClicks += 1;
    });

    actionEl.click();
    assert.equal(actionClicks, 1);
    assert.equal(view.getViewState().type, 'coverage-item-view');

    const renderContext = new pluginSdk.RenderContext();
    const hoverPopover = new pluginSdk.HoverPopover(renderContext, null, 50, {
      x: 1,
      y: 2,
    });

    await hoverPopover[COMPONENT_INTERNAL_LOAD]();
    document.body.append(hoverPopover.hoverEl);
    await hoverPopover[COMPONENT_INTERNAL_UNLOAD]();
    assert.equal(document.body.contains(hoverPopover.hoverEl), false);
  });
}

async function runPlatformTests() {
  await runTest('platform 工具函数与请求辅助', async () => {
    assert.equal(pluginSdk.normalizePath('folder\\\\child/../file.md'), 'folder/file.md');

    const base64 = pluginSdk.arrayBufferToBase64(textToArrayBuffer('coverage'));
    assert.equal(arrayBufferToText(pluginSdk.base64ToArrayBuffer(base64)), 'coverage');

    const hex = pluginSdk.arrayBufferToHex(textToArrayBuffer('A'));
    assert.equal(arrayBufferToText(pluginSdk.hexToArrayBuffer(hex)), 'A');

    assert.deepEqual(pluginSdk.parseLinktext('note/path#Heading'), {
      path: 'note/path',
      subpath: '#Heading',
    });
    assert.equal(pluginSdk.getLinkpath('note/path#Heading'), 'note/path');
    assert.equal(pluginSdk.stripHeading('## Coverage'), 'Coverage');
    assert.equal(pluginSdk.stripHeadingForLink('## Coverage: Test!'), 'coverage test');

    const frontMatterInfo = pluginSdk.getFrontMatterInfo('---\naliases:\n  - One\n  - Two\ntags: a, b\n---\nBody');
    assert.equal(frontMatterInfo.exists, true);
    assert.ok(frontMatterInfo.frontmatter.includes('aliases'));

    const parsedYaml = pluginSdk.parseYaml('aliases:\n  - One\n  - Two\ntags: a, b\ncount: 3');
    assert.deepEqual(parsedYaml, {
      aliases: ['One', 'Two'],
      tags: 'a, b',
      count: 3,
    });

    const yamlString = pluginSdk.stringifyYaml({
      aliases: ['One', 'Two'],
      enabled: true,
    });
    assert.ok(yamlString.includes('aliases:'));

    const frontmatter = {
      aliases: 'One',
      tags: ['a', 'b'],
    };
    assert.deepEqual(pluginSdk.parseFrontMatterAliases(frontmatter), ['One']);
    assert.deepEqual(pluginSdk.parseFrontMatterTags(frontmatter), ['a', 'b']);

    const metadata = {
      tags: [{ tag: '#inline' }],
      frontmatter: {
        tags: ['frontmatter'],
      },
      headings: [
        {
          heading: 'Coverage Heading',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 16, offset: 16 },
          },
        },
      ],
      blocks: [
        {
          id: 'block-id',
          position: {
            start: { line: 2, col: 0, offset: 20 },
            end: { line: 2, col: 10, offset: 30 },
          },
        },
      ],
      listItems: [],
      footnotes: [],
      links: [],
      embeds: [],
    };
    assert.deepEqual(pluginSdk.getAllTags(metadata), ['#inline', 'frontmatter']);
    assert.equal(pluginSdk.resolveSubpath(metadata, '#Coverage Heading').type, 'heading');
    assert.equal(pluginSdk.resolveSubpath(metadata, '#^block-id').type, 'block');

    const simpleSearch = pluginSdk.prepareSimpleSearch('cov');
    const simpleResult = simpleSearch('coverage api');
    assert.ok(simpleResult !== null);

    const fuzzySearch = pluginSdk.prepareFuzzySearch('cvg');
    const fuzzyResult = fuzzySearch('coverage');
    assert.ok(fuzzyResult !== null);

    const searchResults = [
      {
        item: 'low',
        match: {
          score: 1,
          matches: [],
        },
      },
      {
        item: 'high',
        match: {
          score: 10,
          matches: [],
        },
      },
    ];
    pluginSdk.sortSearchResults(searchResults);
    assert.equal(searchResults[0].item, 'high');

    const fragment = pluginSdk.sanitizeHTMLToDom('<h1>Coverage</h1><p><strong>API</strong></p>');
    assert.ok(fragment.textContent.includes('Coverage'));
    const markdown = pluginSdk.htmlToMarkdown(fragment);
    assert.ok(markdown.includes('# Coverage'));
    assert.ok(markdown.includes('**API**'));

    const matchesTarget = document.createElement('div');
    pluginSdk.renderMatches(matchesTarget, 'coverage', [[0, 4]]);
    assert.equal(matchesTarget.querySelectorAll('mark').length, 1);
    pluginSdk.renderResults(matchesTarget, 'coverage', {
      score: 1,
      matches: [[4, 8]],
    });
    assert.equal(matchesTarget.querySelectorAll('mark').length, 1);

    assert.equal(pluginSdk.requireApiVersion('1.0.0'), true);
    assert.equal(pluginSdk.requireApiVersion('9.0.0'), false);

    let debouncedValue = '';
    const debounced = pluginSdk.debounce((value) => {
      debouncedValue = value;
    }, 50);
    debounced('queued');
    debounced.run();
    assert.equal(debouncedValue, 'queued');
    debounced('cancelled');
    debounced.cancel();
    assert.equal(debouncedValue, 'queued');

    const moment = pluginSdk.moment('2026-04-03T00:00:00.000Z');
    assert.equal(pluginSdk.moment.isMoment(moment), true);
    assert.equal(pluginSdk.moment.unix(0).valueOf(), 0);
    assert.equal(pluginSdk.moment.duration(2, 'minutes').asMilliseconds(), 120000);
    assert.equal(typeof pluginSdk.Platform.isDesktop, 'boolean');

    globalThis.mermaid = {
      initialized: true,
    };
    globalThis.pdfjsLib = {
      loaded: true,
    };
    globalThis.Prism = {
      loaded: true,
    };
    assert.deepEqual(await pluginSdk.loadMermaid(), {
      initialized: true,
    });
    assert.deepEqual(await pluginSdk.loadPdfJs(), {
      loaded: true,
    });
    assert.deepEqual(await pluginSdk.loadPrism(), {
      loaded: true,
    });
    delete globalThis.mermaid;
    delete globalThis.pdfjsLib;
    delete globalThis.Prism;

    const mathInlineEl = pluginSdk.renderMath('x+y', false);
    const mathBlockEl = pluginSdk.renderMath('x+y', true);
    assert.equal(mathInlineEl.dataset.math, 'inline');
    assert.equal(mathBlockEl.dataset.math, 'block');
    await pluginSdk.finishRenderMath();

    await withHttpServer((request, response) => {
      if (request.url === '/json') {
        response.writeHead(200, {
          'content-type': 'application/json',
        });
        response.end(JSON.stringify({
          ok: true,
        }));
        return;
      }

      response.writeHead(500, {
        'content-type': 'text/plain',
      });
      response.end('error');
    }, async (baseUrl) => {
      const response = await pluginSdk.requestUrl({
        url: `${baseUrl}/json`,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.json, {
        ok: true,
      });
      assert.equal(await pluginSdk.request(`${baseUrl}/json`), '{"ok":true}');

      await assert.rejects(
        () => pluginSdk.requestUrl(`${baseUrl}/error`),
        /Request failed with status 500/,
      );
    });
  });
}

async function runVaultAndBasesTests() {
  await runTest('Vault / Adapter / 文件值对象', async () => {
    const adapter = new pluginSdk.FileSystemAdapter('workspace');

    await adapter.mkdir('notes');
    await adapter.write('notes/a.md', '# Coverage');
    await adapter.append('notes/a.md', '\nExtra');
    assert.equal(await adapter.exists('notes/a.md'), true);
    assert.equal(await adapter.read('notes/a.md'), '# Coverage\nExtra');
    assert.equal(arrayBufferToText(await adapter.readBinary('notes/a.md')), '# Coverage\nExtra');

    const stat = await adapter.stat('notes/a.md');
    assert.equal(stat.type, 'file');

    const processed = await adapter.process('notes/a.md', (value) => value.replace('Extra', 'Processed'));
    assert.equal(processed, '# Coverage\nProcessed');

    await adapter.copy('notes/a.md', 'notes/b.md');
    await adapter.rename('notes/b.md', 'notes/c.md');
    const listed = await adapter.list('notes');
    assert.deepEqual(listed.files.sort(), ['a.md', 'c.md']);
    assert.ok(adapter.getResourcePath('notes/a.md').includes('workspace/notes/a.md'));

    await adapter.remove('notes/c.md');
    assert.equal(await adapter.exists('notes/c.md'), false);
    await adapter.trashLocal('notes/a.md');
    assert.equal(await adapter.exists('notes/a.md'), false);
    await adapter.mkdir('notes/sub');
    await adapter.write('notes/sub/d.md', 'coverage');
    await adapter.rmdir('notes', true);
    assert.equal(await adapter.exists('notes/sub/d.md'), false);

    const fakeVault = {};
    const file = new pluginSdk.TFile(
      fakeVault,
      'folder/coverage.md',
      'coverage.md',
      {
        ctime: 1,
        mtime: 2,
        size: 3,
      },
      'coverage',
      'md',
      null,
    );
    const nestedFile = new pluginSdk.TFile(
      fakeVault,
      'folder/nested.md',
      'nested.md',
      {
        ctime: 1,
        mtime: 2,
        size: 3,
      },
      'nested',
      'md',
      null,
    );
    const nestedFolder = new pluginSdk.TFolder(fakeVault, 'folder/sub', 'sub', [nestedFile], null);
    const folder = new pluginSdk.TFolder(fakeVault, 'folder', 'folder', [file, nestedFolder], null);
    const traversed = [];
    pluginSdk.recurseChildren(folder, (entry) => {
      traversed.push(entry.path);
    });

    assert.deepEqual(traversed, ['folder/coverage.md', 'folder/sub', 'folder/nested.md']);
    assert.equal(folder.isRoot(), true);
  });

  await runTest('Bases 值对象与配置工具', async () => {
    assert.deepEqual(pluginSdk.parsePropertyId('note.title'), {
      type: 'note',
      name: 'title',
    });
    assert.equal(pluginSdk.parsePropertyId('invalid'), null);

    const fakeFile = {
      path: 'folder/coverage.md',
      basename: 'coverage',
      extension: 'md',
    };

    assert.equal(new pluginSdk.BooleanValue(true).isTruthy(), true);
    assert.equal(new pluginSdk.StringValue('Coverage').toString(), 'Coverage');
    assert.equal(new pluginSdk.NumberValue(3).toString(), '3');
    assert.equal(pluginSdk.DateValue.parseFromString('2026-04-03') !== null, true);
    assert.equal(pluginSdk.DurationValue.parseFromString('P1DT2H').getMilliseconds(), 93600000);
    assert.equal(new pluginSdk.FileValue(fakeFile).toString(), 'folder/coverage.md');
    assert.equal(pluginSdk.LinkValue.parseFromString({}, '[[Coverage]]', '').toString(), 'Coverage');
    assert.equal(new pluginSdk.ListValue(['a', 2]).length(), 2);
    assert.equal(new pluginSdk.ListValue(['Coverage']).includes(new pluginSdk.StringValue('coverage')), true);
    assert.equal(new pluginSdk.ObjectValue({ title: 'Coverage' }).get('title').toString(), 'Coverage');
    assert.equal(pluginSdk.NullValue.value.isTruthy(), false);
    assert.equal(new pluginSdk.TagValue('coverage').toString(), '#coverage');
    assert.equal(new pluginSdk.UrlValue('https://example.com').toString(), 'https://example.com');

    const queryController = new pluginSdk.QueryController({
      scope: new pluginSdk.Scope(),
    });
    const entry = new pluginSdk.BasesEntry(fakeFile, {
      'note.title': new pluginSdk.StringValue('Coverage'),
    });
    const group = new pluginSdk.BasesEntryGroup([entry], new pluginSdk.StringValue('coverage'));
    const result = new pluginSdk.BasesQueryResult([entry], ['note.title'], [group]);

    assert.equal(entry.getValue('note.title').toString(), 'Coverage');
    assert.equal(group.hasKey(), true);
    assert.equal(result.getSummaryValue(queryController, [entry], 'note.title', 'count').toString(), '1');

    const config = new pluginSdk.BasesViewConfig('Coverage View', {
      order: ['note.title'],
      sort: [
        {
          property: 'note.title',
          direction: 'ASC',
        },
      ],
      'displayName:note.title': 'Title',
    });
    assert.deepEqual(config.getOrder(), ['note.title']);
    assert.deepEqual(config.getSort(), [
      {
        property: 'note.title',
        direction: 'ASC',
      },
    ]);
    assert.equal(config.getDisplayName('note.title'), 'Title');

    const containerEl = document.createElement('div');
    const basesView = new CoverageBasesView(queryController, containerEl, config);
    await basesView.createFileForView('Coverage Note', (frontmatter) => {
      frontmatter.title = 'Coverage';
    });
    assert.equal(containerEl.dataset.lastCreatedFile, 'Coverage Note.md');
    assert.ok(containerEl.dataset.lastCreatedFrontmatter.includes('"title":"Coverage"'));
  });
}

async function runTasksTests() {
  await runTest('Tasks 聚合异步任务', async () => {
    const tasks = new pluginSdk.Tasks();
    const completed = [];

    tasks.add(async () => {
      completed.push('callback');
    });
    tasks.addPromise(Promise.resolve().then(() => {
      completed.push('promise');
    }));

    assert.equal(tasks.isEmpty(), false);
    await tasks.promise();
    assert.deepEqual(completed.sort(), ['callback', 'promise']);
  });
}

async function runPluginHostApiTests() {
  await runTest('Plugin 宿主 API 覆盖与生命周期', async () => {
    const manifest = {
      id: 'coverage-plugin',
      name: 'Coverage Plugin',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      description: 'Runtime smoke coverage plugin',
      author: 'Tests',
      engines: {
        wstudio: '1.0.0',
      },
    };
    const initialData = {
      seeded: true,
    };
    const { app, appState } = createPluginRuntimeFixture(initialData);
    const plugin = new ApiCoveragePlugin(app, manifest);

    await plugin[PLUGIN_INTERNAL_LOAD]();

    assert.deepEqual(plugin.loadedData, initialData);
    assert.deepEqual(appState.removedCommands, ['coverage.command.remove']);
    assert.ok(appState.commandMap.has('coverage.command.keep'));
    assert.equal(appState.commandMap.has('coverage.command.remove'), false);
    assert.equal(appState.ribbonEntries.length, 2);
    assert.deepEqual(
      appState.ribbonEntries.map((entry) => entry.ribbonEl.dataset.location).sort(),
      ['statusBar', 'titleBar'],
    );
    assert.equal(appState.statusItems.length, 1);
    assert.equal(appState.statusItems[0].textContent, 'coverage-ready');
    assert.equal(appState.views.length, 1);
    assert.equal(appState.hoverSources.length, 2);
    assert.equal(appState.extensionRegistrations.length, 1);
    assert.equal(appState.basesRegistrations.size, 1);
    assert.equal(appState.markdownPostProcessorRegistrations.length, 1);
    assert.equal(appState.markdownCodeBlockRegistrations.length, 1);
    assert.equal(appState.editorExtensions.length, 1);
    assert.equal(appState.editorSuggests.length, 1);
    assert.equal(appState.protocolHandlers.length, 2);
    assert.deepEqual(appState.savedData, {
      saved: true,
      from: 'coverage-plugin',
    });

    appState.settingTabs[0].settingTab.display();
    assert.ok(appState.settingTabs[0].containerEl.textContent.includes('Coverage Settings'));

    await appState.commandMap.get('coverage.command.keep').command.callback();
    assert.deepEqual(plugin.commandExecutions, ['keep']);

    await appState.ribbonEntries[0].spec.onClick({});
    assert.equal(plugin.ribbonClicks, 1);

    await plugin[PLUGIN_INTERNAL_ENABLE]();
    assert.equal(plugin.enableCount, 1);
    assert.equal(plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]().state, 'enabled');

    await plugin[PLUGIN_INTERNAL_DISABLE]();
    assert.equal(plugin.disableCount, 1);
    assert.equal(plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]().state, 'disabled');

    await plugin[PLUGIN_INTERNAL_UNLOAD]();
    assert.equal(appState.commandMap.size, 0);
    assert.equal(appState.ribbonEntries.length, 0);
    assert.equal(appState.statusItems.length, 0);
    assert.equal(appState.settingTabs.length, 0);
    assert.equal(appState.views.length, 0);
    assert.equal(appState.hoverSources.length, 0);
    assert.equal(appState.extensionRegistrations.length, 0);
    assert.equal(appState.basesRegistrations.size, 0);
    assert.equal(appState.markdownPostProcessorRegistrations.length, 0);
    assert.equal(appState.markdownCodeBlockRegistrations.length, 0);
    assert.equal(appState.editorExtensions.length, 0);
    assert.equal(appState.editorSuggests.length, 0);
    assert.equal(appState.protocolHandlers.length, 0);
    assert.equal(plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]().state, 'unloaded');
  });

  await runTest('Plugin 失败生命周期与 onFailed', async () => {
    const manifest = {
      id: 'failing-coverage-plugin',
      name: 'Failing Coverage Plugin',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      description: 'Runtime failure coverage plugin',
      author: 'Tests',
      engines: {
        wstudio: '1.0.0',
      },
    };
    const { app } = createPluginRuntimeFixture();
    const plugin = new FailingCoveragePlugin(app, manifest);

    await plugin[PLUGIN_INTERNAL_LOAD]();

    await assert.rejects(
      () => plugin[PLUGIN_INTERNAL_ENABLE](),
      /Coverage plugin enable failure/,
    );

    const snapshot = plugin[PLUGIN_INTERNAL_GET_SNAPSHOT]();
    assert.equal(snapshot.state, 'failed');
    assert.ok(plugin.failureContext !== null);
    assert.equal(plugin.failureContext.operation, 'enable');
  });
}

async function main() {
  await runComponentTests();
  await runEventsAndKeymapTests();
  await runUiAndMenuTests();
  await runNoticeAndModalTests();
  await runSettingsAndControlsTests();
  await runSuggestAndViewTests();
  await runPlatformTests();
  await runVaultAndBasesTests();
  await runTasksTests();
  await runPluginHostApiTests();

  console.log('');
  console.log(`plugin runtime smoke summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
