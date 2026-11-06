/**
 * The checks every Resolve goes through before anything is sent to Jira, shared
 * by the server and the in-browser demo: a well-formed request, a known issue, and
 * no field filled in by someone else since the dialog opened.
 */
import type { Issue, JiraDataset } from "../jira/types"
import { updateConflicts } from "./conflicts"
import { HEALTH_FIELD_FOR, issuePatch, resolveRequestSchema, type Fix, type JiraUpdate, type JiraUser, type ResolveResult, type UpdateField } from "./contract"

type Ctx = Pick<JiraDataset, "byKey" | "personById" | "sprintById">

export type Checked =
  | { ok: true; issue: Issue; update: JiraUpdate; usedSuggestion: string[] }
  | Extract<ResolveResult, { ok: false }>

export function checkResolve(key: string, body: unknown, ctx: Ctx | null): Checked {
  const parsed = resolveRequestSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: parsed.error.issues.map((i) => i.message).join(" "), fieldErrors: {} }
  }
  const issue = ctx?.byKey.get(key)
  if (!ctx || !issue) return { ok: false, code: "not-found", message: `${key} isn't in the current data.`, fieldErrors: {} }

  const conflicts = updateConflicts(issue, parsed.data.update, ctx)
  if (Object.keys(conflicts).length) {
    return { ok: false, code: "conflict", message: "Someone filled this in since you opened it. The list has been refreshed.", fieldErrors: conflicts }
  }
  return { ok: true, issue, update: parsed.data.update, usedSuggestion: parsed.data.usedSuggestion }
}

/** After Jira accepted some fields: what changed on the issue, and the record of who fixed it. */
export function recordWrite(
  checked: Extract<Checked, { ok: true }>,
  written: UpdateField[],
  by: JiraUser,
  at: string,
  id: string,
): { patch: Partial<Issue>; fix: Fix } {
  const update: JiraUpdate = {}
  for (const f of written) Object.assign(update, { [f]: checked.update[f] })
  const writtenFields: string[] = written.map((f) => HEALTH_FIELD_FOR[f])
  return {
    patch: issuePatch(checked.issue, update, at),
    fix: {
      id,
      issueKey: checked.issue.key,
      update,
      by,
      at,
      via: "app",
      usedSuggestion: checked.usedSuggestion.filter((f) => writtenFields.includes(f)),
    },
  }
}
