import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { parseExportText } from "../jira/adapter"
import type { Issue } from "../jira/types"
import { checkDataset } from "./checks"
import {
  formatSuggestion,
  jaccard,
  similarTickets,
  suggest,
  suggestionsFor,
  summaryWords,
} from "./hints"
import { makeIssue } from "./test-issue"

let n = 100
/** Another Web flow-value ticket with a fresh key, unrelated by epic, label and summary unless overridden. */
const other = (overrides: Partial<Issue> = {}) =>
  makeIssue({ key: `WEB-${n++}`, epicKey: "WEB-OTHER", labels: ["misc"], summary: `Unrelated work item ${n}`, ...overrides })

function ctx(issues: Issue[]) {
  const teams = [
    { id: "TEAM-WEB", name: "Web", projectKey: "WEB", memberIds: [] },
    { id: "TEAM-MOB", name: "Mobile", projectKey: "MOB", memberIds: [] },
  ]
  return {
    issues,
    byKey: new Map(issues.map((i) => [i.key, i])),
    teams,
    teamById: new Map(teams.map((t) => [t.id, t])),
    sprintById: new Map(),
    personById: new Map([
      ["u-1", { id: "u-1", displayName: "Pat Doe" }],
      ["u-2", { id: "u-2", displayName: "Sam Roe" }],
      ["u-3", { id: "u-3", displayName: "Kim Lee" }],
      ["u-4", { id: "u-4", displayName: "Ali Khan" }],
    ]),
  }
}

/** The ticket missing story points, in epic WEB-0 with label "search". */
const target = makeIssue({ key: "WEB-1", storyPoints: null, epicKey: "WEB-0", labels: ["search"], summary: "Search: add filters to the list view" })
const hasPoints = (i: Issue) => i.storyPoints !== null

describe("summary similarity", () => {
  it("lower-cases, splits on punctuation and drops stop words", () => {
    expect([...summaryWords("Search: add filters to the List-view")]).toEqual(["search", "add", "filters", "list", "view"])
  })

  it("scores shared words over all words", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5)
    expect(jaccard(new Set(), new Set())).toBe(0)
  })
})

describe("similarTickets", () => {
  it("tier 1: same epic, same type", () => {
    const epicMates = [other({ epicKey: "WEB-0" }), other({ epicKey: "WEB-0" }), other({ epicKey: "WEB-0" })]
    const found = similarTickets(target, ctx([target, ...epicMates, other(), other(), other()]), hasPoints)
    expect(found?.tier).toBe(1)
    expect(found?.matches).toEqual(epicMates)
    expect(found?.source).toBe("flow-value tickets in WEB-0")
  })

  it("tier 1 ignores other types, the ticket itself and tickets without the field", () => {
    const issues = [
      target,
      other({ epicKey: "WEB-0", type: "flow-defect" }),
      other({ epicKey: "WEB-0", storyPoints: null }),
      other({ epicKey: "WEB-0" }),
      other({ epicKey: "WEB-0" }),
    ]
    expect(similarTickets(target, ctx(issues), hasPoints)).toBeNull()
  })

  it("tier 2: same team and type, sharing a label", () => {
    const labelled = [other({ labels: ["search"] }), other({ labels: ["search", "perf"] }), other({ labels: ["search"] })]
    const issues = [target, other({ epicKey: "WEB-0" }), ...labelled, other(), other({ key: "MOB-1", teamId: "TEAM-MOB", labels: ["search"] })]
    const found = similarTickets(target, ctx(issues), hasPoints)
    expect(found?.tier).toBe(2)
    expect(found?.matches).toEqual(labelled)
    expect(found?.source).toBe("flow-value tickets in Web labelled search")
  })

  it("tier 3: same team and type, similar summary", () => {
    const alike = [
      other({ summary: "Search: add filters to the grid view" }),
      other({ summary: "Add search filters to list view" }),
      other({ summary: "Search list view: add filters" }),
    ]
    const found = similarTickets(target, ctx([target, ...alike, other(), other()]), hasPoints)
    expect(found?.tier).toBe(3)
    expect(found?.matches).toEqual(alike)
  })

  it("tier 4: any ticket of the same team and type", () => {
    const team = [other(), other(), other()]
    const found = similarTickets(target, ctx([target, ...team, other({ key: "MOB-2", teamId: "TEAM-MOB" })]), hasPoints)
    expect(found?.tier).toBe(4)
    expect(found?.matches).toEqual(team)
    expect(found?.source).toBe("flow-value tickets in Web")
  })

  it("stops at the first tier with at least 3 matches", () => {
    // Two in the epic aren't enough; tier 4 has five.
    const issues = [target, other({ epicKey: "WEB-0" }), other({ epicKey: "WEB-0" }), other(), other(), other()]
    expect(similarTickets(target, ctx(issues), hasPoints)?.tier).toBe(4)
  })

  it("finds nothing with fewer than 3 matches in every tier", () => {
    expect(similarTickets(target, ctx([target, other({ epicKey: "WEB-0", labels: ["search"] }), other()]), hasPoints)).toBeNull()
  })

  it("places a ticket that lost its team by project key", () => {
    const orphan = makeIssue({ key: "WEB-2", teamId: null, epicKey: null, labels: [], storyPoints: null })
    expect(similarTickets(orphan, ctx([orphan, other(), other(), other()]), hasPoints)?.tier).toBe(4)
  })
})

describe("suggest", () => {
  it("story points: the median and range of similar tickets", () => {
    const issues = [target, ...[2, 5, 3, 3].map((p) => other({ epicKey: "WEB-0", storyPoints: p }))]
    const s = suggest(target, "storyPoints", ctx(issues))
    expect(s).toMatchObject({ field: "storyPoints", value: 3, tier: 1 })
    expect(s?.evidence).toBe("4 similar flow-value tickets in WEB-0 have 2–5 pts, median 3.")
  })

  it("story points: an even count takes the lower middle, so it's a value someone used", () => {
    const issues = [target, ...[1, 2, 5, 8].map((p) => other({ epicKey: "WEB-0", storyPoints: p }))]
    expect(suggest(target, "storyPoints", ctx(issues))?.value).toBe(2)
  })

  it("story points: says so when they all agree", () => {
    const issues = [target, ...[3, 3, 3].map((p) => other({ epicKey: "WEB-0", storyPoints: p }))]
    expect(suggest(target, "storyPoints", ctx(issues))?.evidence).toBe("3 similar flow-value tickets in WEB-0 have all 3 pts.")
  })

  it("epic: the most common epic among similar tickets", () => {
    const noEpic = makeIssue({ key: "WEB-1", epicKey: null, labels: ["search"] })
    const epic = makeIssue({ key: "WEB-700", type: "Epic", summary: "Global search", epicKey: null })
    const issues = [noEpic, epic, other({ labels: ["search"], epicKey: "WEB-700" }), other({ labels: ["search"], epicKey: "WEB-700" }), other({ labels: ["search"], epicKey: "WEB-9" })]
    const s = suggest(noEpic, "epicKey", ctx(issues))
    expect(s).toMatchObject({ value: "WEB-700", tier: 2 })
    expect(s?.evidence).toBe("2 of 3 similar flow-value tickets in Web labelled search are in WEB-700 (Global search).")
    expect(s?.basedOn).toHaveLength(2)
  })

  it("priority: the most common, ties broken alphabetically", () => {
    const issue = makeIssue({ key: "WEB-1", priority: null })
    const issues = [issue, ...["High", "Medium", "High", "Medium"].map((p) => other({ epicKey: "WEB-0", priority: p }))]
    const s = suggest(issue, "priority", ctx(issues))
    expect(s?.value).toBe("High")
    expect(s?.evidence).toBe("2 of 4 similar flow-value tickets in WEB-0 are High priority.")
  })

  it("labels: adds the flow label similar Spikes use, keeping the ticket's own", () => {
    const task = makeIssue({ key: "WEB-1", type: "Spike", labels: ["search"], epicKey: "WEB-0" })
    const issues = [
      task,
      other({ type: "Spike", epicKey: "WEB-0", labels: ["search", "tech-debt"] }),
      other({ type: "Spike", epicKey: "WEB-0", labels: ["Tech-Debt"] }),
      other({ type: "Spike", epicKey: "WEB-0", labels: ["risk"] }),
      other({ type: "Spike", epicKey: "WEB-0", labels: ["search"] }),
    ]
    const s = suggest(task, "labels", ctx(issues))
    expect(s).toMatchObject({ value: ["search", "tech-debt"], added: "tech-debt", tier: 1 })
    expect(s?.evidence).toBe("2 of 3 similar Spikes in WEB-0 are labelled tech-debt.")
  })

  it("assignee: up to three people most active on the same epic", () => {
    const issue = makeIssue({ key: "WEB-1", assigneeId: null, epicKey: "WEB-0" })
    const people = ["u-2", "u-1", "u-2", "u-3", "u-4", "u-3", "u-2"]
    const issues = [issue, makeIssue({ key: "WEB-0", type: "Epic", summary: "Search", epicKey: null, assigneeId: null }), ...people.map((p) => other({ epicKey: "WEB-0", assigneeId: p, type: "flow-defect" }))]
    const s = suggest(issue, "assigneeId", ctx(issues))
    expect(s).toMatchObject({ value: "u-2", alternatives: ["u-3", "u-4"] })
    expect(s?.evidence).toBe("Most active on WEB-0 (Search): Sam Roe (3 tickets), Kim Lee (2 tickets), Ali Khan (1 ticket).")
  })

  it("assignee: nothing without an epic, or with fewer than 3 assigned tickets on it", () => {
    const noEpic = makeIssue({ key: "WEB-1", assigneeId: null, epicKey: null })
    expect(suggest(noEpic, "assigneeId", ctx([noEpic, other(), other(), other()]))).toBeNull()
    const issue = makeIssue({ key: "WEB-1", assigneeId: null, epicKey: "WEB-0" })
    const issues = [issue, other({ epicKey: "WEB-0" }), other({ epicKey: "WEB-0" }), other({ epicKey: "WEB-0", assigneeId: null })]
    expect(suggest(issue, "assigneeId", ctx(issues))).toBeNull()
  })

  it("has no rule for team, sprint or resolved date", () => {
    const issue = makeIssue({ key: "WEB-1", teamId: null, sprintIds: [], resolved: null })
    const c = ctx([issue, other(), other(), other()])
    expect(suggestionsFor(issue, ["teamId", "sprintIds", "resolved"], c)).toEqual({})
  })
})

describe("formatSuggestion", () => {
  const c = ctx([makeIssue({ key: "WEB-700", type: "Epic", summary: "Global search" })])
  it("reads naturally", () => {
    expect(formatSuggestion({ field: "storyPoints", value: 1, tier: 1, evidence: "", basedOn: [] }, c)).toBe("1 point")
    expect(formatSuggestion({ field: "storyPoints", value: 5, tier: 1, evidence: "", basedOn: [] }, c)).toBe("5 points")
    expect(formatSuggestion({ field: "epicKey", value: "WEB-700", tier: 2, evidence: "", basedOn: [] }, c)).toBe("WEB-700 · Global search")
    expect(formatSuggestion({ field: "labels", value: ["x", "risk"], added: "risk", tier: 4, evidence: "", basedOn: [] }, c)).toBe("Add risk")
    expect(formatSuggestion({ field: "assigneeId", value: "u-1", alternatives: ["u-2"], evidence: "", basedOn: [] }, c)).toBe(
      "Pat Doe (or Sam Roe)",
    )
  })
})

describe("on the mock export", () => {
  const dataset = parseExportText(sample)
  const gaps = checkDataset(dataset).flatMap((h) => h.gaps.map((g) => ({ issue: h.issue, field: g.field })))
  const coverage = (field: string) => {
    const these = gaps.filter((g) => g.field === field)
    const withSuggestion = these.filter((g) => suggest(g.issue, g.field, dataset) !== null)
    return { total: these.length, suggested: withSuggestion.length, without: these.filter((g) => !withSuggestion.includes(g)).map((g) => g.issue.key) }
  }

  it("suggests most story points, epics and priorities, but not for Platform's lone flow-defects", () => {
    const points = coverage("storyPoints")
    const epics = coverage("epicKey")
    const priorities = coverage("priority")
    expect(points.without).toEqual(["PLAT-1290"])
    expect(epics.without).toEqual(["PLAT-1292"])
    expect(priorities.without).toEqual(["PLAT-1290"])
    for (const c of [points, epics, priorities]) expect(c.suggested / c.total).toBeGreaterThan(0.75)
  })

  it("matches the brief's example wording for story points", () => {
    const issue = dataset.issues.find((i) => i.key === "WEB-880")!
    expect(suggest(issue, "storyPoints", dataset)?.evidence).toMatch(/^\d+ similar flow-value tickets in WEB-\d+ have \d–\d pts, median \d\.$/)
  })
})
