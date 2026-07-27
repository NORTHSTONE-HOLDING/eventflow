import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web-first SaaS — Tauri desktop is optional (`npm run tauri:dev`) and never blocks localhost.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: '/',
  server: {
    port: 5173,
    host: true,
    watch: {
      // Never watch / recompile native desktop crate during web SaaS work
      ignored: ['**/src-tauri/**', '**/src-tauri/target/**'],
    },
  },
  build: {
    // Relative assets still fine for optional desktop packaging via tauri.conf frontendDist
    assetsDir: 'assets',
  },
})
