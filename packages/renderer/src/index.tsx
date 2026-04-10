/**
 * Renderer entry.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BookmarkGroupPickerWindow } from './components/Popup/BookmarkGroupPickerWindow/BookmarkGroupPickerWindow';
import { MainLayout } from './components/Layout/MainLayout';
import { initIconSystem } from './components/Icons';
import { NotificationContainer, notification } from './components/Notification';
import { GlobalPluginMenu } from './components/GlobalPluginMenu';
import { GlobalPluginSuggestModal } from './components/GlobalPluginSuggestModal';
import { AppI18nProvider } from './contexts/AppI18nProvider';
import { Toaster } from './components/ui/sonner';
import { knowledgeBaseRecoveryService } from './services/KnowledgeBaseRecoveryService';
import { modal, useModalStore } from './stores/modalStore';
import { usePluginMenuStore } from './stores/pluginMenuStore';
import { usePluginSuggestModalStore } from './stores/pluginSuggestModalStore';
import './styles/index.scss';
import './styles/aiResponseFormatter.scss';

type ReactRoot = ReturnType<typeof ReactDOM.createRoot>;
const popupView = new URLSearchParams(window.location.search).get('popup');
const isBookmarkGroupPickerPopup = popupView === 'bookmark-group-picker';

declare global {
  interface Window {
    __REACT_ROOT__?: ReactRoot;
    __PLUGIN_RUNTIME_BRIDGE_INSTALLED__?: boolean;
  }
}

function configureIpcMaxListeners(): void {
  const ipcRendererObject = window.electron?.ipcRenderer;
  if (!ipcRendererObject) {
    return;
  }

  const maybeSetMaxListeners = Reflect.get(ipcRendererObject as object, 'setMaxListeners');
  if (typeof maybeSetMaxListeners === 'function') {
    (maybeSetMaxListeners as (count: number) => void).call(ipcRendererObject, 20);
  }
}

function registerGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    console.error('[renderer] unhandled error', event.error ?? event.message);
    event.preventDefault();

    const root = document.getElementById('root');
    if (root && !root.classList.contains('theme-loaded')) {
      root.classList.add('theme-loaded');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[renderer] unhandled rejection', event.reason);
    event.preventDefault();
  });
}

function clearOldBackgroundCover(): void {
  document.querySelectorAll('style[id*="background-cover"]').forEach((element) => {
    element.remove();
  });
}

function removeAbnormalSVGs(): void {
  const allSVGs = document.querySelectorAll('svg');

  allSVGs.forEach((svg) => {
    if (svg.closest('.cm-mermaid-svg-wrapper') || svg.closest('.cm-mermaid-container')) {
      return;
    }

    if (svg.closest('.mermaid-designer') || svg.closest('.mermaid-designer-svg')) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8) {
      svg.remove();
      return;
    }

    const classes = svg.getAttribute('class') || '';
    if (classes.includes('w-') || classes.includes('h-') || classes.includes('mr-')) {
      svg.style.maxWidth = '20px';
      svg.style.maxHeight = '20px';
      svg.style.width = '16px';
      svg.style.height = '16px';
      svg.style.position = 'static';
      svg.style.display = 'inline-block';
    }
  });
}

function installSvgCleanup(): void {
  removeAbnormalSVGs();
  window.setInterval(removeAbnormalSVGs, 2000);

  const observer = new MutationObserver((mutations) => {
    const needCheck = mutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some((node) => {
        if (node.nodeName === 'svg' || node.nodeName === 'SVG') {
          return true;
        }

        return node instanceof HTMLElement && node.querySelector('svg') !== null;
      });
    });

    if (needCheck) {
      window.setTimeout(removeAbnormalSVGs, 50);
    }
  });

  const startObserve = () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };

  if (document.body) {
    startObserve();
  } else {
    document.addEventListener('DOMContentLoaded', startObserve, { once: true });
  }
}

function installDevtoolsShortcut(): void {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F12') {
      return;
    }

    try {
      if (window.electronAPI?.toggleDevTools) {
        window.electronAPI.toggleDevTools();
        return;
      }

      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.send('toggle-devtools');
      }
    } catch (error) {
      console.error('[renderer] failed to toggle devtools', error);
    }
  });
}

function initializeRecoveryService(): void {
  window.setTimeout(() => {
    knowledgeBaseRecoveryService.initialize().catch((error) => {
      console.error('[renderer] failed to initialize knowledge base recovery service', error);
    });
  }, 2000);
}

function installPluginRuntimeBridge(): void {
  if (window.__PLUGIN_RUNTIME_BRIDGE_INSTALLED__) {
    return;
  }

  const ipcRenderer = window.electron?.ipcRenderer;

  if (!ipcRenderer) {
    return;
  }

  let pendingMouseUpDispatch: ReturnType<typeof setTimeout> | null = null;
  let pendingMouseMoveFrame: number | null = null;
  let pendingMouseMoveEvent:
    | {
      readonly clientX: number;
      readonly clientY: number;
      readonly button: number;
    }
    | null = null;

  ipcRenderer.on(
    'plugin-runtime:show-notice',
    (_event: object, payload: { readonly message: string; readonly level: 'success' | 'error' | 'warning' | 'info' }) => {
      notification[payload.level](payload.message);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:open-modal',
    (_event: object, payload: { readonly title: string; readonly description: string | null }) => {
      modal.info({
        title: payload.title,
        description: payload.description ?? undefined,
        confirmText: '关闭',
        cancelText: '取消',
      });
    },
  );

  ipcRenderer.on('plugin-runtime:close-modal', () => {
    useModalStore.getState().closeModal();
  });

  ipcRenderer.on(
    'plugin-runtime:open-suggest-modal',
    (
      _event: object,
      payload: {
        readonly modalId: string;
        readonly title: string;
        readonly placeholder: string;
        readonly query: string;
        readonly emptyStateText: string;
        readonly instructions: readonly {
          readonly command: string;
          readonly purpose: string;
        }[];
        readonly items: readonly {
          readonly id: string;
          readonly title: string;
          readonly description: string | null;
        }[];
      },
    ) => {
      usePluginSuggestModalStore.getState().openModal(payload);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:update-suggest-modal',
    (
      _event: object,
      payload: {
        readonly modalId: string;
        readonly title: string;
        readonly placeholder: string;
        readonly query: string;
        readonly emptyStateText: string;
        readonly instructions: readonly {
          readonly command: string;
          readonly purpose: string;
        }[];
        readonly items: readonly {
          readonly id: string;
          readonly title: string;
          readonly description: string | null;
        }[];
      },
    ) => {
      usePluginSuggestModalStore.getState().updateModal(payload);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:close-suggest-modal',
    (
      _event: object,
      payload: {
        readonly modalId: string;
      },
    ) => {
      usePluginSuggestModalStore.getState().closeModalById(payload.modalId);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:open-menu',
    (
      _event: object,
      payload: {
        readonly menuId: string;
        readonly items: readonly {
          readonly id: string;
          readonly title: string;
          readonly icon: string | null;
          readonly checked: boolean | null;
          readonly disabled: boolean;
          readonly warning: boolean;
          readonly label: boolean;
          readonly section: string;
          readonly separator: boolean;
        }[];
        readonly position: {
          readonly x: number;
          readonly y: number;
          readonly width?: number;
          readonly overlap?: boolean;
          readonly left?: boolean;
        } | null;
        readonly noIcon: boolean;
        readonly useNativeMenu: boolean;
      },
    ) => {
      usePluginMenuStore.getState().openMenu(payload);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:close-menu',
    (
      _event: object,
      payload: {
        readonly menuId: string;
      },
    ) => {
      usePluginMenuStore.getState().closeMenuById(payload.menuId);
    },
  );

  ipcRenderer.on(
    'plugin-runtime:open-file',
    (
      _event: object,
      payload: {
        readonly path: string;
        readonly title: string;
        readonly language: string;
        readonly content: string;
      },
    ) => {
      window.dispatchEvent(new CustomEvent('open-editor-tab', {
        detail: {
          path: payload.path,
          title: payload.title,
          language: payload.language,
          content: payload.content,
          type: 'file',
        },
      }));
    },
  );

  ipcRenderer.on(
    'plugin-runtime:open-view',
    (
      _event: object,
      payload: {
        readonly leafId: string;
        readonly path: string;
        readonly sourcePath: string | null;
        readonly title: string;
        readonly viewType: string;
        readonly icon: string | null;
        readonly html: string;
        readonly active: boolean;
      },
    ) => {
      window.dispatchEvent(new CustomEvent('open-plugin-view-tab', {
        detail: payload,
      }));
    },
  );

  ipcRenderer.on(
    'plugin-runtime:update-view',
    (
      _event: object,
      payload: {
        readonly leafId: string;
        readonly path: string;
        readonly sourcePath: string | null;
        readonly title: string;
        readonly viewType: string;
        readonly icon: string | null;
        readonly html: string;
        readonly active: boolean;
      },
    ) => {
      window.dispatchEvent(new CustomEvent('open-plugin-view-tab', {
        detail: payload,
      }));
    },
  );

  ipcRenderer.on(
    'plugin-runtime:close-view',
    (
      _event: object,
      payload: {
        readonly leafId: string;
      },
    ) => {
      window.dispatchEvent(new CustomEvent('close-plugin-view-tab', {
        detail: payload,
      }));
    },
  );

  document.addEventListener('click', () => {
    ipcRenderer.send('plugin-runtime:dispatch-document-event', {
      type: 'click',
    });
  }, true);

  document.addEventListener('mouseup', (event) => {
    if (pendingMouseUpDispatch !== null) {
      clearTimeout(pendingMouseUpDispatch);
    }

    const eventSnapshot = {
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
    };

    pendingMouseUpDispatch = setTimeout(() => {
      ipcRenderer.send('plugin-runtime:dispatch-document-event', {
        type: 'mouseup',
        clientX: eventSnapshot.clientX,
        clientY: eventSnapshot.clientY,
        button: eventSnapshot.button,
      });
      pendingMouseUpDispatch = null;
    }, 40);
  }, true);

  document.addEventListener('mousemove', (event) => {
    if (event.buttons === 0) {
      return;
    }

    pendingMouseMoveEvent = {
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
    };

    if (pendingMouseMoveFrame !== null) {
      return;
    }

    pendingMouseMoveFrame = window.requestAnimationFrame(() => {
      if (pendingMouseMoveEvent !== null) {
        ipcRenderer.send('plugin-runtime:dispatch-document-event', {
          type: 'mousemove',
          clientX: pendingMouseMoveEvent.clientX,
          clientY: pendingMouseMoveEvent.clientY,
          button: pendingMouseMoveEvent.button,
        });
      }

      pendingMouseMoveEvent = null;
      pendingMouseMoveFrame = null;
    });
  }, true);

  window.__PLUGIN_RUNTIME_BRIDGE_INSTALLED__ = true;
}

const App: React.FC = () => {
  if (isBookmarkGroupPickerPopup) {
    return <BookmarkGroupPickerWindow />;
  }

  return (
    <>
      <MainLayout />
      <GlobalPluginMenu />
      <GlobalPluginSuggestModal />
      <NotificationContainer />
      <Toaster />
    </>
  );
};

configureIpcMaxListeners();
registerGlobalErrorHandlers();
clearOldBackgroundCover();
installSvgCleanup();
installDevtoolsShortcut();
initIconSystem();
installPluginRuntimeBridge();
if (!isBookmarkGroupPickerPopup) {
  initializeRecoveryService();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found.');
}

const reactRoot = window.__REACT_ROOT__ ?? ReactDOM.createRoot(rootElement);
window.__REACT_ROOT__ = reactRoot;
reactRoot.render(
  <AppI18nProvider>
    <App />
  </AppI18nProvider>
);
