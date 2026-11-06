/**
 * A stand-in for Jira's edit rules, used by the server's mock Jira (JIRA_MODE=mock)
 * and the in-browser demo, so both refuse what a real Jira would and the dialog's
 * error handling can be tried without one. It checks references only; it doesn't
 * invent rules Jira doesn't have.
 */
import type { Issue, JiraDataset } from "../jira/types"
import { HEALTH_FIELD_FOR, JIRA_PRIORITIES, updateFields, type FieldErrors, type JiraUpdate } from "./contract"

export const DEFAULT_RESOLUTIONS = ["Done", "Won't Do", "Duplicate", "Cannot Reproduce"]

type Ctx = Pick<JiraDataset, "byKey" | "personById" | "sprintById" | "issues">

/** Jira's own messages for the values it would refuse; empty when Jira would accept the update. */
export function mockJiraErrors(issue: Issue, update: JiraUpdate, ctx: Ctx, resolutions: readonly string[] = DEFAULT_RESOLUTIONS): FieldErrors {
  const errors: FieldErrors = {}
  const priorities = new Set<string>([...JIRA_PRIORITIES, ...ctx.issues.map((i) => i.priority).filter((p): p is string => !!p)])

  for (const field of updateFields(update)) {
    const at = HEALTH_FIELD_FOR[field]
    switch (field) {
      case "assigneeId":
        if (!ctx.personById.has(update.assigneeId!)) errors[at] = `User '${update.assigneeId}' does not exist.`
        break
      case "epicKey": {
        const epic = ctx.byKey.get(update.epicKey!)
        if (!epic) errors[at] = `Issue '${update.epicKey}' does not exist or you do not have permission to see it.`
        else if (epic.type !== "Epic") errors[at] = `'${update.epicKey}' is not an epic.`
        else if (epic.key === issue.key) errors[at] = "An issue can't be its own epic."
        break
      }
      case "sprintId": {
        const sprint = ctx.sprintById.get(update.sprintId!)
        if (!sprint) errors[at] = `Sprint with id ${update.sprintId} does not exist.`
        else if (sprint.state === "closed") errors[at] = "Issues can't be moved to a closed sprint."
        break
      }
      case "priority":
        if (!priorities.has(update.priority!)) errors[at] = `Priority name '${update.priority}' is not valid.`
        break
      case "resolution":
        if (!resolutions.includes(update.resolution!)) errors[at] = `Resolution '${update.resolution}' is not valid.`
        else if (issue.statusCategory !== "done") errors[at] = "Resolution can only be set on a done ticket."
        break
      case "storyPoints":
      case "labels":
        break
    }
  }
  return errors
}
