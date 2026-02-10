import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(__dirname, 'public'), // 明确指定 public 目录
  plugins: [
    react()
  ],
  server: {
    port: 5173,
    strictPort: false, // 允许自动切换到下一个可用端口
    headers: {
      // Content Security Policy - 禁止 unsafe-eval 以消除 Electron 安全警告
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: http: https: file: local-file: vscode-file:; font-src 'self' data: https://cdn.jsdelivr.net; media-src 'self' local-file: file: blob: data:; connect-src 'self' http: https: ws: wss:; frame-src 'self' https://player.bilibili.com https://www.bilibili.com https://www.youtube.com https://www.youtube-nocookie.com https://player.youku.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    },
    fs: {
      // 允许访问整个项目根目录及 node_modules
      allow: [
        path.resolve(__dirname, '../..'), // 项目根目录
        path.resolve(__dirname, '../../node_modules') // 根目录的 node_modules
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
    exclude: ['jsdom', 'fs/promises', 'path', 'crypto', 'child_process', 'chokidar', 'events']
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler', // or "modern"
      }
    }
  },
  build: {
    outDir: 'dist',
    // 为 Electron 环境构建
    target: 'esnext',
    rollupOptions: {
      external: ['electron', 'jsdom', 'fs/promises', 'path', 'crypto', 'child_process', 'chokidar', 'events'],
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  // 支持 Electron 环境
  base: './'
});
