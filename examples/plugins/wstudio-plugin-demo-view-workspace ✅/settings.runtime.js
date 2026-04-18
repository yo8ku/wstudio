// src/settings.runtime.ts
function formatJsonValue(value) {
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value, null, 2) ?? "null";
}
function createActionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-settings-runtime__action";
  button.textContent = label;
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
function mountPluginSurface(context) {
  if (context.surface.surfaceId.endsWith(":setting-tab:2")) {
    throw new Error("Intentional ui.settings runtime failure for fallback demo.");
  }
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .demo-settings-runtime {
      display: grid;
      gap: 14px;
      min-height: 100%;
      padding: 18px;
      color: var(--ws-text-normal, inherit);
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 32%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.08));
    }

    .demo-settings-runtime__hero,
    .demo-settings-runtime__panel {
      display: grid;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 16px;
      background: color-mix(in srgb, var(--ws-editor-background, #101828) 88%, white 12%);
    }

    .demo-settings-runtime__eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .demo-settings-runtime__title {
      margin: 0;
      font-size: 24px;
      line-height: 1.12;
    }

    .demo-settings-runtime__meta {
      display: grid;
      gap: 6px;
      font-size: 13px;
      opacity: 0.84;
    }

    .demo-settings-runtime__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .demo-settings-runtime__action {
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid var(--ws-border-color, rgba(148, 163, 184, 0.24));
      border-radius: 999px;
      background: color-mix(in srgb, var(--ws-toolbar-background, #0f172a) 86%, white 14%);
      color: inherit;
      cursor: pointer;
    }

    .demo-settings-runtime__action:hover,
    .demo-settings-runtime__action:focus-visible {
      border-color: var(--ws-focusBorder, rgba(125, 211, 252, 0.72));
      outline: none;
    }

    .demo-settings-runtime__list,
    .demo-settings-runtime__pre {
      margin: 0;
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--ws-text-code-block-background, rgba(15, 23, 42, 0.18)) 84%, transparent 16%);
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      overflow: auto;
    }

    .demo-settings-runtime__list {
      display: grid;
      gap: 8px;
      list-style: none;
    }

    .demo-settings-runtime__list strong {
      display: block;
      margin-bottom: 2px;
    }
  `;
  const shell = document.createElement("div");
  shell.className = "demo-settings-runtime";
  const hero = document.createElement("section");
  hero.className = "demo-settings-runtime__hero";
  const eyebrow = document.createElement("div");
  eyebrow.className = "demo-settings-runtime__eyebrow";
  eyebrow.textContent = "PLUGIN UI SETTINGS";
  const title = document.createElement("h1");
  title.className = "demo-settings-runtime__title";
  title.textContent = "Settings tab now rendered by ui.settings";
  const meta = document.createElement("div");
  meta.className = "demo-settings-runtime__meta";
  meta.innerHTML = [
    "<div><strong>surfaceKind:</strong> " + context.surface.surfaceKind + "</div>",
    "<div><strong>surfaceId:</strong> " + context.surface.surfaceId + "</div>",
    "<div><strong>pluginId:</strong> " + context.surface.pluginId + "</div>"
  ].join("");
  hero.append(eyebrow, title, meta);
  const actionsPanel = document.createElement("section");
  actionsPanel.className = "demo-settings-runtime__panel";
  const actionsTitle = document.createElement("strong");
  actionsTitle.textContent = "Host bridge actions";
  const actions = document.createElement("div");
  actions.className = "demo-settings-runtime__actions";
  const dataPanel = document.createElement("section");
  dataPanel.className = "demo-settings-runtime__panel";
  const dataTitle = document.createElement("strong");
  dataTitle.textContent = "Plugin data snapshot";
  const dataPre = document.createElement("pre");
  dataPre.className = "demo-settings-runtime__pre";
  dataPre.textContent = "loading...";
  dataPanel.append(dataTitle, dataPre);
  const tabsPanel = document.createElement("section");
  tabsPanel.className = "demo-settings-runtime__panel";
  const tabsTitle = document.createElement("strong");
  tabsTitle.textContent = "Setting tab summaries";
  const tabsList = document.createElement("ul");
  tabsList.className = "demo-settings-runtime__list";
  tabsPanel.append(tabsTitle, tabsList);
  const refreshPersistedData = async () => {
    const data = await context.host.data.load();
    dataPre.textContent = formatJsonValue(data);
  };
  const refreshTabs = async () => {
    const tabs = await context.host.settings.getTabs();
    tabsTitle.textContent = "Setting tab summaries (" + tabs.length + ")";
    tabsList.replaceChildren(
      ...tabs.map((tab) => {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        name.textContent = tab.title;
        const preview = document.createElement("span");
        preview.textContent = tab.preview ?? "No summary preview available.";
        item.append(name, preview);
        return item;
      })
    );
  };
  const saveSampleDataButton = createActionButton("Save runtime data", async () => {
    await context.host.data.save({
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      surfaceId: context.surface.surfaceId,
      source: "settings-runtime"
    });
    await refreshPersistedData();
    await context.host.showNotice({
      message: "Settings runtime data saved.",
      level: "success"
    });
  });
  const loadSampleDataButton = createActionButton("Load runtime data", async () => {
    await refreshPersistedData();
    await context.host.showNotice({
      message: "Settings runtime data loaded.",
      level: "info"
    });
  });
  const deleteSampleDataButton = createActionButton("Delete runtime data", async () => {
    await context.host.data.delete();
    await refreshPersistedData();
    await context.host.showNotice({
      message: "Settings runtime data deleted.",
      level: "warning"
    });
  });
  const readSettingTabsButton = createActionButton("Read settings tabs", async () => {
    await refreshTabs();
    await context.host.showNotice({
      message: "Settings tab summaries refreshed.",
      level: "info"
    });
  });
  const showNoticeButton = createActionButton("Show host notice", async () => {
    await context.host.showNotice({
      message: "Settings runtime notice from ui.settings",
      level: "info"
    });
  });
  actions.append(
    loadSampleDataButton.element,
    saveSampleDataButton.element,
    deleteSampleDataButton.element,
    readSettingTabsButton.element,
    showNoticeButton.element
  );
  actionsPanel.append(actionsTitle, actions);
  shell.append(hero, actionsPanel, dataPanel, tabsPanel);
  context.root.replaceChildren(styleElement, shell);
  context.markRendered();
  void refreshPersistedData();
  void refreshTabs();
  return () => {
    saveSampleDataButton.dispose();
    loadSampleDataButton.dispose();
    deleteSampleDataButton.dispose();
    readSettingTabsButton.dispose();
    showNoticeButton.dispose();
    context.root.replaceChildren();
  };
}
export {
  mountPluginSurface
};
//# sourceMappingURL=settings.runtime.js.map
