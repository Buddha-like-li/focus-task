import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    port: 1420,
    host: '127.0.0.1',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
