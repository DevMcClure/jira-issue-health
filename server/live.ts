/**
 * Live data: the current dataset with a content revision, and server-sent events
 * that tell every open browser when it changes.
 *
 * The revision is a hash of the data, so it's the same whichever way a change was
 * noticed (a change stream, polling, or this server's own write) and an unchanged
 * poll is a no-op.
 */
import { createHash } from "node:crypto"
import type { ServerResponse } from "node:http"
import type { ExportDoc, LiveEvent } from "../src/lib/api/contract"
import { parseExport } from "../src/lib/jira/adapter"
import type { JiraDataset } from "../src/lib/jira/types"
import type { IssueStore } from "./store/issue-store"

export type Current = { revision: string; json: string; dataset: JiraDataset }

export function createDatasetCache(store: IssueStore) {
  let current: Current | null = null
  let loading: Promise<Current | null> | null = null

  const load = async (): Promise<Current | null> => {
    const doc: ExportDoc | null = await store.snapshot()
    if (!doc) return null
    const json = JSON.stringify(doc)
    const revision = createHash("sha256").update(json).digest("base64url").slice(0, 22)
    if (current?.revision === revision) return current
    return { revision, json, dataset: parseExport(doc) }
  }

  return {
    /** The dataset now (read once, then kept until `refresh`). */
    async get(): Promise<Current | null> {
      if (current) return current
      loading ??= load().finally(() => (loading = null))
      current = await loading
      return current
    },
    /** Read the store again; true when the data changed. */
    async refresh(): Promise<boolean> {
      const before = current?.revision ?? null
      current = await load()
      return (current?.revision ?? null) !== before
    },
  }
}

export type DatasetCache = ReturnType<typeof createDatasetCache>

const frame = (event: LiveEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`

/** The open event streams. A comment every `heartbeatMs` keeps proxies from closing idle ones. */
export function createLiveHub({ heartbeatMs = 25_000 } = {}) {
  const clients = new Set<ServerResponse>()
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(": ping\n\n")
  }, heartbeatMs)
  heartbeat.unref()

  return {
    get size() {
      return clients.size
    },
    add(res: ServerResponse, first: LiveEvent[]) {
      clients.add(res)
      for (const e of first) res.write(frame(e))
      res.on("close", () => clients.delete(res))
    },
    broadcast(event: LiveEvent) {
      const data = frame(event)
      for (const c of clients) c.write(data)
    },
    close() {
      clearInterval(heartbeat)
      for (const c of clients) c.end()
      clients.clear()
    },
  }
}

export type LiveHub = ReturnType<typeof createLiveHub>

/** Coalesce bursts (an ingest writes thousands of documents) into one call. */
export function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const run = () => {
    clearTimeout(t)
    t = setTimeout(fn, ms)
  }
  run.cancel = () => clearTimeout(t)
  return run
}
