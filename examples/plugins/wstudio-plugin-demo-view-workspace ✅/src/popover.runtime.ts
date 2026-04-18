interface RuntimeSurfaceDescriptor {
  readonly pluginId: string;
  readonly surfaceKind: 'view' | 'settingTab' | 'modal' | 'popover';
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly state: RuntimeJsonValue | null;
}

type RuntimeJsonPrimitive = string | number | boolean | null;
type RuntimeJsonValue = RuntimeJsonPrimitive | RuntimeJsonObject | RuntimeJsonValue[];

interface RuntimeJsonObject {
  readonly [key: string]: RuntimeJsonValue;
}

interface RuntimeInstructionSnapshot {
  readonly command: string;
  readonly purpose: string;
}

interface RuntimePopoverState {
  readonly title: string;
  readonly suggestions: readonly string[];
  readonly selectedIndex: number;
  readonly instructions: readonly RuntimeInstructionSnapshot[];
}

interface PluginRuntimeHostBridge {
  closeOverlay(): Promise<void>;
  readonly overlay: {
    dispatchAction(action: RuntimeJsonValue | null): Promise<void>;
  };
}

interface PluginRuntimeSurfaceContext {
  readonly surface: RuntimeSurfaceDescriptor;
  readonly root: HTMLElement;
  readonly host: PluginRuntimeHostBridge;
  readonly markRendered: () => void;
  readonly onSurfaceStateChange: (
    listener: (state: RuntimeJsonValue | null) => void,
  ) => (() => void);
}

function readString(value: RuntimeJsonValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: RuntimeJsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: RuntimeJsonValue | undefined): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function readInstructions(value: RuntimeJsonValue | undefined): readonly RuntimeInstructionSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== 'object') {
      return [];
    }

    const command = entry.command;
    const purpose = entry.purpose;

    if (typeof command !== 'string' || typeof purpose !== 'string') {
      return [];
    }

    return [{ command, purpose }];
  });
}

function readPopoverState(value: RuntimeJsonValue | null): RuntimePopoverState {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return {
      title: 'Workspace popover demo',
      suggestions: [],
      selectedIndex: -1,
      instructions: [],
    };
  }

  return {
    title: readString(value.title, 'Workspace popover demo'),
    suggestions: readStringArray(value.suggestions),
    selectedIndex: readNumber(value.selectedIndex, -1),
    instructions: readInstructions(value.instructions),
  };
}

function createButton(
  label: string,
  onClick: () => Promise<void>,
  selected = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `workspace-runtime-popover__item${selected ? ' workspace-runtime-popover__item--selected' : ''}`;
  button.textContent = label;
  button.addEventListener('click', () => {
    void onClick();
  });
  return button;
}

async function dispatchKeyboardAction(
  event: KeyboardEvent,
  context: PluginRuntimeSurfaceContext,
): Promise<void> {
  event.stopPropagation();

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: 'move-selection',
      direction: 1,
    });
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: 'move-selection',
      direction: -1,
    });
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: 'select-active',
    });
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    await context.host.closeOverlay();
  }
}

function buildInstructionsSignature(instructions: readonly RuntimeInstructionSnapshot[]): string {
  return instructions
    .map((instruction) => `${instruction.command}::${instruction.purpose}`)
    .join('||');
}

function buildSuggestionsSignature(suggestions: readonly string[]): string {
  return suggestions.join('||');
}

export function mountPluginSurface(context: PluginRuntimeSurfaceContext): () => void {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .workspace-runtime-popover {
      display: grid;
      gap: 12px;
      min-height: 100%;
      padding: 16px;
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 32%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.14));
      color: var(--ws-text-normal, #f8fafc);
    }

    .workspace-runtime-popover__panel {
      display: grid;
      gap: 10px;
      padding: 16px;
      border: 1px solid color-mix(in srgb, var(--ws-border-color, rgba(148, 163, 184, 0.28)) 84%, white 16%);
      border-radius: 16px;
      background: color-mix(in srgb, var(--ws-editor-background, #0f172a) 82%, white 18%);
      box-shadow: 0 16px 32px rgba(15, 23, 42, 0.16);
    }

    .workspace-runtime-popover__eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .workspace-runtime-popover__panel h2,
    .workspace-runtime-popover__panel p {
      margin: 0;
    }

    .workspace-runtime-popover__meta {
      font-size: 12px;
      opacity: 0.8;
    }

    .workspace-runtime-popover__instructions,
    .workspace-runtime-popover__items {
      display: grid;
      gap: 8px;
    }

    .workspace-runtime-popover__instruction {
      display: flex;
      gap: 8px;
      font-size: 12px;
      opacity: 0.9;
    }

    .workspace-runtime-popover__instruction kbd {
      min-width: 56px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.24);
      font: inherit;
      font-weight: 700;
      text-align: center;
    }

    .workspace-runtime-popover__item,
    .workspace-runtime-popover__close {
      border: 0;
      border-radius: 14px;
      min-height: 38px;
      padding: 0 14px;
      background: color-mix(in srgb, var(--ws-editor-background, #0f172a) 72%, white 28%);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .workspace-runtime-popover__item--selected {
      outline: 2px solid color-mix(in srgb, var(--ws-button-background, #38bdf8) 76%, white 24%);
      background: color-mix(in srgb, var(--ws-button-background, #38bdf8) 28%, var(--ws-editor-background, #0f172a) 72%);
    }

    .workspace-runtime-popover__close {
      text-align: center;
    }

    .workspace-runtime-popover__empty {
      margin: 0;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.22);
      font-size: 13px;
      opacity: 0.8;
    }
  `;

  const handleKeyDown = (event: KeyboardEvent): void => {
    void dispatchKeyboardAction(event, context);
  };

  document.addEventListener('keydown', handleKeyDown);
  const shell = document.createElement('section');
  shell.className = 'workspace-runtime-popover';
  shell.tabIndex = 0;

  const panel = document.createElement('section');
  panel.className = 'workspace-runtime-popover__panel';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'workspace-runtime-popover__eyebrow';
  eyebrow.textContent = 'Workspace Popover Runtime';

  const title = document.createElement('h2');
  title.textContent = 'Runtime popover now rendered by ui.modals';

  const meta = document.createElement('p');
  meta.className = 'workspace-runtime-popover__meta';

  const instructions = document.createElement('div');
  instructions.className = 'workspace-runtime-popover__instructions';

  const items = document.createElement('div');
  items.className = 'workspace-runtime-popover__items';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'workspace-runtime-popover__close';
  closeButton.textContent = 'Close popover';
  closeButton.addEventListener('click', () => {
    void context.host.closeOverlay();
  });

  panel.append(eyebrow, title, meta, instructions, items, closeButton);
  shell.append(panel);
  context.root.replaceChildren(styleElement, shell);

  let instructionSignature = '';
  let suggestionSignature = '';
  let itemButtons: HTMLButtonElement[] = [];
  let selectedIndex = -1;

  const updateSelection = (nextSelectedIndex: number, force = false): void => {
    if (!force && nextSelectedIndex === selectedIndex) {
      return;
    }

    selectedIndex = nextSelectedIndex;
    itemButtons.forEach((button, index) => {
      const selected = index === selectedIndex;
      button.classList.toggle('workspace-runtime-popover__item--selected', selected);
      if (selected) {
        button.scrollIntoView({
          block: 'nearest',
        });
      }
    });
  };

  const renderInstructions = (state: RuntimePopoverState): void => {
    const nextSignature = buildInstructionsSignature(state.instructions);

    if (nextSignature === instructionSignature) {
      return;
    }

    instructionSignature = nextSignature;
    instructions.replaceChildren();

    for (const instruction of state.instructions) {
      const row = document.createElement('div');
      row.className = 'workspace-runtime-popover__instruction';

      const command = document.createElement('kbd');
      command.textContent = instruction.command;

      const purpose = document.createElement('span');
      purpose.textContent = instruction.purpose;

      row.append(command, purpose);
      instructions.append(row);
    }
  };

  const renderItems = (state: RuntimePopoverState): void => {
    const nextSignature = buildSuggestionsSignature(state.suggestions);

    if (nextSignature !== suggestionSignature) {
      suggestionSignature = nextSignature;
      itemButtons = [];
      items.replaceChildren();

      if (state.suggestions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'workspace-runtime-popover__empty';
        empty.textContent = 'No runtime suggestions are available for this demo.';
        items.append(empty);
      } else {
        state.suggestions.forEach((suggestion, index) => {
          const itemButton = createButton(
            suggestion,
            async () => {
              await context.host.overlay.dispatchAction({
                type: 'select-index',
                index,
              });
            },
          );
          itemButtons.push(itemButton);
          items.append(itemButton);
        });
      }

      updateSelection(state.selectedIndex, true);
      return;
    }

    updateSelection(state.selectedIndex);
  };

  const renderSurface = (stateValue: RuntimeJsonValue | null, focusShell: boolean): void => {
    const state = readPopoverState(stateValue);
    meta.textContent = `${state.title} | surfaceId: ${context.surface.surfaceId}`;
    renderInstructions(state);
    renderItems(state);
    context.markRendered();

    if (focusShell) {
      requestAnimationFrame(() => {
        shell.focus();
      });
    }
  };

  renderSurface(context.surface.state, true);
  const unsubscribeSurfaceState = context.onSurfaceStateChange((state) => {
    renderSurface(state, false);
  });

  return () => {
    unsubscribeSurfaceState();
    document.removeEventListener('keydown', handleKeyDown);
    context.root.replaceChildren();
  };
}
