import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { parseExportText } from "../jira/adapter"
import { checkDataset } from "./checks"
import { fixListMarkdown, scopeTitle, shortName } from "./fixList"
import { DEFAULT_FILTERS, applyFilters, type Filters } from "./list"

const dataset = parseExportText(sample)
const health = checkDataset(dataset)
const md = (f: Partial<Filters>) => {
  const filters = { ...DEFAULT_FILTERS, ...f }
  return fixListMarkdown({ rows: applyFilters(health, filters, dataset).rows, filters, dataset })
}

describe("fix list", () => {
  it("abbreviates surnames", () => {
    expect(shortName("Alex Petrov")).toBe("Alex P.")
    expect(shortName("Liam O'Brien")).toBe("Liam O.")
    expect(shortName("Cher")).toBe("Cher")
    expect(shortName("Unknown (u-9)")).toBe("Unknown (u-9)")
  })

  it("names the scope", () => {
    expect(scopeTitle(DEFAULT_FILTERS, dataset)).toBe("Active sprints")
    expect(scopeTitle({ ...DEFAULT_FILTERS, teamIds: ["TEAM-WEB"] }, dataset)).toBe("WEB 26.4.4")
    expect(scopeTitle({ ...DEFAULT_FILTERS, sprint: 210 }, dataset)).toBe("WEB 26.4.5")
    expect(scopeTitle({ ...DEFAULT_FILTERS, sprint: "backlog", teamIds: ["TEAM-MOB"] }, dataset)).toBe("Mobile · Backlog")
    expect(scopeTitle({ ...DEFAULT_FILTERS, sprint: "all" }, dataset)).toBe("All tickets")
  })

  it("matches the brief's format: heading, counts, then tickets by assignee", () => {
    const text = md({ teamIds: ["TEAM-WEB"] })
    const lines = text.split("\n")
    expect(lines[0]).toBe("## WEB 26.4.4: tickets to update (trawled 3 Nov 08:15)")
    expect(lines[1]).toMatch(/^\d+ tickets · \d+ critical$/)
    expect(lines[3]).toBe("### Unassigned")
    expect(text).toContain("- [WEB-880](https://jira.example.com/browse/WEB-880) Story points, Assignee, Epic missing → ")
    expect(text).toMatch(/### [A-Z][a-z]+ [A-Z]\.\n/)
  })

  it("links every ticket to its Jira page", () => {
    const text = md({ sprint: "all" })
    const links = [...text.matchAll(/\[([A-Z]+-\d+)\]\((\S+)\)/g)]
    expect(links.length).toBe(applyFilters(health, { ...DEFAULT_FILTERS, sprint: "all" }, dataset).rows.length)
    for (const [, key, url] of links) expect(url).toBe(`https://jira.example.com/browse/${key}`)
  })

  it("says 'All team views' for a missing team", () => {
    expect(md({ teamIds: ["TEAM-WEB"], fields: ["teamId"] })).toMatch(/Team missing → All team views/)
  })

  it("writes plain keys without a Jira URL", () => {
    const noUrl = { ...dataset, meta: { ...dataset.meta, jiraBaseUrl: null } }
    const text = fixListMarkdown({ rows: applyFilters(health, DEFAULT_FILTERS, noUrl).rows, filters: DEFAULT_FILTERS, dataset: noUrl })
    expect(text).not.toContain("](")
    expect(text).toMatch(/^- [A-Z]+-\d+ /m)
  })
})
