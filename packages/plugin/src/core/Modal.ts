/**
 * Runtime-only modal surface aligned with plugin-authored interactive flows.
 */

import type { App } from '../types/app';
import type { CloseableComponent } from '../types/closeable';
import { Scope } from '../types/keymap';
import { getPluginHostUiBridge } from '../internal/host-ui-bridge';

function getElementText(target: HTMLElement): string {
  return target.textContent?.trim() ?? '';
}

interface ModalRuntimeSurfaceConstructor {
  readonly runtimeSurfaceId?: string;
  readonly name?: string;
}

export class Modal implements CloseableComponent {
  public readonly app: App;
  public readonly scope: Scope;
  public readonly modalEl: HTMLElement;
  public readonly titleEl: HTMLElement;
  public shouldRestoreSelection = false;

  protected opened = false;
  private readonly overlayEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private closeCallback: (() => void) | null = null;
  private hostOverlayModalId: string | null = null;
  private closingViaHostOverlayBridge = false;
  private hostOverlayOpenRevision = 0;
  private readonly escapeHandler: (event: KeyboardEvent) => void;

  public constructor(app: App) {
    this.app = app;
    this.scope = new Scope(app.scope);

    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'ns-plugin-modal-overlay';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'ns-plugin-modal';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'ns-plugin-modal__title';

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'ns-plugin-modal__content';

    this.modalEl.append(this.titleEl, this.bodyEl);
    this.overlayEl.append(this.modalEl);

    this.escapeHandler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.close();
      }
    };

    this.overlayEl.addEventListener('click', (event) => {
      if (event.target === this.overlayEl) {
        this.close();
      }
    });
  }

  public setTitle(title: string | Node): this {
    if (typeof title === 'string') {
      this.titleEl.textContent = title;
      return this;
    }

    this.titleEl.replaceChildren(title);
    return this;
  }

  public setCloseCallback(callback: () => void): this {
    this.closeCallback = callback;
    return this;
  }

  public open(): void {
    if (this.opened) {
      return;
    }

    this.opened = true;
    this.hostOverlayOpenRevision += 1;
    const openRevision = this.hostOverlayOpenRevision;
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null) {
      throw new Error('Modal rich UI now requires the plugin host UI bridge and a runtime surface.');
    }

    void Promise.resolve(this.onOpen()).then(() => {
      if (!this.opened || this.hostOverlayOpenRevision !== openRevision) {
        return;
      }

      this.hostOverlayModalId = hostUiBridge.openModal({
        title: getElementText(this.titleEl),
        titleElement: this.titleEl,
        contentElement: this.bodyEl,
        surfaceId: this.resolveHostRuntimeSurfaceId(),
        onClose: () => {
          this.handleHostOverlayClosed();
        },
      });
    });
  }

  public close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.hostOverlayOpenRevision += 1;
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null && this.hostOverlayModalId !== null) {
      const modalId = this.hostOverlayModalId;
      this.hostOverlayModalId = null;
      this.closingViaHostOverlayBridge = true;
      hostUiBridge.closeModal(modalId);
      this.closeCallback?.();
      void Promise.resolve(this.onClose());
      return;
    }

    this.closeCallback?.();
    void Promise.resolve(this.onClose());
  }

  public onOpen(): Promise<void> | void {
    return undefined;
  }

  public onClose(): Promise<void> | void {
    return undefined;
  }

  private handleHostOverlayClosed(): void {
    if (this.closingViaHostOverlayBridge) {
      this.closingViaHostOverlayBridge = false;
      return;
    }

    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.hostOverlayModalId = null;
    this.closeCallback?.();
    void Promise.resolve(this.onClose());
  }

  private resolveHostRuntimeSurfaceId(): string | null {
    const constructorRef = this.constructor as ModalRuntimeSurfaceConstructor;
    const configuredSurfaceId = constructorRef.runtimeSurfaceId;

    if (typeof configuredSurfaceId === 'string' && configuredSurfaceId.trim().length > 0) {
      return configuredSurfaceId.trim();
    }

    const inferredSurfaceId = constructorRef.name?.trim() ?? '';
    return inferredSurfaceId.length > 0 ? inferredSurfaceId : null;
  }
}
