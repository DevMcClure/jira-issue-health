import { describe, expect, it, vi } from "vitest"
import sample from "@/data/mock/trawler-export.json?raw"
import { JiraExportError } from "@/lib/jira/adapter"
import { UPLOAD_STORAGE_KEY, createStaticDataSource } from "./static-data-source"

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  }
}

const file = (name: string, text: string) => ({ name, text: async () => text })
const tinyExport = JSON.stringify({
  meta: { generatedAt: "2026-10-01T08:00:00Z" },
  issues: [{ key: "X-1", summary: "One", status: "To Do", statusCategory: "new", created: "2026-09-30T10:00:00Z" }],
})

describe("createStaticDataSource", () => {
  it("loads the sample when nothing is remembered", async () => {
    const source = createStaticDataSource({ loadSample: async () => sample, storage: memoryStorage() })
    const { dataset, origin } = await source.load()
    expect(origin).toEqual({ kind: "sample" })
    expect(dataset.issues).toHaveLength(240)
  })

  it("loads the bundled sample by default", async () => {
    const { dataset } = await createStaticDataSource({ storage: null }).load()
    expect(dataset.meta.generatedAt).toBe("2026-11-03T08:15:00Z")
  })

  it("remembers a loaded file for the next visit", async () => {
    const storage = memoryStorage()
    const source = createStaticDataSource({ loadSample: async () => sample, storage })
    const { data, remembered } = await source.loadFile(file("mine.json", tinyExport))
    expect(remembered).toBe(true)
    expect(data.origin).toMatchObject({ kind: "upload", fileName: "mine.json" })

    const again = await createStaticDataSource({ loadSample: async () => sample, storage }).load()
    expect(again.origin).toMatchObject({ kind: "upload", fileName: "mine.json" })
    expect(again.dataset.issues.map((i) => i.key)).toEqual(["X-1"])
  })

  it("rejects a bad file and keeps the remembered one", async () => {
    const storage = memoryStorage()
    const source = createStaticDataSource({ loadSample: async () => sample, storage })
    await source.loadFile(file("good.json", tinyExport))
    await expect(source.loadFile(file("bad.json", '{"issues": [{}]}'))).rejects.toBeInstanceOf(JiraExportError)
    await expect(source.loadFile(file("broken.json", "{"))).rejects.toBeInstanceOf(SyntaxError)
    expect(JSON.parse(storage.map.get(UPLOAD_STORAGE_KEY)!).fileName).toBe("good.json")
  })

  it("forgets a remembered file that is no longer valid", async () => {
    const storage = memoryStorage()
    storage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify({ fileName: "old.json", loadedAt: "x", json: "{}" }))
    const { origin } = await createStaticDataSource({ loadSample: async () => sample, storage }).load()
    expect(origin).toEqual({ kind: "sample" })
    expect(storage.map.has(UPLOAD_STORAGE_KEY)).toBe(false)
  })

  it("works when storage throws, without remembering", async () => {
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
    const source = createStaticDataSource({ loadSample: async () => sample, storage: throwing })
    expect((await source.load()).origin).toEqual({ kind: "sample" })
    const { remembered } = await source.loadFile(file("mine.json", tinyExport))
    expect(remembered).toBe(false)
  })

  it("reset forgets the file and returns the sample", async () => {
    const storage = memoryStorage()
    const source = createStaticDataSource({ loadSample: async () => sample, storage })
    await source.loadFile(file("mine.json", tinyExport))
    expect((await source.reset()).origin).toEqual({ kind: "sample" })
    expect(storage.map.has(UPLOAD_STORAGE_KEY)).toBe(false)
  })

  it("parses the sample once and retries after a failure", async () => {
    const loadSample = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(sample)
    const source = createStaticDataSource({ loadSample, storage: null })
    await expect(source.load()).rejects.toThrow("offline")
    const first = await source.load()
    const second = await source.reset()
    expect(second.dataset).toBe(first.dataset)
    expect(loadSample).toHaveBeenCalledTimes(2)
  })
})
