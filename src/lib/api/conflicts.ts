/**
 * Before writing to Jira: was a field filled in since the dialog opened (by
 * someone in Jira, or another tab)? Then don't overwrite it; say what it is now.
 */
import { DEFAULT_REQUIRED_FIELDS, isFieldPresent } from "../health/requiredFields"
import type { Issue, JiraDataset } from "../jira/types"
import { HEALTH_FIELD_FOR, updateFields, type FieldErrors, type JiraUpdate } from "./contract"

type Ctx = Pick<JiraDataset, "personById" | "sprintById">

/** What the field is set to now, for the message. */
function currentValue(issue: Issue, field: keyof Issue, ctx: Ctx): string {
  switch (field) {
    case "assigneeId":
      return ctx.personById.get(issue.assigneeId!)?.displayName ?? issue.assigneeId!
    case "sprintIds":
      return issue.sprintIds.map((id) => ctx.sprintById.get(id)?.name ?? String(id)).join(", ")
    case "labels":
      return issue.labels.join(", ")
    case "resolved":
      return issue.resolved!.slice(0, 10)
    case "storyPoints":
      return `${issue.storyPoints} ${issue.storyPoints === 1 ? "point" : "points"}`
    default:
      return String(issue[field])
  }
}

/** Per field: why it won't be written because it's no longer missing. Empty when there's no conflict. */
export function updateConflicts(issue: Issue, update: JiraUpdate, ctx: Ctx): FieldErrors {
  const errors: FieldErrors = {}
  for (const f of updateFields(update)) {
    const field = HEALTH_FIELD_FOR[f]
    const rule = DEFAULT_REQUIRED_FIELDS.find((r) => r.field === field)
    if (rule && isFieldPresent(rule, issue)) {
      errors[field] = `Already set in Jira (${currentValue(issue, field, ctx)}) since you opened this. Nothing was changed.`
    }
  }
  return errors
}
