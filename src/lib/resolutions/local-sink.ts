import type { ResolutionSink } from "./sink"
import { resolutionListSchema, type Resolution } from "./types"

/** Resolutions are keyed by the export's generatedAt, so they never leak onto a different dataset. */
export const RESOLUTIONS_KEY_PREFIX = "jira-health:resolutions:"

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> & { key?: (i: number) => string | null; length?: number }

/** `localStorage`-backed sink. Missing, throwing or full storage is tolerated: resolutions then last for the session only. */
export function createLocalResolutionSink(storage: StorageLike | null = defaultStorage()): ResolutionSink {
  const keyFor = (datasetId: string) => `${RESOLUTIONS_KEY_PREFIX}${datasetId}`
  return {
    load(datasetId) {
      try {
        const raw = storage?.getItem(keyFor(datasetId))
        if (!raw) return []
        const parsed = resolutionListSchema.safeParse(JSON.parse(raw))
        return parsed.success ? (parsed.data as Resolution[]) : []
      } catch {
        return []
      }
    },
    persist(datasetId, resolutions) {
      if (!storage) return false
      try {
        if (resolutions.length) storage.setItem(keyFor(datasetId), JSON.stringify(resolutions))
        else storage.removeItem(keyFor(datasetId))
        return true
      } catch {
        return false
      }
    },
    clearAll() {
      try {
        if (!storage?.key || storage.length === undefined) return
        const keys: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k?.startsWith(RESOLUTIONS_KEY_PREFIX)) keys.push(k)
        }
        keys.forEach((k) => storage.removeItem(k))
      } catch {
        // Nothing to clear if storage is unavailable.
      }
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
