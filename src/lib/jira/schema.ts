import { z } from "zod"

/**
 * Zod schemas for the Jira Trawler export (version "1.0"), the same contract the
 * Jira Dashboard reads.
 *
 * Strict only where the app can't work without a value (issue key, summary,
 * status, status category, created). Every field a required-field check looks
 * at is lenient: `null`, `""`, `[]` and an absent key all pass validation and
 * the adapter turns them into "missing". Objects are loose so extra Trawler
 * fields pass through.
 */

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid ISO date" })
/** An optional date; "" (or whitespace) counts as missing rather than invalid. */
const optionalIsoDate = z.union([z.string().regex(/^\s*$/), isoDate]).nullable().optional()
const optionalString = z.string().nullable().optional()
const optionalStringList = z.array(z.string()).nullable().optional()

/**
 * Jira's own category keys ("new", "indeterminate", "done") and the Jira
 * Dashboard's ("todo", "in_progress", "done"), in any case.
 */
const STATUS_CATEGORY_ALIASES: Record<string, "todo" | "inProgress" | "done"> = {
  todo: "todo",
  "to do": "todo",
  to_do: "todo",
  new: "todo",
  indeterminate: "inProgress",
  inprogress: "inProgress",
  in_progress: "inProgress",
  "in progress": "inProgress",
  done: "done",
}

export const statusCategorySchema = z.string().transform((value, ctx) => {
  const category = STATUS_CATEGORY_ALIASES[value.trim().toLowerCase()]
  if (!category) {
    ctx.addIssue({
      code: "custom",
      message: `Unknown status category "${value}" (expected todo/new, indeterminate or done)`,
    })
    return z.NEVER
  }
  return category
})

export const sprintStateSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.enum(["future", "active", "closed"]))

/** Changelog values can be names, ids or numbers depending on the field. */
const changelogValue = z.union([z.string(), z.number()]).nullable().optional()

export const changelogEntrySchema = z.looseObject({
  at: isoDate,
  authorId: optionalString,
  field: z.string(),
  from: changelogValue,
  to: changelogValue,
})

export const issueSchema = z.looseObject({
  key: z.string().min(1),
  summary: z.string(),
  type: optionalString,
  status: z.string().min(1),
  statusCategory: statusCategorySchema,
  priority: optionalString,
  assigneeId: optionalString,
  teamId: optionalString,
  sprintIds: z.array(z.number()).nullable().optional(),
  storyPoints: z.number().nullable().optional(),
  labels: optionalStringList,
  epicKey: optionalString,
  /** Sub-tasks: the issue they belong to. */
  parentKey: optionalString,
  created: isoDate,
  resolved: optionalIsoDate,
  changelog: z.array(changelogEntrySchema).nullable().optional(),
})

export const sprintSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  teamId: optionalString,
  state: sprintStateSchema,
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  completeDate: optionalIsoDate,
})

export const personSchema = z.looseObject({
  id: z.string().min(1),
  displayName: z.string(),
})

export const teamSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string(),
  projectKey: optionalString,
  memberIds: optionalStringList,
})

export const metaSchema = z.looseObject({
  source: optionalString,
  version: optionalString,
  generatedAt: optionalIsoDate,
  jiraBaseUrl: optionalString,
})

export const exportSchema = z.looseObject({
  meta: metaSchema.nullable().optional(),
  teams: z.array(teamSchema).nullable().optional(),
  people: z.array(personSchema).nullable().optional(),
  sprints: z.array(sprintSchema).nullable().optional(),
  issues: z.array(issueSchema),
})

/** The export as written to disk (before transforms), e.g. by the mock generator. */
export type RawExportInput = z.input<typeof exportSchema>
export type RawExport = z.output<typeof exportSchema>
export type RawIssue = z.output<typeof issueSchema>
