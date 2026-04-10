/**
 * Lightweight DOM-backed notice primitive for renderer-side plugin feedback.
 */

import type { NoticeMessage } from '../types/notice';
import { getPluginHostUiBridge } from '../internal/host-ui-bridge';

function setMessageContent(target: HTMLElement, message: NoticeMessage): void {
  if (typeof message === 'string') {
    target.textContent = message;
    return;
  }

  target.replaceChildren(message);
}

function getNoticeContainer(): HTMLElement {
  const existingContainer = document.body.querySelector<HTMLElement>('[data-ns-plugin-notice-container="true"]');

  if (existingContainer !== null) {
    return existingContainer;
  }

  const containerEl = document.createElement('div');
  containerEl.className = 'ns-plugin-notice-container';
  containerEl.dataset.nsPluginNoticeContainer = 'true';
  document.body.append(containerEl);
  return containerEl;
}

function getNoticeMessageText(message: NoticeMessage): string {
  if (typeof message === 'string') {
    return message;
  }

  return message.textContent ?? '';
}

export class Notice {
  public readonly containerEl: HTMLElement;
  public readonly messageEl: HTMLElement;
  public readonly noticeEl: HTMLElement;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private hidden = false;

  public constructor(message: NoticeMessage, duration?: number) {
    this.noticeEl = document.createElement('div');
    this.noticeEl.className = 'ns-plugin-notice';
    this.noticeEl.setAttribute('role', 'status');
    this.noticeEl.setAttribute('aria-live', 'polite');
    this.messageEl = document.createElement('div');
    this.messageEl.className = 'ns-plugin-notice__message';
    setMessageContent(this.messageEl, message);
    this.noticeEl.append(this.messageEl);

    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null) {
      this.containerEl = document.body;
      hostUiBridge.showNotice({
        message: getNoticeMessageText(message),
        level: 'info',
      });
    } else {
      this.containerEl = getNoticeContainer();
      this.containerEl.append(this.noticeEl);
    }

    if (duration !== 0) {
      const resolvedDuration = duration ?? 4000;
      this.timeoutHandle = setTimeout(() => {
        this.hide();
      }, resolvedDuration);
    }
  }

  public hide(): void {
    if (this.hidden) {
      return;
    }

    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    this.hidden = true;
    this.noticeEl.remove();
  }

  public setMessage(message: NoticeMessage): this {
    setMessageContent(this.messageEl, message);
    return this;
  }
}
