import { updateFields, type JiraUpdate, type UpdateField } from "../api/contract"
import type { JiraDataset } from "../jira/types"

export const UPDATE_LABEL: Record<UpdateField, string> = {
  storyPoints: "Story points",
  assigneeId: "Assignee",
  epicKey: "Epic",
  sprintId: "Sprint",
  priority: "Priority",
  labels: "Labels",
  resolution: "Resolution",
}

/** "Story points → 3", "Assignee → Sofia Lindqvist", … for each value sent. */
export function describeUpdate(update: JiraUpdate, dataset: Pick<JiraDataset, "personById" | "sprintById">): string[] {
  return updateFields(update).map((field) => {
    let text: string
    switch (field) {
      case "storyPoints":
        text = `${update.storyPoints} ${update.storyPoints === 1 ? "pt" : "pts"}`
        break
      case "assigneeId":
        text = dataset.personById.get(update.assigneeId!)?.displayName ?? update.assigneeId!
        break
      case "sprintId":
        text = dataset.sprintById.get(update.sprintId!)?.name ?? String(update.sprintId)
        break
      case "labels":
        text = update.labels!.join(", ")
        break
      default:
        text = String(update[field])
    }
    return `${UPDATE_LABEL[field]} → ${text}`
  })
}
