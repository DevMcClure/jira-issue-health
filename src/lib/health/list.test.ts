import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { jiraIssueUrl, parseExportText } from "../jira/adapter"
import type { Issue, JiraDataset, Sprint } from "../jira/types"
import { checkDataset, checkIssue } from "./checks"
import {
  DEFAULT_FILTERS,
  UNASSIGNED,
  applyFilters,
  compareKeys,
  currentSprint,
  groupTickets,
  inScope,
  isDefaultFilters,
  summarise,
  teamOf,
  type Filters,
} from "./list"
import { makeIssue, todo } from "./test-issue"

const sprint = (id: number, state: Sprint["state"], teamId: string, startDate: string): Sprint => ({
  id,
  name: `S${id}`,
  teamId,
  state,
  startDate,
  endDate: null,
  completeDate: null,
})

/** Two teams; WEB has closed 1, active 2, future 3; MOB has active 12. */
function world(issues: Issue[]) {
  const sprints = [
    sprint(1, "closed", "TEAM-WEB", "2026-10-12T09:00:00Z"),
    sprint(2, "active", "TEAM-WEB", "2026-10-26T09:00:00Z"),
    sprint(3, "future", "TEAM-WEB", "2026-11-09T09:00:00Z"),
    sprint(12, "active", "TEAM-MOB", "2026-10-26T09:00:00Z"),
  ]
  const dataset = {
    teams: [
      { id: "TEAM-WEB", name: "Web", projectKey: "WEB", memberIds: [] },
      { id: "TEAM-MOB", name: "Mobile", projectKey: "MOB", memberIds: [] },
    ],
    sprintById: new Map(sprints.map((s) => [s.id, s])),
    personById: new Map([
      ["u-1", { id: "u-1", displayName: "Pat Doe" }],
      ["u-2", { id: "u-2", displayName: "Sam Roe" }],
    ]),
  }
  return { dataset, health: issues.map((i) => checkIssue(i)) }
}

const filters = (f: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...f })
const keys = (rows: { issue: Issue }[]) => rows.map((r) => r.issue.key)

describe("teamOf", () => {
  const { dataset } = world([])
  it("uses the ticket's team, then its sprint's, then its project key", () => {
    expect(teamOf(makeIssue({ teamId: "TEAM-MOB" }), dataset)).toBe("TEAM-MOB")
    expect(teamOf(makeIssue({ teamId: null, sprintIds: [12] }), dataset)).toBe("TEAM-MOB")
    expect(teamOf(makeIssue({ key: "MOB-7", teamId: null, sprintIds: [] }), dataset)).toBe("TEAM-MOB")
    expect(teamOf(makeIssue({ key: "ZZZ-1", teamId: null, sprintIds: [] }), dataset)).toBeNull()
  })
})

describe("currentSprint", () => {
  const { dataset } = world([])
  it("prefers active, then future, then the latest closed sprint", () => {
    expect(currentSprint(makeIssue({ sprintIds: [1, 2, 3] }), dataset)?.id).toBe(2)
    expect(currentSprint(makeIssue({ sprintIds: [1, 3] }), dataset)?.id).toBe(3)
    expect(currentSprint(makeIssue({ sprintIds: [1] }), dataset)?.id).toBe(1)
    expect(currentSprint(makeIssue({ sprintIds: [] }), dataset)).toBeNull()
  })
})

describe("inScope", () => {
  const { dataset } = world([])
  it("defaults to active sprints plus in-progress work outside any sprint", () => {
    expect(inScope(makeIssue({ sprintIds: [2] }), DEFAULT_FILTERS, dataset)).toBe(true)
    expect(inScope(makeIssue({ sprintIds: [1, 2] }), DEFAULT_FILTERS, dataset)).toBe(true)
    expect(inScope(makeIssue({ sprintIds: [] }), DEFAULT_FILTERS, dataset)).toBe(true)
    expect(inScope(todo({ sprintIds: [] }), DEFAULT_FILTERS, dataset)).toBe(false)
    expect(inScope(makeIssue({ sprintIds: [1] }), DEFAULT_FILTERS, dataset)).toBe(false)
    expect(inScope(makeIssue({ sprintIds: [3] }), DEFAULT_FILTERS, dataset)).toBe(false)
  })

  it("filters by one sprint, the backlog, or nothing", () => {
    expect(inScope(makeIssue({ sprintIds: [3] }), filters({ sprint: 3 }), dataset)).toBe(true)
    expect(inScope(makeIssue({ sprintIds: [2] }), filters({ sprint: 3 }), dataset)).toBe(false)
    expect(inScope(todo({ sprintIds: [] }), filters({ sprint: "backlog" }), dataset)).toBe(true)
    expect(inScope(makeIssue({ sprintIds: [2] }), filters({ sprint: "backlog" }), dataset)).toBe(false)
    expect(inScope(makeIssue({ sprintIds: [1] }), filters({ sprint: "all" }), dataset)).toBe(true)
  })

  it("filters by team, finding a ticket that lost its team", () => {
    const f = filters({ teamIds: ["TEAM-WEB"] })
    expect(inScope(makeIssue({ teamId: null, sprintIds: [2] }), f, dataset)).toBe(true)
    expect(inScope(makeIssue({ teamId: "TEAM-MOB", sprintIds: [12] }), f, dataset)).toBe(false)
  })

  it("filters by assignee, including unassigned", () => {
    expect(inScope(makeIssue({ assigneeId: null, sprintIds: [2] }), filters({ assigneeIds: [UNASSIGNED] }), dataset)).toBe(true)
    expect(inScope(makeIssue({ assigneeId: "u-1", sprintIds: [2] }), filters({ assigneeIds: [UNASSIGNED] }), dataset)).toBe(false)
    expect(inScope(makeIssue({ assigneeId: "u-1", sprintIds: [2] }), filters({ assigneeIds: ["u-1"] }), dataset)).toBe(true)
  })

  it("filters by type and searches key or summary", () => {
    const issue = makeIssue({ key: "WEB-42", summary: "Search: add filters", sprintIds: [2] })
    expect(inScope(issue, filters({ types: ["flow-defect"] }), dataset)).toBe(false)
    expect(inScope(issue, filters({ search: "web-4" }), dataset)).toBe(true)
    expect(inScope(issue, filters({ search: "  ADD FILTERS " }), dataset)).toBe(true)
    expect(inScope(issue, filters({ search: "billing" }), dataset)).toBe(false)
  })
})

describe("applyFilters", () => {
  const { dataset, health } = world([
    makeIssue({ key: "WEB-10", sprintIds: [2], priority: null }), // info
    makeIssue({ key: "WEB-9", sprintIds: [2], epicKey: null }), // warning
    makeIssue({ key: "WEB-3", sprintIds: [], assigneeId: null }), // critical + warning (no sprint), outside any sprint
    makeIssue({ key: "WEB-2", sprintIds: [2], storyPoints: null }), // critical, active
    makeIssue({ key: "WEB-1", sprintIds: [2] }), // healthy
    makeIssue({ key: "MOB-1", teamId: "TEAM-MOB", sprintIds: [12], storyPoints: null }), // critical
  ])

  it("lists tickets with gaps: severity, then active sprint before none, then key", () => {
    const { scope, rows } = applyFilters(health, DEFAULT_FILTERS, dataset)
    expect(scope).toHaveLength(6)
    expect(keys(rows)).toEqual(["MOB-1", "WEB-2", "WEB-3", "WEB-9", "WEB-10"])
  })

  it("filters by worst severity and by missing field", () => {
    expect(keys(applyFilters(health, filters({ severities: ["warning"] }), dataset).rows)).toEqual(["WEB-9"])
    expect(keys(applyFilters(health, filters({ fields: ["sprintIds"] }), dataset).rows)).toEqual(["WEB-3"])
  })

  it("keeps the scope when only the gap filters narrow the list", () => {
    const view = applyFilters(health, filters({ severities: ["info"] }), dataset)
    expect(view.scope).toHaveLength(6)
    expect(view.rows).toHaveLength(1)
  })
})

describe("summarise", () => {
  it("counts listed tickets against the scope, by severity, with the commonest gap", () => {
    const { dataset, health } = world([
      makeIssue({ key: "WEB-1", sprintIds: [2], storyPoints: null, priority: null }),
      makeIssue({ key: "WEB-2", sprintIds: [2], priority: null }),
      makeIssue({ key: "WEB-3", sprintIds: [2], epicKey: null }),
      makeIssue({ key: "WEB-4", sprintIds: [2] }),
    ])
    expect(summarise(applyFilters(health, DEFAULT_FILTERS, dataset))).toEqual({
      needing: 3,
      total: 4,
      bySeverity: { critical: 1, warning: 1, info: 1 },
      topField: { field: "priority", label: "Priority", count: 2 },
    })
  })

  it("has no commonest gap when nothing is listed", () => {
    expect(summarise({ scope: [], rows: [] }).topField).toBeNull()
  })
})

describe("groupTickets", () => {
  const { dataset, health } = world([
    makeIssue({ key: "WEB-1", assigneeId: "u-1", storyPoints: null, epicKey: null }),
    makeIssue({ key: "WEB-2", assigneeId: null }),
    makeIssue({ key: "WEB-3", assigneeId: "u-2", priority: null }),
    makeIssue({ key: "WEB-4", assigneeId: "u-2", storyPoints: null }),
  ])
  const rows = applyFilters(health, filters({ sprint: "all" }), dataset).rows

  it("puts everything in one group by default", () => {
    expect(groupTickets(rows, "none", dataset)).toHaveLength(1)
  })

  it("groups by assignee: unassigned first, then the most tickets", () => {
    const groups = groupTickets(rows, "assignee", dataset)
    expect(groups.map((g) => [g.label, keys(g.rows)])).toEqual([
      ["Unassigned", ["WEB-2"]],
      ["Sam Roe", ["WEB-4", "WEB-3"]],
      ["Pat Doe", ["WEB-1"]],
    ])
  })

  it("groups by missing field, listing a ticket under each of its gaps", () => {
    const groups = groupTickets(rows, "field", dataset)
    expect(groups.map((g) => [g.label, g.severity, keys(g.rows)])).toEqual([
      ["Story points", "critical", ["WEB-1", "WEB-4"]],
      ["Assignee", "critical", ["WEB-2"]],
      ["Epic", "warning", ["WEB-1"]],
      ["Priority", "info", ["WEB-3"]],
    ])
  })
})

describe("helpers", () => {
  it("sorts keys naturally", () => {
    expect(["WEB-10", "MOB-2", "WEB-9"].sort(compareKeys)).toEqual(["MOB-2", "WEB-9", "WEB-10"])
  })

  it("knows the default filters", () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true)
    expect(isDefaultFilters(filters({ search: "x" }))).toBe(false)
  })
})

describe("on the mock export", () => {
  const dataset: JiraDataset = parseExportText(sample)
  const health = checkDataset(dataset)

  it("shows the active sprints' gaps plus in-progress work outside any sprint by default", () => {
    const { rows } = applyFilters(health, DEFAULT_FILTERS, dataset)
    // 26 in active sprints + 2 started without a sprint.
    expect(rows).toHaveLength(28)
    expect(rows.filter((h) => h.issue.sprintIds.length === 0).every((h) => h.gaps.some((g) => g.field === "sprintIds"))).toBe(true)
  })

  it("finds Web's ticket that lost its team under Web", () => {
    const { rows } = applyFilters(health, filters({ teamIds: ["TEAM-WEB"], fields: ["teamId"] }), dataset)
    expect(rows).toHaveLength(1)
  })

  it("updates the summary with every filter", () => {
    const all = summarise(applyFilters(health, DEFAULT_FILTERS, dataset))
    const web = summarise(applyFilters(health, filters({ teamIds: ["TEAM-WEB"] }), dataset))
    const critical = summarise(applyFilters(health, filters({ severities: ["critical"] }), dataset))
    expect(web.needing).toBeLessThan(all.needing)
    expect(web.total).toBeLessThan(all.total)
    expect(critical.bySeverity.warning).toBe(0)
    expect(critical.needing).toBe(all.bySeverity.critical)
  })

  it("links every listed ticket to Jira", () => {
    for (const h of applyFilters(health, filters({ sprint: "all" }), dataset).rows) {
      expect(jiraIssueUrl(dataset.meta, h.issue.key)).toBe(`https://jira.example.com/browse/${h.issue.key}`)
    }
  })

  it("orders the whole list worst first", () => {
    const view = applyFilters(health, filters({ sprint: "all" }), dataset)
    const ranks = view.rows.map((h) => ["critical", "warning", "info"].indexOf(h.severity!))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})
