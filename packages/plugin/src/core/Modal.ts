/**
 * Minimal DOM-backed modal surface aligned with plugin-authored interactive flows.
 */

import type { App } from '../types/app';
import type { CloseableComponent } from '../types/closeable';
import { Scope } from '../types/keymap';
import type { ControlContent } from './Control';
import { getPluginHostUiBridge } from '../internal/host-ui-bridge';

function setContent(target: HTMLElement, content: ControlContent): void {
  if (typeof content === 'string') {
    target.textContent = content;
    return;
  }

  target.replaceChildren(content);
}

function getElementText(target: HTMLElement): string {
  return target.textContent?.trim() ?? '';
}

export class Modal implements CloseableComponent {
  public readonly app: App;
  public readonly scope: Scope;
  public readonly containerEl: HTMLElement;
  public readonly modalEl: HTMLElement;
  public readonly titleEl: HTMLElement;
  public readonly contentEl: HTMLElement;
  public shouldRestoreSelection = false;

  protected opened = false;
  private closeCallback: (() => void) | null = null;
  private readonly escapeHandler: (event: KeyboardEvent) => void;

  public constructor(app: App) {
    this.app = app;
    this.scope = new Scope(app.scope);

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'ns-plugin-modal-overlay';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'ns-plugin-modal';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'ns-plugin-modal__title';

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'ns-plugin-modal__content';

    this.modalEl.append(this.titleEl, this.contentEl);
    this.containerEl.append(this.modalEl);

    this.escapeHandler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        this.close();
      }
    };

    this.containerEl.addEventListener('click', (event) => {
      if (event.target === this.containerEl) {
        this.close();
      }
    });
  }

  public setTitle(title: ControlContent): this {
    setContent(this.titleEl, title);
    return this;
  }

  public setContent(content: ControlContent): this {
    setContent(this.contentEl, content);
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
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null) {
      void Promise.resolve(this.onOpen()).then(() => {
        hostUiBridge.openModal({
          title: getElementText(this.titleEl),
          description: getElementText(this.contentEl) || null,
        });
      });
      return;
    }

    document.body.append(this.containerEl);
    document.addEventListener('keydown', this.escapeHandler);
    void Promise.resolve(this.onOpen());
  }

  public close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null) {
      hostUiBridge.closeModal();
      this.closeCallback?.();
      void Promise.resolve(this.onClose());
      return;
    }

    document.removeEventListener('keydown', this.escapeHandler);
    this.containerEl.remove();
    this.closeCallback?.();
    void Promise.resolve(this.onClose());
  }

  public onOpen(): Promise<void> | void {
    return undefined;
  }

  public onClose(): Promise<void> | void {
    return undefined;
  }
}
