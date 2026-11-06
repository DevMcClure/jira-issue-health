import type { Fix } from "../api/contract"
import type { TicketHealth } from "../health/checks"
import { compareKeys, inScope, type Filters } from "../health/list"
import type { JiraDataset } from "../jira/types"

/** Each ticket's fixes, oldest first. */
export function fixesByIssue(fixes: readonly Fix[]): Map<string, Fix[]> {
  const out = new Map<string, Fix[]>()
  for (const f of [...fixes].sort((a, b) => a.at.localeCompare(b.at))) out.set(f.issueKey, [...(out.get(f.issueKey) ?? []), f])
  return out
}

type Input = {
  health: readonly TicketHealth[]
  byIssue: ReadonlyMap<string, Fix[]>
  filters: Filters
  dataset: Pick<JiraDataset, "teams" | "sprintById">
}

/**
 * Tickets in this slice of work that were fixed through Resolve and now have no
 * gaps: what "Show fixed" brings back, by key.
 */
export function fixedRows({ health, byIssue, filters, dataset }: Input): TicketHealth[] {
  return health
    .filter(
      (h) =>
        h.gaps.length === 0 &&
        byIssue.get(h.issue.key)?.some((f) => f.via === "app") &&
        inScope(h.issue, filters, dataset),
    )
    .sort((a, b) => compareKeys(a.issue.key, b.issue.key))
}
