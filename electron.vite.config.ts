import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react(), tailwindcss()],
    // electron-vite leaves the renderer unminified. Whitespace and syntax only: no source maps are
    // uploaded, so identifiers stay readable in Sentry stack traces.
    build: { minify: 'esbuild' },
    esbuild: { minifyIdentifiers: false },
  },
})
