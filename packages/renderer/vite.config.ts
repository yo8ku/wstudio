import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [
    react()
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    },
    fs: {
      allow: [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../node_modules')
      ]
    }
  },
  resolve: {
    preserveSymlinks: false,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@note-studio/theme': path.resolve(__dirname, '../theme/src/index.ts'),
      '@note-studio/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@note-studio/global-rag': path.resolve(__dirname, '../global-rag/src/index.ts')
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    conditions: ['import', 'module', 'browser', 'default'],
    dedupe: ['@note-studio/shared', '@note-studio/global-rag', '@note-studio/theme']
  },
  optimizeDeps: {
    exclude: [
      'monaco-editor',
      '@monaco-editor/react',
      'jsdom',
      'fs/promises',
      'path',
      'crypto',
      'child_process',
      'chokidar',
      'events'
    ]
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      }
    }
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      external: ['electron', 'jsdom', 'fs/promises', 'path', 'crypto', 'child_process', 'chokidar', 'events'],
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  base: './'
});
