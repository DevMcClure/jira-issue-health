import type { Resolution } from "./types"

/**
 * Where resolutions go. Today only `createLocalResolutionSink` (this browser).
 * A future `JiraResolutionSink` would send the same `Resolution` objects to Jira
 * through a backend, never from the browser.
 */
export interface ResolutionSink {
  /** The resolutions saved for one dataset (identified by its `meta.generatedAt`). */
  load(datasetId: string): Resolution[]
  /** Replace one dataset's saved resolutions. False when they can't be kept past this session. */
  persist(datasetId: string, resolutions: readonly Resolution[]): boolean
  /** Every dataset's saved resolutions, gone. */
  clearAll?(): void
}
