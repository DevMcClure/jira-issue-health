import { describe, expect, it } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { checkDataset } from "../health/checks"
import { DEFAULT_FILTERS, applyFilters } from "../health/list"
import { makeIssue } from "../health/test-issue"
import { parseExportText } from "../jira/adapter"
import { EMPTY_FORM, buildResolution } from "./form"
import { createLocalResolutionSink } from "./local-sink"
import { applyResolutions, mergedValues } from "./overlay"
import type { Resolution } from "./types"

const dataset = parseExportText(sample)
const resolution = (issueKey: string, values: Resolution["values"], resolvedAt = "2026-11-03T09:00:00Z"): Resolution => ({
  issueKey,
  values,
  resolvedAt,
  source: "local-mock",
  usedSuggestion: [],
})
const listed = (resolutions: Resolution[]) =>
  applyFilters(checkDataset(applyResolutions(dataset, resolutions)), DEFAULT_FILTERS, dataset).rows.map((h) => h.issue.key)
const gapsOf = (key: string, resolutions: Resolution[]) =>
  checkDataset(applyResolutions(dataset, resolutions))
    .find((h) => h.issue.key === key)!
    .gaps.map((g) => g.field)

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
    map,
  }
}

describe("resolving tickets (overlay)", () => {
  // WEB-877 is missing story points, assignee and epic.
  it("removes a ticket from the list once every gap is resolved", () => {
    expect(listed([])).toContain("WEB-877")
    const all = resolution("WEB-877", { storyPoints: 3, assigneeId: "u-07", epicKey: "WEB-805" })
    expect(gapsOf("WEB-877", [all])).toEqual([])
    expect(listed([all])).not.toContain("WEB-877")
  })

  it("keeps a partly resolved ticket with its remaining gaps", () => {
    const some = resolution("WEB-877", { storyPoints: 3 })
    expect(gapsOf("WEB-877", [some])).toEqual(["assigneeId", "epicKey"])
    expect(listed([some])).toContain("WEB-877")
  })

  it("lets later saves add to earlier ones", () => {
    const first = resolution("WEB-877", { storyPoints: 3, epicKey: "WEB-700" })
    const second = resolution("WEB-877", { assigneeId: "u-07", epicKey: "WEB-805" }, "2026-11-03T10:00:00Z")
    expect(mergedValues([first, second])).toEqual({ storyPoints: 3, epicKey: "WEB-805", assigneeId: "u-07" })
    expect(listed([first, second])).not.toContain("WEB-877")
  })

  it("restores the ticket when the resolution is undone", () => {
    const all = resolution("WEB-877", { storyPoints: 3, assigneeId: "u-07", epicKey: "WEB-805" })
    const afterUndo: Resolution[] = [all].filter((r) => r !== all)
    expect(listed(afterUndo)).toContain("WEB-877")
  })

  it("never changes the original data", () => {
    const before = JSON.stringify(dataset.issues)
    const overlaid = applyResolutions(dataset, [resolution("WEB-877", { storyPoints: 3 })])
    expect(JSON.stringify(dataset.issues)).toBe(before)
    expect(dataset.byKey.get("WEB-877")!.storyPoints).toBeNull()
    expect(overlaid.byKey.get("WEB-877")!.storyPoints).toBe(3)
  })

  it("ignores resolutions for tickets that aren't in this dataset", () => {
    const overlaid = applyResolutions(dataset, [resolution("NOPE-1", { storyPoints: 3 })])
    expect(overlaid.issues).toEqual(dataset.issues)
  })
})

describe("local resolution sink", () => {
  const generatedAt = "2026-11-03T08:15:00Z"
  const r = resolution("WEB-877", { storyPoints: 3 })

  it("keeps resolutions across a refresh (a new sink on the same storage)", () => {
    const storage = memoryStorage()
    expect(createLocalResolutionSink(storage).persist(generatedAt, [r])).toBe(true)
    expect(createLocalResolutionSink(storage).load(generatedAt)).toEqual([r])
  })

  it("doesn't show them on a different dataset", () => {
    const storage = memoryStorage()
    createLocalResolutionSink(storage).persist(generatedAt, [r])
    expect(createLocalResolutionSink(storage).load("2026-10-01T08:00:00Z")).toEqual([])
  })

  it("ignores stored data that isn't valid", () => {
    const storage = memoryStorage()
    storage.setItem(`jira-health:resolutions:${generatedAt}`, JSON.stringify([{ issueKey: "X", values: { storyPoints: "three" } }]))
    expect(createLocalResolutionSink(storage).load(generatedAt)).toEqual([])
    storage.setItem(`jira-health:resolutions:${generatedAt}`, "{")
    expect(createLocalResolutionSink(storage).load(generatedAt)).toEqual([])
  })

  it("removes the key when nothing is left", () => {
    const storage = memoryStorage()
    const sink = createLocalResolutionSink(storage)
    sink.persist(generatedAt, [r])
    sink.persist(generatedAt, [])
    expect(storage.map.size).toBe(0)
  })

  it("clears every dataset's resolutions and nothing else", () => {
    const storage = memoryStorage()
    storage.setItem("jira-health:theme", "light")
    const sink = createLocalResolutionSink(storage)
    sink.persist(generatedAt, [r])
    sink.persist("other", [r])
    sink.clearAll!()
    expect([...storage.map.keys()]).toEqual(["jira-health:theme"])
  })

  it("reports that it can't keep them when storage fails", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied")
      },
      setItem: () => {
        throw new Error("quota")
      },
      removeItem: () => {
        throw new Error("denied")
      },
    }
    const sink = createLocalResolutionSink(throwing)
    expect(sink.load(generatedAt)).toEqual([])
    expect(sink.persist(generatedAt, [r])).toBe(false)
    expect(createLocalResolutionSink(null).persist(generatedAt, [r])).toBe(false)
  })
})

describe("buildResolution", () => {
  const issue = makeIssue({ storyPoints: null, assigneeId: null, epicKey: null, labels: ["search"], created: "2026-10-20T10:00:00Z" })
  const now = new Date("2026-11-03T09:30:00Z")
  const build = (form: Partial<typeof EMPTY_FORM>, fields = ["storyPoints", "assigneeId", "epicKey"] as const) =>
    buildResolution({ issue, fields: [...fields], form: { ...EMPTY_FORM, ...form }, now })

  it("saves only the fields filled in", () => {
    expect(build({ storyPoints: "5", epicKey: "WEB-700" })).toEqual({
      ok: true,
      resolution: {
        issueKey: "WEB-1",
        values: { storyPoints: 5, epicKey: "WEB-700" },
        resolvedAt: "2026-11-03T09:30:00.000Z",
        source: "local-mock",
        usedSuggestion: [],
      },
    })
  })

  it("needs at least one field", () => {
    expect(build({})).toEqual({ ok: false, errors: { form: "Fill in at least one field to save." } })
    expect(build({ storyPoints: "  " })).toMatchObject({ ok: false, errors: { form: expect.any(String) } })
  })

  it("rejects story points that aren't a number from 0 to 100", () => {
    for (const bad of ["three", "-1", "101", "1e3"]) {
      expect(build({ storyPoints: bad })).toEqual({ ok: false, errors: { storyPoints: "Story points must be a number from 0 to 100." } })
    }
    expect(build({ storyPoints: "0.5" })).toMatchObject({ ok: true })
  })

  it("ignores inputs for fields the dialog didn't show, valid or not", () => {
    expect(build({ priority: "High" })).toMatchObject({ ok: false, errors: { form: expect.any(String) } })
    expect(build({ resolved: "garbage", storyPoints: "2" })).toMatchObject({ ok: true, resolution: { values: { storyPoints: 2 } } })
  })

  it("puts a ticket in the chosen sprint", () => {
    expect(build({ sprintId: "209" }, ["sprintIds"] as never)).toMatchObject({ ok: true, resolution: { values: { sprintIds: [209] } } })
  })

  it("saves labels only when they changed, without blanks or duplicates", () => {
    const fields = ["labels"] as never
    expect(build({ labels: ["search"] }, fields)).toMatchObject({ ok: false })
    expect(build({ labels: ["search", " tech-debt ", "tech-debt", ""] }, fields)).toMatchObject({
      ok: true,
      resolution: { values: { labels: ["search", "tech-debt"] } },
    })
  })

  it("stores a resolved day at midday UTC, not before the ticket was created", () => {
    const fields = ["resolved"] as never
    expect(build({ resolved: "2026-10-30" }, fields)).toMatchObject({ ok: true, resolution: { values: { resolved: "2026-10-30T12:00:00Z" } } })
    expect(build({ resolved: "2026-10-01" }, fields)).toEqual({
      ok: false,
      errors: { resolved: "The resolved date can't be before the ticket was created." },
    })
  })

  it("records which suggestions were accepted, including an alternative person", () => {
    const result = buildResolution({
      issue,
      fields: ["storyPoints", "assigneeId", "epicKey"],
      form: { ...EMPTY_FORM, storyPoints: "3", assigneeId: "u-3", epicKey: "WEB-9" },
      suggestions: {
        storyPoints: { field: "storyPoints", value: 3, tier: 1, evidence: "", basedOn: [] },
        assigneeId: { field: "assigneeId", value: "u-2", alternatives: ["u-3"], evidence: "", basedOn: [] },
        epicKey: { field: "epicKey", value: "WEB-700", tier: 2, evidence: "", basedOn: [] },
      },
      now,
    })
    expect(result).toMatchObject({ ok: true, resolution: { usedSuggestion: ["storyPoints", "assigneeId"] } })
  })
})
