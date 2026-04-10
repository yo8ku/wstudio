/**
 * Demo plugin entry used to verify workspace leaf routing behavior across multiple leaves.
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

const DEMO_VIEW_TYPE = 'wstudio-demo-workspace-leaf-routing-view';
const DEMO_TITLE = '叶子路由演示';
const OPEN_BASE_LEAF_COMMAND_ID = 'open-workspace-routing-base-leaf';
const SPLIT_ACTIVE_LEAF_COMMAND_ID = 'split-active-workspace-routing-leaf';
const DUPLICATE_ACTIVE_LEAF_COMMAND_ID = 'duplicate-active-workspace-routing-leaf';
const ACTIVATE_FIRST_LEAF_COMMAND_ID = 'activate-first-workspace-routing-leaf';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-workspace-routing-snapshot';
const CLOSE_ALL_LEAVES_COMMAND_ID = 'close-all-workspace-routing-leaves';

type DemoViewConstructorArgument = string | number | boolean | bigint | symbol | object | null | undefined;
type DemoTraceHandler = (message: string) => void;

type RoutingViewState = JsonObject & {
  readonly origin: string;
  readonly label: string;
  readonly sequence: number;
};

function ignoreDemoMessage(message: string): void {
  void message;
}

function isDemoTraceHandler(value: DemoViewConstructorArgument): value is DemoTraceHandler {
  return typeof value === 'function';
}

function resolveWorkspaceLeaf(args: readonly DemoViewConstructorArgument[]): WorkspaceLeaf {
  const leaf = args[0] ?? null;

  if (typeof leaf !== 'object' || leaf === null) {
    throw new Error('RoutingWorkspaceView requires a workspace leaf.');
  }

  return leaf as WorkspaceLeaf;
}

function resolveTraceHandler(value: DemoViewConstructorArgument): DemoTraceHandler {
  return isDemoTraceHandler(value) ? value : ignoreDemoMessage;
}

function readStringStateValue(state: JsonObject, key: string, fallback: string): string {
  const value = state[key];
  return typeof value === 'string' ? value : fallback;
}

function readNumberStateValue(state: JsonObject, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

class RoutingWorkspaceView extends ItemView {
  private origin = '未设置';
  private label = '未设置';
  private sequence = 0;
  private readonly trace: DemoTraceHandler;

  public constructor(...args: DemoViewConstructorArgument[]) {
    super(resolveWorkspaceLeaf(args));
    this.trace = resolveTraceHandler(args[1] ?? null);
    this.icon = 'layout-panel-left';
  }

  public getViewType(): string {
    return DEMO_VIEW_TYPE;
  }

  public getDisplayText(): string {
    return `${DEMO_TITLE} #${this.sequence}`;
  }

  public getState(): JsonObject {
    return {
      origin: this.origin,
      label: this.label,
      sequence: this.sequence,
    };
  }

  public async setState(state: JsonObject, result: ViewStateResult): Promise<void> {
    this.origin = readStringStateValue(state, 'origin', this.origin);
    this.label = readStringStateValue(state, 'label', this.label);
    this.sequence = readNumberStateValue(state, 'sequence', this.sequence);
    this.renderViewContent();
    this.trace(
      `routingView.setState#${this.sequence} origin=${this.origin} label=${this.label} history=${result.history}`,
    );
  }

  public override onOpen(): void {
    this.trace(`routingView.onOpen#${this.sequence} leaf=${this.leaf.id}`);
    this.renderViewContent();
  }

  public override onClose(): void {
    this.trace(`routingView.onClose#${this.sequence} leaf=${this.leaf.id}`);
  }

  private renderViewContent(): void {
    const titleEl = document.createElement('div');
    titleEl.textContent = `${DEMO_TITLE} #${this.sequence}`;

    const originEl = document.createElement('div');
    originEl.textContent = `来源：${this.origin}`;

    const labelEl = document.createElement('div');
    labelEl.textContent = `标签：${this.label}`;

    const leafEl = document.createElement('div');
    leafEl.textContent = `叶子：${this.leaf.id}`;

    this.contentEl.replaceChildren(titleEl, originEl, labelEl, leafEl);
  }
}

export default class WorkspaceLeafRoutingDemoPlugin extends Plugin {
  private nextSequence = 0;

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.registerView(DEMO_VIEW_TYPE, (leaf) => new RoutingWorkspaceView(
      leaf,
      (message: string) => this.recordTrace(message),
    ));

    this.addRibbonIcon('layout-panel-left', DEMO_TITLE, () => {
      this.runAsyncAction('open-routing-base-leaf-from-ribbon', () => this.openBaseLeaf('活动栏入口'));
    }, { location: 'activityBar' });

    this.addCommand({
      id: OPEN_BASE_LEAF_COMMAND_ID,
      name: '叶子路由演示：打开基准演示叶子',
      callback: () => {
        this.runAsyncAction('open-routing-base-leaf-from-command', () => this.openBaseLeaf('命令中心'));
      },
    });

    this.addCommand({
      id: SPLIT_ACTIVE_LEAF_COMMAND_ID,
      name: '叶子路由演示：分割活动叶子',
      callback: () => {
        this.runAsyncAction('split-active-routing-leaf', () => this.splitActiveDemoLeaf());
      },
    });

    this.addCommand({
      id: DUPLICATE_ACTIVE_LEAF_COMMAND_ID,
      name: '叶子路由演示：复制活动演示叶子',
      callback: () => {
        this.runAsyncAction('duplicate-active-routing-leaf', () => this.duplicateActiveDemoLeaf());
      },
    });

    this.addCommand({
      id: ACTIVATE_FIRST_LEAF_COMMAND_ID,
      name: '叶子路由演示：切换到第一个演示叶子',
      callback: () => {
        this.activateFirstDemoLeaf();
      },
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '叶子路由演示：显示叶子路由快照',
      callback: () => {
        this.showRoutingSnapshot('命令中心');
      },
    });

    this.addCommand({
      id: CLOSE_ALL_LEAVES_COMMAND_ID,
      name: '叶子路由演示：关闭全部演示叶子',
      callback: () => {
        this.runAsyncAction('close-all-routing-leaves', () => this.closeAllDemoLeaves());
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

  private async openBaseLeaf(source: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await this.openRoutingView(leaf, {
      origin: source,
      label: '基准叶子',
      sequence: this.createSequence(),
    });
    this.showRoutingSnapshot(source);
  }

  private async splitActiveDemoLeaf(): Promise<void> {
    const sourceLeaf = this.getActiveOrFirstDemoLeaf();

    if (sourceLeaf === null) {
      new Notice(`${DEMO_TITLE}：当前没有可分割的演示叶子。`, 2200);
      this.recordTrace('workspace.splitActiveLeaf.skipped');
      return;
    }

    this.app.workspace.setActiveLeaf(sourceLeaf, true, true);
    const nextLeaf = this.app.workspace.splitActiveLeaf('vertical');
    await this.openRoutingView(nextLeaf, {
      origin: 'splitActiveLeaf',
      label: `分割自 ${sourceLeaf.id}`,
      sequence: this.createSequence(),
    });
    this.recordTrace(`workspace.splitActiveLeaf source=${sourceLeaf.id} target=${nextLeaf.id}`);
    this.showRoutingSnapshot('splitActiveLeaf');
  }

  private async duplicateActiveDemoLeaf(): Promise<void> {
    const sourceLeaf = this.getActiveOrFirstDemoLeaf();

    if (sourceLeaf === null) {
      new Notice(`${DEMO_TITLE}：当前没有可复制的演示叶子。`, 2200);
      this.recordTrace('workspace.duplicateLeaf.skipped');
      return;
    }

    const duplicateLeaf = await this.app.workspace.duplicateLeaf(sourceLeaf, 'tab');
    await this.openRoutingView(duplicateLeaf, {
      origin: 'duplicateLeaf',
      label: `复制自 ${sourceLeaf.id}`,
      sequence: this.createSequence(),
    });
    this.recordTrace(`workspace.duplicateLeaf source=${sourceLeaf.id} target=${duplicateLeaf.id}`);
    this.showRoutingSnapshot('duplicateLeaf');
  }

  private activateFirstDemoLeaf(): void {
    const firstLeaf = this.getFirstDemoLeaf();

    if (firstLeaf === null) {
      new Notice(`${DEMO_TITLE}：当前没有可切换的演示叶子。`, 2200);
      this.recordTrace('workspace.setActiveLeaf.skipped');
      return;
    }

    this.app.workspace.setActiveLeaf(firstLeaf, true, true);
    this.recordTrace(`workspace.setActiveLeaf target=${firstLeaf.id}`);
    this.showRoutingSnapshot('setActiveLeaf');
  }

  private async closeAllDemoLeaves(): Promise<void> {
    const beforeCount = this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length;
    this.app.workspace.detachLeavesOfType(DEMO_VIEW_TYPE);
    this.recordTrace(`workspace.detachLeavesOfType before=${beforeCount}`);
    this.showRoutingSnapshot('关闭演示叶子');
  }

  private async openRoutingView(leaf: WorkspaceLeaf, state: RoutingViewState): Promise<void> {
    await leaf.setViewState({
      type: DEMO_VIEW_TYPE,
      active: true,
      state,
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private getFirstDemoLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE)[0] ?? null;
  }

  private getActiveOrFirstDemoLeaf(): WorkspaceLeaf | null {
    const activeLeaf = this.app.workspace.activeLeaf;

    if (activeLeaf !== null && activeLeaf.getViewState().type === DEMO_VIEW_TYPE) {
      return activeLeaf;
    }

    return this.getFirstDemoLeaf();
  }

  private showRoutingSnapshot(source: string): void {
    const allLeaves: string[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      allLeaves.push(`${leaf.id}:${leaf.getViewState().type}`);
    });

    const activeLeaf = this.app.workspace.activeLeaf;
    const firstDemoLeaf = this.getFirstDemoLeaf();
    const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
    const leftLeaf = this.app.workspace.getLeftLeaf(false);
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    const unpinnedLeaf = this.app.workspace.getUnpinnedLeaf();
    const activeLookup = activeLeaf === null ? '无' : this.app.workspace.getLeafById(activeLeaf.id)?.id ?? '未找到';
    const snapshot = [
      `source=${source}`,
      `active=${this.describeLeaf(activeLeaf)}`,
      `first=${this.describeLeaf(firstDemoLeaf)}`,
      `recent=${this.describeLeaf(mostRecentLeaf)}`,
      `left=${this.describeLeaf(leftLeaf)}`,
      `right=${this.describeLeaf(rightLeaf)}`,
      `unpinned=${this.describeLeaf(unpinnedLeaf)}`,
      `lookup=${activeLookup}`,
      `demoLeaves=${this.app.workspace.getLeavesOfType(DEMO_VIEW_TYPE).length}`,
      `allLeaves=${allLeaves.join('|')}`,
    ].join(', ');

    this.recordTrace(`workspace.routingSnapshot ${snapshot}`);
    new Notice(`${DEMO_TITLE}：${snapshot}`, 4500);
  }

  private describeLeaf(leaf: WorkspaceLeaf | null): string {
    if (leaf === null) {
      return '无';
    }

    return `${leaf.id}/${leaf.getViewState().type}/${leaf.getDisplayText()}`;
  }

  private createSequence(): number {
    this.nextSequence += 1;
    return this.nextSequence;
  }

  private recordTrace(message: string): void {
    console.log(`[demo-workspace-leaf-routing] ${message}`);
  }

  private runAsyncAction(label: string, action: () => Promise<void>): void {
    void action().catch((error: Error) => {
      const message = error.message;
      this.recordTrace(`${label}.failed ${message}`);
      new Notice(`${DEMO_TITLE}：${message}`, 3000);
    });
  }
}
