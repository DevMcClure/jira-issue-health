import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // GitHub Pages serves the site from /<repo>/; CI sets VITE_BASE_PATH. Locally it's "/".
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    build: {
      // The mock export loads as its own chunk. The entry is still ~520 KB (React, Radix, zod),
      // all needed before the first render, hence the raised limit (the Jira Dashboard uses 800).
      chunkSizeWarningLimit: 600,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
