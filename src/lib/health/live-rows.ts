/**
 * What changed in the list when new data arrived, so the UI can show it without
 * the list jumping: tickets that left stay in place for a moment (fixed, or moved
 * out of this view), new ones and ones whose gaps changed are highlighted. Pure.
 */
import type { TicketHealth } from "./checks"

export type RowMark =
  /** Newly in the list. */
  | "new"
  /** Still listed, with different gaps. */
  | "changed"
  /** Left the list because nothing is missing any more. */
  | "fixed"
  /** Left the list for another reason (moved sprint, reassigned, …). */
  | "moved"

export type ListRow = { health: TicketHealth; mark?: RowMark }

export type LiveDiff = {
  marks: Map<string, RowMark>
  /** Rows that left, as they were, to keep in place for a moment. */
  leaving: ListRow[]
}

export const EMPTY_DIFF: LiveDiff = { marks: new Map(), leaving: [] }

const gapKey = (h: TicketHealth) => h.gaps.map((g) => g.field).join(",")

/**
 * Compare the list before and after a data change. `now` is every ticket's health
 * in the new data, to tell a fixed ticket from one that only left this view.
 */
export function diffRows(prev: readonly TicketHealth[], next: readonly TicketHealth[], now: ReadonlyMap<string, TicketHealth>): LiveDiff {
  const before = new Map(prev.map((h) => [h.issue.key, h]))
  const after = new Set(next.map((h) => h.issue.key))
  const marks = new Map<string, RowMark>()
  const leaving: ListRow[] = []

  for (const h of next) {
    const old = before.get(h.issue.key)
    if (!old) marks.set(h.issue.key, "new")
    else if (gapKey(old) !== gapKey(h)) marks.set(h.issue.key, "changed")
  }
  for (const h of prev) {
    if (after.has(h.issue.key)) continue
    const mark: RowMark = now.get(h.issue.key)?.gaps.length === 0 ? "fixed" : "moved"
    marks.set(h.issue.key, mark)
    leaving.push({ health: h, mark })
  }
  return { marks, leaving }
}

/**
 * The new list with leaving rows put back where they were: each goes after the
 * closest row that was above it before and is still listed.
 */
export function withLeaving(next: readonly TicketHealth[], prev: readonly TicketHealth[], diff: LiveDiff): ListRow[] {
  const rows: ListRow[] = next.map((h) => ({ health: h, mark: diff.marks.get(h.issue.key) }))
  if (diff.leaving.length === 0) return rows
  const leavingByKey = new Map(diff.leaving.map((r) => [r.health.issue.key, r]))
  const order = prev.map((h) => h.issue.key)
  for (const key of order) {
    const row = leavingByKey.get(key)
    if (!row) continue
    let at = 0
    for (let i = order.indexOf(key) - 1; i >= 0; i--) {
      const idx = rows.findIndex((r) => r.health.issue.key === order[i])
      if (idx >= 0) {
        at = idx + 1
        break
      }
    }
    rows.splice(at, 0, row)
  }
  return rows
}
