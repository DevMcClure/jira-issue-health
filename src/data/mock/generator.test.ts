import { describe, expect, it } from "vitest"
import committed from "./trawler-export.json?raw"
import { parseExport } from "@/lib/jira/adapter"
import { MOCK_GENERATED_AT, generateMockExport } from "./generator"

describe("generateMockExport", () => {
  it("is deterministic and matches the committed file (run `pnpm mock` after changing the generator)", () => {
    expect(`${JSON.stringify(generateMockExport(), null, 2)}\n`).toBe(committed)
  })

  it("is a valid Trawler export", () => {
    expect(() => parseExport(generateMockExport())).not.toThrow()
  })

  it("has 3 teams with 2 closed, 1 active and 1 future sprint each", () => {
    const dataset = parseExport(generateMockExport())
    for (const team of dataset.teams) {
      const states = dataset.sprints.filter((s) => s.teamId === team.id).map((s) => s.state)
      expect(states).toEqual(["closed", "closed", "active", "future"])
    }
  })

  it("has nothing dated after the trawl", () => {
    const cutoff = Date.parse(MOCK_GENERATED_AT)
    for (const issue of parseExport(generateMockExport()).issues) {
      const dates = [issue.created, issue.resolved, ...issue.changelog.map((c) => c.at)].filter((d) => d !== null)
      for (const d of dates) expect(Date.parse(d), issue.key).toBeLessThanOrEqual(cutoff)
    }
  })

  it("writes missing values as null, empty strings and absent keys", () => {
    const issues = generateMockExport().issues as Record<string, unknown>[]
    const fields = ["assigneeId", "epicKey", "priority", "teamId", "resolved"]
    expect(issues.some((i) => fields.some((f) => i[f] === ""))).toBe(true)
    expect(issues.some((i) => fields.some((f) => !(f in i)))).toBe(true)
    expect(issues.some((i) => fields.some((f) => i[f] === null))).toBe(true)
  })

  it("only references sprints, people and epics that exist", () => {
    const dataset = parseExport(generateMockExport())
    const named = new Set(dataset.people.filter((p) => !p.displayName.startsWith("Unknown")).map((p) => p.id))
    expect(dataset.people.every((p) => named.has(p.id))).toBe(true)
    for (const issue of dataset.issues) {
      for (const id of issue.sprintIds) expect(dataset.sprintById.has(id), issue.key).toBe(true)
      if (issue.epicKey) expect(dataset.byKey.get(issue.epicKey)?.type, issue.key).toBe("Epic")
      if (issue.parentKey) expect(dataset.byKey.has(issue.parentKey), issue.key).toBe(true)
    }
  })
})
