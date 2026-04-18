// node_modules/@note-studio/plugin/dist/esm/internal/runtime.js
var COMPONENT_INTERNAL_LOAD = Symbol.for("wstudio.component.internal.load");
var COMPONENT_INTERNAL_UNLOAD = Symbol.for("wstudio.component.internal.unload");
var COMPONENT_INTERNAL_ADD_CHILD = Symbol.for("wstudio.component.internal.addChild");
var COMPONENT_INTERNAL_REMOVE_CHILD = Symbol.for("wstudio.component.internal.removeChild");
var PLUGIN_INTERNAL_LOAD = Symbol.for("wstudio.plugin.internal.load");
var PLUGIN_INTERNAL_ENABLE = Symbol.for("wstudio.plugin.internal.enable");
var PLUGIN_INTERNAL_DISABLE = Symbol.for("wstudio.plugin.internal.disable");
var PLUGIN_INTERNAL_UNLOAD = Symbol.for("wstudio.plugin.internal.unload");
var PLUGIN_INTERNAL_FAIL = Symbol.for("wstudio.plugin.internal.fail");
var PLUGIN_INTERNAL_GET_SNAPSHOT = Symbol.for("wstudio.plugin.internal.getSnapshot");
var EDITOR_SUGGEST_INTERNAL_REFRESH = Symbol.for("wstudio.editorSuggest.internal.refresh");
var EDITOR_SUGGEST_INTERNAL_HANDLE_KEY = Symbol.for("wstudio.editorSuggest.internal.handleKey");
var SETTING_TAB_INTERNAL_ATTACH = Symbol.for("wstudio.settingTab.internal.attach");

// node_modules/@note-studio/plugin/dist/esm/core/Component.js
function normalizeError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallbackMessage);
}
async function disposeRegistration(registration) {
  if (typeof registration === "function") {
    const callback = registration;
    await callback();
    return;
  }
  await registration.dispose();
}
var Component = class {
  constructor() {
    this.loaded = false;
    this.children = [];
    this.registrations = [];
  }
  load() {
    void this[COMPONENT_INTERNAL_LOAD]();
  }
  unload() {
    void this[COMPONENT_INTERNAL_UNLOAD]();
  }
  addChild(component) {
    void this[COMPONENT_INTERNAL_ADD_CHILD](component);
    return component;
  }
  removeChild(component) {
    void this[COMPONENT_INTERNAL_REMOVE_CHILD](component);
    return component;
  }
  async [COMPONENT_INTERNAL_LOAD]() {
    if (this.loaded) {
      return;
    }
    await this.onload();
    this.loaded = true;
  }
  async [COMPONENT_INTERNAL_UNLOAD]() {
    if (!this.loaded) {
      return;
    }
    let firstError = null;
    for (let index = this.children.length - 1; index >= 0; index -= 1) {
      const child = this.children[index];
      try {
        await child[COMPONENT_INTERNAL_UNLOAD]();
      } catch (error) {
        if (firstError === null) {
          firstError = normalizeError(error instanceof Error ? error : null, "Failed to unload child component.");
        }
      }
    }
    try {
      await this.onunload();
    } catch (error) {
      if (firstError === null) {
        firstError = normalizeError(error instanceof Error ? error : null, "Failed to unload component.");
      }
    }
    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      const registration = this.registrations[index];
      try {
        await disposeRegistration(registration);
      } catch (error) {
        if (firstError === null) {
          firstError = normalizeError(error instanceof Error ? error : null, "Failed to dispose component registration.");
        }
      }
    }
    this.children.length = 0;
    this.registrations.length = 0;
    this.loaded = false;
    if (firstError !== null) {
      throw firstError;
    }
  }
  async [COMPONENT_INTERNAL_ADD_CHILD](component) {
    this.children.push(component);
    if (this.loaded && !component.loaded) {
      await component[COMPONENT_INTERNAL_LOAD]();
    }
    return component;
  }
  async [COMPONENT_INTERNAL_REMOVE_CHILD](component) {
    const index = this.children.indexOf(component);
    if (index === -1) {
      return component;
    }
    this.children.splice(index, 1);
    if (component.loaded) {
      await component[COMPONENT_INTERNAL_UNLOAD]();
    }
    return component;
  }
  register(callback) {
    this.registrations.push(callback);
  }
  registerDisposable(disposable) {
    this.registrations.push(disposable);
  }
  registerEvent(eventRef) {
    this.registerDisposable(eventRef);
  }
  registerDomEvent(el, type, callback, options) {
    const listener = (event) => {
      void callback(event);
    };
    el.addEventListener(type, listener, options);
    this.register(() => {
      el.removeEventListener(type, listener, options);
    });
  }
  registerInterval(intervalHandle) {
    this.register(() => {
      clearInterval(intervalHandle);
    });
    return intervalHandle;
  }
  getChildren() {
    return this.children;
  }
};

// node_modules/@note-studio/plugin/dist/esm/internal/host-ui-bridge.js
function getPluginHostUiBridge() {
  const owner = globalThis;
  return owner.__wstudioPluginHostUiBridge ?? null;
}

// node_modules/@note-studio/plugin/dist/esm/types/keymap.js
function normalizeModifiers(modifiers) {
  if (modifiers === null || modifiers.length === 0) {
    return null;
  }
  return [...modifiers].sort().join("+");
}
var Scope = class {
  constructor(parentScope) {
    this.parentScope = parentScope;
    this.handlers = [];
    this.listeners = /* @__PURE__ */ new Map();
  }
  register(modifiers, key, listener) {
    const handler = {
      scope: this,
      modifiers: normalizeModifiers(modifiers),
      key
    };
    this.handlers.push(handler);
    this.listeners.set(handler, listener);
    return handler;
  }
  unregister(handler) {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
    this.listeners.delete(handler);
  }
};

// node_modules/@note-studio/plugin/dist/esm/core/Notice.js
function setMessageContent(target, message) {
  if (typeof message === "string") {
    target.textContent = message;
    return;
  }
  target.replaceChildren(message);
}
function getNoticeContainer() {
  const existingContainer = document.body.querySelector('[data-ns-plugin-notice-container="true"]');
  if (existingContainer !== null) {
    return existingContainer;
  }
  const containerEl = document.createElement("div");
  containerEl.className = "ns-plugin-notice-container";
  containerEl.dataset.nsPluginNoticeContainer = "true";
  document.body.append(containerEl);
  return containerEl;
}
function getNoticeMessageText(message) {
  if (typeof message === "string") {
    return message;
  }
  return message.textContent ?? "";
}
var Notice = class {
  constructor(message, duration) {
    this.timeoutHandle = null;
    this.hidden = false;
    this.noticeEl = document.createElement("div");
    this.noticeEl.className = "ns-plugin-notice";
    this.noticeEl.setAttribute("role", "status");
    this.noticeEl.setAttribute("aria-live", "polite");
    this.messageEl = document.createElement("div");
    this.messageEl.className = "ns-plugin-notice__message";
    setMessageContent(this.messageEl, message);
    this.noticeEl.append(this.messageEl);
    const hostUiBridge = getPluginHostUiBridge();
    if (hostUiBridge !== null) {
      this.containerEl = document.body;
      hostUiBridge.showNotice({
        message: getNoticeMessageText(message),
        level: "info",
        duration: duration === 0 ? 0 : duration ?? 4e3
      });
    } else {
      this.containerEl = getNoticeContainer();
      this.containerEl.append(this.noticeEl);
    }
    if (duration !== 0) {
      const resolvedDuration = duration ?? 4e3;
      this.timeoutHandle = setTimeout(() => {
        this.hide();
      }, resolvedDuration);
    }
  }
  hide() {
    if (this.hidden) {
      return;
    }
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.hidden = true;
    this.noticeEl.remove();
  }
  setMessage(message) {
    setMessageContent(this.messageEl, message);
    return this;
  }
};

// node_modules/@note-studio/plugin/dist/esm/types/lifecycle.js
var PluginLifecycleError = class extends Error {
  constructor(pluginId, operation, state, allowedStates) {
    super(`Plugin "${pluginId}" cannot execute "${operation}" while in "${state}" state. Allowed states: ${allowedStates.join(", ")}.`);
    this.name = "PluginLifecycleError";
    this.pluginId = pluginId;
    this.operation = operation;
    this.state = state;
    this.allowedStates = allowedStates;
  }
};

// node_modules/@note-studio/plugin/dist/esm/core/Plugin.js
function normalizeError2(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallbackMessage);
}
var Plugin = class extends Component {
  constructor(app, manifest) {
    super();
    this.lifecycleState = "created";
    this.lastFailure = null;
    this.app = app;
    this.manifest = manifest;
  }
  get runtime() {
    return this.app.__pluginRuntime;
  }
  addRibbonIcon(icon, title, onClick, options) {
    const ribbonIcon = this.runtime.ui.addRibbonIcon(this.manifest.id, {
      icon,
      title,
      onClick,
      location: options?.location,
      scope: options?.scope
    });
    this.registerDisposable(ribbonIcon);
    return ribbonIcon;
  }
  addStatusBarItem() {
    const statusBarItem = this.runtime.ui.createStatusBarItem(this.manifest.id);
    this.registerDisposable(statusBarItem);
    return statusBarItem;
  }
  addCommand(command) {
    this.registerDisposable(this.runtime.commands.registerCommand(this.manifest.id, command));
    return command;
  }
  removeCommand(commandId) {
    this.runtime.commands.removeCommand(commandId);
  }
  addSettingTab(settingTab) {
    this.registerDisposable(this.runtime.settings.registerSettingTab(this.manifest.id, settingTab));
  }
  registerView(type, viewCreator) {
    this.registerDisposable(this.runtime.views.registerView(this.manifest.id, type, viewCreator));
  }
  registerHoverLinkSource(id, source) {
    this.registerDisposable(this.runtime.hover.registerHoverLinkSource(this.manifest.id, id, source));
  }
  registerHoverPreviewSource(id, source) {
    this.registerHoverLinkSource(id, source);
  }
  registerExtensions(extensions, viewType) {
    this.registerDisposable(this.runtime.extensions.registerExtensions(this.manifest.id, extensions, viewType));
  }
  registerBasesView(viewId, registration) {
    const disposable = this.runtime.bases.registerBasesView(this.manifest.id, viewId, registration);
    if (disposable === null) {
      return false;
    }
    this.registerDisposable(disposable);
    return true;
  }
  registerMarkdownPostProcessor(postProcessor, sortOrder) {
    if (sortOrder !== void 0) {
      postProcessor.sortOrder = sortOrder;
    }
    this.registerDisposable(this.runtime.markdown.registerPostProcessor(this.manifest.id, postProcessor));
    return postProcessor;
  }
  registerMarkdownCodeBlockProcessor(language, handler, sortOrder) {
    const postProcessor = () => void 0;
    if (sortOrder !== void 0) {
      postProcessor.sortOrder = sortOrder;
    }
    this.registerDisposable(this.runtime.markdown.registerCodeBlockProcessor(this.manifest.id, language, handler, postProcessor));
    return postProcessor;
  }
  registerEditorExtension(extension) {
    this.registerDisposable(this.runtime.editors.registerEditorExtension(this.manifest.id, extension));
  }
  registerEditorSuggest(editorSuggest) {
    this.registerDisposable(this.runtime.editors.registerEditorSuggest(this.manifest.id, editorSuggest));
  }
  registerAppProtocolHandler(action, handler) {
    this.registerDisposable(this.runtime.protocols.registerAppProtocolHandler(this.manifest.id, action, handler));
  }
  registerObsidianProtocolHandler(action, handler) {
    this.registerAppProtocolHandler(action, handler);
  }
  loadData() {
    return this.runtime.data.loadData(this.manifest.id);
  }
  saveData(data) {
    return this.runtime.data.saveData(this.manifest.id, data);
  }
  async [PLUGIN_INTERNAL_LOAD]() {
    await this.runTransition({
      operation: "load",
      allowedStates: ["created", "unloaded"],
      pendingState: "loading",
      successState: "loaded",
      execute: async () => {
        await this[COMPONENT_INTERNAL_LOAD]();
      }
    });
  }
  async [PLUGIN_INTERNAL_ENABLE]() {
    await this.runTransition({
      operation: "enable",
      allowedStates: ["loaded", "disabled"],
      pendingState: "enabling",
      successState: "enabled",
      execute: async () => {
        await this.onEnable();
      }
    });
  }
  async [PLUGIN_INTERNAL_DISABLE]() {
    await this.runTransition({
      operation: "disable",
      allowedStates: ["enabled"],
      pendingState: "disabling",
      successState: "disabled",
      execute: async () => {
        await this.onDisable();
      }
    });
  }
  async [PLUGIN_INTERNAL_UNLOAD]() {
    if (this.lifecycleState === "enabled") {
      await this[PLUGIN_INTERNAL_DISABLE]();
    }
    await this.runTransition({
      operation: "unload",
      allowedStates: ["loaded", "disabled", "failed"],
      pendingState: "unloading",
      successState: "unloaded",
      execute: async () => {
        await this[COMPONENT_INTERNAL_UNLOAD]();
      }
    });
  }
  async [PLUGIN_INTERNAL_FAIL](error) {
    return this.recordFailure("fail", error);
  }
  [PLUGIN_INTERNAL_GET_SNAPSHOT]() {
    return {
      manifest: this.manifest,
      state: this.lifecycleState,
      lastFailure: this.lastFailure
    };
  }
  onUserEnable() {
    return void 0;
  }
  async runTransition(transition) {
    this.assertOperationAllowed(transition.operation, transition.allowedStates);
    this.lifecycleState = transition.pendingState;
    try {
      await transition.execute();
      this.lastFailure = null;
      this.lifecycleState = transition.successState;
    } catch (error) {
      const normalizedError = normalizeError2(error instanceof Error ? error : null, `Plugin "${this.manifest.id}" failed during "${transition.operation}".`);
      await this.recordFailure(transition.operation, normalizedError);
      throw normalizedError;
    }
  }
  assertOperationAllowed(operation, allowedStates) {
    if (allowedStates.includes(this.lifecycleState)) {
      return;
    }
    throw new PluginLifecycleError(this.manifest.id, operation, this.lifecycleState, allowedStates);
  }
  async recordFailure(operation, error) {
    const failure = {
      pluginId: this.manifest.id,
      pluginName: this.manifest.name,
      operation,
      state: this.lifecycleState,
      error
    };
    this.lastFailure = failure;
    this.lifecycleState = "failed";
    try {
      await this.onFailed(failure);
    } catch (failureHandlerError) {
      const normalizedFailureHandlerError = normalizeError2(failureHandlerError instanceof Error ? failureHandlerError : null, `Plugin "${this.manifest.id}" failed while handling its failure state.`);
      new Notice(normalizedFailureHandlerError.message);
    }
    return failure;
  }
};

// node_modules/@note-studio/plugin/dist/esm/core/PluginUiContext.js
var THEME_TOKEN_VARIABLE_CANDIDATES = {
  "surface.background": ["--ws-editor-background"],
  "surface.panel": ["--ws-editorWidget-background", "--ws-sideBar-background", "--ws-editor-background"],
  "surface.panelMuted": ["--ws-sideBar-background", "--ws-panel-background", "--ws-editor-background"],
  "surface.overlay": ["--ws-menu-background", "--ws-editorWidget-background", "--ws-editorHoverWidget-background", "--ws-editor-background"],
  "surface.hover": ["--ws-list-hoverBackground", "--ws-toolbar-hoverBackground", "--ws-editor-hoverHighlightBackground"],
  "surface.selected": ["--ws-list-activeSelectionBackground", "--ws-list-inactiveSelectionBackground", "--ws-editor-selectionBackground", "--ws-focusBorder"],
  "text.primary": ["--ws-text-normal", "--ws-foreground"],
  "text.secondary": ["--ws-descriptionForeground", "--ws-text-muted", "--ws-foreground"],
  "text.muted": ["--ws-text-muted", "--ws-descriptionForeground", "--ws-disabledForeground"],
  "text.placeholder": ["--ws-input-placeholderForeground", "--ws-descriptionForeground"],
  "text.inverse": ["--ws-button-foreground", "--ws-editor-background", "--ws-foreground"],
  "text.link": ["--ws-textLink-foreground", "--ws-textLink-activeForeground", "--ws-button-background"],
  "border.default": ["--ws-border-color", "--ws-contrastBorder"],
  "border.muted": ["--ws-widget-border", "--ws-border-color", "--ws-contrastBorder"],
  "border.focus": ["--ws-focusBorder"],
  "accent.primary": ["--ws-button-background", "--ws-focusBorder", "--ws-textLink-foreground"],
  "accent.primaryHover": ["--ws-button-hoverBackground", "--ws-list-hoverBackground", "--ws-focusBorder"],
  "accent.onPrimary": ["--ws-button-foreground", "--ws-editor-background", "--ws-foreground"],
  "input.background": ["--ws-input-background", "--ws-editor-background"],
  "input.foreground": ["--ws-input-foreground", "--ws-text-normal"],
  "input.border": ["--ws-input-border", "--ws-border-color"],
  "input.borderFocus": ["--ws-focusBorder", "--ws-inputOption-activeBorder"],
  "button.primary.background": ["--ws-button-background"],
  "button.primary.foreground": ["--ws-button-foreground"],
  "button.primary.hoverBackground": ["--ws-button-hoverBackground", "--ws-button-background"],
  "button.secondary.background": ["--ws-button-secondaryBackground", "--ws-button-background"],
  "button.secondary.foreground": ["--ws-button-secondaryForeground", "--ws-button-foreground", "--ws-text-normal"],
  "button.secondary.hoverBackground": ["--ws-button-secondaryHoverBackground", "--ws-button-secondaryBackground", "--ws-button-hoverBackground"],
  "menu.background": ["--ws-menu-background", "--ws-editorWidget-background"],
  "menu.border": ["--ws-menu-border", "--ws-border-color"],
  "list.hoverBackground": ["--ws-list-hoverBackground"],
  "list.activeBackground": ["--ws-list-activeSelectionBackground", "--ws-list-inactiveSelectionBackground"],
  "list.activeForeground": ["--ws-list-activeSelectionForeground", "--ws-foreground"],
  "status.success": ["--ws-testing-iconPassed", "--ws-charts-green", "--ws-statusBarItem-remoteForeground"],
  "status.warning": ["--ws-notificationsWarningIcon-foreground", "--ws-testing-iconSkipped", "--ws-charts-yellow", "--ws-statusBarItem-warningForeground"],
  "status.error": ["--ws-notificationsErrorIcon-foreground", "--ws-errorForeground", "--ws-testing-iconFailed", "--ws-charts-red"],
  "scrollbar.thumb": ["--ws-scrollbarSlider-background"],
  "scrollbar.thumbHover": ["--ws-scrollbarSlider-hoverBackground", "--ws-scrollbarSlider-activeBackground"]
};
var contextCache = /* @__PURE__ */ new WeakMap();
function getRuntimeBridge() {
  const owner = globalThis;
  const runtimeBridge = owner.__WSTUDIO_PLUGIN_RUNTIME_SURFACE__;
  if (runtimeBridge === void 0) {
    throw new Error("Plugin UI runtime context is unavailable outside a plugin UI surface.");
  }
  return runtimeBridge;
}
function resolveThemeAppearance(value) {
  return value === "light" ? "light" : "dark";
}
function resolveVariableValue(variableNames, variableMap) {
  const rootStyle = window.getComputedStyle(document.documentElement);
  for (const variableName of variableNames) {
    const mappedValue = variableMap.get(variableName);
    if (mappedValue !== void 0 && mappedValue.trim().length > 0) {
      return mappedValue;
    }
    const domValue = rootStyle.getPropertyValue(variableName).trim();
    if (domValue.length > 0) {
      return domValue;
    }
  }
  return "";
}
function buildThemeSnapshot(state) {
  const variableMap = /* @__PURE__ */ new Map();
  for (const variable of state.variables) {
    variableMap.set(variable.name, variable.value);
  }
  const tokenEntries = [];
  for (const tokenName of Object.keys(THEME_TOKEN_VARIABLE_CANDIDATES)) {
    tokenEntries.push([
      tokenName,
      resolveVariableValue(THEME_TOKEN_VARIABLE_CANDIDATES[tokenName], variableMap)
    ]);
  }
  return {
    info: {
      id: state.info.id,
      label: state.info.label,
      appearance: resolveThemeAppearance(state.info.appearance)
    },
    tokens: Object.fromEntries(tokenEntries)
  };
}
var RuntimeThemeService = class {
  constructor(runtimeBridge) {
    this.runtimeBridge = runtimeBridge;
    this.snapshot = buildThemeSnapshot(this.runtimeBridge.theme.getSnapshot());
  }
  getSnapshot() {
    this.snapshot = buildThemeSnapshot(this.runtimeBridge.theme.getSnapshot());
    return this.snapshot;
  }
  getToken(name) {
    return this.getSnapshot().tokens[name];
  }
  onDidChange(listener) {
    if (typeof listener !== "function") {
      return () => void 0;
    }
    return this.runtimeBridge.theme.onDidChange((state) => {
      const previousSnapshot = this.snapshot;
      const currentSnapshot = buildThemeSnapshot(state);
      this.snapshot = currentSnapshot;
      listener({
        previous: previousSnapshot,
        current: currentSnapshot
      });
    });
  }
};
function acquirePluginUiContext() {
  const runtimeBridge = getRuntimeBridge();
  const cached = contextCache.get(runtimeBridge);
  if (cached !== void 0) {
    return cached;
  }
  const theme = new RuntimeThemeService(runtimeBridge);
  const context = {
    get surface() {
      return runtimeBridge.surface;
    },
    root: runtimeBridge.root,
    host: runtimeBridge.host,
    theme,
    markRendered: () => {
      runtimeBridge.markRendered();
    },
    onSurfaceStateChange: (listener) => runtimeBridge.onSurfaceStateChange(listener)
  };
  contextCache.set(runtimeBridge, context);
  return context;
}

// node_modules/@note-studio/plugin/dist/esm/core/SettingTab.js
var SettingTab = class {
  constructor(app) {
    this.attached = false;
    this.app = app;
  }
  [SETTING_TAB_INTERNAL_ATTACH](containerEl) {
    this.containerEl = containerEl;
    this.attached = true;
  }
  hide() {
    if (this.attached) {
      this.containerEl.replaceChildren();
    }
    return void 0;
  }
};

// node_modules/@note-studio/plugin/dist/esm/core/Suggest.js
function clearElement(target) {
  target.replaceChildren();
}
function appendInstruction(target, instruction) {
  const rowEl = document.createElement("div");
  rowEl.className = "ns-plugin-instruction";
  const commandEl = document.createElement("kbd");
  commandEl.className = "ns-plugin-instruction__command";
  commandEl.textContent = instruction.command;
  const purposeEl = document.createElement("span");
  purposeEl.className = "ns-plugin-instruction__purpose";
  purposeEl.textContent = instruction.purpose;
  rowEl.append(commandEl, purposeEl);
  target.append(rowEl);
}
function createSyntheticKeyboardEvent(key) {
  return {
    key,
    preventDefault() {
      return void 0;
    },
    stopPropagation() {
      return void 0;
    }
  };
}
var PopoverSuggest = class {
  constructor(app, scope) {
    this.opened = false;
    this.hostPopoverId = null;
    this.closingViaHostBridge = false;
    this.hostPopoverAnchorRect = null;
    this.instructions = [];
    this.suggestions = [];
    this.selectedIndex = -1;
    this.app = app;
    this.scope = scope ?? new Scope(app.scope);
    this.containerEl = document.createElement("div");
    this.containerEl.className = "ns-plugin-popover-suggest";
    this.containerEl.hidden = true;
    this.instructionsEl = document.createElement("div");
    this.instructionsEl.className = "ns-plugin-popover-suggest__instructions";
    this.suggestionsEl = document.createElement("div");
    this.suggestionsEl.className = "ns-plugin-popover-suggest__results";
    this.containerEl.append(this.instructionsEl, this.suggestionsEl);
  }
  open() {
    const hostUiBridge = getPluginHostUiBridge();
    if (hostUiBridge !== null) {
      if (this.opened) {
        this.syncHostPopover(hostUiBridge);
        return;
      }
      this.opened = true;
      this.containerEl.hidden = false;
      this.hostPopoverId = hostUiBridge.openPopover({
        title: "Plugin suggestions",
        contentElement: this.containerEl,
        surfaceId: this.resolveHostRuntimeSurfaceId(),
        runtimeState: this.resolveHostRuntimeState(),
        onRuntimeAction: (action) => {
          this.handleHostRuntimeAction(action);
        },
        width: 420,
        height: 320,
        anchorRect: this.hostPopoverAnchorRect,
        interactionMode: this.resolveHostPopoverInteractionMode(),
        onClose: () => {
          this.handleHostPopoverClosed();
        }
      });
      return;
    }
    if (this.opened) {
      return;
    }
    this.opened = true;
    if (!this.containerEl.isConnected) {
      document.body.append(this.containerEl);
    }
    this.containerEl.hidden = false;
  }
  close() {
    const hostUiBridge = getPluginHostUiBridge();
    if (hostUiBridge !== null && this.hostPopoverId !== null) {
      if (!this.opened) {
        return;
      }
      const popoverId = this.hostPopoverId;
      this.opened = false;
      this.containerEl.hidden = true;
      this.hostPopoverId = null;
      this.hostPopoverAnchorRect = null;
      this.closingViaHostBridge = true;
      hostUiBridge.closePopover(popoverId);
      return;
    }
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.containerEl.hidden = true;
    this.hostPopoverAnchorRect = null;
    this.selectedIndex = -1;
    this.containerEl.remove();
  }
  setHostPopoverAnchorRect(anchorRect) {
    this.hostPopoverAnchorRect = anchorRect;
  }
  setInstructions(instructions) {
    this.instructions = instructions;
    clearElement(this.instructionsEl);
    for (const instruction of instructions) {
      appendInstruction(this.instructionsEl, instruction);
    }
    this.notifyHostPopoverUpdated();
  }
  setSuggestions(values) {
    this.suggestions = values;
    this.selectedIndex = values.length === 0 ? -1 : this.selectedIndex >= 0 && this.selectedIndex < values.length ? this.selectedIndex : 0;
    clearElement(this.suggestionsEl);
    values.forEach((value, index) => {
      const rowEl = document.createElement("div");
      rowEl.className = "ns-plugin-popover-suggest__item";
      rowEl.setAttribute("role", "button");
      rowEl.setAttribute("aria-selected", index === this.selectedIndex ? "true" : "false");
      rowEl.tabIndex = 0;
      rowEl.dataset.selected = index === this.selectedIndex ? "true" : "false";
      this.renderSuggestion(value, rowEl);
      rowEl.addEventListener("click", (event) => {
        this.selectedIndex = index;
        this.syncSuggestionSelectionState();
        this.selectSuggestion(value, event);
      });
      rowEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        this.selectedIndex = index;
        this.syncSuggestionSelectionState();
        this.selectSuggestion(value, event);
      });
      this.suggestionsEl.append(rowEl);
    });
    this.notifyHostPopoverUpdated();
  }
  moveSelection(direction) {
    if (this.suggestions.length === 0) {
      return false;
    }
    const nextIndex = this.selectedIndex < 0 ? 0 : (this.selectedIndex + direction + this.suggestions.length) % this.suggestions.length;
    this.selectedIndex = nextIndex;
    this.syncSuggestionSelectionState();
    this.notifyHostPopoverUpdated();
    return true;
  }
  selectActiveSuggestion(evt) {
    const value = this.suggestions[this.selectedIndex] ?? this.suggestions[0];
    if (value === void 0) {
      return false;
    }
    this.selectSuggestion(value, evt);
    return true;
  }
  handleHostPopoverClosed() {
    if (this.closingViaHostBridge) {
      this.closingViaHostBridge = false;
      return;
    }
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.hostPopoverId = null;
    this.hostPopoverAnchorRect = null;
    this.selectedIndex = -1;
    this.containerEl.hidden = true;
  }
  syncHostPopover(hostUiBridge) {
    if (this.hostPopoverId === null) {
      return;
    }
    hostUiBridge.updatePopover(this.hostPopoverId, {
      title: "Plugin suggestions",
      runtimeState: this.resolveHostRuntimeState(),
      width: 420,
      height: 320,
      anchorRect: this.hostPopoverAnchorRect,
      interactionMode: this.resolveHostPopoverInteractionMode()
    });
  }
  syncSuggestionSelectionState() {
    const suggestionChildren = Array.from(this.suggestionsEl.children);
    suggestionChildren.forEach((child, index) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }
      const selected = index === this.selectedIndex;
      child.dataset.selected = selected ? "true" : "false";
      child.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        child.scrollIntoView?.({
          block: "nearest"
        });
      }
    });
  }
  resolveHostPopoverInteractionMode() {
    return "default";
  }
  resolveHostRuntimeState() {
    const renderedSuggestions = Array.from(this.suggestionsEl.children).flatMap((child) => {
      if (!(child instanceof HTMLElement)) {
        return [];
      }
      const text = child.textContent?.trim() ?? "";
      return text.length > 0 ? [text] : [];
    });
    return {
      title: "Plugin suggestions",
      suggestions: renderedSuggestions,
      selectedIndex: this.selectedIndex,
      interactionMode: this.resolveHostPopoverInteractionMode(),
      instructions: this.instructions.map((instruction) => ({
        command: instruction.command,
        purpose: instruction.purpose
      }))
    };
  }
  resolveHostRuntimeSurfaceId() {
    const constructorRef = this.constructor;
    const configuredSurfaceId = constructorRef.runtimeSurfaceId;
    if (typeof configuredSurfaceId === "string" && configuredSurfaceId.trim().length > 0) {
      return configuredSurfaceId.trim();
    }
    const inferredSurfaceId = constructorRef.name?.trim() ?? "";
    return inferredSurfaceId.length > 0 ? inferredSurfaceId : null;
  }
  notifyHostPopoverUpdated() {
    const hostUiBridge = getPluginHostUiBridge();
    if (hostUiBridge === null || this.hostPopoverId === null || !this.opened) {
      return;
    }
    this.syncHostPopover(hostUiBridge);
  }
  handleHostRuntimeAction(action) {
    if (action === null || Array.isArray(action) || typeof action !== "object") {
      return;
    }
    const actionObject = action;
    const actionType = actionObject.type;
    if (actionType === "close") {
      this.close();
      return;
    }
    if (actionType === "move-selection") {
      const directionValue = actionObject.direction;
      if (directionValue === 1 || directionValue === -1) {
        this.moveSelection(directionValue);
      }
      return;
    }
    if (actionType === "select-active") {
      this.selectActiveSuggestion(createSyntheticKeyboardEvent("Enter"));
      return;
    }
    if (actionType !== "select-index") {
      return;
    }
    const indexValue = actionObject.index;
    if (typeof indexValue !== "number" || !Number.isInteger(indexValue)) {
      return;
    }
    const targetValue = this.suggestions[indexValue];
    if (targetValue === void 0) {
      return;
    }
    this.selectedIndex = indexValue;
    this.syncSuggestionSelectionState();
    this.selectSuggestion(targetValue, createSyntheticKeyboardEvent("Enter"));
  }
};
var EditorSuggest = class extends PopoverSuggest {
  constructor(app) {
    super(app);
    this.context = null;
    this.limit = 100;
    this.refreshSequence = 0;
  }
  setInstructions(instructions) {
    super.setInstructions(instructions);
  }
  resolveHostPopoverInteractionMode() {
    return "editorSuggest";
  }
  close() {
    this.context = null;
    this.refreshSequence += 1;
    this.setHostPopoverAnchorRect(null);
    super.close();
  }
  async [EDITOR_SUGGEST_INTERNAL_REFRESH](options) {
    const refreshSequence = ++this.refreshSequence;
    this.context = options.context;
    this.setHostPopoverAnchorRect(options.anchorRect);
    const suggestions = (await this.getSuggestions(options.context)).slice(0, this.limit);
    if (refreshSequence !== this.refreshSequence) {
      return false;
    }
    if (suggestions.length === 0) {
      this.close();
      return false;
    }
    this.setSuggestions(suggestions);
    this.open();
    return true;
  }
  [EDITOR_SUGGEST_INTERNAL_HANDLE_KEY](key) {
    if (key === "ArrowDown") {
      return this.moveSelection(1);
    }
    if (key === "ArrowUp") {
      return this.moveSelection(-1);
    }
    if (key === "Enter") {
      return this.selectActiveSuggestion(createSyntheticKeyboardEvent("Enter"));
    }
    if (key === "Escape") {
      this.close();
      return true;
    }
    return false;
  }
};

// node_modules/@note-studio/plugin/dist/esm/types/bases.js
function isValueRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp) && !(value instanceof Value);
}
function isTFileLike(value) {
  return typeof value === "object" && value !== null && "path" in value && "basename" in value && "extension" in value;
}
function normalizeString(value) {
  return value.trim();
}
function wrapValue(value) {
  if (value instanceof Value) {
    return value;
  }
  if (value === null) {
    return NullValue.value;
  }
  if (typeof value === "string") {
    return new StringValue(value);
  }
  if (typeof value === "number") {
    return new NumberValue(value);
  }
  if (typeof value === "boolean") {
    return new BooleanValue(value);
  }
  if (value instanceof Date) {
    return new DateValue(value);
  }
  if (value instanceof RegExp) {
    return new RegExpValue(value);
  }
  if (Array.isArray(value)) {
    return new ListValue(value);
  }
  if (isTFileLike(value)) {
    return new FileValue(value);
  }
  if (isValueRecord(value)) {
    return new ObjectValue(value);
  }
  return new StringValue(String(value));
}
var Value = class _Value {
  static equals(left, right) {
    if (left === right) {
      return true;
    }
    if (left === null || right === null) {
      return false;
    }
    return left.toString() === right.toString();
  }
  static looseEquals(left, right) {
    if (left === right) {
      return true;
    }
    if (left === null || right === null) {
      return false;
    }
    return normalizeString(left.toString()).toLowerCase() === normalizeString(right.toString()).toLowerCase();
  }
  equals(other) {
    return _Value.equals(this, other);
  }
  looseEquals(other) {
    return _Value.looseEquals(this, other);
  }
  renderTo(el, _ctx) {
    el.textContent = this.toString();
  }
};
Value.type = "value";
var NotNullValue = class extends Value {
};
var PrimitiveValue = class extends NotNullValue {
  constructor(value) {
    super();
    this.value = value;
  }
  toString() {
    return String(this.value);
  }
  isTruthy() {
    return Boolean(this.value);
  }
};
var BooleanValue = class extends PrimitiveValue {
};
BooleanValue.type = "boolean";
var StringValue = class extends PrimitiveValue {
};
StringValue.type = "string";
var NumberValue = class extends PrimitiveValue {
};
NumberValue.type = "number";
var DateValue = class _DateValue extends NotNullValue {
  constructor(value) {
    super();
    this.value = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  }
  toString() {
    return Number.isNaN(this.value.getTime()) ? "" : this.value.toISOString();
  }
  dateOnly() {
    return new _DateValue(new Date(this.value.getFullYear(), this.value.getMonth(), this.value.getDate()));
  }
  relative() {
    const delta = this.value.getTime() - Date.now();
    if (Math.abs(delta) < 6e4) {
      return "just now";
    }
    const minutes = Math.round(delta / 6e4);
    if (Math.abs(minutes) < 60) {
      return minutes > 0 ? `in ${minutes} minutes` : `${Math.abs(minutes)} minutes ago`;
    }
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) {
      return hours > 0 ? `in ${hours} hours` : `${Math.abs(hours)} hours ago`;
    }
    const days = Math.round(hours / 24);
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
  }
  isTruthy() {
    return !Number.isNaN(this.value.getTime());
  }
  toDate() {
    return new Date(this.value.getTime());
  }
  static parseFromString(input) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return new _DateValue(date);
  }
};
var FileValue = class extends NotNullValue {
  constructor(value) {
    super();
    this.value = value;
  }
  toString() {
    return typeof this.value === "string" ? this.value : this.value.path;
  }
  isTruthy() {
    return this.toString().length > 0;
  }
};
var ListValue = class _ListValue extends NotNullValue {
  constructor(value) {
    super();
    this.value = value.map((item) => wrapValue(item));
  }
  toString() {
    return `[${this.value.map((item) => item.toString()).join(", ")}]`;
  }
  isTruthy() {
    return this.value.length > 0;
  }
  includes(value) {
    return this.value.some((item) => item.looseEquals(value));
  }
  concat(value) {
    const nextValues = value instanceof _ListValue ? value.value : value.map((item) => wrapValue(item));
    return new _ListValue([...this.value, ...nextValues]);
  }
  length() {
    return this.value.length;
  }
  get(index) {
    return this.value[index] ?? NullValue.value;
  }
};
ListValue.type = "list";
var NullValue = class extends Value {
  constructor() {
    super();
  }
  toString() {
    return "null";
  }
  isTruthy() {
    return false;
  }
};
NullValue.value = new NullValue();
var ObjectValue = class extends NotNullValue {
  constructor(value) {
    super();
    this.value = value;
  }
  toString() {
    const json = {};
    for (const [key, value] of Object.entries(this.value)) {
      json[key] = value === void 0 ? "" : wrapValue(value).toString();
    }
    return JSON.stringify(json);
  }
  isTruthy() {
    return Object.keys(this.value).length > 0;
  }
  isEmpty() {
    return Object.keys(this.value).length === 0;
  }
  get(key) {
    const value = this.value[key];
    return value === void 0 ? NullValue.value : wrapValue(value);
  }
};
ObjectValue.type = "object";
var RegExpValue = class extends NotNullValue {
  constructor(value) {
    super();
    this.value = value;
  }
  toString() {
    return this.value.toString();
  }
  isTruthy() {
    return true;
  }
};

// node_modules/@note-studio/plugin/dist/esm/types/markdown.js
function collectCodeBlocksByLanguage(root, language) {
  const expectedClass = `language-${language}`;
  const results = [];
  const visit = (element) => {
    if (element.tagName === "CODE" && element.classList.contains(expectedClass) && element.parentElement?.tagName === "PRE") {
      results.push(element);
    }
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) {
        visit(child);
      }
    }
  };
  visit(root);
  return results;
}
var MarkdownPreviewRenderer = class {
  static registerPostProcessor(postProcessor, sortOrder) {
    if (sortOrder !== void 0) {
      postProcessor.sortOrder = sortOrder;
    }
    this.postProcessors.add(postProcessor);
  }
  static unregisterPostProcessor(postProcessor) {
    this.postProcessors.delete(postProcessor);
  }
  static createCodeBlockPostProcessor(language, handler) {
    return (el, ctx) => {
      const codeBlocks = collectCodeBlocksByLanguage(el, language);
      for (const codeBlock of Array.from(codeBlocks)) {
        const source = codeBlock.textContent ?? "";
        const replacementEl = document.createElement("div");
        codeBlock.parentElement?.replaceWith(replacementEl);
        void handler(source, replacementEl, ctx);
      }
    };
  }
  static getPostProcessors() {
    return [...this.postProcessors].sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
  }
};
MarkdownPreviewRenderer.postProcessors = /* @__PURE__ */ new Set();

// node_modules/@note-studio/plugin/dist/esm/types/platform.js
var _a;
_a = Symbol.toStringTag;
var ManagedMomentDuration = class {
  constructor(input, unit) {
    this.milliseconds = convertDurationToMilliseconds(input, unit);
  }
  asMilliseconds() {
    return this.milliseconds;
  }
  humanize() {
    const absolute = Math.abs(this.milliseconds);
    if (absolute < 6e4) {
      return "a few seconds";
    }
    if (absolute < 36e5) {
      return `${Math.round(absolute / 6e4)} minutes`;
    }
    if (absolute < 864e5) {
      return `${Math.round(absolute / 36e5)} hours`;
    }
    return `${Math.round(absolute / 864e5)} days`;
  }
};
var ManagedMoment = class _ManagedMoment {
  constructor(input) {
    if (input === null || input === void 0) {
      this.date = /* @__PURE__ */ new Date();
      return;
    }
    if (isMomentLike(input)) {
      this.date = input.toDate();
      return;
    }
    this.date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  }
  toDate() {
    return new Date(this.date.getTime());
  }
  valueOf() {
    return this.date.getTime();
  }
  format(pattern) {
    void pattern;
    return Number.isNaN(this.date.getTime()) ? "" : this.date.toISOString();
  }
  fromNow() {
    const delta = this.date.getTime() - Date.now();
    if (Math.abs(delta) < 6e4) {
      return "a few seconds";
    }
    const minutes = Math.round(delta / 6e4);
    if (Math.abs(minutes) < 60) {
      return minutes > 0 ? `in ${minutes} minutes` : `${Math.abs(minutes)} minutes ago`;
    }
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) {
      return hours > 0 ? `in ${hours} hours` : `${Math.abs(hours)} hours ago`;
    }
    const days = Math.round(hours / 24);
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
  }
  clone() {
    return new _ManagedMoment(this.date);
  }
  add(amount, unit) {
    return new _ManagedMoment(this.date.getTime() + convertDurationToMilliseconds(amount, unit));
  }
  subtract(amount, unit) {
    return new _ManagedMoment(this.date.getTime() - convertDurationToMilliseconds(amount, unit));
  }
};
function isMomentLike(value) {
  if (value === null || value === void 0) {
    return false;
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return false;
  }
  return "toDate" in value && "format" in value && "fromNow" in value;
}
function convertDurationToMilliseconds(value, unit) {
  switch (unit) {
    case "ms":
    case "millisecond":
    case "milliseconds":
    case void 0:
      return value;
    case "s":
    case "second":
    case "seconds":
      return value * 1e3;
    case "m":
    case "minute":
    case "minutes":
      return value * 6e4;
    case "h":
    case "hour":
    case "hours":
      return value * 36e5;
    case "d":
    case "day":
    case "days":
      return value * 864e5;
    case "w":
    case "week":
    case "weeks":
      return value * 6048e5;
    default:
      return value;
  }
}
var momentFactory = ((input) => {
  return new ManagedMoment(input);
});
momentFactory.unix = (seconds) => new ManagedMoment(seconds * 1e3);
momentFactory.duration = (input, unit) => {
  return new ManagedMomentDuration(input, unit);
};
momentFactory.isMoment = (value) => {
  return isMomentLike(value);
};
var platformContext = globalThis;
var userAgent = platformContext.navigator?.userAgent ?? "";
var processPlatform = platformContext.process?.platform ?? "";
var isDesktopApp = typeof processPlatform === "string" && processPlatform.length > 0;
var isAndroidApp = /Android/i.test(userAgent);
var isIosApp = /iPhone|iPad|iPod/i.test(userAgent);
var isMobileApp = isAndroidApp || isIosApp;
var isMobile = isMobileApp;
var isPhone = isMobile && /Mobile/i.test(userAgent);
var isMacOS = /Mac|iPhone|iPad|iPod/i.test(userAgent) || processPlatform === "darwin";
var isWin = processPlatform === "win32" || /Windows/i.test(userAgent);
var isLinux = processPlatform === "linux" || /Linux/i.test(userAgent);
var isSafari = /Safari/i.test(userAgent) && !/Chrome|Chromium|Android/i.test(userAgent);

// node_modules/@note-studio/plugin/dist/esm/types/render.js
var PopoverState;
/* @__PURE__ */ (function(PopoverState2) {
})(PopoverState || (PopoverState = {}));

// src/view.runtime.ts
var SHOW_SNAPSHOT_COMMAND_ID = "show-demo-workspace-snapshot";
function createActionButton(label, description, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-runtime-view__action";
  button.innerHTML = "<strong>" + label + "</strong><span>" + description + "</span>";
  const handleClick = () => {
    void onClick();
  };
  button.addEventListener("click", handleClick);
  return {
    element: button,
    dispose: () => {
      button.removeEventListener("click", handleClick);
    }
  };
}
function createFactCard(label, valueElement) {
  const card = document.createElement("div");
  card.className = "demo-runtime-view__fact";
  const labelElement = document.createElement("strong");
  labelElement.textContent = label;
  card.append(labelElement, valueElement);
  return card;
}
function formatEditorPoint(point) {
  return `L${point.line + 1}:C${point.ch + 1}`;
}
function formatEditorRange(range) {
  return `${formatEditorPoint(range.from)} -> ${formatEditorPoint(range.to)}`;
}
function formatJsonValue(value) {
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value, null, 2) ?? "null";
}
function mountPluginSurface() {
  const context = acquirePluginUiContext();
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .demo-runtime-view {
      display: grid;
      gap: 12px;
      min-height: 100%;
      padding: 16px;
      align-content: start;
      background:
        radial-gradient(circle at top right, rgba(110, 231, 183, 0.2), transparent 32%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.08));
      color: var(--ws-text-normal, inherit);
    }

    .demo-runtime-view__dashboard {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
      gap: 12px;
      align-items: start;
    }

    .demo-runtime-view__column {
      display: grid;
      gap: 12px;
      min-width: 0;
      align-content: start;
    }

    .demo-runtime-view__hero {
      display: grid;
      gap: 8px;
      padding: 16px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 18px;
      background: color-mix(in srgb, var(--ws-editor-background, #101828) 84%, white 16%);
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
    }

    .demo-runtime-view__eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .demo-runtime-view__title {
      margin: 0;
      font-size: 22px;
      line-height: 1.1;
    }

    .demo-runtime-view__meta {
      display: grid;
      gap: 6px;
      font-size: 13px;
      opacity: 0.84;
    }

    .demo-runtime-view__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }

    .demo-runtime-view__action {
      display: grid;
      gap: 4px;
      min-height: 72px;
      padding: 12px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 16px;
      background: color-mix(in srgb, var(--ws-toolbar-background, #0f172a) 86%, white 14%);
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    }

    .demo-runtime-view__action:hover,
    .demo-runtime-view__action:focus-visible {
      transform: translateY(-1px);
      border-color: var(--ws-focusBorder, rgba(125, 211, 252, 0.72));
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
      outline: none;
    }

    .demo-runtime-view__action strong {
      font-size: 14px;
    }

    .demo-runtime-view__action span {
      font-size: 11px;
      opacity: 0.78;
    }

    .demo-runtime-view__editor {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 18px;
      background: color-mix(in srgb, var(--ws-editor-background, #101828) 88%, white 12%);
    }

    .demo-runtime-view__editor textarea {
      width: 100%;
      min-height: 92px;
      resize: vertical;
      padding: 10px 12px;
      color: inherit;
      background: color-mix(in srgb, var(--ws-input-background, #0f172a) 84%, white 16%);
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 14px;
      font: inherit;
    }

    .demo-runtime-view__facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }

    .demo-runtime-view__fact {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 14px;
      background: color-mix(in srgb, var(--ws-editor-background, #101828) 92%, white 8%);
    }

    .demo-runtime-view__fact strong {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .demo-runtime-view__fact span {
      min-height: 16px;
      font-size: 12px;
      line-height: 1.4;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .demo-runtime-view__footer {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      opacity: 0.84;
    }

    @media (max-width: 960px) {
      .demo-runtime-view__dashboard {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `;
  const container = document.createElement("section");
  container.className = "demo-runtime-view";
  const hero = document.createElement("header");
  hero.className = "demo-runtime-view__hero";
  const eyebrow = document.createElement("div");
  eyebrow.className = "demo-runtime-view__eyebrow";
  eyebrow.textContent = "Plugin UI Runtime";
  const title = document.createElement("h1");
  title.className = "demo-runtime-view__title";
  title.textContent = "Workspace view now rendered by ui.views";
  const meta = document.createElement("div");
  meta.className = "demo-runtime-view__meta";
  meta.innerHTML = [
    "<span>surfaceKind: " + context.surface.surfaceKind + "</span>",
    "<span>surfaceId: " + context.surface.surfaceId + "</span>",
    "<span>pluginId: " + context.surface.pluginId + "</span>"
  ].join("");
  hero.append(eyebrow, title, meta);
  const actionGrid = document.createElement("div");
  actionGrid.className = "demo-runtime-view__grid";
  const dashboard = document.createElement("div");
  dashboard.className = "demo-runtime-view__dashboard";
  const primaryColumn = document.createElement("div");
  primaryColumn.className = "demo-runtime-view__column";
  const secondaryColumn = document.createElement("div");
  secondaryColumn.className = "demo-runtime-view__column";
  const bridgeSection = document.createElement("section");
  bridgeSection.className = "demo-runtime-view__editor";
  const bridgeLabel = document.createElement("strong");
  bridgeLabel.textContent = "Host editor bridge";
  const bridgeHint = document.createElement("div");
  bridgeHint.textContent = "Reads the active editor state through the host bridge and can write text back into the focused document.";
  const bridgeFacts = document.createElement("div");
  bridgeFacts.className = "demo-runtime-view__facts";
  const documentValue = document.createElement("span");
  const focusValue = document.createElement("span");
  const selectionValue = document.createElement("span");
  const previewValue = document.createElement("span");
  bridgeFacts.append(
    createFactCard("Active document", documentValue),
    createFactCard("Focus", focusValue),
    createFactCard("Selection", selectionValue),
    createFactCard("Preview", previewValue)
  );
  const stateBridgeSection = document.createElement("section");
  stateBridgeSection.className = "demo-runtime-view__editor";
  const stateBridgeLabel = document.createElement("strong");
  stateBridgeLabel.textContent = "Host data + settings bridge";
  const stateBridgeHint = document.createElement("div");
  stateBridgeHint.textContent = "Reads persisted plugin data and host-owned setting tab summaries without relying on the legacy DOM snapshot path.";
  const stateBridgeFacts = document.createElement("div");
  stateBridgeFacts.className = "demo-runtime-view__facts";
  const persistedDataValue = document.createElement("span");
  const settingTabsValue = document.createElement("span");
  const lastSyncValue = document.createElement("span");
  stateBridgeFacts.append(
    createFactCard("Persisted plugin data", persistedDataValue),
    createFactCard("Setting tab summaries", settingTabsValue),
    createFactCard("Last bridge sync", lastSyncValue)
  );
  const themeSection = document.createElement("section");
  themeSection.className = "demo-runtime-view__editor";
  const themeLabel = document.createElement("strong");
  themeLabel.textContent = "Theme service";
  const themeHint = document.createElement("div");
  themeHint.textContent = "Reads semantic theme tokens through the published UI runtime ThemeService instead of accessing raw host CSS variables directly.";
  const themeFacts = document.createElement("div");
  themeFacts.className = "demo-runtime-view__facts";
  const themeNameValue = document.createElement("span");
  const themeAppearanceValue = document.createElement("span");
  const themeAccentValue = document.createElement("span");
  const themePanelValue = document.createElement("span");
  themeFacts.append(
    createFactCard("Theme", themeNameValue),
    createFactCard("Appearance", themeAppearanceValue),
    createFactCard("Accent", themeAccentValue),
    createFactCard("Panel surface", themePanelValue)
  );
  const editorSection = document.createElement("section");
  editorSection.className = "demo-runtime-view__editor";
  const editorLabel = document.createElement("strong");
  editorLabel.textContent = "Runtime-local editing";
  const editorHint = document.createElement("div");
  editorHint.textContent = "Typing here proves the active UI no longer depends on the legacy DOM replay path.";
  const textArea = document.createElement("textarea");
  textArea.placeholder = "Type directly inside the runtime iframe...";
  const footer = document.createElement("div");
  footer.className = "demo-runtime-view__footer";
  const statusText = document.createElement("span");
  statusText.textContent = "Ready.";
  const counterText = document.createElement("span");
  counterText.textContent = "0 characters";
  const updateCounter = () => {
    const characterCount = textArea.value.length;
    counterText.textContent = characterCount + " characters";
  };
  const updateStatus = (message) => {
    statusText.textContent = message;
  };
  const renderEditorState = (state, reason) => {
    if (state === null) {
      documentValue.textContent = "No focused editable document";
      focusValue.textContent = "Unavailable";
      selectionValue.textContent = "No selection";
      previewValue.textContent = reason;
      return;
    }
    documentValue.textContent = state.documentUri;
    focusValue.textContent = state.hasFocus ? "Focused" : "Blurred";
    selectionValue.textContent = state.selection === null ? "No selection" : `${formatEditorRange({
      from: state.selection.anchor,
      to: state.selection.head
    })} | ${state.selection.text.length} chars`;
    previewValue.textContent = state.content.trim().length === 0 ? "Document is empty" : state.content.slice(0, 120);
  };
  const renderThemeSnapshot = (reason) => {
    const snapshot = context.theme.getSnapshot();
    themeNameValue.textContent = snapshot.info.label;
    themeAppearanceValue.textContent = snapshot.info.appearance;
    themeAccentValue.textContent = snapshot.tokens["accent.primary"];
    themePanelValue.textContent = snapshot.tokens["surface.panel"];
    lastSyncValue.textContent = reason;
  };
  const refreshThemeSnapshot = (reason) => {
    renderThemeSnapshot(reason);
  };
  const refreshActiveEditorState = async (reason) => {
    const state = await context.host.editor.getState(null);
    renderEditorState(state, reason);
    return state;
  };
  const renderPersistedData = (data, reason) => {
    persistedDataValue.textContent = formatJsonValue(data);
    lastSyncValue.textContent = reason;
  };
  const renderSettingTabs = (settingTabs, reason) => {
    settingTabsValue.textContent = settingTabs.length === 0 ? "No registered setting tabs" : settingTabs.map((entry) => `${entry.title}${entry.preview === null ? "" : `
${entry.preview}`}`).join("\n\n");
    lastSyncValue.textContent = reason;
  };
  const refreshPersistedData = async (reason) => {
    const data = await context.host.data.load();
    renderPersistedData(data, reason);
    return data;
  };
  const refreshSettingTabs = async (reason) => {
    const settingTabs = await context.host.settings.getTabs();
    renderSettingTabs(settingTabs, reason);
    return settingTabs;
  };
  textArea.addEventListener("input", () => {
    updateCounter();
    updateStatus("Local runtime state updated inside iframe.");
  });
  const actionDefinitions = [
    createActionButton("Show host notice", "Calls the host bridge notification API.", async () => {
      await context.host.showNotice({
        level: "success",
        message: "Runtime iframe successfully called the host notice bridge."
      });
      updateStatus("Host notice dispatched.");
    }),
    createActionButton("Run snapshot command", "Executes the existing plugin command through the host bridge.", async () => {
      await context.host.executeCommand(SHOW_SNAPSHOT_COMMAND_ID, []);
      updateStatus("Host command executed: " + SHOW_SNAPSHOT_COMMAND_ID);
    }),
    createActionButton("Read editor state", "Reads the currently focused editor through the runtime host bridge.", async () => {
      const state = await refreshActiveEditorState("Active editor bridge state refreshed.");
      if (state === null) {
        await context.host.showNotice({
          level: "warning",
          message: "\u8BF7\u5148\u805A\u7126\u4E00\u4E2A\u53EF\u7F16\u8F91\u6587\u6863\uFF0C\u518D\u8BFB\u53D6 editor bridge \u72B6\u6001\u3002"
        });
        updateStatus("No active editor is available.");
        return;
      }
      updateStatus("Active editor bridge state refreshed.");
    }),
    createActionButton("Insert runtime note", "Appends a line to the current editor via host text edits.", async () => {
      const state = await refreshActiveEditorState("Preparing to apply runtime text edits.");
      if (state === null) {
        await context.host.showNotice({
          level: "warning",
          message: "\u5F53\u524D\u6CA1\u6709\u53EF\u5199\u5165\u7684\u7F16\u8F91\u5668\u6587\u6863\u3002"
        });
        updateStatus("Runtime text edit skipped because no editor is active.");
        return;
      }
      const contentLength = state.content.length;
      const lines = state.content.split("\n");
      const lineCount = lines.length;
      const lastLine = lines[lineCount - 1] ?? "";
      const lastLineLength = lastLine.length;
      const insertPrefix = contentLength === 0 ? "" : "\n";
      const stamp = (/* @__PURE__ */ new Date()).toISOString();
      await context.host.editor.applyTextEdits(state.documentUri, [{
        range: {
          from: { line: lineCount - 1, ch: lastLineLength },
          to: { line: lineCount - 1, ch: lastLineLength }
        },
        text: insertPrefix + "[ui.views runtime bridge wrote this line at " + stamp + "]"
      }]);
      await refreshActiveEditorState("Runtime text edit applied to the active document.");
      updateStatus("Runtime text edit applied to the active document.");
    }),
    createActionButton("Load runtime data", "Reads plugin persisted data through the host runtime bridge.", async () => {
      await refreshPersistedData("Plugin data reloaded through runtime bridge.");
      updateStatus("Plugin data reloaded through runtime bridge.");
    }),
    createActionButton("Save runtime data", "Persists a runtime-generated snapshot for this plugin.", async () => {
      const state = await context.host.editor.getState(null);
      const payload = {
        surfaceId: context.surface.surfaceId,
        savedAt: (/* @__PURE__ */ new Date()).toISOString(),
        localCharacterCount: textArea.value.length,
        localDraft: textArea.value,
        activeEditorUri: state?.documentUri ?? null,
        activeEditorFocused: state?.hasFocus ?? false
      };
      await context.host.data.save(payload);
      renderPersistedData(payload, "Plugin data saved from ui.views runtime.");
      updateStatus("Plugin data saved from ui.views runtime.");
    }),
    createActionButton("Delete runtime data", "Clears plugin persisted data through the host bridge.", async () => {
      await context.host.data.delete();
      renderPersistedData(null, "Plugin data cleared through runtime bridge.");
      updateStatus("Plugin data cleared through runtime bridge.");
    }),
    createActionButton("Read settings tabs", "Reads host-owned setting tab summaries for this plugin.", async () => {
      const settingTabs = await refreshSettingTabs("Setting tab summaries refreshed through runtime bridge.");
      updateStatus(`Loaded ${settingTabs.length} setting tab summary item(s).`);
    }),
    createActionButton("Focus editor", "Returns focus to the host editor without leaving the runtime surface.", async () => {
      await context.host.editor.performAction({
        action: "focus",
        documentUri: null
      });
      updateStatus("Host editor focus requested.");
    }),
    createActionButton("Undo editor edit", "Invokes the host editor undo action through the bridge.", async () => {
      await context.host.editor.performAction({
        action: "undo",
        documentUri: null
      });
      await refreshActiveEditorState("Host editor undo requested.");
      updateStatus("Host editor undo requested.");
    }),
    createActionButton("Activate view", "Asks the host to reveal this workspace leaf.", async () => {
      await context.host.activateView();
      updateStatus("Host view activation requested.");
    }),
    createActionButton("Close view", "Requests the host to close this workspace leaf.", async () => {
      await context.host.closeView();
    })
  ];
  for (const action of actionDefinitions) {
    actionGrid.append(action.element);
  }
  footer.append(statusText, counterText);
  bridgeSection.append(bridgeLabel, bridgeHint, bridgeFacts);
  stateBridgeSection.append(stateBridgeLabel, stateBridgeHint, stateBridgeFacts);
  themeSection.append(themeLabel, themeHint, themeFacts);
  editorSection.append(editorLabel, editorHint, textArea, footer);
  primaryColumn.append(actionGrid, editorSection);
  secondaryColumn.append(bridgeSection, stateBridgeSection, themeSection);
  dashboard.append(primaryColumn, secondaryColumn);
  container.append(hero, dashboard);
  context.root.replaceChildren(styleElement, container);
  context.markRendered();
  void refreshActiveEditorState("Editor bridge ready. Focus a document to inspect it here.");
  void refreshPersistedData("Plugin data bridge ready. Save a snapshot to persist runtime state.");
  void refreshSettingTabs("Settings bridge ready. Read host-owned setting tab summaries here.");
  refreshThemeSnapshot("Theme service ready.");
  const disposeThemeChange = context.theme.onDidChange(() => {
    refreshThemeSnapshot("Theme service changed.");
  });
  textArea.focus();
  return () => {
    for (const action of actionDefinitions) {
      action.dispose();
    }
    textArea.replaceWith(textArea.cloneNode(false));
    disposeThemeChange();
    styleElement.remove();
    container.remove();
  };
}
export {
  mountPluginSurface
};
//# sourceMappingURL=view.runtime.js.map
