/**
 * Event emitter primitives aligned with the plugin-facing event system.
 */

import type { EventRef } from './disposable';

export type EventArgument = string | number | boolean | bigint | symbol | null | undefined | object;

export type EventCallback = (...data: readonly EventArgument[]) => EventArgument | void;

interface EventListener {
  readonly callback: EventCallback;
  readonly context?: object;
}

class ManagedEventRef implements EventRef {
  private active = true;

  public constructor(
    private readonly owner: Events,
    public readonly name: string,
    public readonly callback: EventCallback,
    public readonly context?: object,
  ) {}

  public dispose(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.owner.offref(this);
  }

  public matches(name: string, callback: EventCallback): boolean {
    return this.name === name && this.callback === callback;
  }

  public trigger(args: readonly EventArgument[]): void {
    if (!this.active) {
      return;
    }

    this.callback(...args);
  }
}

export class Events {
  private readonly listeners = new Map<string, ManagedEventRef[]>();

  public on(name: string, callback: EventCallback, context?: object): EventRef {
    const ref = new ManagedEventRef(this, name, callback, context);
    const listeners = this.listeners.get(name);

    if (listeners === undefined) {
      this.listeners.set(name, [ref]);
    } else {
      listeners.push(ref);
    }

    return ref;
  }

  public off(name: string, callback: EventCallback): void {
    const listeners = this.listeners.get(name);

    if (listeners === undefined) {
      return;
    }

    const nextListeners = listeners.filter((listener) => !listener.matches(name, callback));

    if (nextListeners.length === 0) {
      this.listeners.delete(name);
      return;
    }

    this.listeners.set(name, nextListeners);
  }

  public offref(ref: EventRef): void {
    if (!(ref instanceof ManagedEventRef)) {
      return;
    }

    const listeners = this.listeners.get(ref.name);

    if (listeners === undefined) {
      return;
    }

    const nextListeners = listeners.filter((listener) => listener !== ref);

    if (nextListeners.length === 0) {
      this.listeners.delete(ref.name);
      return;
    }

    this.listeners.set(ref.name, nextListeners);
  }

  public trigger(name: string, ...data: readonly EventArgument[]): void {
    const listeners = this.listeners.get(name);

    if (listeners === undefined) {
      return;
    }

    for (const listener of [...listeners]) {
      listener.trigger(data);
    }
  }

  public tryTrigger(ref: EventRef, args: readonly EventArgument[]): void {
    if (ref instanceof ManagedEventRef) {
      ref.trigger(args);
    }
  }
}
