import { useEffect, useState } from "react"
import type { TicketHealth } from "@/lib/health/checks"
import { EMPTY_DIFF, diffRows, withLeaving, type ListRow, type LiveDiff } from "@/lib/health/live-rows"

/** How long changed, new and leaving rows stay marked. */
export const MARK_MS = 5_000

type State = { revision: string; rows: readonly TicketHealth[]; before: readonly TicketHealth[]; diff: LiveDiff }

/**
 * The list with live changes marked: when the data's revision changes, tickets that
 * left stay where they were for a moment and new or changed ones are highlighted.
 * Filter changes (same revision) never animate.
 */
export function useLiveRows(rows: readonly TicketHealth[], revision: string, now: ReadonlyMap<string, TicketHealth>): ListRow[] {
  const [state, setState] = useState<State>({ revision, rows, before: rows, diff: EMPTY_DIFF })

  // Derive from the new props during render (React's "adjust state on prop change" pattern),
  // so the list never renders a frame without its leaving rows.
  let current = state
  if (state.revision !== revision) {
    current = { revision, rows, before: state.rows, diff: diffRows(state.rows, rows, now) }
    setState(current)
  } else if (state.rows !== rows) {
    current = { ...state, rows, diff: state.diff.leaving.length ? { marks: state.diff.marks, leaving: [] } : state.diff }
    setState(current)
  }

  const diff = current.diff
  useEffect(() => {
    if (diff.marks.size === 0) return
    const t = setTimeout(() => setState((s) => (s.diff === diff ? { ...s, diff: EMPTY_DIFF } : s)), MARK_MS)
    return () => clearTimeout(t)
  }, [diff])

  return withLeaving(current.rows, current.before, current.diff)
}
