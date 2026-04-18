/**
 * Demo plugin entry used to verify runtime-only workspace views, settings tabs,
 * and popover overlays without relying on legacy DOM roots.
 */

import {
  addIcon,
  ItemView,
  Notice,
  Plugin,
  PopoverSuggest,
  type App,
  type JsonObject,
  type PluginFailureContext,
  type ViewStateResult,
  type WorkspaceLeaf,
} from '@note-studio/plugin';
import { DemoViewWorkspaceSettingTab } from './settingsTabs';

const DEMO_VIEW_TYPE = 'wstudio-demo-workspace-view';
const DEMO_FALLBACK_VIEW_TYPE = 'wstudio-demo-workspace-view-fallback';
const DEMO_TITLE = 'UI Runtime 示例视图';
const DEMO_ACTIVITY_BAR_TITLE = 'UI Runtime Demo';
const DEMO_FALLBACK_TITLE = 'UI Runtime 回退演示视图';
const OPEN_VIEW_COMMAND_ID = 'open-demo-workspace-view';
const OPEN_FALLBACK_VIEW_COMMAND_ID = 'open-demo-workspace-view-fallback';
const ACTIVATE_VIEW_COMMAND_ID = 'activate-demo-workspace-view';
const TRIGGER_VIEW_ACTION_COMMAND_ID = 'trigger-demo-workspace-view-action';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-demo-workspace-snapshot';
const CLOSE_VIEWS_COMMAND_ID = 'close-demo-workspace-views';
const OPEN_RUNTIME_POPOVER_COMMAND_ID = 'open-demo-runtime-popover';
const OPEN_RUNTIME_POPOVER_FALLBACK_COMMAND_ID = 'open-demo-runtime-popover-fallback';
const RUNTIME_POPOVER_SURFACE_ID = 'workspace-runtime-popover-demo';
const RUNTIME_POPOVER_FAILURE_SURFACE_ID = 'workspace-runtime-popover-demo-failure';
const RUNTIME_POPOVER_VALUES = ['amber-task', 'azure-note', 'atlas-sheet', 'aurora-board'];
const DEMO_ICON_ID = 'demo-ui-runtime-view-icon';
const DEMO_ICON_SVG = `
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="16" y="18" width="68" height="64" rx="14" fill="currentColor" opacity="0.18" />
    <rect x="22" y="24" width="56" height="52" rx="10" fill="none" stroke="currentColor" stroke-width="8" />
    <path d="M34 62 L50 38 L66 62" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="50" cy="38" r="6" fill="currentColor" />
  </svg>
`;

type DemoViewConstructorArgument = string | number | boolean | bigint | symbol | object | null | undefined;
type DemoTraceHandler = (message: string) => void;

interface DemoViewDefinition {
  readonly viewType: string;
  readonly title: string;
  readonly fallbackDemo: boolean;
}

const PRIMARY_DEMO_VIEW: DemoViewDefinition = {
  viewType: DEMO_VIEW_TYPE,
  title: DEMO_TITLE,
  fallbackDemo: false,
};

const FALLBACK_DEMO_VIEW: DemoViewDefinition = {
  viewType: DEMO_FALLBACK_VIEW_TYPE,
  title: DEMO_FALLBACK_TITLE,
  fallbackDemo: true,
};

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

function isDemoViewDefinition(value: DemoViewConstructorArgument): value is DemoViewDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as DemoViewDefinition;
  return typeof candidate.viewType === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.fallbackDemo === 'boolean';
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

function resolveViewDefinition(value: DemoViewConstructorArgument): DemoViewDefinition {
  return isDemoViewDefinition(value) ? value : PRIMARY_DEMO_VIEW;
}

class DemoWorkspaceView extends ItemView {
  private source = '未设置';
  private sequence = 0;
  private stateMessage = '尚未写入状态';
  private readonly trace: DemoTraceHandler;
  private readonly notify: DemoTraceHandler;
  private readonly definition: DemoViewDefinition;

  public constructor(...args: DemoViewConstructorArgument[]) {
    super(resolveWorkspaceLeaf(args));
    this.trace = resolveTraceHandler(args[1] ?? null);
    this.notify = resolveTraceHandler(args[2] ?? null);
    this.definition = resolveViewDefinition(args[3] ?? null);
    this.icon = DEMO_ICON_ID;
  }

  public getViewType(): string {
    return this.definition.viewType;
  }

  public getDisplayText(): string {
    return `${this.definition.title} #${this.sequence}`;
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
    this.trace(
      `view.setState#${this.sequence} type=${this.definition.viewType} source=${this.source} history=${result.history} message=${this.stateMessage}`,
    );
  }

  public override onOpen(): void {
    this.trace(`view.onOpen#${this.sequence} type=${this.definition.viewType} leaf=${this.leaf.id}`);
  }

  public override onClose(): void {
    this.trace(`view.onClose#${this.sequence} type=${this.definition.viewType} leaf=${this.leaf.id}`);
  }

  public triggerInternalAction(): boolean {
    this.trace(`view.action#${this.sequence} leaf=${this.leaf.id}`);
    this.notify(`视图内部动作已触发：leaf=${this.leaf.id}, sequence=${this.sequence}`);
    return true;
  }
}

class DemoRuntimePopover extends PopoverSuggest<string> {
  public static readonly runtimeSurfaceId: string = RUNTIME_POPOVER_SURFACE_ID;

  public constructor(
    app: App,
    private readonly onChosen: (value: string) => void,
    private readonly onTrace: DemoTraceHandler,
    private readonly onNotice: DemoTraceHandler,
  ) {
    super(app);
    this.setInstructions([
      { command: 'Click', purpose: 'Select a runtime popover item' },
      { command: 'Esc', purpose: 'Close the popover' },
    ]);
  }

  public renderSuggestion(value: string, el: HTMLElement): void {
    el.textContent = value;
  }

  public selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();
    this.onChosen(value);
    this.onTrace(`popover.choose value=${value}`);
    this.onNotice(`Runtime popover selected: ${value}`);
    this.close();
  }

  public openDemo(): readonly string[] {
    this.close();
    this.setSuggestions(RUNTIME_POPOVER_VALUES);
    this.open();
    return RUNTIME_POPOVER_VALUES;
  }
}

class DemoRuntimePopoverFailure extends DemoRuntimePopover {
  public static readonly runtimeSurfaceId: string = RUNTIME_POPOVER_FAILURE_SURFACE_ID;
}

export default class DemoViewWorkspacePlugin extends Plugin {
  private nextSequence = 0;
  private runtimePopover: DemoRuntimePopover | null = null;
  private runtimePopoverFailure: DemoRuntimePopoverFailure | null = null;
  private lastRuntimePopoverValue = 'none';

  public onload(): void {
    this.recordTrace('plugin.onload');
    addIcon(DEMO_ICON_ID, DEMO_ICON_SVG);
    this.addSettingTab(new DemoViewWorkspaceSettingTab(this.app, this, {
      title: 'UI Runtime Demo',
      description: 'This settings tab is used to verify that ui.settings can render inside an isolated runtime iframe.',
      verificationHint: 'In the settings center, this tab should render successfully through ui.settings rather than any legacy summary preview.',
    }));
    this.addSettingTab(new DemoViewWorkspaceSettingTab(this.app, this, {
      title: 'UI Runtime Fallback Demo',
      description: 'This settings tab intentionally fails inside ui.settings so the host can verify the fallback error state.',
      verificationHint: 'In the settings center, this tab should show a host-managed failure state instead of silently falling back to legacy DOM content.',
    }));
    this.runtimePopover = new DemoRuntimePopover(
      this.app,
      (value: string) => {
        this.setRuntimePopoverValue(value);
      },
      (message: string) => {
        this.recordTrace(message);
      },
      (message: string) => {
        this.showNotice(message);
      },
    );
    this.runtimePopoverFailure = new DemoRuntimePopoverFailure(
      this.app,
      (value: string) => {
        this.setRuntimePopoverValue(value);
      },
      (message: string) => {
        this.recordTrace(message);
      },
      (message: string) => {
        this.showNotice(message);
      },
    );

    this.registerView(
      DEMO_VIEW_TYPE,
      (leaf) => new DemoWorkspaceView(
        leaf,
        (message: string) => this.recordTrace(message),
        (message: string) => {
          new Notice(message, 2400);
        },
      ),
    );

    this.registerView(
      DEMO_FALLBACK_VIEW_TYPE,
      (leaf) => new DemoWorkspaceView(
        leaf,
        (message: string) => this.recordTrace(message),
        (message: string) => {
          new Notice(message, 2400);
        },
        FALLBACK_DEMO_VIEW,
      ),
    );

    this.addRibbonIcon(DEMO_ICON_ID, DEMO_ACTIVITY_BAR_TITLE, () => {
      this.runAsyncAction('open-demo-view-from-ribbon', () => this.openDemoView('活动栏入口'));
    }, { location: 'activityBar' });

    this.addCommand({
      id: OPEN_VIEW_COMMAND_ID,
      name: 'UI Runtime 示例视图：打开',
      callback: () => {
        this.runAsyncAction('open-demo-view-from-command', () => this.openDemoView('命令面板'));
      },
    });

    this.addCommand({
      id: OPEN_FALLBACK_VIEW_COMMAND_ID,
      name: 'UI Runtime 示例视图：打开失败回退演示',
      callback: () => {
        this.runAsyncAction('open-demo-view-fallback-from-command', () => this.openFallbackDemoView());
      },
    });

    this.addCommand({
      id: ACTIVATE_VIEW_COMMAND_ID,
      name: 'UI Runtime 示例视图：激活当前视图',
      callback: () => {
        this.runAsyncAction('reveal-demo-view', () => this.revealFirstDemoLeaf());
      },
    });

    this.addCommand({
      id: TRIGGER_VIEW_ACTION_COMMAND_ID,
      name: 'UI Runtime 示例视图：触发内部动作',
      callback: () => {
        this.triggerActiveViewAction();
      },
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: 'UI Runtime 示例视图：显示工作区快照',
      callback: () => {
        this.showWorkspaceSnapshot('命令面板');
      },
    });

    this.addCommand({
      id: CLOSE_VIEWS_COMMAND_ID,
      name: 'UI Runtime 示例视图：关闭全部视图',
      callback: () => {
        this.runAsyncAction('close-demo-views', () => this.closeDemoViews());
      },
    });

    this.addCommand({
      id: OPEN_RUNTIME_POPOVER_COMMAND_ID,
      name: 'UI Runtime 示例视图：Runtime Popover Demo',
      callback: () => {
        this.openRuntimePopoverDemo();
      },
    });

    this.addCommand({
      id: OPEN_RUNTIME_POPOVER_FALLBACK_COMMAND_ID,
      name: 'UI Runtime 示例视图：Runtime Popover Fallback Demo',
      callback: () => {
        this.openRuntimePopoverFallbackDemo();
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace('plugin.onDisable');
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(DEMO_FALLBACK_VIEW_TYPE);
  }

  public onunload(): void {
    this.recordTrace('plugin.onunload');
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(DEMO_FALLBACK_VIEW_TYPE);
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}：${failure.operation} 阶段出现异常。`, 2500);
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
        stateMessage: `${source} 打开`,
      },
    });
    await this.app.workspace.revealLeaf(leaf);
    this.showWorkspaceSnapshot(source);
  }

  private async openFallbackDemoView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    this.nextSequence += 1;

    await leaf.setViewState({
      type: DEMO_FALLBACK_VIEW_TYPE,
      active: true,
      state: {
        source: '失败回退演示',
        sequence: this.nextSequence,
        stateMessage: '此视图的 ui.views runtime 会故意失败。',
      },
    });
    await this.app.workspace.revealLeaf(leaf);
    this.showWorkspaceSnapshot('失败回退演示');
  }

  private async revealFirstDemoLeaf(): Promise<void> {
    const firstDemoLeaf = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0] ?? null;

    if (firstDemoLeaf === null) {
      new Notice(`${DEMO_TITLE}：当前没有可激活的运行时视图。`, 2200);
      this.recordTrace('workspace.revealLeaf.skipped');
      return;
    }

    await this.app.workspace.revealLeaf(firstDemoLeaf);
    this.recordTrace(`workspace.revealLeaf leaf=${firstDemoLeaf.id}`);
    new Notice(
      `${DEMO_TITLE}：已激活 leaf=${firstDemoLeaf.id} / ${firstDemoLeaf.getDisplayText()} / ${firstDemoLeaf.getIcon()}`,
      2600,
    );
  }

  private triggerActiveViewAction(): void {
    const activeView = this.app.workspace.getActiveViewOfType(DemoWorkspaceView);

    if (activeView === null) {
      new Notice(`${DEMO_TITLE}：当前没有激活的示例视图。`, 2200);
      this.recordTrace('view.action.skipped');
      return;
    }

    activeView.triggerInternalAction();
  }

  private async closeDemoViews(): Promise<void> {
    const beforeCount = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length
      + this.app.workspace.getLeavesOfType(DEMO_FALLBACK_VIEW_TYPE).length;
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(DEMO_FALLBACK_VIEW_TYPE);
    this.recordTrace(`workspace.detachLeavesOfType before=${beforeCount}`);

    const fallbackLeaf = this.app.workspace.getLeaf('tab');
    await fallbackLeaf.setViewState({
      type: 'empty',
      active: true,
      state: {
        source: '关闭示例视图',
      },
    });
    await this.app.workspace.revealLeaf(fallbackLeaf);
    this.showWorkspaceSnapshot('关闭示例视图');
  }

  private showWorkspaceSnapshot(source: string): void {
    const allLeafIds: string[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      allLeafIds.push(`${leaf.id}:${leaf.getViewState().type}`);
    });

    const activeLeaf = this.app.workspace.activeLeaf;
    const activeLeafText = activeLeaf === null
      ? 'none'
      : `${activeLeaf.id}/${activeLeaf.getViewState().type}/${activeLeaf.getDisplayText()}`;
    const activeLeafLookup = activeLeaf === null
      ? 'none'
      : this.app.workspace.getLeafById(activeLeaf.id)?.id ?? 'missing';
    const demoLeaves = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length
      + this.app.workspace.getLeavesOfType(DEMO_FALLBACK_VIEW_TYPE).length;
    const snapshot = `source=${source}, active=${activeLeafText}, lookup=${activeLeafLookup}, demoLeaves=${demoLeaves}, runtimePopover=${this.lastRuntimePopoverValue}, allLeaves=${allLeafIds.join('|')}`;

    this.recordTrace(`workspace.snapshot ${snapshot}`);
    new Notice(`${DEMO_TITLE}：${snapshot}`, 4200);
  }

  private openRuntimePopoverDemo(): void {
    const runtimePopover = this.requireRuntimePopover();
    const suggestions = runtimePopover.openDemo();
    this.recordTrace(`popover.open values=${suggestions.join('|')}`);
    this.showNotice(`Runtime popover opened with ${suggestions.length} items.`);
  }

  private openRuntimePopoverFallbackDemo(): void {
    const runtimePopoverFailure = this.requireRuntimePopoverFailure();
    const suggestions = runtimePopoverFailure.openDemo();
    this.recordTrace(`popoverFallback.open values=${suggestions.join('|')}`);
    this.showNotice(`Runtime popover fallback opened with ${suggestions.length} items.`);
  }

  private setRuntimePopoverValue(value: string): void {
    this.lastRuntimePopoverValue = value;
  }

  private requireRuntimePopover(): DemoRuntimePopover {
    if (this.runtimePopover === null) {
      throw new Error('Runtime popover demo is not initialized.');
    }

    return this.runtimePopover;
  }

  private requireRuntimePopoverFailure(): DemoRuntimePopoverFailure {
    if (this.runtimePopoverFailure === null) {
      throw new Error('Runtime popover fallback demo is not initialized.');
    }

    return this.runtimePopoverFailure;
  }

  private recordTrace(message: string): void {
    console.log(`[demo-view-workspace] ${message}`);
  }

  private showNotice(message: string): void {
    new Notice(message, 2800);
  }

  private runAsyncAction(label: string, action: () => Promise<void>): void {
    void action().catch((error: Error) => {
      const message = error.message;
      this.recordTrace(`${label}.failed ${message}`);
      new Notice(`${DEMO_TITLE}：${message}`, 3000);
    });
  }
}
