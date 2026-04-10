/**
 * Menu and menu item primitives exposed to plugin authors for pane and context menu customization.
 */

import { Component } from './Component';
import type { CloseableComponent } from '../types/closeable';
import type { IconName } from '../types/ui';
import {
  getPluginHostUiBridge,
  type PluginRuntimeMenuItemPayload,
  type PluginRuntimeMenuPositionPayload,
} from '../internal/host-ui-bridge';

export interface MenuPositionDef {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly overlap?: boolean;
  readonly left?: boolean;
}

export interface MenuPositionDefinition extends MenuPositionDef {}

export type MenuItemClickHandler = (
  event: MouseEvent | KeyboardEvent,
) => Promise<void> | void;

function createSyntheticMenuEvent(): MouseEvent {
  return {
    type: 'click',
    preventDefault(): void {
      return undefined;
    },
    stopPropagation(): void {
      return undefined;
    },
  } as MouseEvent;
}

export class MenuItem {
  public title: string | DocumentFragment = '';
  public icon: IconName | null = null;
  public checked: boolean | null = null;
  public disabled = false;
  public warning = false;
  public label = false;
  public section = '';
  private clickHandler: MenuItemClickHandler | null = null;

  public setTitle(title: string | DocumentFragment): this {
    this.title = title;
    return this;
  }

  public setIcon(icon: IconName | null): this {
    this.icon = icon;
    return this;
  }

  public setChecked(checked: boolean | null): this {
    this.checked = checked;
    return this;
  }

  public setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  public setWarning(isWarning: boolean): this {
    this.warning = isWarning;
    return this;
  }

  public setIsLabel(isLabel: boolean): this {
    this.label = isLabel;
    return this;
  }

  public onClick(callback: MenuItemClickHandler): this {
    this.clickHandler = callback;
    return this;
  }

  public setSection(section: string): this {
    this.section = section;
    return this;
  }

  public trigger(event?: MouseEvent | KeyboardEvent): void {
    if (this.disabled || this.clickHandler === null) {
      return;
    }

    void this.clickHandler(event ?? createSyntheticMenuEvent());
  }
}

export class MenuSeparator {}

export class Menu extends Component implements CloseableComponent {
  private noIcon = false;
  private useNativeMenu = false;
  private readonly items: Array<MenuItem | MenuSeparator> = [];
  private readonly hideCallbacks: Array<() => void> = [];
  private activeMenuId: string | null = null;

  public setNoIcon(): this {
    this.noIcon = true;
    return this;
  }

  public setUseNativeMenu(useNativeMenu: boolean): this {
    this.useNativeMenu = useNativeMenu;
    return this;
  }

  public addItem(callback: (item: MenuItem) => void): this {
    const item = new MenuItem();
    callback(item);
    this.items.push(item);
    return this;
  }

  public addSeparator(): this {
    this.items.push(new MenuSeparator());
    return this;
  }

  public showAtMouseEvent(event: MouseEvent): this {
    const position = this.resolveMousePosition(event);
    return this.showAtPosition(position);
  }

  public showAtPosition(position: MenuPositionDef, _document?: Document): this {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null) {
      return this;
    }

    if (this.activeMenuId !== null) {
      hostUiBridge.closeMenu(this.activeMenuId);
      this.activeMenuId = null;
    }

    this.activeMenuId = hostUiBridge.openMenu({
      items: this.serializeItems(),
      position: this.serializePosition(position),
      noIcon: this.noIcon,
      useNativeMenu: this.useNativeMenu,
      onSelect: (itemId) => {
        this.handleSelect(itemId);
      },
      onHide: () => {
        this.handleHideFromHost();
      },
    });

    return this;
  }

  public hide(): this {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null && this.activeMenuId !== null) {
      hostUiBridge.closeMenu(this.activeMenuId);
      return this;
    }

    this.handleHideFromHost();
    return this;
  }

  public close(): void {
    this.hide();
  }

  public onHide(callback: () => void): void {
    this.hideCallbacks.push(callback);
  }

  public static forEvent(_event: PointerEvent | MouseEvent): Menu {
    return new Menu();
  }

  public override onload(): void {
    return undefined;
  }

  public override onunload(): void {
    return undefined;
  }

  private resolveMousePosition(event: MouseEvent): MenuPositionDef {
    const fallbackPosition: MenuPositionDef = {
      x: 96,
      y: 96,
    };

    const nextX = Number.isFinite(event.clientX) ? event.clientX : fallbackPosition.x;
    const nextY = Number.isFinite(event.clientY) ? event.clientY : fallbackPosition.y;

    return {
      x: nextX,
      y: nextY,
    };
  }

  private serializeItems(): readonly PluginRuntimeMenuItemPayload[] {
    return this.items.map((item, index) => {
      if (item instanceof MenuSeparator) {
        return {
          id: `separator-${index + 1}`,
          title: '',
          icon: null,
          checked: null,
          disabled: true,
          warning: false,
          label: false,
          section: '',
          separator: true,
        };
      }

      return {
        id: `item-${index + 1}`,
        title: typeof item.title === 'string' ? item.title : item.title.textContent ?? '',
        icon: item.icon,
        checked: item.checked,
        disabled: item.disabled,
        warning: item.warning,
        label: item.label,
        section: item.section,
        separator: false,
      };
    });
  }

  private serializePosition(position: MenuPositionDef): PluginRuntimeMenuPositionPayload {
    return {
      x: position.x,
      y: position.y,
      width: position.width,
      overlap: position.overlap,
      left: position.left,
    };
  }

  private handleSelect(itemId: string): void {
    const serializedItems = this.serializeItems();
    const targetIndex = serializedItems.findIndex((item) => item.id === itemId);

    if (targetIndex === -1) {
      return;
    }

    const target = this.items[targetIndex];

    if (target instanceof MenuSeparator) {
      return;
    }

    target.trigger();
  }

  private handleHideFromHost(): void {
    this.activeMenuId = null;

    for (const callback of this.hideCallbacks) {
      callback();
    }
  }
}
