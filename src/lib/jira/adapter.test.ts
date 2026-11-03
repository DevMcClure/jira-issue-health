import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { JiraExportError, jiraIssueUrl, parseExport, parseExportText } from "./adapter"

/** A minimal valid export; `issue` overrides the single issue's fields. */
function exportWith(issue: Record<string, unknown> = {}, rest: Record<string, unknown> = {}) {
  return {
    meta: { source: "jira-trawler", version: "1.0", generatedAt: "2026-11-03T08:15:00Z", jiraBaseUrl: "https://jira.example.com" },
    teams: [{ id: "TEAM-WEB", name: "Web", projectKey: "WEB", memberIds: ["p1"] }],
    people: [{ id: "p1", displayName: "Pat Doe" }],
    sprints: [{ id: 1, name: "WEB 1", teamId: "TEAM-WEB", state: "active", startDate: "2026-10-26T09:00:00Z", endDate: "2026-11-06T17:00:00Z", completeDate: null }],
    issues: [
      {
        key: "WEB-1",
        summary: "Do the thing",
        type: "Story",
        status: "In Progress",
        statusCategory: "indeterminate",
        priority: "Medium",
        assigneeId: "p1",
        teamId: "TEAM-WEB",
        sprintIds: [1],
        storyPoints: 3,
        labels: ["web"],
        epicKey: "WEB-0",
        created: "2026-10-20T10:00:00Z",
        resolved: null,
        changelog: [],
        ...issue,
      },
    ],
    ...rest,
  }
}

function problemsOf(raw: unknown): string[] {
  try {
    parseExport(raw)
  } catch (err) {
    if (err instanceof JiraExportError) return err.problems
    throw err
  }
  throw new Error("expected the export to be rejected")
}

describe("parseExportText on the mock export", () => {
  const dataset = parseExportText(sample)

  it("reads every team, person, sprint and issue", () => {
    expect(dataset.teams.map((t) => t.name)).toEqual(["Platform", "Web", "Mobile"])
    expect(dataset.people).toHaveLength(15)
    expect(dataset.sprints).toHaveLength(12)
    expect(dataset.issues).toHaveLength(240)
    expect(dataset.epics).toHaveLength(18)
  })

  it("normalises Jira's status categories", () => {
    expect(new Set(dataset.issues.map((i) => i.statusCategory))).toEqual(new Set(["todo", "inProgress", "done"]))
  })

  it("indexes issues, people, sprints and teams", () => {
    expect(dataset.byKey.get("PLAT-1290")?.summary).toBe("SSO: SAML login loops on Safari")
    expect(dataset.personById.get("u-10")?.displayName).toBe("Alex Petrov")
    expect(dataset.sprintById.get(209)).toMatchObject({ name: "WEB 26.4.4", state: "active" })
    expect(dataset.teamById.get("TEAM-MOB")?.projectKey).toBe("MOB")
  })

  it("keeps the meta, without a trailing slash on the Jira URL", () => {
    expect(dataset.meta).toEqual({
      source: "jira-trawler",
      version: "1.0",
      generatedAt: "2026-11-03T08:15:00Z",
      jiraBaseUrl: "https://jira.example.com",
    })
  })

  it("sorts sprints by start and changelogs by time", () => {
    const starts = dataset.sprints.map((s) => Date.parse(s.startDate!))
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    for (const issue of dataset.issues) {
      const times = issue.changelog.map((c) => Date.parse(c.at))
      expect(times).toEqual([...times].sort((a, b) => a - b))
    }
  })
})

describe("missing values", () => {
  it.each([
    ["null", null],
    ["an empty string", ""],
    ["whitespace", "  "],
    ["an absent key", undefined],
  ])("treats %s as missing for text fields", (_label, value) => {
    const fields = ["priority", "assigneeId", "teamId", "epicKey", "resolved"] as const
    const issue = Object.fromEntries(fields.map((f) => [f, value]))
    const [parsed] = parseExport(exportWith(issue)).issues
    for (const f of fields) expect(parsed[f]).toBeNull()
  })

  it.each([
    ["null", null],
    ["an empty list", []],
    ["an absent key", undefined],
  ])("treats %s as missing for list fields", (_label, value) => {
    const [parsed] = parseExport(exportWith({ labels: value, sprintIds: value })).issues
    expect(parsed.labels).toEqual([])
    expect(parsed.sprintIds).toEqual([])
  })

  it("treats null and absent story points as missing, but keeps 0", () => {
    expect(parseExport(exportWith({ storyPoints: null })).issues[0].storyPoints).toBeNull()
    expect(parseExport(exportWith({ storyPoints: undefined })).issues[0].storyPoints).toBeNull()
    expect(parseExport(exportWith({ storyPoints: 0 })).issues[0].storyPoints).toBe(0)
  })

  it("drops blank labels", () => {
    expect(parseExport(exportWith({ labels: ["risk", " ", ""] })).issues[0].labels).toEqual(["risk"])
  })

  it("defaults a missing type to Task", () => {
    expect(parseExport(exportWith({ type: null })).issues[0].type).toBe("Task")
  })
})

describe("status categories", () => {
  it.each([
    ["new", "todo"],
    ["todo", "todo"],
    ["To Do", "todo"],
    ["indeterminate", "inProgress"],
    ["in_progress", "inProgress"],
    ["IN PROGRESS", "inProgress"],
    ["done", "done"],
    ["Done", "done"],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseExport(exportWith({ statusCategory: raw })).issues[0].statusCategory).toBe(expected)
  })

  it("rejects an unknown category with a readable message", () => {
    expect(problemsOf(exportWith({ statusCategory: "waiting" }))).toEqual([
      'issues.0.statusCategory: Unknown status category "waiting" (expected todo/new, indeterminate or done)',
    ])
  })
})

describe("malformed files", () => {
  it("rejects invalid JSON with a SyntaxError", () => {
    expect(() => parseExportText("{ not json")).toThrow(SyntaxError)
  })

  it("rejects a file without issues", () => {
    expect(problemsOf({ meta: {} })).toEqual(["issues: Invalid input: expected array, received undefined"])
  })

  it("rejects something that isn't an export at all", () => {
    expect(problemsOf([1, 2, 3])[0]).toMatch(/^\(root\): /)
  })

  it("lists every problem with its path", () => {
    const problems = problemsOf(
      exportWith({ key: "", created: "yesterday", sprintIds: ["one"], storyPoints: "3" }, { sprints: [{ id: 1, name: "S", state: "running" }] }),
    )
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^issues\.0\.key: /),
        "issues.0.created: Invalid ISO date",
        expect.stringMatching(/^issues\.0\.sprintIds\.0: /),
        expect.stringMatching(/^issues\.0\.storyPoints: /),
        expect.stringMatching(/^sprints\.0\.state: /),
      ]),
    )
  })

  it("summarises long problem lists in the error message", () => {
    const issues = Array.from({ length: 8 }, (_, i) => ({ key: `X-${i}` }))
    let message = ""
    try {
      parseExport({ issues })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/^Invalid Jira export:\n/)
    expect(message).toMatch(/…and \d+ more$/)
  })

  it("lets extra Trawler fields through", () => {
    expect(() => parseExport(exportWith({ customfield_10010: "x" }, { extra: true }))).not.toThrow()
  })
})

describe("people and meta", () => {
  it("names people the export references but doesn't list", () => {
    const dataset = parseExport(exportWith({ assigneeId: "ghost" }))
    expect(dataset.personById.get("ghost")?.displayName).toBe("Unknown (ghost)")
  })

  it("falls back to the newest date in the data when generatedAt is missing", () => {
    const dataset = parseExport(
      exportWith(
        { changelog: [{ at: "2026-10-30T12:00:00Z", authorId: "p1", field: "status", from: "To Do", to: "In Progress" }] },
        { meta: null },
      ),
    )
    expect(dataset.meta.generatedAt).toBe("2026-10-30T12:00:00Z")
    expect(dataset.meta.jiraBaseUrl).toBeNull()
  })
})

describe("jiraIssueUrl", () => {
  it("links to the ticket's browse page", () => {
    expect(jiraIssueUrl({ jiraBaseUrl: "https://jira.example.com" }, "WEB-123")).toBe("https://jira.example.com/browse/WEB-123")
  })

  it("works with the adapter's trimmed base URL", () => {
    const { meta } = parseExport(exportWith({}, { meta: { jiraBaseUrl: "https://jira.example.com/jira/" } }))
    expect(jiraIssueUrl(meta, "WEB-1")).toBe("https://jira.example.com/jira/browse/WEB-1")
  })

  it("is null when the export has no Jira URL", () => {
    expect(jiraIssueUrl({ jiraBaseUrl: null }, "WEB-1")).toBeNull()
  })
})
