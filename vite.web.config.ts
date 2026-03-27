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
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || 'https://eqfmeavkefflwmzihqkd.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZm1lYXZrZWZmbHdtemlocWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MjQzMjksImV4cCI6MjA4OTEwMDMyOX0.1F1v2KOm30s-o2lRmy5ZuNf3B1Cm8FTx8FpHWLANrIE'),
  }
})
