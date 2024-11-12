import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, './../dist/frontend'),
    assetsDir: 'static',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // URL вашего сервера Express
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '') // убирает /api, если не нужно
      }
    }
  }
});