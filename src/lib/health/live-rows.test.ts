import { describe, expect, it } from "vitest"
import { checkIssue } from "./checks"
import { diffRows, withLeaving } from "./live-rows"
import { makeIssue } from "./test-issue"

const h = (key: string, overrides = {}) => checkIssue(makeIssue({ key, ...overrides }))
const missingPoints = (key: string) => h(key, { storyPoints: null })
const keys = (rows: { health: { issue: { key: string } } }[]) => rows.map((r) => r.health.issue.key)

describe("live list changes", () => {
  const prev = [missingPoints("A-1"), missingPoints("A-2"), missingPoints("A-3")]

  it("marks a ticket that left because it was fixed, and keeps it where it was", () => {
    const next = [prev[0], prev[2]]
    const now = new Map([["A-2", h("A-2")]])
    const diff = diffRows(prev, next, now)
    expect(diff.marks.get("A-2")).toBe("fixed")
    expect(keys(withLeaving(next, prev, diff))).toEqual(["A-1", "A-2", "A-3"])
  })

  it("tells a ticket that only left this view from a fixed one", () => {
    const next = [prev[1], prev[2]]
    const diff = diffRows(prev, next, new Map([["A-1", missingPoints("A-1")]]))
    expect(diff.marks.get("A-1")).toBe("moved")
    expect(keys(withLeaving(next, prev, diff))).toEqual(["A-1", "A-2", "A-3"])
  })

  it("marks new tickets and tickets whose gaps changed", () => {
    const next = [h("A-1", { storyPoints: null, assigneeId: null }), prev[1], prev[2], missingPoints("A-4")]
    const diff = diffRows(prev, next, new Map())
    expect(Object.fromEntries(diff.marks)).toEqual({ "A-1": "changed", "A-4": "new" })
    expect(withLeaving(next, prev, diff).map((r) => r.mark)).toEqual(["changed", undefined, undefined, "new"])
  })
})
