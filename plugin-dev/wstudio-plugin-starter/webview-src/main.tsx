/**
 * React entry for the starter plugin webview.
 * Mounts the panel application into the static webview container.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './panel.scss';

const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('Starter panel root element #app was not found.');
}

ReactDOM.createRoot(appRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
