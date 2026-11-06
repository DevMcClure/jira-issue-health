import sample from "@/data/mock/trawler-export.json?raw"
import { describe, expect, it } from "vitest"
import { makeIssue } from "../health/test-issue"
import { updateConflicts } from "./conflicts"
import { issuePatch, labelChanges, toExportDoc } from "./contract"
import { mockJiraErrors } from "./mock-jira"
import { checkResolve, recordWrite } from "./resolve-check"
import { parseExport, parseExportText } from "../jira/adapter"

const dataset = parseExportText(sample)
const web877 = dataset.byKey.get("WEB-877")!

describe("API contract helpers", () => {
  it("round-trips the dataset through contract JSON unchanged", () => {
    const again = parseExport(JSON.parse(JSON.stringify(toExportDoc(dataset))))
    expect(again.issues).toEqual(dataset.issues)
    expect(again.sprints).toEqual(dataset.sprints)
  })

  it("turns an update into the change to the issue; Jira dates the resolution", () => {
    const issue = makeIssue({ sprintIds: [1], resolved: null })
    expect(issuePatch(issue, { sprintId: 2, resolution: "Done", storyPoints: 0 }, "2026-11-04T10:00:00Z")).toEqual({
      sprintIds: [1, 2],
      resolved: "2026-11-04T10:00:00Z",
      storyPoints: 0,
    })
  })

  it("works out label additions and removals", () => {
    expect(labelChanges(["a", "b"], ["b", "c"])).toEqual({ add: ["c"], remove: ["a"] })
  })
})

describe("before writing to Jira", () => {
  it("flags fields someone filled in since the dialog opened, saying what they are now", () => {
    const issue = { ...web877, storyPoints: 5, assigneeId: "u-07" }
    expect(updateConflicts(issue, { storyPoints: 3, assigneeId: "u-01", epicKey: "WEB-805" }, dataset)).toEqual({
      storyPoints: "Already set in Jira (5 points) since you opened this. Nothing was changed.",
      assigneeId: "Already set in Jira (Jamal Wright) since you opened this. Nothing was changed.",
    })
  })

  it("checks the request, the issue and conflicts in one place", () => {
    expect(checkResolve("WEB-877", { update: {} }, dataset)).toMatchObject({ ok: false, code: "invalid" })
    expect(checkResolve("NOPE-1", { update: { storyPoints: 1 } }, dataset)).toMatchObject({ ok: false, code: "not-found" })
    const ok = checkResolve("WEB-877", { update: { storyPoints: 3, assigneeId: "u-07" }, usedSuggestion: ["assigneeId", "epicKey"] }, dataset)
    expect(ok).toMatchObject({ ok: true, update: { storyPoints: 3, assigneeId: "u-07" } })
  })

  it("records only what Jira accepted", () => {
    const checked = checkResolve("WEB-877", { update: { storyPoints: 3, assigneeId: "u-07" }, usedSuggestion: ["assigneeId"] }, dataset)
    if (!checked.ok) throw new Error("expected ok")
    const { patch, fix } = recordWrite(checked, ["storyPoints"], { id: "me", displayName: "Me" }, "2026-11-04T10:00:00Z", "fix-1")
    expect(patch).toEqual({ storyPoints: 3 })
    expect(fix).toMatchObject({ update: { storyPoints: 3 }, usedSuggestion: [], via: "app" })
  })
})

describe("mock Jira", () => {
  it("refuses what a real Jira would, with Jira-style messages", () => {
    expect(mockJiraErrors(web877, { assigneeId: "nobody", epicKey: "WEB-877", sprintId: 107, priority: "Urgent!" }, dataset)).toEqual({
      assigneeId: "User 'nobody' does not exist.",
      epicKey: "'WEB-877' is not an epic.",
      sprintIds: "Issues can't be moved to a closed sprint.",
      priority: "Priority name 'Urgent!' is not valid.",
    })
  })

  it("accepts valid references", () => {
    expect(mockJiraErrors(web877, { assigneeId: "u-07", epicKey: "WEB-805", sprintId: 209, storyPoints: 3 }, dataset)).toEqual({})
  })
})
