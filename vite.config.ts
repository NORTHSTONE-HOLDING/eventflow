import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
// base: './' — relative asset URLs for Tauri WebView (macOS AppKit / Windows WebView2)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: './',
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
