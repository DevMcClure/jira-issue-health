import sample from "@/data/mock/trawler-export.json?raw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkIssue } from "@/lib/health/checks"
import type { DataUpdate, LoadedData } from "@/providers/data-source"
import { createStaticDataSource } from "@/providers/static-data-source"
import { DEMO_CHANGES_PREFIX, createDemoBackend } from "./demo-backend"


function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map }
}

const make = (storage = memoryStorage(), extra: Partial<Parameters<typeof createDemoBackend>[0]> = {}) => {
  let n = 0
  return createDemoBackend({
    files: createStaticDataSource({ loadSample: async () => sample, storage: null }),
    storage,
    latencyMs: 0,
    now: () => new Date("2026-11-04T10:00:00Z"),
    newId: () => `fix-${++n}`,
    random: () => 0,
    ...extra,
  })
}
const gaps = (data: LoadedData, key: string) => checkIssue(data.dataset.byKey.get(key)!).gaps.map((g) => g.field)

describe("demo backend", () => {
  it("needs the demo account before resolving", async () => {
    const backend = make()
    await backend.data.load()
    expect(await backend.jira.resolve("WEB-877", { update: { storyPoints: 3 } })).toMatchObject({ ok: false, code: "not-connected" })
    await expect(backend.jira.connect({ kind: "pat", token: "real-token" })).rejects.toThrow(/demo account/)
    expect((await backend.jira.connect({ kind: "demo" })).user.displayName).toBe("You (demo)")
  })

  it("applies a fix, tells listeners, and keeps it across a reload", async () => {
    const storage = memoryStorage()
    const backend = make(storage)
    await backend.data.load()
    await backend.jira.connect({ kind: "demo" })
    const updates: DataUpdate[] = []
    const stop = backend.data.subscribe((u) => updates.push(u))

    const result = await backend.jira.resolve("WEB-877", { update: { storyPoints: 3, assigneeId: "u-07", epicKey: "WEB-805" } })
    expect(result).toMatchObject({ ok: true, written: ["storyPoints", "assigneeId", "epicKey"], fix: { by: { displayName: "You (demo)" } } })
    const last = updates.filter((u) => u.kind === "data").at(-1)
    expect(last && last.kind === "data" && gaps(last.data, "WEB-877")).toEqual([])
    stop()

    // A new visit (same browser) sees the same fix.
    const again = await make(storage).data.load()
    expect(gaps(again, "WEB-877")).toEqual([])
    expect(again.fixes).toHaveLength(1)
    expect([...storage.map.keys()].some((k) => k.startsWith(DEMO_CHANGES_PREFIX))).toBe(true)
  })

  it("refuses like Jira and changes nothing", async () => {
    const backend = make()
    await backend.data.load()
    await backend.jira.connect({ kind: "demo" })
    const result = await backend.jira.resolve("WEB-877", { update: { epicKey: "WEB-877" } })
    expect(result).toMatchObject({ ok: false, code: "rejected", fieldErrors: { epicKey: "'WEB-877' is not an epic." } })
    expect(gaps(await backend.data.refresh(), "WEB-877")).toContain("epicKey")
  })

  it("resets every demo change", async () => {
    const backend = make()
    await backend.data.load()
    await backend.jira.connect({ kind: "demo" })
    await backend.jira.resolve("WEB-877", { update: { storyPoints: 3 } })
    await backend.demo!.reset()
    expect(gaps(await backend.data.refresh(), "WEB-877")).toContain("storyPoints")
  })

  describe("stand-in feed", () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("fixes a gap 'in Jira' now and then while someone is watching, and can be turned off", async () => {
      const backend = make(memoryStorage(), { simulateEveryMs: [1000, 1000] })
      const before = await backend.data.load()
      const updates: DataUpdate[] = []
      const stop = backend.data.subscribe((u) => updates.push(u))
      await vi.advanceTimersByTimeAsync(1000)
      const data = updates.filter((u): u is Extract<DataUpdate, { kind: "data" }> => u.kind === "data").at(-1)!.data
      expect(data.fixes).toHaveLength(1)
      expect(data.fixes[0].via).toBe("jira")
      expect(data.revision).not.toBe(before.revision)

      backend.demo!.simulation.setEnabled(false)
      await vi.advanceTimersByTimeAsync(5000)
      expect((await backend.data.refresh()).fixes).toHaveLength(1)
      stop()
    })
  })
})
