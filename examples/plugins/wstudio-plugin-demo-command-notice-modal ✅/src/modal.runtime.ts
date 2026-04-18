interface RuntimeSurfaceDescriptor {
  readonly pluginId: string;
  readonly surfaceKind: 'view' | 'settingTab' | 'modal';
  readonly surfaceId: string;
  readonly entryUrl: string;
}

type RuntimeJsonPrimitive = string | number | boolean | null;
type RuntimeJsonValue = RuntimeJsonPrimitive | RuntimeJsonObject | RuntimeJsonValue[];

interface RuntimeJsonObject {
  readonly [key: string]: RuntimeJsonValue;
}

interface RuntimeHostNoticePayload {
  readonly message: string;
  readonly level: 'success' | 'error' | 'warning' | 'info';
}

interface PluginRuntimeHostBridge {
  showNotice(payload: RuntimeHostNoticePayload): Promise<void>;
  readonly data: {
    load(): Promise<RuntimeJsonValue | null>;
    save(data: RuntimeJsonValue | null): Promise<void>;
  };
  closeOverlay(): Promise<void>;
}

interface PluginRuntimeSurfaceContext {
  readonly surface: RuntimeSurfaceDescriptor;
  readonly root: HTMLElement;
  readonly host: PluginRuntimeHostBridge;
  readonly markRendered: () => void;
}

function formatJsonValue(value: RuntimeJsonValue | null): string {
  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value, null, 2) ?? 'null';
}

function createButton(label: string, onClick: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'demo-modal-runtime__button';
  button.textContent = label;
  button.addEventListener('click', () => {
    void onClick();
  });
  return button;
}

export function mountPluginSurface(context: PluginRuntimeSurfaceContext): () => void {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .demo-modal-runtime {
      display: grid;
      gap: 16px;
      min-height: 100%;
      padding: 20px;
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.22), transparent 34%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.14));
      color: var(--ws-text-normal, #f8fafc);
    }

    .demo-modal-runtime__hero,
    .demo-modal-runtime__panel {
      display: grid;
      gap: 10px;
      padding: 18px;
      border: 1px solid color-mix(in srgb, var(--ws-border-color, rgba(148, 163, 184, 0.28)) 88%, white 12%);
      border-radius: 18px;
      background: color-mix(in srgb, var(--ws-editor-background, #0f172a) 84%, white 16%);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
    }

    .demo-modal-runtime__eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .demo-modal-runtime__hero h1,
    .demo-modal-runtime__panel h2,
    .demo-modal-runtime__panel p {
      margin: 0;
    }

    .demo-modal-runtime__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .demo-modal-runtime__button {
      border: 0;
      border-radius: 999px;
      min-height: 38px;
      padding: 0 16px;
      background: color-mix(in srgb, var(--ws-button-background, #38bdf8) 88%, white 12%);
      color: var(--ws-button-foreground, #0f172a);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .demo-modal-runtime__button--secondary {
      background: color-mix(in srgb, var(--ws-editor-background, #0f172a) 70%, white 30%);
      color: var(--ws-text-normal, #f8fafc);
    }

    .demo-modal-runtime__data {
      margin: 0;
      padding: 14px;
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.22);
      color: inherit;
      font: 12px/1.5 Consolas, "SFMono-Regular", Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;

  const shell = document.createElement('section');
  shell.className = 'demo-modal-runtime';

  const hero = document.createElement('section');
  hero.className = 'demo-modal-runtime__hero';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'demo-modal-runtime__eyebrow';
  eyebrow.textContent = 'Plugin Modal Runtime';

  const title = document.createElement('h1');
  title.textContent = 'This modal is now rendered by ui.modals';

  const description = document.createElement('p');
  description.textContent = `surfaceId: ${context.surface.surfaceId}`;

  hero.append(eyebrow, title, description);

  const panel = document.createElement('section');
  panel.className = 'demo-modal-runtime__panel';

  const panelTitle = document.createElement('h2');
  panelTitle.textContent = 'Runtime host bridge';

  const panelDescription = document.createElement('p');
  panelDescription.textContent = '当前 modal 正文已经在独立 sandbox iframe 中运行。';

  const actions = document.createElement('div');
  actions.className = 'demo-modal-runtime__actions';

  const dataView = document.createElement('pre');
  dataView.className = 'demo-modal-runtime__data';
  dataView.textContent = '点击下方动作读取或保存插件数据。';

  const showNoticeButton = createButton('Show host notice', async () => {
    await context.host.showNotice({
      message: 'Modal runtime bridge is active.',
      level: 'success',
    });
  });

  const saveDataButton = createButton('Save runtime data', async () => {
    await context.host.data.save({
      source: 'modal-runtime',
      surfaceId: context.surface.surfaceId,
      savedAt: new Date().toISOString(),
    });
    dataView.textContent = '已写入插件数据。';
  });

  const loadDataButton = createButton('Load runtime data', async () => {
    const value = await context.host.data.load();
    dataView.textContent = formatJsonValue(value);
  });

  const closeButton = createButton('Close overlay', async () => {
    await context.host.closeOverlay();
  });
  closeButton.classList.add('demo-modal-runtime__button--secondary');

  actions.append(showNoticeButton, saveDataButton, loadDataButton, closeButton);
  panel.append(panelTitle, panelDescription, actions, dataView);
  shell.append(hero, panel);
  context.root.replaceChildren(styleElement, shell);
  context.markRendered();

  return () => {
    context.root.replaceChildren();
  };
}
