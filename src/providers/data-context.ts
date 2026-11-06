import { createContext } from "react"
import type { Fix } from "@/lib/api/contract"
import type { JiraDataset } from "@/lib/jira/types"
import type { DataOrigin, DemoControls, LiveStatus } from "./data-source"

export type LoadResult = { ok: true; dataset: JiraDataset } | { ok: false; problems: string[] }

export type DataContextValue = {
  /** "api": the Jira Health server. "demo": everything in this browser. */
  mode: "api" | "demo"
  dataset: JiraDataset
  origin: DataOrigin
  /** Changes whenever the data does. */
  revision: string
  /** Recent fixes, oldest first. */
  fixes: Fix[]
  /** The live connection; null until it reports. */
  live: LiveStatus | null
  /** Fetch the data again now. */
  refresh: () => void
  /** Demo only: load a Trawler file in the browser. A bad file shows its problems and keeps the current data. */
  loadFromFile: ((file: File) => Promise<LoadResult>) | null
  /** Demo only, while a loaded file is showing. */
  resetToSample: (() => void) | null
  demo: DemoControls | null
}

export const DataContext = createContext<DataContextValue | null>(null)
