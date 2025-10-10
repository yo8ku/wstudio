/**
 * 激活事件处理器 - 处理 VSCode 激活事件
 */

export class ActivationEventHandler {
  private eventListeners: Map<string, Set<() => void>> = new Map();

  registerActivationEvent(event: string, callback: () => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  triggerActivationEvent(event: string): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback());
    }
  }

  parseActivationEvents(events: string[]): string[] {
    return events.map(event => {
      // 解析 VSCode 激活事件格式
      // 例如: "onLanguage:typescript", "onCommand:extension.command"
      return event;
    });
  }
}



