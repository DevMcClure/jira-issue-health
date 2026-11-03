import { format } from "date-fns"
import type { JiraDataset } from "../jira/types"
import type { ResolutionValues, ResolvableField } from "./types"

export const FIELD_LABEL: Record<ResolvableField, string> = {
  storyPoints: "Story points",
  assigneeId: "Assignee",
  epicKey: "Epic",
  sprintIds: "Sprint",
  priority: "Priority",
  labels: "Labels",
  resolved: "Resolved date",
}

/** "Story points → 3", "Assignee → Sofia Lindqvist", … for each value entered. */
export function describeValues(values: ResolutionValues, dataset: Pick<JiraDataset, "personById" | "sprintById">): string[] {
  return (Object.keys(values) as ResolvableField[]).map((field) => {
    const v = values[field]
    let text: string
    switch (field) {
      case "storyPoints":
        text = `${v} ${v === 1 ? "pt" : "pts"}`
        break
      case "assigneeId":
        text = dataset.personById.get(v as string)?.displayName ?? String(v)
        break
      case "sprintIds":
        text = (v as number[]).map((id) => dataset.sprintById.get(id)?.name ?? String(id)).join(", ")
        break
      case "labels":
        text = (v as string[]).join(", ")
        break
      case "resolved":
        text = format(new Date(v as string), "d MMM yyyy")
        break
      default:
        text = String(v)
    }
    return `${FIELD_LABEL[field]} → ${text}`
  })
}
