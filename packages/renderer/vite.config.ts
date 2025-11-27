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
    strictPort: false, // 允许自动切换到下一个可用端口
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
      '@note-studio/theme': path.resolve(__dirname, '../theme/dist/esm'),
      '@note-studio/shared': path.resolve(__dirname, '../shared/dist/esm'),
      '@note-studio/global-rag': path.resolve(__dirname, '../global-rag/dist')
    }
  },
  optimizeDeps: {
    include: ['@note-studio/global-rag'],
    exclude: ['jsdom', 'fs/promises', 'path', 'crypto', 'child_process', 'chokidar', 'events'],
    force: true // 强制重新预构建依赖
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
