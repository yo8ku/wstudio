import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@note-studio/extension-api': path.resolve(__dirname, '../extension-api/src/index.ts'),
    }
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
      external: ['electron']
    }
  },
  // 支持 Electron 环境
  base: './'
});
