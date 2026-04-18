// src/popover.runtime.ts
function readString(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function readNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function readStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
function readInstructions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
      return [];
    }
    const command = entry.command;
    const purpose = entry.purpose;
    if (typeof command !== "string" || typeof purpose !== "string") {
      return [];
    }
    return [{ command, purpose }];
  });
}
function readInteractionMode(value) {
  return value === "editorSuggest" ? "editorSuggest" : "default";
}
function readPopoverState(value) {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return {
      title: "Runtime popover demo",
      query: "",
      suggestions: [],
      selectedIndex: -1,
      instructions: [],
      interactionMode: "default"
    };
  }
  return {
    title: readString(value.title, "Runtime popover demo"),
    query: readString(value.query, ""),
    suggestions: readStringArray(value.suggestions),
    selectedIndex: readNumber(value.selectedIndex, -1),
    instructions: readInstructions(value.instructions),
    interactionMode: readInteractionMode(value.interactionMode)
  };
}
function createButton(label, onClick, selected = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `demo-runtime-popover__item${selected ? " demo-runtime-popover__item--selected" : ""}`;
  button.textContent = label;
  button.addEventListener("click", () => {
    void onClick();
  });
  return button;
}
async function dispatchKeyboardAction(event, context) {
  event.stopPropagation();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: "move-selection",
      direction: 1
    });
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: "move-selection",
      direction: -1
    });
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    await context.host.overlay.dispatchAction({
      type: "select-active"
    });
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    await context.host.closeOverlay();
  }
}
function buildInstructionsSignature(instructions) {
  return instructions.map((instruction) => `${instruction.command}::${instruction.purpose}`).join("||");
}
function buildSuggestionsSignature(suggestions) {
  return suggestions.join("||");
}
function mountPluginSurface(context) {
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .demo-runtime-popover {
      display: grid;
      gap: 12px;
      min-height: 100%;
      padding: 16px;
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 36%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.14));
      color: var(--ws-text-normal, #f8fafc);
    }

    .demo-runtime-popover__panel {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid color-mix(in srgb, var(--ws-border-color, rgba(148, 163, 184, 0.28)) 88%, white 12%);
      border-radius: 16px;
      background: color-mix(in srgb, var(--ws-editor-background, #0f172a) 84%, white 16%);
      box-shadow: 0 16px 32px rgba(15, 23, 42, 0.16);
    }

    .demo-runtime-popover__eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .demo-runtime-popover__panel h2,
    .demo-runtime-popover__panel p,
    .demo-runtime-popover__meta,
    .demo-runtime-popover__empty {
      margin: 0;
    }

    .demo-runtime-popover__meta {
      font-size: 12px;
      opacity: 0.78;
    }

    .demo-runtime-popover__instructions,
    .demo-runtime-popover__items {
      display: grid;
      gap: 8px;
    }

    .demo-runtime-popover__instruction {
      display: flex;
      gap: 8px;
      font-size: 12px;
      opacity: 0.88;
    }

    .demo-runtime-popover__instruction kbd {
      min-width: 56px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.24);
      font: inherit;
      font-weight: 700;
      text-align: center;
    }

    .demo-runtime-popover__item,
    .demo-runtime-popover__close {
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

    .demo-runtime-popover__item--selected {
      outline: 2px solid color-mix(in srgb, var(--ws-button-background, #38bdf8) 76%, white 24%);
      background: color-mix(in srgb, var(--ws-button-background, #38bdf8) 28%, var(--ws-editor-background, #0f172a) 72%);
    }

    .demo-runtime-popover__close {
      text-align: center;
    }

    .demo-runtime-popover__empty {
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.22);
      font-size: 13px;
      opacity: 0.78;
    }
  `;
  const shell = document.createElement("section");
  shell.className = "demo-runtime-popover";
  shell.tabIndex = 0;
  const panel = document.createElement("section");
  panel.className = "demo-runtime-popover__panel";
  const eyebrow = document.createElement("span");
  eyebrow.className = "demo-runtime-popover__eyebrow";
  eyebrow.textContent = "Plugin Runtime Popover";
  const title = document.createElement("h2");
  const meta = document.createElement("p");
  meta.className = "demo-runtime-popover__meta";
  const instructions = document.createElement("div");
  instructions.className = "demo-runtime-popover__instructions";
  const items = document.createElement("div");
  items.className = "demo-runtime-popover__items";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "demo-runtime-popover__close";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    void context.host.closeOverlay();
  });
  panel.append(eyebrow, title, meta, instructions, items, closeButton);
  shell.append(panel);
  context.root.replaceChildren(styleElement, shell);
  const handleKeyDown = (event) => {
    void dispatchKeyboardAction(event, context);
  };
  let keyboardModeEnabled = false;
  let lastInstructionsSignature = "";
  let lastSuggestionsSignature = "";
  let selectedButtons = [];
  const setKeyboardModeEnabled = (enabled) => {
    if (keyboardModeEnabled === enabled) {
      return;
    }
    keyboardModeEnabled = enabled;
    if (enabled) {
      document.addEventListener("keydown", handleKeyDown);
      shell.addEventListener("keydown", handleKeyDown);
      return;
    }
    document.removeEventListener("keydown", handleKeyDown);
    shell.removeEventListener("keydown", handleKeyDown);
  };
  const updateSelection = (nextSelectedIndex, force = false) => {
    selectedButtons.forEach((button, index) => {
      const selected = index === nextSelectedIndex;
      if (!force && button.classList.contains("demo-runtime-popover__item--selected") === selected) {
        return;
      }
      button.classList.toggle("demo-runtime-popover__item--selected", selected);
      if (selected) {
        button.scrollIntoView({
          block: "nearest"
        });
      }
    });
  };
  const renderInstructions = (nextInstructions) => {
    const nextSignature = buildInstructionsSignature(nextInstructions);
    if (nextSignature === lastInstructionsSignature) {
      return;
    }
    lastInstructionsSignature = nextSignature;
    instructions.replaceChildren();
    for (const instruction of nextInstructions) {
      const row = document.createElement("div");
      row.className = "demo-runtime-popover__instruction";
      const command = document.createElement("kbd");
      command.textContent = instruction.command;
      const purpose = document.createElement("span");
      purpose.textContent = instruction.purpose;
      row.append(command, purpose);
      instructions.append(row);
    }
  };
  const renderItems = (nextSuggestions) => {
    const nextSignature = buildSuggestionsSignature(nextSuggestions);
    if (nextSignature === lastSuggestionsSignature) {
      return;
    }
    lastSuggestionsSignature = nextSignature;
    selectedButtons = [];
    items.replaceChildren();
    if (nextSuggestions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "demo-runtime-popover__empty";
      empty.textContent = "No runtime suggestions are currently available.";
      items.append(empty);
      return;
    }
    nextSuggestions.forEach((suggestion, index) => {
      const itemButton = createButton(suggestion, async () => {
        await context.host.overlay.dispatchAction({
          type: "select-index",
          index
        });
      });
      selectedButtons.push(itemButton);
      items.append(itemButton);
    });
  };
  const renderSurface = (stateValue, focusShell) => {
    const state = readPopoverState(stateValue);
    title.textContent = state.title;
    meta.textContent = `query: ${state.query || "empty"} | mode: ${state.interactionMode} | surfaceId: ${context.surface.surfaceId}`;
    renderInstructions(state.instructions);
    renderItems(state.suggestions);
    updateSelection(state.selectedIndex, true);
    setKeyboardModeEnabled(state.interactionMode !== "editorSuggest");
    if (focusShell && state.interactionMode !== "editorSuggest") {
      requestAnimationFrame(() => {
        shell.focus();
      });
    }
  };
  renderSurface(context.surface.state, true);
  context.markRendered();
  const unsubscribe = context.onSurfaceStateChange((nextState) => {
    renderSurface(nextState, false);
  });
  return () => {
    unsubscribe();
    setKeyboardModeEnabled(false);
    context.root.replaceChildren();
  };
}
export {
  mountPluginSurface
};
//# sourceMappingURL=popover.runtime.js.map
