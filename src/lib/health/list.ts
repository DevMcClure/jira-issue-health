/**
 * The "Tickets to fix" list: filtering, ordering, the summary strip and grouping.
 * Pure: the page passes in the dataset and each ticket's health.
 */
import type { Issue, JiraDataset, Sprint } from "../jira/types"
import type { TicketHealth } from "./checks"
import { DEFAULT_REQUIRED_FIELDS, severityRank, type FieldId, type Severity } from "./requiredFields"

/** Assignee filter value for "nobody". */
export const UNASSIGNED = "__unassigned__"

/**
 * "active": every active sprint, plus in-progress work that isn't in any sprint
 * (otherwise a missing sprint would never show by default).
 * "backlog": not in any sprint. "all": everything. Otherwise one sprint's id.
 */
export type SprintFilter = "active" | "backlog" | "all" | number

export type Filters = {
  /** Empty = all. */
  teamIds: string[]
  sprint: SprintFilter
  /** Person ids; `UNASSIGNED` for nobody. Empty = all. */
  assigneeIds: string[]
  types: string[]
  /** The ticket's worst severity. */
  severities: Severity[]
  /** Tickets missing any of these fields. */
  fields: FieldId[]
  /** Key or summary contains this, ignoring case. */
  search: string
}

export const DEFAULT_FILTERS: Filters = {
  teamIds: [],
  sprint: "active",
  assigneeIds: [],
  types: [],
  severities: [],
  fields: [],
  search: "",
}

export const isDefaultFilters = (f: Filters) => JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS)

/**
 * The ticket's team: its own, else its sprint's, else the team whose project key
 * matches the issue key (so a ticket that lost its team still shows under it).
 */
export function teamOf(issue: Issue, dataset: Pick<JiraDataset, "teams" | "sprintById">): string | null {
  if (issue.teamId) return issue.teamId
  for (const id of issue.sprintIds) {
    const team = dataset.sprintById.get(id)?.teamId
    if (team) return team
  }
  const project = issue.key.split("-")[0]
  return dataset.teams.find((t) => t.projectKey === project)?.id ?? null
}

const SPRINT_RANK: Record<Sprint["state"], number> = { active: 0, future: 1, closed: 2 }

/** The sprint a ticket is "in" now: active over future over the latest closed one. */
export function currentSprint(issue: Issue, dataset: Pick<JiraDataset, "sprintById">): Sprint | null {
  let best: Sprint | null = null
  for (const id of issue.sprintIds) {
    const s = dataset.sprintById.get(id)
    if (!s) continue
    if (
      !best ||
      SPRINT_RANK[s.state] < SPRINT_RANK[best.state] ||
      (s.state === best.state && Date.parse(s.startDate ?? "") > Date.parse(best.startDate ?? ""))
    ) {
      best = s
    }
  }
  return best
}

function inSprintScope(issue: Issue, sprint: SprintFilter, dataset: Pick<JiraDataset, "sprintById">): boolean {
  if (sprint === "all") return true
  if (sprint === "backlog") return issue.sprintIds.length === 0
  if (sprint === "active") {
    if (issue.sprintIds.length === 0) return issue.statusCategory === "inProgress"
    return issue.sprintIds.some((id) => dataset.sprintById.get(id)?.state === "active")
  }
  return issue.sprintIds.includes(sprint)
}

/** Whether a ticket is in the chosen slice of work, before looking at its gaps. */
export function inScope(issue: Issue, filters: Filters, dataset: Pick<JiraDataset, "teams" | "sprintById">): boolean {
  if (filters.teamIds.length) {
    const team = teamOf(issue, dataset)
    if (!team || !filters.teamIds.includes(team)) return false
  }
  if (!inSprintScope(issue, filters.sprint, dataset)) return false
  if (filters.assigneeIds.length && !filters.assigneeIds.includes(issue.assigneeId ?? UNASSIGNED)) return false
  if (filters.types.length && !filters.types.includes(issue.type)) return false
  const q = filters.search.trim().toLowerCase()
  if (q && !issue.key.toLowerCase().includes(q) && !issue.summary.toLowerCase().includes(q)) return false
  return true
}

function matchesGapFilters(h: TicketHealth, filters: Filters): boolean {
  if (h.gaps.length === 0) return false
  if (filters.severities.length && !filters.severities.includes(h.severity!)) return false
  if (filters.fields.length && !h.gaps.some((g) => filters.fields.includes(g.field))) return false
  return true
}

/** "WEB-9" before "WEB-10"; projects alphabetically. */
export function compareKeys(a: string, b: string): number {
  const [pa, na] = a.split("-")
  const [pb, nb] = b.split("-")
  return pa.localeCompare(pb) || Number(na) - Number(nb) || a.localeCompare(b)
}

/** Severity, then sprint (active first, no sprint last), then key. */
export function sortTickets(rows: TicketHealth[], dataset: Pick<JiraDataset, "sprintById">): TicketHealth[] {
  const sprintRank = (h: TicketHealth) => {
    const s = currentSprint(h.issue, dataset)
    return s ? SPRINT_RANK[s.state] : 3
  }
  return [...rows].sort(
    (a, b) =>
      severityRank(a.severity ?? "info") - severityRank(b.severity ?? "info") ||
      sprintRank(a) - sprintRank(b) ||
      compareKeys(a.issue.key, b.issue.key),
  )
}

export type TicketView = {
  /** Every ticket in the chosen slice of work (team, sprint, assignee, type, search), healthy or not. */
  scope: TicketHealth[]
  /** The tickets to fix, sorted. */
  rows: TicketHealth[]
}

export function applyFilters(health: TicketHealth[], filters: Filters, dataset: Pick<JiraDataset, "teams" | "sprintById">): TicketView {
  const scope = health.filter((h) => inScope(h.issue, filters, dataset))
  const rows = sortTickets(
    scope.filter((h) => matchesGapFilters(h, filters)),
    dataset,
  )
  return { scope, rows }
}

export type Summary = {
  /** Tickets listed. */
  needing: number
  /** Tickets in the chosen slice of work. */
  total: number
  bySeverity: Record<Severity, number>
  /** The field missing from the most listed tickets (rule order breaks ties), or null with nothing listed. */
  topField: { field: FieldId; label: string; count: number } | null
}

export function summarise(view: TicketView): Summary {
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 }
  const fieldCounts = new Map<FieldId, number>()
  for (const h of view.rows) {
    bySeverity[h.severity!]++
    for (const g of h.gaps) fieldCounts.set(g.field, (fieldCounts.get(g.field) ?? 0) + 1)
  }
  let topField: Summary["topField"] = null
  for (const rule of DEFAULT_REQUIRED_FIELDS) {
    const count = fieldCounts.get(rule.field) ?? 0
    if (count > 0 && (!topField || count > topField.count)) {
      topField = { field: rule.field, label: view.rows.flatMap((h) => h.gaps).find((g) => g.field === rule.field)!.label, count }
    }
  }
  return { needing: view.rows.length, total: view.scope.length, bySeverity, topField }
}

export type GroupBy = "none" | "assignee" | "field"

export type TicketGroup = {
  key: string
  label: string
  rows: TicketHealth[]
  /** The group is itself a gap: unassigned work, or a missing field. */
  severity?: Severity
}

/**
 * Groups keep the list's order inside them.
 * - assignee: "who do I need to chase". Unassigned first, then most tickets first.
 * - field: a ticket with several gaps is listed under each; worst field first.
 */
export function groupTickets(rows: TicketHealth[], by: GroupBy, dataset: Pick<JiraDataset, "personById">): TicketGroup[] {
  if (by === "none") return [{ key: "all", label: "All tickets", rows }]

  const groups = new Map<string, TicketGroup>()
  const add = (key: string, make: () => Omit<TicketGroup, "rows">, h: TicketHealth) => {
    const g = groups.get(key) ?? { ...make(), rows: [] }
    g.rows.push(h)
    groups.set(key, g)
  }

  if (by === "assignee") {
    for (const h of rows) {
      const id = h.issue.assigneeId
      add(
        id ?? UNASSIGNED,
        () =>
          id
            ? { key: id, label: dataset.personById.get(id)?.displayName ?? `Unknown (${id})` }
            : { key: UNASSIGNED, label: "Unassigned" },
        h,
      )
    }
    return [...groups.values()].sort(
      (a, b) =>
        Number(b.key === UNASSIGNED) - Number(a.key === UNASSIGNED) ||
        b.rows.length - a.rows.length ||
        a.label.localeCompare(b.label),
    )
  }

  for (const h of rows) {
    for (const g of h.gaps) add(g.field, () => ({ key: g.field, label: g.label, severity: g.severity }), h)
  }
  return [...groups.values()].sort(
    (a, b) => severityRank(a.severity!) - severityRank(b.severity!) || b.rows.length - a.rows.length,
  )
}
