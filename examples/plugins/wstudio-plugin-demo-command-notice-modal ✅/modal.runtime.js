// src/modal.runtime.ts
function formatJsonValue(value) {
  if (value === null) {
    return "null";
  }
  return JSON.stringify(value, null, 2) ?? "null";
}
function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-modal-runtime__button";
  button.textContent = label;
  button.addEventListener("click", () => {
    void onClick();
  });
  return button;
}
function mountPluginSurface(context) {
  const styleElement = document.createElement("style");
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
  const shell = document.createElement("section");
  shell.className = "demo-modal-runtime";
  const hero = document.createElement("section");
  hero.className = "demo-modal-runtime__hero";
  const eyebrow = document.createElement("span");
  eyebrow.className = "demo-modal-runtime__eyebrow";
  eyebrow.textContent = "Plugin Modal Runtime";
  const title = document.createElement("h1");
  title.textContent = "This modal is now rendered by ui.modals";
  const description = document.createElement("p");
  description.textContent = `surfaceId: ${context.surface.surfaceId}`;
  hero.append(eyebrow, title, description);
  const panel = document.createElement("section");
  panel.className = "demo-modal-runtime__panel";
  const panelTitle = document.createElement("h2");
  panelTitle.textContent = "Runtime host bridge";
  const panelDescription = document.createElement("p");
  panelDescription.textContent = "\u5F53\u524D modal \u6B63\u6587\u5DF2\u7ECF\u5728\u72EC\u7ACB sandbox iframe \u4E2D\u8FD0\u884C\u3002";
  const actions = document.createElement("div");
  actions.className = "demo-modal-runtime__actions";
  const dataView = document.createElement("pre");
  dataView.className = "demo-modal-runtime__data";
  dataView.textContent = "\u70B9\u51FB\u4E0B\u65B9\u52A8\u4F5C\u8BFB\u53D6\u6216\u4FDD\u5B58\u63D2\u4EF6\u6570\u636E\u3002";
  const showNoticeButton = createButton("Show host notice", async () => {
    await context.host.showNotice({
      message: "Modal runtime bridge is active.",
      level: "success"
    });
  });
  const saveDataButton = createButton("Save runtime data", async () => {
    await context.host.data.save({
      source: "modal-runtime",
      surfaceId: context.surface.surfaceId,
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    dataView.textContent = "\u5DF2\u5199\u5165\u63D2\u4EF6\u6570\u636E\u3002";
  });
  const loadDataButton = createButton("Load runtime data", async () => {
    const value = await context.host.data.load();
    dataView.textContent = formatJsonValue(value);
  });
  const closeButton = createButton("Close overlay", async () => {
    await context.host.closeOverlay();
  });
  closeButton.classList.add("demo-modal-runtime__button--secondary");
  actions.append(showNoticeButton, saveDataButton, loadDataButton, closeButton);
  panel.append(panelTitle, panelDescription, actions, dataView);
  shell.append(hero, panel);
  context.root.replaceChildren(styleElement, shell);
  context.markRendered();
  return () => {
    context.root.replaceChildren();
  };
}
export {
  mountPluginSurface
};
//# sourceMappingURL=modal.runtime.js.map
