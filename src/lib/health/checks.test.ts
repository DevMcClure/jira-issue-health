import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { parseExportText } from "../jira/adapter"
import type { Issue } from "../jira/types"
import { checkDataset, checkIssue, needsFix, type TicketHealth } from "./checks"
import { DEFAULT_REQUIRED_FIELDS, type FieldId } from "./requiredFields"
import { done, makeIssue } from "./test-issue"

describe("checkIssue", () => {
  it("finds nothing wrong with a complete ticket", () => {
    const health = checkIssue(makeIssue())
    expect(health.gaps).toEqual([])
    expect(health.severity).toBeNull()
    expect(health.affects).toEqual([])
  })

  it("lists every rule for the type as present, missing or not required", () => {
    const health = checkIssue(makeIssue({ storyPoints: null }))
    expect(health.fields.map((f) => [f.field, f.state])).toEqual([
      ["storyPoints", "missing"],
      ["assigneeId", "present"],
      ["teamId", "present"],
      ["resolved", "not-required"],
      ["sprintIds", "present"],
      ["epicKey", "present"],
      ["priority", "present"],
    ])
  })

  it("orders gaps worst first and reports the worst severity", () => {
    const health = checkIssue(makeIssue({ type: "flow-quality", priority: null, epicKey: null, assigneeId: null, sprintIds: [] }))
    expect(health.gaps.map((g) => [g.field, g.severity])).toEqual([
      ["assigneeId", "critical"],
      ["sprintIds", "warning"],
      ["epicKey", "warning"],
      ["priority", "info"],
    ])
    expect(health.severity).toBe("critical")
  })

  it("collects the affected views once each", () => {
    const health = checkIssue(makeIssue({ storyPoints: null, sprintIds: [], statusCategory: "inProgress", type: "flow-defect" }))
    // Out of a sprint, points aren't required, but the sprint is.
    expect(health.gaps.map((g) => g.field)).toEqual(["sprintIds"])
    expect(health.affects).toEqual(["commitment", "sprint-burndown", "scope-change"])

    const both = checkIssue(done({ storyPoints: null, resolved: null }))
    expect(both.affects).toEqual(["velocity", "sprint-burndown", "commitment", "predictability", "cycle-time", "throughput"])
  })

  it("only checks a Sub-task's assignee", () => {
    const sub = makeIssue({ type: "Sub-task", assigneeId: null, teamId: null, priority: null, epicKey: null, storyPoints: null })
    expect(checkIssue(sub).gaps.map((g) => g.field)).toEqual(["assigneeId"])
  })

  it("ignores issue types the rules don't know", () => {
    const health = checkIssue(makeIssue({ type: "Improvement", teamId: null, priority: null }))
    expect(health.fields).toEqual([])
    expect(health.gaps).toEqual([])
  })

  it("follows custom rules", () => {
    const rules = DEFAULT_REQUIRED_FIELDS.map((r) =>
      r.field === "storyPoints" ? { ...r, requiredFor: ["flow-value" as const], severity: "info" as const } : r,
    )
    expect(checkIssue(makeIssue({ type: "flow-defect", storyPoints: null }), rules).gaps).toEqual([])
    expect(checkIssue(makeIssue({ storyPoints: null }), rules).severity).toBe("info")
  })
})

describe("checkDataset on the mock export", () => {
  const dataset = parseExportText(sample)
  const health = checkDataset(dataset)
  const toFix = needsFix(health)

  const activeSprintIds = new Set(dataset.sprints.filter((s) => s.state === "active").map((s) => s.id))
  const inActiveSprint = (i: Issue) => i.sprintIds.some((id) => activeSprintIds.has(id))
  // One ticket has lost its team, so go by project key.
  const project = (h: TicketHealth) => h.issue.key.split("-")[0]
  const countBy = (hs: TicketHealth[], key: (h: TicketHealth) => string) =>
    hs.reduce<Record<string, number>>((acc, h) => ({ ...acc, [key(h)]: (acc[key(h)] ?? 0) + 1 }), {})

  it("checks every issue", () => {
    expect(health).toHaveLength(dataset.issues.length)
  })

  it("needs 20–30 updates in the active sprints: Platform nearly clean, Mobile mixed, Web poor", () => {
    const active = toFix.filter((h) => inActiveSprint(h.issue))
    expect(active.length).toBeGreaterThanOrEqual(20)
    expect(active.length).toBeLessThanOrEqual(30)
    expect(countBy(active, project)).toEqual({ PLAT: 2, MOB: 8, WEB: 16 })
  })

  it("has a few tickets with 2–3 gaps", () => {
    const multi = toFix.filter((h) => h.gaps.length > 1)
    expect(multi.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...multi.map((h) => h.gaps.length))).toBe(3)
  })

  it("misses every required field somewhere", () => {
    const missing = new Set(toFix.flatMap((h) => h.gaps.map((g) => g.field)))
    expect([...missing].sort()).toEqual(DEFAULT_REQUIRED_FIELDS.map((r) => r.field as FieldId).sort())
  })

  it("has every severity in the active sprints", () => {
    const active = toFix.filter((h) => inActiveSprint(h.issue))
    expect(new Set(active.map((h) => h.severity))).toEqual(new Set(["critical", "warning", "info"]))
  })

  it("has gaps outside the active sprints too", () => {
    expect(toFix.filter((h) => !inActiveSprint(h.issue)).length).toBeGreaterThan(5)
  })
})
