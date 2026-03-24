/**
 * Bookmark group picker popup entry.
 * Boots the detached bookmark group picker window without loading the main workbench renderer.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BookmarkGroupPickerWindow } from './components/Popup/BookmarkGroupPickerWindow/BookmarkGroupPickerWindow';
import { initIconSystem } from './components/Icons';
import './styles/index.scss';

function registerGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    console.error('[bookmark-group-picker] unhandled error', event.error ?? event.message);
    event.preventDefault();
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[bookmark-group-picker] unhandled rejection', event.reason);
    event.preventDefault();
  });
}

registerGlobalErrorHandlers();
initIconSystem();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found.');
}

ReactDOM.createRoot(rootElement).render(<BookmarkGroupPickerWindow />);
