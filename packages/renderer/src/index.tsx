/**
 * Renderer entry.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BookmarkGroupPickerWindow } from './components/Popup/BookmarkGroupPickerWindow/BookmarkGroupPickerWindow';
import { MainLayout } from './components/Layout/MainLayout';
import { initIconSystem } from './components/Icons';
import { NotificationContainer } from './components/Notification';
import { AppI18nProvider } from './contexts/AppI18nProvider';
import { Toaster } from './components/ui/sonner';
import { knowledgeBaseRecoveryService } from './services/KnowledgeBaseRecoveryService';
import './styles/index.scss';
import './styles/aiResponseFormatter.scss';

type ReactRoot = ReturnType<typeof ReactDOM.createRoot>;
const popupView = new URLSearchParams(window.location.search).get('popup');
const isBookmarkGroupPickerPopup = popupView === 'bookmark-group-picker';

declare global {
  interface Window {
    __REACT_ROOT__?: ReactRoot;
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

const App: React.FC = () => {
  if (isBookmarkGroupPickerPopup) {
    return <BookmarkGroupPickerWindow />;
  }

  return (
    <>
      <MainLayout />
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
