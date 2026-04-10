/**
 * Keyboard scope and keymap contracts exposed through the plugin app facade.
 */

import type { Modifier, PaneType, UserEvent } from './base';

export interface KeymapInfo {
  readonly modifiers: string | null;
  readonly key: string | null;
}

export interface KeymapContext extends KeymapInfo {
  readonly vkey: string;
}

export interface KeymapEventHandler extends KeymapInfo {
  readonly scope: Scope;
}

export type KeymapEventListener = (
  event: KeyboardEvent,
  context: KeymapContext,
) => false | Promise<false | void> | void;

function normalizeModifiers(modifiers: readonly Modifier[] | null): string | null {
  if (modifiers === null || modifiers.length === 0) {
    return null;
  }

  return [...modifiers].sort().join('+');
}

export class Scope {
  private readonly handlers: KeymapEventHandler[] = [];
  private readonly listeners = new Map<KeymapEventHandler, KeymapEventListener>();

  public constructor(private readonly parentScope?: Scope) {}

  public register(
    modifiers: readonly Modifier[] | null,
    key: string | null,
    listener: KeymapEventListener,
  ): KeymapEventHandler {
    const handler: KeymapEventHandler = {
      scope: this,
      modifiers: normalizeModifiers(modifiers),
      key,
    };

    this.handlers.push(handler);
    this.listeners.set(handler, listener);
    return handler;
  }

  public unregister(handler: KeymapEventHandler): void {
    const index = this.handlers.indexOf(handler);

    if (index !== -1) {
      this.handlers.splice(index, 1);
    }

    this.listeners.delete(handler);
  }
}

export class Keymap {
  private readonly scopes: Scope[] = [];

  public pushScope(scope: Scope): void {
    this.scopes.push(scope);
  }

  public popScope(scope: Scope): void {
    const index = this.scopes.lastIndexOf(scope);

    if (index !== -1) {
      this.scopes.splice(index, 1);
    }
  }

  public static isModifier(event: MouseEvent | TouchEvent | KeyboardEvent, modifier: Modifier): boolean {
    switch (modifier) {
      case 'Mod':
        return event.metaKey || event.ctrlKey;
      case 'Ctrl':
        return event.ctrlKey;
      case 'Meta':
        return event.metaKey;
      case 'Shift':
        return event.shiftKey;
      case 'Alt':
        return event.altKey;
      default:
        return false;
    }
  }

  public static isModEvent(event?: UserEvent | null): PaneType | boolean {
    if (event === undefined || event === null) {
      return false;
    }

    if ((event.metaKey || event.ctrlKey) && event.altKey && event.shiftKey) {
      return 'window';
    }

    if ((event.metaKey || event.ctrlKey) && event.altKey) {
      return 'split';
    }

    if ((event.metaKey || event.ctrlKey) || ('button' in event && event.button === 1)) {
      return 'tab';
    }

    return false;
  }
}
