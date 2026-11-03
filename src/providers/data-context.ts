import { createContext } from "react"
import type { JiraDataset } from "@/lib/jira/types"
import type { DataOrigin } from "./data-source"

export type LoadResult = { ok: true; dataset: JiraDataset } | { ok: false; problems: string[] }

export type DataContextValue = {
  dataset: JiraDataset
  /** Sample or a loaded file. */
  origin: DataOrigin
  /** Load a Trawler file in the browser. A bad file shows its problems and keeps the current data. */
  loadFromFile: (file: File) => Promise<LoadResult>
  resetToSample: () => void
}

export const DataContext = createContext<DataContextValue | null>(null)
