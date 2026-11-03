import type { StatusCategory } from "./types"

/** Status colours, as in the Jira Dashboard: known workflow statuses by name, others by category. */
const STATUS_COLOR_VAR: Record<string, string> = {
  "To Do": "--status-todo",
  "In Progress": "--status-progress",
  "In Review": "--status-review",
  Blocked: "--status-blocked",
  QA: "--status-qa",
  Done: "--status-done",
}

const CATEGORY_COLOR_VAR: Record<StatusCategory, string> = {
  todo: "--status-todo",
  inProgress: "--status-progress",
  done: "--status-done",
}

export function statusColorVar(status: string, category: StatusCategory): string {
  return STATUS_COLOR_VAR[status] ?? CATEGORY_COLOR_VAR[category]
}
