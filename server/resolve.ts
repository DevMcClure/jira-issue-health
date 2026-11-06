/**
 * Resolve: fill a ticket's missing fields in Jira, as the person, then reflect the
 * change here straight away (the next Trawler run confirms it).
 */
import { randomUUID } from "node:crypto"
import type { Fix, ResolveResult } from "../src/lib/api/contract"
import { checkResolve, recordWrite } from "../src/lib/api/resolve-check"
import { HEALTH_FIELD_FOR } from "../src/lib/api/contract"
import type { JiraClient } from "./jira/client"
import { JiraUnreachableError } from "./jira/client"
import type { ActiveSession } from "./jira/sessions"
import type { DatasetCache } from "./live"
import type { IssueStore } from "./store/issue-store"

type Deps = {
  store: IssueStore
  cache: DatasetCache
  jira: JiraClient
  /** Called after the data changed here, so every browser hears now rather than at the next poll. */
  onWritten: (fix: Fix) => Promise<void>
  now?: () => Date
}

export async function resolveIssue(key: string, body: unknown, session: ActiveSession, deps: Deps): Promise<ResolveResult> {
  const { store, cache, jira, onWritten, now = () => new Date() } = deps
  const current = await cache.get()
  const checked = checkResolve(key, body, current?.dataset ?? null)
  if (!checked.ok) return checked

  let outcome
  try {
    outcome = await jira.update(session.credentials, checked.issue, checked.update, current!.dataset)
  } catch (err) {
    if (err instanceof JiraUnreachableError) return { ok: false, code: "jira-unreachable", message: err.message, fieldErrors: {} }
    throw err
  }
  if (outcome.failure) return { ok: false, ...outcome.failure, fieldErrors: outcome.fieldErrors }
  if (outcome.written.length === 0) {
    return { ok: false, code: "rejected", message: "Jira didn't accept these values; nothing was changed.", fieldErrors: outcome.fieldErrors }
  }

  const { patch, fix } = recordWrite(checked, outcome.written, session.connection.user, now().toISOString(), randomUUID())
  await store.patchIssue(key, patch)
  await store.recordFix(fix)
  await onWritten(fix)
  return { ok: true, fix, written: outcome.written.map((f) => HEALTH_FIELD_FOR[f]), fieldErrors: outcome.fieldErrors }
}
