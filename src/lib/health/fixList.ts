/** "Copy fix list": the current list as Markdown, grouped by assignee, for a channel or a stand-up. */
import { format } from "date-fns"
import { jiraIssueUrl } from "../jira/adapter"
import type { JiraDataset } from "../jira/types"
import type { TicketHealth } from "./checks"
import { DASHBOARD_VIEW_IDS, affectedViews } from "./impact"
import { UNASSIGNED, groupTickets, type Filters } from "./list"

/** "Alex Petrov" → "Alex P."; single names and "Unknown (…)" stay as they are. */
export function shortName(name: string): string {
  if (name.startsWith("Unknown (")) return name
  const parts = name.trim().split(/\s+/)
  return parts.length < 2 ? name : `${parts[0]} ${parts.at(-1)![0]}.`
}

const escape = (s: string) => s.replace(/([\\[\]*_`#<>])/g, "\\$1")

/** What the filter covers, for the heading: a sprint name, a team's active sprint, the backlog… */
export function scopeTitle(filters: Filters, dataset: Pick<JiraDataset, "sprints" | "sprintById" | "teamById">): string {
  const teamNames = filters.teamIds.map((id) => dataset.teamById.get(id)?.name ?? id)
  const withTeams = (s: string) => (teamNames.length ? `${teamNames.join(", ")} · ${s}` : s)
  const s = filters.sprint
  if (typeof s === "number") return dataset.sprintById.get(s)?.name ?? `Sprint ${s}`
  if (s === "active") {
    if (!teamNames.length) return "Active sprints"
    const names = dataset.sprints.filter((sp) => sp.state === "active" && sp.teamId && filters.teamIds.includes(sp.teamId)).map((sp) => sp.name)
    return names.length ? names.join(", ") : withTeams("Active sprints")
  }
  return withTeams(s === "backlog" ? "Backlog" : "All tickets")
}

type Input = {
  /** The tickets listed (with gaps), in list order. */
  rows: TicketHealth[]
  filters: Filters
  dataset: Pick<JiraDataset, "meta" | "sprints" | "sprintById" | "teamById" | "personById">
}

export function fixListMarkdown({ rows, filters, dataset }: Input): string {
  const toFix = rows.filter((h) => h.gaps.length > 0)
  const trawled = format(new Date(dataset.meta.generatedAt), "d MMM HH:mm")
  const critical = toFix.filter((h) => h.severity === "critical").length
  const lines = [
    `## ${escape(scopeTitle(filters, dataset))}: tickets to update (trawled ${trawled})`,
    `${toFix.length} ${toFix.length === 1 ? "ticket" : "tickets"} · ${critical} critical`,
  ]
  for (const group of groupTickets(toFix, "assignee", dataset)) {
    lines.push("", `### ${group.key === UNASSIGNED ? "Unassigned" : escape(shortName(group.label))}`)
    for (const h of group.rows) {
      const url = jiraIssueUrl(dataset.meta, h.issue.key)
      const key = url ? `[${h.issue.key}](${url})` : h.issue.key
      const views = DASHBOARD_VIEW_IDS.every((id) => h.affects.includes(id))
        ? "All team views"
        : affectedViews(h.affects)
            .map((v) => v.label)
            .join(", ")
      lines.push(`- ${key} ${h.gaps.map((g) => g.label).join(", ")} missing → ${views}`)
    }
  }
  return `${lines.join("\n")}\n`
}
