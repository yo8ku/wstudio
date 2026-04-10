/**
 * Render context contracts exposed by the plugin app facade.
 */

import { Component } from '../core/Component';
import type { Point } from './base';

export interface HoverLinkSource {
  readonly display: string;
  readonly defaultMod: boolean;
}

export interface HoverParent {
  readonly hoverPopover: HoverPopover | null;
}

export enum PopoverState {}

export class HoverPopover extends Component {
  public readonly hoverEl: HTMLElement;
  public state: PopoverState = 0 as PopoverState;
  public readonly parent: HoverParent;
  public readonly targetEl: HTMLElement | null;
  public readonly waitTime: number;
  public readonly staticPos: Point | null;

  public constructor(
    parent: HoverParent,
    targetEl: HTMLElement | null,
    waitTime = 0,
    staticPos: Point | null = null,
  ) {
    super();
    this.parent = parent;
    this.targetEl = targetEl;
    this.waitTime = waitTime;
    this.staticPos = staticPos;
    this.hoverEl = document.createElement('div');
  }

  public onload(): void {
    return undefined;
  }

  public onunload(): void {
    this.hoverEl.remove();
  }
}

export class RenderContext implements HoverParent {
  public hoverPopover: HoverPopover | null = null;
}
