import { describe, expect, it } from "vitest"
import type { Fix } from "../api/contract"
import { checkIssue } from "../health/checks"
import { DEFAULT_FILTERS } from "../health/list"
import { makeIssue } from "../health/test-issue"
import { parseExport } from "../jira/adapter"
import { fixedRows, fixesByIssue } from "./view"

const dataset = parseExport({ sprints: [{ id: 1, name: "S1", state: "active", teamId: "TEAM-WEB" }], issues: [] })
const fix = (issueKey: string, via: Fix["via"], at = "2026-11-04T10:00:00Z"): Fix => ({
  id: `${issueKey}-${at}`,
  issueKey,
  update: { storyPoints: 3 },
  by: { id: "u", displayName: "U" },
  at,
  via,
  usedSuggestion: [],
})

describe("fixed tickets", () => {
  it("lists tickets fixed with Resolve that now have nothing missing, in this view", () => {
    const health = [
      checkIssue(makeIssue({ key: "WEB-1" })),
      checkIssue(makeIssue({ key: "WEB-2", storyPoints: null })),
      checkIssue(makeIssue({ key: "WEB-3" })),
      checkIssue(makeIssue({ key: "WEB-4", sprintIds: [] })),
    ]
    const byIssue = fixesByIssue([fix("WEB-1", "app"), fix("WEB-2", "app"), fix("WEB-3", "jira"), fix("WEB-4", "app")])
    // WEB-2 still has a gap, WEB-3 was fixed in Jira directly, WEB-4 isn't in an active sprint.
    expect(fixedRows({ health, byIssue, filters: DEFAULT_FILTERS, dataset }).map((h) => h.issue.key)).toEqual(["WEB-1"])
  })

  it("orders each ticket's fixes oldest first", () => {
    const byIssue = fixesByIssue([fix("WEB-1", "app", "2026-11-04T11:00:00Z"), fix("WEB-1", "app", "2026-11-04T09:00:00Z")])
    expect(byIssue.get("WEB-1")!.map((f) => f.at)).toEqual(["2026-11-04T09:00:00Z", "2026-11-04T11:00:00Z"])
  })
})
