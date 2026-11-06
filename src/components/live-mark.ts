import type { RowMark } from "@/lib/health/live-rows"

/** Row styling for a live change: an accent edge for new and changed rows, faded for ones on their way out. */
export function liveMarkClass(mark: RowMark | undefined): string {
  switch (mark) {
    case "new":
      return "bg-brand/5 shadow-[inset_3px_0_0_var(--color-brand)]"
    case "changed":
      return "bg-severity-warning/5 shadow-[inset_3px_0_0_var(--color-severity-warning)]"
    case "fixed":
      return "bg-brand/5 opacity-70 shadow-[inset_3px_0_0_var(--color-brand)]"
    case "moved":
      return "opacity-50"
    default:
      return ""
  }
}

export const LIVE_MARK_LABEL: Partial<Record<RowMark, string>> = { new: "New", changed: "Updated", fixed: "Fixed" }

/** One sentence for screen readers about what just changed, or "" when nothing did. */
export function liveSummary(marks: (RowMark | undefined)[]): string {
  const count = (m: RowMark) => marks.filter((x) => x === m).length
  const parts = [
    [count("fixed"), "fixed"],
    [count("new"), "new"],
    [count("changed"), "updated"],
    [count("moved"), "moved out of this view"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, what]) => `${n} ${n === 1 ? "ticket" : "tickets"} ${what}`)
  return parts.length ? `Live update: ${parts.join(", ")}.` : ""
}
