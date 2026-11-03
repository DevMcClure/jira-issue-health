import { createContext } from "react"
import type { Resolution } from "@/lib/resolutions/types"

export type ResolutionsContextValue = {
  /** This dataset's resolutions, oldest first. */
  resolutions: Resolution[]
  byIssue: Map<string, Resolution[]>
  /** Save one; false when it will only last for this session (storage unavailable). */
  save: (r: Resolution) => boolean
  /** Remove one save (the toast's Undo). */
  undo: (r: Resolution) => void
  /** Remove every save for a ticket (Undo on a resolved row). */
  undoIssue: (issueKey: string) => void
  /** Remove all of this dataset's resolutions; returns them so they can be restored. */
  clear: () => Resolution[]
  /** Put back resolutions removed by `clear`. */
  restore: (rs: Resolution[]) => void
}

export const ResolutionsContext = createContext<ResolutionsContextValue | null>(null)
