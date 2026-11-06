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
    server: {
      // `pnpm dev:live`: the web app talks to the local server (`pnpm dev:server`) on the same origin.
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8787', changeOrigin: false } },
    },
    build: {
      // The mock export loads as its own chunk. The entry is still ~600 KB (React, Radix, cmdk, zod),
      // all needed before the first render, hence the raised limit (the same as the Jira Dashboard's).
      chunkSizeWarningLimit: 800,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
