import { z } from "zod"
import type { Issue } from "../jira/types"

/** Fields the Resolve dialog can fill in. Team isn't one: it's set in Jira. */
export const RESOLVABLE_FIELDS = ["storyPoints", "assigneeId", "epicKey", "sprintIds", "priority", "labels", "resolved"] as const
export type ResolvableField = (typeof RESOLVABLE_FIELDS)[number]

export type ResolutionValues = Partial<Pick<Issue, ResolvableField>>

/** Values a user entered for one ticket, saved in this browser only. A future Jira sink would send the same objects. */
export interface Resolution {
  issueKey: string
  values: ResolutionValues
  /** ISO timestamp. */
  resolvedAt: string
  source: "local-mock"
  /** Fields where the suggested value was accepted. */
  usedSuggestion: string[]
}

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid ISO date" })

/** Validates resolutions read back from storage. */
export const resolutionSchema = z.object({
  issueKey: z.string().min(1),
  values: z
    .object({
      storyPoints: z.number().min(0),
      assigneeId: z.string().min(1),
      epicKey: z.string().min(1),
      sprintIds: z.array(z.number()).min(1),
      priority: z.string().min(1),
      labels: z.array(z.string().min(1)).min(1),
      resolved: isoDate,
    })
    .partial(),
  resolvedAt: isoDate,
  source: z.literal("local-mock"),
  usedSuggestion: z.array(z.string()),
}) satisfies z.ZodType<Resolution>

export const resolutionListSchema = z.array(resolutionSchema)
