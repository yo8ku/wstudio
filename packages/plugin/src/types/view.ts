/**
 * Workspace view and leaf abstractions for plugin-contributed surfaces.
 */

import type { Constructor, PaneType, Side, SplitDirection } from './base';
import type { EventRef } from './disposable';
import { Events } from './events';
import type { JsonObject, JsonValue } from './json';
import type { App } from './app';
import type { Editor } from './editor';
import type { MarkdownFileInfo, MarkdownView } from './markdown';
import type { HoverPopover } from './render';
import type { Tasks } from './tasks';
import type { IconName } from './ui';
import type { TAbstractFile, TFile } from './vault';
import type { Menu } from '../core/Menu';
import type { View } from '../core/View';

export interface ViewState {
  readonly type: string;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly group?: WorkspaceLeaf;
  readonly state?: JsonObject;
}

export interface ViewStateResult {
  readonly history: boolean;
}

export interface OpenViewState {
  readonly state?: JsonObject;
  readonly eState?: JsonObject;
  readonly active?: boolean;
  readonly group?: WorkspaceLeaf;
}

export type ViewCreator = (leaf: WorkspaceLeaf) => View;

export type PaneMenuSource = 'more-options' | 'tab-header' | string;

export interface WorkspaceWindowInitData {
  readonly x?: number;
  readonly y?: number;
  readonly size?: {
    readonly width: number;
    readonly height: number;
  };
}

export abstract class WorkspaceItem extends Events {
  public abstract parent: WorkspaceParent;

  public getRoot(): WorkspaceItem {
    let current: WorkspaceItem = this;
    const visited = new Set<WorkspaceItem>();

    while (!visited.has(current.parent)) {
      visited.add(current);
      current = current.parent;
    }

    return current;
  }

  public getContainer(): WorkspaceContainer {
    let current: WorkspaceItem = this;
    const visited = new Set<WorkspaceItem>();

    while (!visited.has(current)) {
      if (current instanceof WorkspaceContainer) {
        return current;
      }

      visited.add(current);
      current = current.parent;
    }

    throw new Error('Workspace item is not attached to a workspace container.');
  }
}

export abstract class WorkspaceParent extends WorkspaceItem {}

export class WorkspaceRibbon {}

export abstract class WorkspaceSplit extends WorkspaceParent {
  public abstract override parent: WorkspaceParent;
}

export abstract class WorkspaceContainer extends WorkspaceSplit {
  public abstract readonly win: Window;
  public abstract readonly doc: Document;
}

export abstract class WorkspaceFloating extends WorkspaceParent {
  public abstract override parent: WorkspaceParent;
}

export abstract class WorkspaceMobileDrawer extends WorkspaceParent {
  public abstract override parent: WorkspaceParent;
  public abstract readonly collapsed: boolean;

  public abstract expand(): void;

  public abstract collapse(): void;

  public abstract toggle(): void;
}

export abstract class WorkspaceRoot extends WorkspaceContainer {
  public abstract override readonly win: Window;
  public abstract override readonly doc: Document;
}

export abstract class WorkspaceSidedock extends WorkspaceSplit {
  public abstract readonly collapsed: boolean;

  public abstract toggle(): void;

  public abstract collapse(): void;

  public abstract expand(): void;
}

export abstract class WorkspaceTabs extends WorkspaceParent {
  public abstract override parent: WorkspaceSplit;
}

export abstract class WorkspaceWindow extends WorkspaceContainer {
  public abstract override readonly win: Window;
  public abstract override readonly doc: Document;
}

export abstract class WorkspaceLeaf extends WorkspaceItem {
  public abstract readonly app: App;
  public abstract readonly containerEl: HTMLElement;
  public abstract readonly id: string;
  public abstract override parent: WorkspaceTabs | WorkspaceMobileDrawer;
  public abstract hoverPopover: HoverPopover | null;
  public abstract readonly isDeferred: boolean;
  public abstract view: View;

  public abstract openFile(file: TFile, openState?: OpenViewState): Promise<void>;

  public abstract open(view: View): Promise<View>;

  public abstract getViewState(): ViewState;

  public abstract setViewState(viewState: ViewState, ephemeralState?: JsonValue | null): Promise<void>;

  public abstract loadIfDeferred(): Promise<void>;

  public abstract getEphemeralState(): JsonValue | null;

  public abstract setEphemeralState(state: JsonValue | null): void;

  public abstract togglePinned(): void;

  public abstract setPinned(pinned: boolean): void;

  public abstract setGroupMember(other: WorkspaceLeaf): void;

  public abstract setGroup(group: string): void;

  public abstract detach(): void;

  public abstract getIcon(): IconName;

  public abstract getDisplayText(): string;

  public abstract onResize(): void;
}

export interface WorkspaceLeaf {
  on(
    name: 'pinned-change',
    callback: (pinned: boolean) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'group-change',
    callback: (group: string) => void,
    context?: object,
  ): EventRef;
}

export abstract class Workspace extends Events {
  public abstract leftSplit: WorkspaceSidedock | WorkspaceMobileDrawer;
  public abstract rightSplit: WorkspaceSidedock | WorkspaceMobileDrawer;
  public abstract leftRibbon: WorkspaceRibbon;
  public abstract rightRibbon: WorkspaceRibbon;
  public abstract rootSplit: WorkspaceRoot;
  public abstract activeLeaf: WorkspaceLeaf | null;
  public abstract activeEditor: MarkdownFileInfo | null;
  public abstract layoutReady: boolean;

  public abstract onLayoutReady(callback: () => void): void;

  public abstract changeLayout(workspace: JsonObject): Promise<void>;

  public abstract getLayout(): JsonObject;

  public abstract createLeafInParent(parent: WorkspaceSplit, index: number): WorkspaceLeaf;

  public abstract createLeafBySplit(
    leaf: WorkspaceLeaf,
    direction?: SplitDirection,
    before?: boolean,
  ): WorkspaceLeaf;

  public abstract splitActiveLeaf(direction?: SplitDirection): WorkspaceLeaf;

  public abstract duplicateLeaf(
    leaf: WorkspaceLeaf,
    direction?: SplitDirection,
  ): Promise<WorkspaceLeaf>;
  public abstract duplicateLeaf(
    leaf: WorkspaceLeaf,
    leafType: PaneType | boolean,
    direction?: SplitDirection,
  ): Promise<WorkspaceLeaf>;

  public abstract getUnpinnedLeaf(): WorkspaceLeaf;

  public abstract getLeaf(newLeaf?: 'split', direction?: SplitDirection): WorkspaceLeaf;
  public abstract getLeaf(newLeaf?: PaneType | boolean): WorkspaceLeaf;

  public abstract moveLeafToPopout(
    leaf: WorkspaceLeaf,
    data?: WorkspaceWindowInitData,
  ): WorkspaceWindow;

  public abstract openPopoutLeaf(data?: WorkspaceWindowInitData): WorkspaceLeaf;

  public abstract openLinkText(
    linktext: string,
    sourcePath: string,
    newLeaf?: PaneType | boolean,
    openViewState?: OpenViewState,
  ): Promise<void>;

  public abstract setActiveLeaf(
    leaf: WorkspaceLeaf,
    params?: {
      readonly focus?: boolean;
    },
  ): void;
  public abstract setActiveLeaf(leaf: WorkspaceLeaf, pushHistory: boolean, focus: boolean): void;

  public abstract getLeafById(id: string): WorkspaceLeaf | null;

  public abstract getGroupLeaves(group: string): readonly WorkspaceLeaf[];

  public abstract getMostRecentLeaf(root?: WorkspaceParent): WorkspaceLeaf | null;

  public abstract getLeftLeaf(split: boolean): WorkspaceLeaf | null;

  public abstract getRightLeaf(split: boolean): WorkspaceLeaf | null;

  public abstract ensureSideLeaf(
    type: string,
    side: Side,
    options?: {
      readonly active?: boolean;
      readonly split?: boolean;
      readonly reveal?: boolean;
      readonly state?: JsonObject;
    },
  ): Promise<WorkspaceLeaf>;

  public abstract getActiveViewOfType<TView extends View>(type: Constructor<TView>): TView | null;

  public abstract getActiveFile(): TFile | null;

  public abstract iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => void): void;

  public abstract iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void;

  public abstract getLeavesOfType(viewType: string): readonly WorkspaceLeaf[];

  public abstract detachLeavesOfType(viewType: string): void;

  public abstract revealLeaf(leaf: WorkspaceLeaf): Promise<void>;

  public abstract getLastOpenFiles(): readonly string[];

  public abstract requestSaveLayout(): void;

  public abstract updateOptions(): void;

  public abstract handleLinkContextMenu(
    menu: Menu,
    linktext: string,
    sourcePath: string,
    leaf?: WorkspaceLeaf,
  ): boolean;
}

export interface Workspace {
  on(
    name: 'quick-preview',
    callback: (file: TFile, data: string) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'resize',
    callback: () => void,
    context?: object,
  ): EventRef;
  on(
    name: 'active-leaf-change',
    callback: (leaf: WorkspaceLeaf | null) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'file-open',
    callback: (file: TFile | null) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'layout-change',
    callback: () => void,
    context?: object,
  ): EventRef;
  on(
    name: 'window-open',
    callback: (workspaceWindow: WorkspaceWindow, window: Window) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'window-close',
    callback: (workspaceWindow: WorkspaceWindow, window: Window) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'css-change',
    callback: () => void,
    context?: object,
  ): EventRef;
  on(
    name: 'file-menu',
    callback: (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'files-menu',
    callback: (
      menu: Menu,
      files: readonly TAbstractFile[],
      source: string,
      leaf?: WorkspaceLeaf,
    ) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'url-menu',
    callback: (menu: Menu, url: string) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'editor-menu',
    callback: (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'editor-change',
    callback: (editor: Editor, info: MarkdownView | MarkdownFileInfo) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'editor-paste',
    callback: (event: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'editor-drop',
    callback: (event: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) => void,
    context?: object,
  ): EventRef;
  on(
    name: 'quit',
    callback: (tasks: Tasks) => void,
    context?: object,
  ): EventRef;
}
