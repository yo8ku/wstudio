/**
 * Demo plugin entry used to verify workspace, leaf, and item view behavior.
 * It now also verifies that plugin ItemView content can interact inside the renderer host.
 */

import {
  ItemView,
  Notice,
  Plugin,
  type JsonObject,
  type PluginFailureContext,
  type ViewStateResult,
  type WorkspaceLeaf,
} from '@note-studio/plugin';

const DEMO_VIEW_TYPE = 'wstudio-demo-workspace-view';
const DEMO_TITLE = '工作区视图演示';
const OPEN_VIEW_COMMAND_ID = 'open-demo-workspace-view';
const ACTIVATE_VIEW_COMMAND_ID = 'activate-demo-workspace-view';
const TRIGGER_VIEW_ACTION_COMMAND_ID = 'trigger-demo-workspace-view-action';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-demo-workspace-snapshot';
const CLOSE_VIEWS_COMMAND_ID = 'close-demo-workspace-views';

type DemoViewConstructorArgument = string | number | boolean | bigint | symbol | object | null | undefined;
type DemoTraceHandler = (message: string) => void;

function readStringValue(state: JsonObject, key: string, fallback: string): string {
  const value = state[key];
  return typeof value === 'string' ? value : fallback;
}

function readFiniteNumberValue(state: JsonObject, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ignoreDemoMessage(message: string): void {
  void message;
}

function isDemoTraceHandler(value: DemoViewConstructorArgument): value is DemoTraceHandler {
  return typeof value === 'function';
}

function resolveWorkspaceLeaf(args: readonly DemoViewConstructorArgument[]): WorkspaceLeaf {
  const leaf = args[0] ?? null;

  if (typeof leaf !== 'object' || leaf === null) {
    throw new Error('DemoWorkspaceView requires a workspace leaf.');
  }

  return leaf as WorkspaceLeaf;
}

function resolveTraceHandler(value: DemoViewConstructorArgument): DemoTraceHandler {
  return isDemoTraceHandler(value) ? value : ignoreDemoMessage;
}

class DemoWorkspaceView extends ItemView {
  private source = '未设置';
  private sequence = 0;
  private stateMessage = '尚未写入状态';
  private actionEl: HTMLElement | null = null;
  private readonly trace: DemoTraceHandler;
  private readonly notify: DemoTraceHandler;

  public constructor(...args: DemoViewConstructorArgument[]) {
    super(resolveWorkspaceLeaf(args));
    this.trace = resolveTraceHandler(args[1] ?? null);
    this.notify = resolveTraceHandler(args[2] ?? null);
    this.icon = 'layout-dashboard';
  }

  public getViewType(): string {
    return DEMO_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return `${DEMO_TITLE} #${this.sequence}`;
  }

  public getState(): JsonObject {
    return {
      source: this.source,
      sequence: this.sequence,
      stateMessage: this.stateMessage,
    };
  }

  public async setState(state: JsonObject, result: ViewStateResult): Promise<void> {
    this.source = readStringValue(state, 'source', this.source);
    this.sequence = readFiniteNumberValue(state, 'sequence', this.sequence);
    this.stateMessage = readStringValue(state, 'stateMessage', this.stateMessage);
    this.renderViewContent();
    this.trace(
      `view.setState#${this.sequence} source=${this.source} history=${result.history} message=${this.stateMessage}`,
    );
  }

  public override onOpen(): void {
    this.trace(`view.onOpen#${this.sequence} leaf=${this.leaf.id}`);
    this.renderViewContent();
    this.actionEl = this.addAction('play-circle', '触发视图动作', () => {
      this.trace(`view.action#${this.sequence} leaf=${this.leaf.id}`);
      this.notify(`视图内部动作已触发：leaf=${this.leaf.id}, sequence=${this.sequence}`);
    });
    this.actionEl.textContent = '触发视图动作';
  }

  public override onClose(): void {
    this.trace(`view.onClose#${this.sequence} leaf=${this.leaf.id}`);
    this.actionEl = null;
  }

  public triggerInternalAction(): boolean {
    if (this.actionEl === null) {
      return false;
    }

    this.actionEl.click();
    return true;
  }

  private renderViewContent(): void {
    const titleEl = document.createElement('div');
    titleEl.textContent = `${DEMO_TITLE} #${this.sequence}`;

    const sourceEl = document.createElement('div');
    sourceEl.textContent = `来源：${this.source}`;

    const stateEl = document.createElement('div');
    stateEl.textContent = `状态：${this.stateMessage}`;

    const leafEl = document.createElement('div');
    leafEl.textContent = `叶子：${this.leaf.id}`;

    const editorLabelEl = document.createElement('div');
    editorLabelEl.textContent = '在视图内直接编辑状态：';

    const editorInputEl = document.createElement('input');
    editorInputEl.type = 'text';
    editorInputEl.value = this.stateMessage;
    editorInputEl.placeholder = '输入新的状态文本';
    this.registerDomEvent(editorInputEl, 'input', () => {
      this.stateMessage = editorInputEl.value.trim().length === 0 ? '未填写状态' : editorInputEl.value;
      stateEl.textContent = `状态：${this.stateMessage}`;
      this.trace(`view.input#${this.sequence} value=${this.stateMessage}`);
    });

    const actionHintEl = document.createElement('div');
    actionHintEl.textContent = '下方按钮应可直接在视图中点击触发：';

    this.contentEl.replaceChildren(
      titleEl,
      sourceEl,
      stateEl,
      leafEl,
      editorLabelEl,
      editorInputEl,
      actionHintEl,
    );

    if (this.actionEl !== null) {
      this.contentEl.append(this.actionEl);
    }
  }
}

export default class DemoViewWorkspacePlugin extends Plugin {
  private nextSequence = 0;

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.registerView(DEMO_VIEW_TYPE, (leaf) => new DemoWorkspaceView(
      leaf,
      (message: string) => this.recordTrace(message),
      (message: string) => {
        new Notice(message, 2400);
      },
    ));

    this.addRibbonIcon('layout-dashboard', DEMO_TITLE, () => {
      this.runAsyncAction('open-demo-view-from-ribbon', () => this.openDemoView('活动栏入口'));
    }, { location: 'activityBar' });

    this.addCommand({
      id: OPEN_VIEW_COMMAND_ID,
      name: '视图演示：打开自定义视图',
      callback: () => {
        this.runAsyncAction('open-demo-view-from-command', () => this.openDemoView('命令中心'));
      },
    });

    this.addCommand({
      id: ACTIVATE_VIEW_COMMAND_ID,
      name: '视图演示：激活当前演示视图',
      callback: () => {
        this.runAsyncAction('reveal-demo-view', () => this.revealFirstDemoLeaf());
      },
    });

    this.addCommand({
      id: TRIGGER_VIEW_ACTION_COMMAND_ID,
      name: '视图演示：触发视图内部动作',
      callback: () => {
        this.triggerActiveViewAction();
      },
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '视图演示：显示工作区快照',
      callback: () => {
        this.showWorkspaceSnapshot('命令中心');
      },
    });

    this.addCommand({
      id: CLOSE_VIEWS_COMMAND_ID,
      name: '视图演示：关闭全部演示视图',
      callback: () => {
        this.runAsyncAction('close-demo-views', () => this.closeDemoViews());
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace('plugin.onDisable');
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }

  public onunload(): void {
    this.recordTrace('plugin.onunload');
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE} 在 ${failure.operation} 阶段失败。`, 2500);
  }

  private async openDemoView(source: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    this.nextSequence += 1;

    await leaf.setViewState({
      type: DEMO_VIEW_TYPE,
      active: true,
      state: {
        source,
        sequence: this.nextSequence,
        stateMessage: `由 ${source} 打开`,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
    this.showWorkspaceSnapshot(source);
  }

  private async revealFirstDemoLeaf(): Promise<void> {
    const firstDemoLeaf = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0] ?? null;

    if (firstDemoLeaf === null) {
      new Notice(`${DEMO_TITLE}：当前没有可激活的演示视图。`, 2200);
      this.recordTrace('workspace.revealLeaf.skipped');
      return;
    }

    await this.app.workspace.revealLeaf(firstDemoLeaf);
    this.recordTrace(`workspace.revealLeaf leaf=${firstDemoLeaf.id}`);
    new Notice(
      `${DEMO_TITLE}：已激活 ${firstDemoLeaf.id} / ${firstDemoLeaf.getDisplayText()} / ${firstDemoLeaf.getIcon()}`,
      2600,
    );
  }

  private triggerActiveViewAction(): void {
    const activeView = this.app.workspace.getActiveViewOfType(DemoWorkspaceView);

    if (activeView === null) {
      new Notice(`${DEMO_TITLE}：当前活动叶子不是演示视图。`, 2200);
      this.recordTrace('view.action.skipped');
      return;
    }

    if (!activeView.triggerInternalAction()) {
      new Notice(`${DEMO_TITLE}：当前演示视图还没有可触发动作。`, 2200);
      this.recordTrace('view.action.missing');
    }
  }

  private async closeDemoViews(): Promise<void> {
    const beforeCount = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length;
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
    this.recordTrace(`workspace.detachLeavesOfType before=${beforeCount}`);

    const fallbackLeaf = this.app.workspace.getLeaf('tab');
    await fallbackLeaf.setViewState({
      type: 'empty',
      active: true,
      state: {
        source: '关闭演示视图',
      },
    });
    await this.app.workspace.revealLeaf(fallbackLeaf);
    this.showWorkspaceSnapshot('关闭演示视图');
  }

  private showWorkspaceSnapshot(source: string): void {
    const allLeafIds: string[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      allLeafIds.push(`${leaf.id}:${leaf.getViewState().type}`);
    });

    const activeLeaf = this.app.workspace.activeLeaf;
    const activeLeafText = activeLeaf === null
      ? '无'
      : `${activeLeaf.id}/${activeLeaf.getViewState().type}/${activeLeaf.getDisplayText()}`;
    const activeLeafLookup = activeLeaf === null
      ? '无'
      : this.app.workspace.getLeafById(activeLeaf.id)?.id ?? '未找到';
    const demoLeaves = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length;
    const snapshot = `source=${source}, active=${activeLeafText}, lookup=${activeLeafLookup}, demoLeaves=${demoLeaves}, allLeaves=${allLeafIds.join('|')}`;

    this.recordTrace(`workspace.snapshot ${snapshot}`);
    new Notice(`${DEMO_TITLE}：${snapshot}`, 4200);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-view-workspace] ${message}`);
  }

  private runAsyncAction(label: string, action: () => Promise<void>): void {
    void action().catch((error: Error) => {
      const message = error.message;
      this.recordTrace(`${label}.failed ${message}`);
      new Notice(`${DEMO_TITLE}：${message}`, 3000);
    });
  }
}
