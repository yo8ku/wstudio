/**
 * Webview API 桥接
 */

export const apiBridge = {
  postMessage(message: any): void {
    window.parent.postMessage(message, '*');
  },

  onMessage(handler: (message: any) => void): void {
    window.addEventListener('message', (event) => {
      handler(event.data);
    });
  },

  getState(): any {
    return (window as any).__vscodeState || {};
  },

  setState(state: any): void {
    (window as any).__vscodeState = state;
  }
};



