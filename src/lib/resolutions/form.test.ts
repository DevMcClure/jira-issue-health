import { describe, expect, it } from "vitest"
import { makeIssue } from "../health/test-issue"
import { EMPTY_FORM, buildUpdate } from "./form"

const issue = makeIssue({ storyPoints: null, assigneeId: null, epicKey: null, priority: null, labels: ["search"] })

describe("Resolve form → Jira update", () => {
  it("sends only the fields shown, converted for Jira", () => {
    const result = buildUpdate({
      issue,
      fields: ["storyPoints", "sprintIds", "resolved"],
      form: { ...EMPTY_FORM, storyPoints: " 5 ", sprintId: "209", resolution: "Done", priority: "High" },
    })
    expect(result).toEqual({ ok: true, update: { storyPoints: 5, sprintId: 209, resolution: "Done" }, usedSuggestion: [] })
  })

  it("explains bad input per field", () => {
    const result = buildUpdate({ issue, fields: ["storyPoints", "labels"], form: { ...EMPTY_FORM, storyPoints: "lots", labels: ["two words"] } })
    expect(result).toEqual({
      ok: false,
      errors: { storyPoints: "Story points must be a number from 0 to 100.", labels: "Labels can't contain spaces." },
    })
  })

  it("ignores invalid input in fields the dialog doesn't show", () => {
    const result = buildUpdate({ issue, fields: ["priority"], form: { ...EMPTY_FORM, storyPoints: "lots", priority: "High" } })
    expect(result).toMatchObject({ ok: true, update: { priority: "High" } })
  })

  it("needs at least one value, and unchanged labels don't count", () => {
    expect(buildUpdate({ issue, fields: ["labels"], form: { ...EMPTY_FORM, labels: ["search"] } })).toEqual({
      ok: false,
      errors: { form: "Fill in at least one field." },
    })
  })

  it("records which suggestions were used", () => {
    const suggestions = {
      storyPoints: { field: "storyPoints" as const, value: 3, tier: 1 as const, evidence: "", basedOn: [] },
      assigneeId: { field: "assigneeId" as const, value: "u-1", alternatives: ["u-2"], evidence: "", basedOn: [] },
    }
    const result = buildUpdate({
      issue,
      fields: ["storyPoints", "assigneeId"],
      form: { ...EMPTY_FORM, storyPoints: "5", assigneeId: "u-2" },
      suggestions,
    })
    expect(result).toMatchObject({ ok: true, usedSuggestion: ["assigneeId"] })
  })
})
