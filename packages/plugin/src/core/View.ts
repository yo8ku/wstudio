/**
 * Base view classes for plugin-contributed workspace surfaces.
 */

import { Component } from './Component';
import type { Menu } from './Menu';
import type { App } from '../types/app';
import type { JsonObject, JsonValue } from '../types/json';
import { Scope } from '../types/keymap';
import type { IconName } from '../types/ui';
import type { PaneMenuSource, ViewState, ViewStateResult, WorkspaceLeaf } from '../types/view';

export abstract class View extends Component {
  public readonly app: App;
  public readonly leaf: WorkspaceLeaf;
  public readonly containerEl: HTMLElement;
  public icon: IconName = '';
  public navigation = true;
  public scope: Scope | null = null;

  protected constructor(leaf: WorkspaceLeaf) {
    super();
    this.app = leaf.app;
    this.leaf = leaf;
    this.containerEl = leaf.containerEl;
  }

  public abstract getViewType(): string;

  public abstract getDisplayText(): string;

  public getIcon(): IconName {
    return this.icon;
  }

  public getState(): JsonObject {
    return {};
  }

  public getEphemeralState(): JsonValue | null {
    return null;
  }

  public async setState(_state: JsonObject, _result: ViewStateResult): Promise<void> {
    return undefined;
  }

  public setEphemeralState(_state: JsonValue | null): void {
    return undefined;
  }

  public onResize(): void {
    return undefined;
  }

  public onPaneMenu(_menu: Menu, _source: PaneMenuSource): void {
    return undefined;
  }

  public override async onload(): Promise<void> {
    await this.onOpen();
  }

  public override async onunload(): Promise<void> {
    await this.onClose();
  }

  public onOpen(): Promise<void> | void {
    return undefined;
  }

  public onClose(): Promise<void> | void {
    return undefined;
  }
}

export abstract class ItemView extends View {
  public readonly contentEl: HTMLElement;

  protected constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = this.containerEl;
  }

  public getViewState(): ViewState {
    return {
      type: this.getViewType(),
      state: this.getState(),
    };
  }

  public addAction(
    icon: IconName,
    title: string,
    callback: (event: MouseEvent) => Promise<void> | void,
  ): HTMLElement {
    const actionEl = document.createElement('div');
    actionEl.className = 'ns-plugin-item-view__action';
    actionEl.dataset.icon = icon;
    actionEl.title = title;
    actionEl.setAttribute('role', 'button');
    actionEl.tabIndex = 0;
    this.registerDomEvent(actionEl, 'click', (event) => {
      void callback(event);
    });
    this.registerDomEvent(actionEl, 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      actionEl.click();
    });
    this.contentEl.append(actionEl);
    return actionEl;
  }
}
