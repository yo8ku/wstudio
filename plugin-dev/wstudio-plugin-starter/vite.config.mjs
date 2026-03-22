/**
 * Vite build config for the starter plugin webview.
 * Compiles the React source in webview-src into stable files under webviews/.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    emptyOutDir: false,
    outDir: path.resolve(pluginRoot, 'webviews'),
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(pluginRoot, 'webview-src', 'main.tsx'),
      formats: ['es'],
      fileName: () => 'panel.js',
      cssFileName: 'panel',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (typeof assetInfo.name === 'string' && assetInfo.name.endsWith('.css')) {
            return 'panel.css';
          }

          return 'assets/[name][extname]';
        },
      },
    },
  },
});
