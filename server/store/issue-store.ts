/**
 * Where the server reads issue data and keeps fixes. Routes only talk to this
 * interface: MongoDB in every deployment, memory in tests and local development.
 */
import type { ExportDoc, Fix } from "../../src/lib/api/contract"
import type { Issue } from "../../src/lib/jira/types"

export interface IssueStore {
  /** Everything, as normalised contract JSON; null before any data arrives. */
  snapshot(): Promise<ExportDoc | null>
  /** Replace all the data (an ingest). */
  replace(doc: ExportDoc): Promise<void>
  /** Apply a successful Jira write to one issue, so it shows before the next Trawler run. False when there's no such issue. */
  patchIssue(key: string, patch: Partial<Issue>): Promise<boolean>
  /** Keep a record of a fix made through Resolve. */
  recordFix(fix: Fix): Promise<void>
  /** Fixes since a time, oldest first. */
  fixes(since: Date, limit?: number): Promise<Fix[]>
  /**
   * Calls `onChange` whenever the data may have changed, whoever changed it
   * (this server, an ingest, or another process writing to the database).
   * Resolves to a function that stops watching.
   */
  watch(onChange: () => void): Promise<() => void>
  /** Throws when the store can't be reached. */
  ping(): Promise<void>
  close(): Promise<void>
}

export const FIX_LIMIT = 500

/** For tests and DATA_STORE=memory: the same behaviour, no database. */
export function createMemoryIssueStore(initial: ExportDoc | null = null, opts: { failPing?: boolean } = {}): IssueStore {
  let doc: ExportDoc | null = initial && structuredClone(initial)
  const fixes: Fix[] = []
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((l) => l())

  return {
    async snapshot() {
      return doc && structuredClone(doc)
    },
    async replace(next) {
      doc = structuredClone(next)
      changed()
    },
    async patchIssue(key, patch) {
      const i = doc?.issues.findIndex((x) => x.key === key) ?? -1
      if (!doc || i < 0) return false
      doc.issues[i] = { ...doc.issues[i], ...structuredClone(patch), key }
      changed()
      return true
    },
    async recordFix(fix) {
      fixes.push(structuredClone(fix))
    },
    async fixes(since, limit = FIX_LIMIT) {
      return fixes.filter((f) => Date.parse(f.at) >= since.getTime()).slice(-limit)
    },
    async watch(onChange) {
      listeners.add(onChange)
      return () => void listeners.delete(onChange)
    },
    async ping() {
      if (opts.failPing) throw new Error("store unreachable")
    },
    async close() {
      listeners.clear()
    },
  }
}
