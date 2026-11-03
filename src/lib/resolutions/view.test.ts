import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { checkDataset } from "../health/checks"
import { DEFAULT_FILTERS } from "../health/list"
import { parseExportText } from "../jira/adapter"
import { applyResolutions, resolutionsByIssue } from "./overlay"
import type { Resolution } from "./types"
import { resolvedCounts, resolvedRows } from "./view"

const dataset = parseExportText(sample)
const baseHealth = checkDataset(dataset)
const r = (issueKey: string, values: Resolution["values"]): Resolution => ({
  issueKey,
  values,
  resolvedAt: "2026-11-03T09:00:00Z",
  source: "local-mock",
  usedSuggestion: [],
})

function input(resolutions: Resolution[], filters = DEFAULT_FILTERS) {
  const current = new Map(checkDataset(applyResolutions(dataset, resolutions)).map((h) => [h.issue.key, h]))
  return { baseHealth, baseDataset: dataset, current, byIssue: resolutionsByIssue(resolutions), filters }
}

describe("show resolved", () => {
  const fixes = [
    r("WEB-880", { storyPoints: 3, assigneeId: "u-07", epicKey: "WEB-805" }), // all three gaps
    r("PLAT-1290", { storyPoints: 2 }), // one of two
  ]

  it("brings back fully resolved tickets, without gaps", () => {
    const rows = resolvedRows(input(fixes))
    expect(rows.map((h) => h.issue.key)).toEqual(["WEB-880"])
    expect(rows[0].gaps).toEqual([])
    expect(rows[0].issue.storyPoints).toBe(3)
  })

  it("matches the filters against the original gaps", () => {
    expect(resolvedRows(input(fixes, { ...DEFAULT_FILTERS, fields: ["epicKey"] }))).toHaveLength(1)
    expect(resolvedRows(input(fixes, { ...DEFAULT_FILTERS, fields: ["priority"] }))).toHaveLength(0)
    expect(resolvedRows(input(fixes, { ...DEFAULT_FILTERS, teamIds: ["TEAM-MOB"] }))).toHaveLength(0)
  })

  it("counts full and partial local fixes in the filter", () => {
    expect(resolvedCounts(input(fixes))).toEqual({ full: 1, partial: 1 })
    expect(resolvedCounts(input(fixes, { ...DEFAULT_FILTERS, teamIds: ["TEAM-PLAT"] }))).toEqual({ full: 0, partial: 1 })
    expect(resolvedCounts(input([]))).toEqual({ full: 0, partial: 0 })
  })
})
