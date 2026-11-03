import type { TicketHealth } from "../health/checks"
import { applyFilters, compareKeys, type Filters } from "../health/list"
import type { JiraDataset } from "../jira/types"
import type { Resolution } from "./types"

type Input = {
  /** Health of the data as loaded. */
  baseHealth: TicketHealth[]
  baseDataset: Pick<JiraDataset, "teams" | "sprintById">
  /** Health with local resolutions applied, by key. */
  current: Map<string, TicketHealth>
  byIssue: Map<string, Resolution[]>
  filters: Filters
}

/**
 * Tickets this filter would list if they hadn't been fixed locally, and that now
 * have no gaps: what "Show resolved" brings back. Matched on their original gaps, sorted by key.
 */
export function resolvedRows({ baseHealth, baseDataset, current, byIssue, filters }: Input): TicketHealth[] {
  return applyFilters(baseHealth, filters, baseDataset)
    .rows.filter((h) => byIssue.has(h.issue.key) && current.get(h.issue.key)?.gaps.length === 0)
    .map((h) => current.get(h.issue.key)!)
    .sort((a, b) => compareKeys(a.issue.key, b.issue.key))
}

/** Tickets in this filter fixed locally: fully (no gaps left) or partly. */
export function resolvedCounts({ baseHealth, baseDataset, current, byIssue, filters }: Input): { full: number; partial: number } {
  let full = 0
  let partial = 0
  for (const h of applyFilters(baseHealth, filters, baseDataset).rows) {
    if (!byIssue.has(h.issue.key)) continue
    if (current.get(h.issue.key)?.gaps.length === 0) full++
    else partial++
  }
  return { full, partial }
}
