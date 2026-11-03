import { format, isSameDay } from "date-fns"
import type { DataOrigin } from "./data-source"

/** The sidebar's data line, in the Jira Dashboard's style: "Data: sample · trawled 08:15" (with the date when it isn't today). */
export function dataLineLabel(origin: DataOrigin, generatedAt: string, now: Date = new Date()): string {
  const name = origin.kind === "sample" ? "sample" : origin.fileName
  const at = new Date(generatedAt)
  return `Data: ${name} · trawled ${format(at, isSameDay(at, now) ? "HH:mm" : "d MMM, HH:mm")}`
}
