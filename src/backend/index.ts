import type { Backend } from "@/providers/data-source"
import { createStaticDataSource } from "@/providers/static-data-source"
import { createDemoBackend } from "./demo-backend"
import { createHttpBackend } from "./http-backend"

/**
 * VITE_DATA_MODE picks the backend:
 *   - "demo" (default, GitHub Pages): everything in this browser, a mock Jira.
 *   - "api": the Jira Health server at VITE_API_BASE_URL (default "/api").
 */
export function createBackend(env: ImportMetaEnv = import.meta.env): Backend {
  if (env.VITE_DATA_MODE === "api") return createHttpBackend({ baseUrl: env.VITE_API_BASE_URL || "/api" })
  return createDemoBackend({ files: createStaticDataSource() })
}
