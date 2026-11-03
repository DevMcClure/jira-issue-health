import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { createLocalResolutionSink } from "@/lib/resolutions/local-sink"
import { resolutionsByIssue } from "@/lib/resolutions/overlay"
import type { ResolutionSink } from "@/lib/resolutions/sink"
import type { Resolution } from "@/lib/resolutions/types"
import { ResolutionsContext } from "./resolutions-context"

const defaultSink = createLocalResolutionSink()

type Props = {
  /** The export's `meta.generatedAt`: resolutions belong to one dataset. Remount (key) when it changes. */
  datasetId: string
  sink?: ResolutionSink
  children: ReactNode
}

/** Local mock resolutions for the loaded dataset, kept in this browser through a `ResolutionSink`. */
export function ResolutionsProvider({ datasetId, sink = defaultSink, children }: Props) {
  const [resolutions, setResolutions] = useState<Resolution[]>(() => sink.load(datasetId))
  // Every change starts from the latest list, so an old toast's Undo can't drop later saves.
  const latest = useRef(resolutions)

  const commit = useCallback(
    (change: (current: Resolution[]) => Resolution[]) => {
      const next = change(latest.current)
      latest.current = next
      setResolutions(next)
      return sink.persist(datasetId, next)
    },
    [sink, datasetId],
  )

  const save = useCallback((r: Resolution) => commit((rs) => [...rs, r]), [commit])
  const undo = useCallback(
    (r: Resolution) => void commit((rs) => rs.filter((x) => !(x.issueKey === r.issueKey && x.resolvedAt === r.resolvedAt))),
    [commit],
  )
  const undoIssue = useCallback((key: string) => void commit((rs) => rs.filter((x) => x.issueKey !== key)), [commit])
  const clear = useCallback(() => {
    const removed = latest.current
    commit(() => [])
    return removed
  }, [commit])
  const restore = useCallback((removed: Resolution[]) => void commit((rs) => [...removed, ...rs]), [commit])

  const value = useMemo(
    () => ({ resolutions, byIssue: resolutionsByIssue(resolutions), save, undo, undoIssue, clear, restore }),
    [resolutions, save, undo, undoIssue, clear, restore],
  )
  return <ResolutionsContext.Provider value={value}>{children}</ResolutionsContext.Provider>
}
