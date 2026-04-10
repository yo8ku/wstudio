/**
 * UI contribution contracts such as ribbon icons and status bar items.
 */

import type { Disposable } from './disposable';

export type IconName = string;

export type HexString = string;

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface HSL {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export type TooltipPlacement = 'bottom' | 'right' | 'left' | 'top';

export interface TooltipOptions {
  readonly placement?: TooltipPlacement;
  readonly classes?: readonly string[];
  readonly gap?: number;
  readonly delay?: number;
}

export type RibbonClickHandler = (evt: MouseEvent) => Promise<void> | void;

export interface ManagedHTMLElement extends HTMLElement, Disposable {}

export interface RibbonIconRef extends ManagedHTMLElement {}

export const PLUGIN_UI_ENTRY_LOCATIONS = [
  'activityBar',
  'titleBar',
  'statusBar',
  'canvasToolbar',
  'canvasTitleBar',
  'canvasContextMenu',
] as const;

export type PluginUiEntryLocation = (typeof PLUGIN_UI_ENTRY_LOCATIONS)[number];

export interface PluginUiEntryScope {
  readonly viewType?: string;
  readonly fileExtensions?: readonly string[];
}

export interface RibbonIconOptions {
  readonly location?: PluginUiEntryLocation;
  readonly scope?: PluginUiEntryScope;
}

export interface RibbonIconSpec {
  readonly icon: IconName;
  readonly title: string;
  readonly onClick: RibbonClickHandler;
  readonly location?: PluginUiEntryLocation;
  readonly scope?: PluginUiEntryScope;
}

export interface StatusBarItem extends ManagedHTMLElement {
  setText(text: string): void;
  show(): void;
  hide(): void;
}

export interface UIRegistry {
  addRibbonIcon(pluginId: string, spec: RibbonIconSpec): RibbonIconRef;
  createStatusBarItem(pluginId: string): StatusBarItem;
}

const registeredIcons = new Map<string, string>();

function normalizeTooltipContent(content: string | DocumentFragment): string {
  if (typeof content === 'string') {
    return content;
  }

  return content.textContent ?? '';
}

export function addIcon(iconId: string, svgContent: string): void {
  registeredIcons.set(iconId, svgContent);
}

export function getIcon(iconId: string): SVGSVGElement | null {
  const svgContent = registeredIcons.get(iconId);

  if (svgContent === undefined) {
    return null;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgEl = parsed.documentElement;

  if (!(svgEl instanceof SVGSVGElement)) {
    return null;
  }

  return svgEl.cloneNode(true) as SVGSVGElement;
}

export function getIconIds(): readonly IconName[] {
  return [...registeredIcons.keys()];
}

export function removeIcon(iconId: string): void {
  registeredIcons.delete(iconId);
}

export function setIcon(parent: HTMLElement, iconId: IconName): void {
  const svgEl = getIcon(iconId);

  if (svgEl === null) {
    return;
  }

  parent.replaceChildren(svgEl);
}

export function setTooltip(
  el: HTMLElement,
  tooltip: string,
  options?: TooltipOptions,
): void {
  el.title = tooltip;
  el.dataset.nsTooltip = tooltip;

  if (options?.placement !== undefined) {
    el.dataset.nsTooltipPlacement = options.placement;
  }
}

export function displayTooltip(
  newTargetEl: HTMLElement,
  content: string | DocumentFragment,
  options?: TooltipOptions,
): void {
  const normalized = normalizeTooltipContent(content);
  setTooltip(newTargetEl, normalized, options);
}
