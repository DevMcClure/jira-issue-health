import { describe, expect, it } from "vitest"
import type { Issue } from "../jira/types"
import { checkIssue } from "./checks"
import { DASHBOARD_VIEW_IDS } from "./impact"
import { DEFAULT_REQUIRED_FIELDS, type FieldId } from "./requiredFields"
import { done, makeIssue, todo } from "./test-issue"

/** How one rule judges a ticket: the field's state, or absent when the rule doesn't cover its type. */
const stateOf = (field: FieldId, issue: Issue) => checkIssue(issue).fields.find((f) => f.field === field)?.state

type Case = {
  field: FieldId
  present: Issue[]
  missing: Issue[]
  /** Required for the type, but its condition doesn't hold. */
  notRequired: Issue[]
  /** Types the rule doesn't cover, even with the field missing. */
  wrongType: Issue[]
}

const CASES: Case[] = [
  {
    field: "storyPoints",
    present: [makeIssue(), makeIssue({ type: "Bug" }), makeIssue({ storyPoints: 0 })],
    missing: [makeIssue({ storyPoints: null }), makeIssue({ type: "Bug", storyPoints: null }), todo({ storyPoints: null })],
    notRequired: [makeIssue({ storyPoints: null, sprintIds: [] })],
    wrongType: [makeIssue({ type: "Task", storyPoints: null }), makeIssue({ type: "Spike", storyPoints: null })],
  },
  {
    field: "assigneeId",
    present: [makeIssue(), done()],
    missing: [makeIssue({ assigneeId: null }), done({ assigneeId: null }), makeIssue({ type: "Sub-task", assigneeId: null })],
    notRequired: [todo({ assigneeId: null })],
    wrongType: [makeIssue({ type: "Epic", assigneeId: null })],
  },
  {
    field: "teamId",
    present: [makeIssue(), makeIssue({ type: "Epic" })],
    missing: [makeIssue({ teamId: null }), todo({ teamId: null }), done({ type: "Epic", teamId: null })],
    notRequired: [],
    wrongType: [makeIssue({ type: "Sub-task", teamId: null })],
  },
  {
    field: "resolved",
    present: [done(), done({ type: "Epic" })],
    missing: [done({ resolved: null }), done({ type: "Spike", resolved: null })],
    notRequired: [makeIssue({ resolved: null }), todo({ resolved: null })],
    wrongType: [done({ type: "Sub-task", resolved: null })],
  },
  {
    field: "sprintIds",
    present: [makeIssue(), makeIssue({ type: "Task" })],
    missing: [makeIssue({ sprintIds: [] }), makeIssue({ type: "Bug", sprintIds: [] })],
    notRequired: [todo({ sprintIds: [] }), done({ sprintIds: [] })],
    wrongType: [makeIssue({ type: "Spike", sprintIds: [] }), makeIssue({ type: "Epic", sprintIds: [] })],
  },
  {
    field: "epicKey",
    present: [makeIssue(), makeIssue({ type: "Task" })],
    missing: [makeIssue({ epicKey: null }), todo({ type: "Bug", epicKey: null }), done({ type: "Task", epicKey: null })],
    notRequired: [],
    wrongType: [makeIssue({ type: "Spike", epicKey: null }), makeIssue({ type: "Epic", epicKey: null })],
  },
  {
    field: "priority",
    present: [makeIssue(), makeIssue({ type: "Spike" })],
    missing: [makeIssue({ priority: null }), todo({ type: "Task", priority: null })],
    notRequired: [],
    wrongType: [makeIssue({ type: "Epic", priority: null }), makeIssue({ type: "Sub-task", priority: null })],
  },
  {
    field: "labels",
    present: [
      makeIssue({ type: "Task", labels: ["tech-debt"] }),
      makeIssue({ type: "Spike", labels: ["search", "risk"] }),
      makeIssue({ type: "Task", labels: ["Tech-Debt"] }),
    ],
    missing: [makeIssue({ type: "Task", labels: [] }), makeIssue({ type: "Spike", labels: ["search"] })],
    notRequired: [],
    wrongType: [makeIssue({ type: "Story", labels: [] }), makeIssue({ type: "Bug", labels: [] })],
  },
]

describe("default required fields", () => {
  it("has one test case per rule", () => {
    expect(CASES.map((c) => c.field).sort()).toEqual(DEFAULT_REQUIRED_FIELDS.map((r) => r.field).sort())
  })

  describe.each(CASES)("$field", ({ field, present, missing, notRequired, wrongType }) => {
    it.each(present)("is present: %#", (issue) => expect(stateOf(field, issue)).toBe("present"))
    it.each(missing)("is missing: %#", (issue) => expect(stateOf(field, issue)).toBe("missing"))
    if (notRequired.length) {
      it.each(notRequired)("isn't required when the condition isn't met: %#", (issue) =>
        expect(stateOf(field, issue)).toBe("not-required"),
      )
    } else {
      it("is required whatever the status", () => {
        expect(DEFAULT_REQUIRED_FIELDS.find((r) => r.field === field)?.when).toBeUndefined()
      })
    }
    it.each(wrongType)("doesn't apply to other types: %#", (issue) => expect(stateOf(field, issue)).toBeUndefined())
  })

  it("matches the brief's severities", () => {
    const severity = Object.fromEntries(DEFAULT_REQUIRED_FIELDS.map((r) => [r.field, r.severity]))
    expect(severity).toEqual({
      storyPoints: "critical",
      assigneeId: "critical",
      teamId: "critical",
      resolved: "critical",
      sprintIds: "warning",
      epicKey: "warning",
      priority: "info",
      labels: "info",
    })
  })

  it("only names known dashboard views, and every view depends on some field", () => {
    const used = new Set(DEFAULT_REQUIRED_FIELDS.flatMap((r) => r.affects))
    for (const id of used) expect(DASHBOARD_VIEW_IDS).toContain(id)
    expect([...used].sort()).toEqual([...DASHBOARD_VIEW_IDS].sort())
  })

  it("explains every rule in one sentence", () => {
    for (const r of DEFAULT_REQUIRED_FIELDS) expect(r.why).toMatch(/^[A-Z][^.]*\.$/)
  })
})
