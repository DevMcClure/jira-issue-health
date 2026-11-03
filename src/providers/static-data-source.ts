import { parseExportText } from "@/lib/jira/adapter"
import type { DataSource, FileLike, LoadedData } from "./data-source"

/** localStorage key for the last loaded file. */
export const UPLOAD_STORAGE_KEY = "jira-health:upload"

type Stored = { fileName: string; loadedAt: string; json: string }
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

type Options = {
  /** The sample export's text. Defaults to the bundled mock, loaded as its own chunk. */
  loadSample?: () => Promise<string>
  /** Defaults to `localStorage`; missing or throwing storage is tolerated. */
  storage?: StorageLike | null
}

const bundledSample = () => import("@/data/mock/trawler-export.json?raw").then((m) => m.default)

/** The bundled mock export, plus a file the user loads, remembered in this browser only. */
export function createStaticDataSource({ loadSample = bundledSample, storage = defaultStorage() }: Options = {}): DataSource {
  let sample: Promise<LoadedData> | null = null

  const sampleData = () => {
    sample ??= loadSample().then((text) => ({ dataset: parseExportText(text), origin: { kind: "sample" } }) satisfies LoadedData)
    // A failed load can be retried.
    sample.catch(() => (sample = null))
    return sample
  }

  const readStored = (): Stored | null => {
    try {
      const s = storage?.getItem(UPLOAD_STORAGE_KEY)
      return s ? (JSON.parse(s) as Stored) : null
    } catch {
      return null
    }
  }

  const writeStored = (value: Stored | null): boolean => {
    if (!storage) return false
    try {
      if (value) storage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(value))
      else storage.removeItem(UPLOAD_STORAGE_KEY)
      return true
    } catch {
      return false
    }
  }

  return {
    async load() {
      const stored = readStored()
      if (stored) {
        try {
          return {
            dataset: parseExportText(stored.json),
            origin: { kind: "upload", fileName: stored.fileName, loadedAt: stored.loadedAt },
          }
        } catch {
          // No longer valid (e.g. the contract changed): forget it and use the sample.
          writeStored(null)
        }
      }
      return sampleData()
    },

    async loadFile(file: FileLike) {
      const text = await file.text()
      const dataset = parseExportText(text)
      const loadedAt = new Date().toISOString()
      const remembered = writeStored({ fileName: file.name, loadedAt, json: text })
      // Don't bring back an older file on refresh when this one couldn't be kept.
      if (!remembered) writeStored(null)
      return { data: { dataset, origin: { kind: "upload", fileName: file.name, loadedAt } }, remembered }
    },

    async reset() {
      writeStored(null)
      return sampleData()
    },
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
