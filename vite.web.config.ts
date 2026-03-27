import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/renderer'),
  envDir: resolve(__dirname), // pick up .env from project root
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: resolve(__dirname, 'web-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    }
  },
  define: {
    'import.meta.env.VITE_WEB_MODE': JSON.stringify('true'),
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true'),
  }
})
