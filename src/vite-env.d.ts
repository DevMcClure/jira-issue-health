/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the "Jira Dashboard" entry in the product switcher links to. */
  readonly VITE_DASHBOARD_URL?: string
  /** Sub-path the app is served from (GitHub Pages: /<repo>/). */
  readonly VITE_BASE_PATH?: string
  /** "demo" (default): everything in the browser. "api": the Jira Health server. */
  readonly VITE_DATA_MODE?: string
  /** The server's API root in api mode; defaults to "/api". */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
