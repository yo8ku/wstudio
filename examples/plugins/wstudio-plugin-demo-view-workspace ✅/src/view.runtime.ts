import {
  acquirePluginUiContext,
  type JsonValue,
  type PluginUiEditorPoint,
  type PluginUiEditorRange,
  type PluginUiEditorStateSnapshot,
  type PluginUiSettingTabSummary,
} from '@note-studio/plugin';

const SHOW_SNAPSHOT_COMMAND_ID = 'show-demo-workspace-snapshot';

function createActionButton(
  label: string,
  description: string,
  onClick: () => Promise<void>,
): {
  readonly element: HTMLButtonElement;
  readonly dispose: () => void;
} {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'demo-runtime-view__action';
  button.innerHTML = '<strong>' + label + '</strong><span>' + description + '</span>';

  const handleClick = (): void => {
    void onClick();
  };

  button.addEventListener('click', handleClick);

  return {
    element: button,
    dispose: () => {
      button.removeEventListener('click', handleClick);
    },
  };
}

function createFactCard(
  label: string,
  valueElement: HTMLElement,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'demo-runtime-view__fact';

  const labelElement = document.createElement('strong');
  labelElement.textContent = label;

  card.append(labelElement, valueElement);
  return card;
}

function formatEditorPoint(point: PluginUiEditorPoint): string {
  return `L${point.line + 1}:C${point.ch + 1}`;
}

function formatEditorRange(range: PluginUiEditorRange): string {
  return `${formatEditorPoint(range.from)} -> ${formatEditorPoint(range.to)}`;
}

function formatJsonValue(value: JsonValue | null): string {
  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value, null, 2) ?? 'null';
}

export function mountPluginSurface(): () => void {
  const context = acquirePluginUiContext();
  const styleElement = document.createElement('style');
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

  const container = document.createElement('section');
  container.className = 'demo-runtime-view';

  const hero = document.createElement('header');
  hero.className = 'demo-runtime-view__hero';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'demo-runtime-view__eyebrow';
  eyebrow.textContent = 'Plugin UI Runtime';

  const title = document.createElement('h1');
  title.className = 'demo-runtime-view__title';
  title.textContent = 'Workspace view now rendered by ui.views';

  const meta = document.createElement('div');
  meta.className = 'demo-runtime-view__meta';
  meta.innerHTML = [
    '<span>surfaceKind: ' + context.surface.surfaceKind + '</span>',
    '<span>surfaceId: ' + context.surface.surfaceId + '</span>',
    '<span>pluginId: ' + context.surface.pluginId + '</span>',
  ].join('');

  hero.append(eyebrow, title, meta);

  const actionGrid = document.createElement('div');
  actionGrid.className = 'demo-runtime-view__grid';

  const dashboard = document.createElement('div');
  dashboard.className = 'demo-runtime-view__dashboard';

  const primaryColumn = document.createElement('div');
  primaryColumn.className = 'demo-runtime-view__column';

  const secondaryColumn = document.createElement('div');
  secondaryColumn.className = 'demo-runtime-view__column';

  const bridgeSection = document.createElement('section');
  bridgeSection.className = 'demo-runtime-view__editor';

  const bridgeLabel = document.createElement('strong');
  bridgeLabel.textContent = 'Host editor bridge';

  const bridgeHint = document.createElement('div');
  bridgeHint.textContent = 'Reads the active editor state through the host bridge and can write text back into the focused document.';

  const bridgeFacts = document.createElement('div');
  bridgeFacts.className = 'demo-runtime-view__facts';

  const documentValue = document.createElement('span');
  const focusValue = document.createElement('span');
  const selectionValue = document.createElement('span');
  const previewValue = document.createElement('span');

  bridgeFacts.append(
    createFactCard('Active document', documentValue),
    createFactCard('Focus', focusValue),
    createFactCard('Selection', selectionValue),
    createFactCard('Preview', previewValue),
  );

  const stateBridgeSection = document.createElement('section');
  stateBridgeSection.className = 'demo-runtime-view__editor';

  const stateBridgeLabel = document.createElement('strong');
  stateBridgeLabel.textContent = 'Host data + settings bridge';

  const stateBridgeHint = document.createElement('div');
  stateBridgeHint.textContent = 'Reads persisted plugin data and host-owned setting tab summaries without relying on the legacy DOM snapshot path.';

  const stateBridgeFacts = document.createElement('div');
  stateBridgeFacts.className = 'demo-runtime-view__facts';

  const persistedDataValue = document.createElement('span');
  const settingTabsValue = document.createElement('span');
  const lastSyncValue = document.createElement('span');

  stateBridgeFacts.append(
    createFactCard('Persisted plugin data', persistedDataValue),
    createFactCard('Setting tab summaries', settingTabsValue),
    createFactCard('Last bridge sync', lastSyncValue),
  );

  const themeSection = document.createElement('section');
  themeSection.className = 'demo-runtime-view__editor';

  const themeLabel = document.createElement('strong');
  themeLabel.textContent = 'Theme service';

  const themeHint = document.createElement('div');
  themeHint.textContent = 'Reads semantic theme tokens through the published UI runtime ThemeService instead of accessing raw host CSS variables directly.';

  const themeFacts = document.createElement('div');
  themeFacts.className = 'demo-runtime-view__facts';

  const themeNameValue = document.createElement('span');
  const themeAppearanceValue = document.createElement('span');
  const themeAccentValue = document.createElement('span');
  const themePanelValue = document.createElement('span');

  themeFacts.append(
    createFactCard('Theme', themeNameValue),
    createFactCard('Appearance', themeAppearanceValue),
    createFactCard('Accent', themeAccentValue),
    createFactCard('Panel surface', themePanelValue),
  );

  const editorSection = document.createElement('section');
  editorSection.className = 'demo-runtime-view__editor';

  const editorLabel = document.createElement('strong');
  editorLabel.textContent = 'Runtime-local editing';

  const editorHint = document.createElement('div');
  editorHint.textContent = 'Typing here proves the active UI no longer depends on the legacy DOM replay path.';

  const textArea = document.createElement('textarea');
  textArea.placeholder = 'Type directly inside the runtime iframe...';

  const footer = document.createElement('div');
  footer.className = 'demo-runtime-view__footer';

  const statusText = document.createElement('span');
  statusText.textContent = 'Ready.';

  const counterText = document.createElement('span');
  counterText.textContent = '0 characters';

  const updateCounter = (): void => {
    const characterCount = textArea.value.length;
    counterText.textContent = characterCount + ' characters';
  };

  const updateStatus = (message: string): void => {
    statusText.textContent = message;
  };

  const renderEditorState = (
    state: PluginUiEditorStateSnapshot | null,
    reason: string,
  ): void => {
    if (state === null) {
      documentValue.textContent = 'No focused editable document';
      focusValue.textContent = 'Unavailable';
      selectionValue.textContent = 'No selection';
      previewValue.textContent = reason;
      return;
    }

    documentValue.textContent = state.documentUri;
    focusValue.textContent = state.hasFocus ? 'Focused' : 'Blurred';
    selectionValue.textContent = state.selection === null
      ? 'No selection'
      : `${formatEditorRange({
          from: state.selection.anchor,
          to: state.selection.head,
        })} | ${state.selection.text.length} chars`;
    previewValue.textContent = state.content.trim().length === 0
      ? 'Document is empty'
      : state.content.slice(0, 120);
  };

  const renderThemeSnapshot = (reason: string): void => {
    const snapshot = context.theme.getSnapshot();
    themeNameValue.textContent = snapshot.info.label;
    themeAppearanceValue.textContent = snapshot.info.appearance;
    themeAccentValue.textContent = snapshot.tokens['accent.primary'];
    themePanelValue.textContent = snapshot.tokens['surface.panel'];
    lastSyncValue.textContent = reason;
  };

  const refreshThemeSnapshot = (reason: string): void => {
    renderThemeSnapshot(reason);
  };

  const refreshActiveEditorState = async (reason: string): Promise<PluginUiEditorStateSnapshot | null> => {
    const state = await context.host.editor.getState(null);
    renderEditorState(state, reason);
    return state;
  };

  const renderPersistedData = (data: JsonValue | null, reason: string): void => {
    persistedDataValue.textContent = formatJsonValue(data);
    lastSyncValue.textContent = reason;
  };

  const renderSettingTabs = (
    settingTabs: readonly PluginUiSettingTabSummary[],
    reason: string,
  ): void => {
    settingTabsValue.textContent = settingTabs.length === 0
      ? 'No registered setting tabs'
      : settingTabs
        .map((entry) => `${entry.title}${entry.preview === null ? '' : `\n${entry.preview}`}`)
        .join('\n\n');
    lastSyncValue.textContent = reason;
  };

  const refreshPersistedData = async (reason: string): Promise<JsonValue | null> => {
    const data = await context.host.data.load();
    renderPersistedData(data, reason);
    return data;
  };

  const refreshSettingTabs = async (reason: string): Promise<readonly PluginUiSettingTabSummary[]> => {
    const settingTabs = await context.host.settings.getTabs();
    renderSettingTabs(settingTabs, reason);
    return settingTabs;
  };

  textArea.addEventListener('input', () => {
    updateCounter();
    updateStatus('Local runtime state updated inside iframe.');
  });

  const actionDefinitions = [
    createActionButton('Show host notice', 'Calls the host bridge notification API.', async () => {
      await context.host.showNotice({
        level: 'success',
        message: 'Runtime iframe successfully called the host notice bridge.',
      });
      updateStatus('Host notice dispatched.');
    }),
    createActionButton('Run snapshot command', 'Executes the existing plugin command through the host bridge.', async () => {
      await context.host.executeCommand(SHOW_SNAPSHOT_COMMAND_ID, []);
      updateStatus('Host command executed: ' + SHOW_SNAPSHOT_COMMAND_ID);
    }),
    createActionButton('Read editor state', 'Reads the currently focused editor through the runtime host bridge.', async () => {
      const state = await refreshActiveEditorState('Active editor bridge state refreshed.');

      if (state === null) {
        await context.host.showNotice({
          level: 'warning',
          message: '请先聚焦一个可编辑文档，再读取 editor bridge 状态。',
        });
        updateStatus('No active editor is available.');
        return;
      }

      updateStatus('Active editor bridge state refreshed.');
    }),
    createActionButton('Insert runtime note', 'Appends a line to the current editor via host text edits.', async () => {
      const state = await refreshActiveEditorState('Preparing to apply runtime text edits.');

      if (state === null) {
        await context.host.showNotice({
          level: 'warning',
          message: '当前没有可写入的编辑器文档。',
        });
        updateStatus('Runtime text edit skipped because no editor is active.');
        return;
      }

      const contentLength = state.content.length;
      const lines = state.content.split('\n');
      const lineCount = lines.length;
      const lastLine = lines[lineCount - 1] ?? '';
      const lastLineLength = lastLine.length;
      const insertPrefix = contentLength === 0 ? '' : '\n';
      const stamp = new Date().toISOString();

      await context.host.editor.applyTextEdits(state.documentUri, [{
        range: {
          from: { line: lineCount - 1, ch: lastLineLength },
          to: { line: lineCount - 1, ch: lastLineLength },
        },
        text: insertPrefix + '[ui.views runtime bridge wrote this line at ' + stamp + ']',
      }]);
      await refreshActiveEditorState('Runtime text edit applied to the active document.');
      updateStatus('Runtime text edit applied to the active document.');
    }),
    createActionButton('Load runtime data', 'Reads plugin persisted data through the host runtime bridge.', async () => {
      await refreshPersistedData('Plugin data reloaded through runtime bridge.');
      updateStatus('Plugin data reloaded through runtime bridge.');
    }),
    createActionButton('Save runtime data', 'Persists a runtime-generated snapshot for this plugin.', async () => {
      const state = await context.host.editor.getState(null);
      const payload = {
        surfaceId: context.surface.surfaceId,
        savedAt: new Date().toISOString(),
        localCharacterCount: textArea.value.length,
        localDraft: textArea.value,
        activeEditorUri: state?.documentUri ?? null,
        activeEditorFocused: state?.hasFocus ?? false,
      } satisfies JsonValue;

      await context.host.data.save(payload);
      renderPersistedData(payload, 'Plugin data saved from ui.views runtime.');
      updateStatus('Plugin data saved from ui.views runtime.');
    }),
    createActionButton('Delete runtime data', 'Clears plugin persisted data through the host bridge.', async () => {
      await context.host.data.delete();
      renderPersistedData(null, 'Plugin data cleared through runtime bridge.');
      updateStatus('Plugin data cleared through runtime bridge.');
    }),
    createActionButton('Read settings tabs', 'Reads host-owned setting tab summaries for this plugin.', async () => {
      const settingTabs = await refreshSettingTabs('Setting tab summaries refreshed through runtime bridge.');
      updateStatus(`Loaded ${settingTabs.length} setting tab summary item(s).`);
    }),
    createActionButton('Focus editor', 'Returns focus to the host editor without leaving the runtime surface.', async () => {
      await context.host.editor.performAction({
        action: 'focus',
        documentUri: null,
      });
      updateStatus('Host editor focus requested.');
    }),
    createActionButton('Undo editor edit', 'Invokes the host editor undo action through the bridge.', async () => {
      await context.host.editor.performAction({
        action: 'undo',
        documentUri: null,
      });
      await refreshActiveEditorState('Host editor undo requested.');
      updateStatus('Host editor undo requested.');
    }),
    createActionButton('Activate view', 'Asks the host to reveal this workspace leaf.', async () => {
      await context.host.activateView();
      updateStatus('Host view activation requested.');
    }),
    createActionButton('Close view', 'Requests the host to close this workspace leaf.', async () => {
      await context.host.closeView();
    }),
  ] as const;

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
  void refreshActiveEditorState('Editor bridge ready. Focus a document to inspect it here.');
  void refreshPersistedData('Plugin data bridge ready. Save a snapshot to persist runtime state.');
  void refreshSettingTabs('Settings bridge ready. Read host-owned setting tab summaries here.');
  refreshThemeSnapshot('Theme service ready.');
  const disposeThemeChange = context.theme.onDidChange(() => {
    refreshThemeSnapshot('Theme service changed.');
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
