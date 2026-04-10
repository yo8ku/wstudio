/**
 * Base component aligned with plugin-facing lifecycle and automatic teardown helpers.
 */

import {
  COMPONENT_INTERNAL_ADD_CHILD,
  COMPONENT_INTERNAL_LOAD,
  COMPONENT_INTERNAL_REMOVE_CHILD,
  COMPONENT_INTERNAL_UNLOAD,
} from '../internal/runtime';
import type {
  ComponentRegistration,
  DisposableCallback,
  Disposable,
  EventRef,
  IntervalHandle,
} from '../types/disposable';

function normalizeError(error: Error | null, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

async function disposeRegistration(registration: ComponentRegistration): Promise<void> {
  if (typeof registration === 'function') {
    const callback: DisposableCallback = registration;
    await callback();
    return;
  }

  await registration.dispose();
}

export abstract class Component {
  private loaded = false;
  private readonly children: Component[] = [];
  private readonly registrations: ComponentRegistration[] = [];

  public load(): void {
    void this[COMPONENT_INTERNAL_LOAD]();
  }

  public unload(): void {
    void this[COMPONENT_INTERNAL_UNLOAD]();
  }

  public addChild<TComponent extends Component>(component: TComponent): TComponent {
    void this[COMPONENT_INTERNAL_ADD_CHILD](component);
    return component;
  }

  public removeChild<TComponent extends Component>(component: TComponent): TComponent {
    void this[COMPONENT_INTERNAL_REMOVE_CHILD](component);
    return component;
  }

  public async [COMPONENT_INTERNAL_LOAD](): Promise<void> {
    if (this.loaded) {
      return;
    }

    await this.onload();
    this.loaded = true;
  }

  public async [COMPONENT_INTERNAL_UNLOAD](): Promise<void> {
    if (!this.loaded) {
      return;
    }

    let firstError: Error | null = null;

    for (let index = this.children.length - 1; index >= 0; index -= 1) {
      const child = this.children[index];

      try {
        await child[COMPONENT_INTERNAL_UNLOAD]();
      } catch (error) {
        if (firstError === null) {
          firstError = normalizeError(
            error instanceof Error ? error : null,
            'Failed to unload child component.',
          );
        }
      }
    }

    try {
      await this.onunload();
    } catch (error) {
      if (firstError === null) {
        firstError = normalizeError(
          error instanceof Error ? error : null,
          'Failed to unload component.',
        );
      }
    }

    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      const registration = this.registrations[index];

      try {
        await disposeRegistration(registration);
      } catch (error) {
        if (firstError === null) {
          firstError = normalizeError(
            error instanceof Error ? error : null,
            'Failed to dispose component registration.',
          );
        }
      }
    }

    this.children.length = 0;
    this.registrations.length = 0;
    this.loaded = false;

    if (firstError !== null) {
      throw firstError;
    }
  }

  public async [COMPONENT_INTERNAL_ADD_CHILD]<TComponent extends Component>(
    component: TComponent,
  ): Promise<TComponent> {
    this.children.push(component);

    if (this.loaded && !component.loaded) {
      await component[COMPONENT_INTERNAL_LOAD]();
    }

    return component;
  }

  public async [COMPONENT_INTERNAL_REMOVE_CHILD]<TComponent extends Component>(
    component: TComponent,
  ): Promise<TComponent> {
    const index = this.children.indexOf(component);

    if (index === -1) {
      return component;
    }

    this.children.splice(index, 1);

    if (component.loaded) {
      await component[COMPONENT_INTERNAL_UNLOAD]();
    }

    return component;
  }

  public register(callback: DisposableCallback): void {
    this.registrations.push(callback);
  }

  protected registerDisposable(disposable: Disposable): void {
    this.registrations.push(disposable);
  }

  public registerEvent(eventRef: EventRef): void {
    this.registerDisposable(eventRef);
  }

  public registerDomEvent<K extends keyof WindowEventMap>(
    el: Window,
    type: K,
    callback: (ev: WindowEventMap[K]) => Promise<void> | void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public registerDomEvent<K extends keyof DocumentEventMap>(
    el: Document,
    type: K,
    callback: (ev: DocumentEventMap[K]) => Promise<void> | void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (ev: HTMLElementEventMap[K]) => Promise<void> | void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public registerDomEvent(
    el: Window | Document | HTMLElement,
    type: string,
    callback: (ev: Event) => Promise<void> | void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const listener = (event: Event): void => {
      void callback(event);
    };

    el.addEventListener(type, listener, options);
    this.register(() => {
      el.removeEventListener(type, listener, options);
    });
  }

  public registerInterval(intervalHandle: IntervalHandle): IntervalHandle {
    this.register(() => {
      clearInterval(intervalHandle);
    });

    return intervalHandle;
  }

  protected getChildren(): readonly Component[] {
    return this.children;
  }

  public abstract onload(): Promise<void> | void;

  public abstract onunload(): Promise<void> | void;
}
