import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [
    react()
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // 允许访问整个项目根目录及 node_modules
      allow: [
        path.resolve(__dirname, '../..'), // 项目根目录
        path.resolve(__dirname, '../../node_modules') // 根目录的 node_modules
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@note-studio/core': path.resolve(__dirname, '../core/dist/esm')
    }
  },
  optimizeDeps: {
    include: ['@note-studio/knowledge-base'],
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
