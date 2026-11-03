/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the "Jira Dashboard" entry in the product switcher links to. */
  readonly VITE_DASHBOARD_URL?: string
  /** Sub-path the app is served from (GitHub Pages: /<repo>/). */
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
