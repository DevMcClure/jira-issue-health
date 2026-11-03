import { z } from "zod"
import type { Suggestion } from "../health/hints"
import type { Issue } from "../jira/types"
import type { Resolution, ResolutionValues, ResolvableField } from "./types"

/** The Resolve dialog's raw inputs. Empty string = not filled in. */
export type ResolveForm = {
  storyPoints: string
  assigneeId: string
  epicKey: string
  /** A sprint id as text. */
  sprintId: string
  priority: string
  /** The full label list; null until the user changes it. */
  labels: string[] | null
  /** A calendar day, yyyy-MM-dd. */
  resolved: string
}

export const EMPTY_FORM: ResolveForm = {
  storyPoints: "",
  assigneeId: "",
  epicKey: "",
  sprintId: "",
  priority: "",
  labels: null,
  resolved: "",
}

export const STORY_POINT_PICKS = [1, 2, 3, 5, 8, 13] as const

export type FormErrors = Partial<Record<ResolvableField | "form", string>>

const optional = (s: string) => s.trim() || undefined

const formSchema = z.object({
  storyPoints: z
    .string()
    .trim()
    .refine((s) => s === "" || (/^\d+(\.\d+)?$/.test(s) && Number(s) <= 100), "Story points must be a number from 0 to 100.")
    .transform((s) => (s === "" ? undefined : Number(s))),
  assigneeId: z.string().transform(optional),
  epicKey: z.string().transform(optional),
  sprintId: z
    .string()
    .refine((s) => s === "" || /^\d+$/.test(s), "Pick a sprint.")
    .transform((s) => (s === "" ? undefined : [Number(s)])),
  priority: z.string().transform(optional),
  labels: z
    .array(z.string())
    .nullable()
    .transform((ls) => (ls === null ? undefined : [...new Set(ls.map((l) => l.trim()).filter(Boolean))]))
    .transform((ls) => (ls?.length ? ls : undefined)),
  resolved: z
    .string()
    .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), "Pick a valid date.")
    // Midday UTC, so the day reads the same in every time zone near Europe.
    .transform((s) => (s === "" ? undefined : `${s}T12:00:00Z`)),
})

type BuildInput = {
  issue: Issue
  /** The missing fields the dialog shows; anything else in the form is ignored. */
  fields: readonly ResolvableField[]
  form: ResolveForm
  suggestions?: Partial<Record<string, Suggestion>>
  now?: Date
}

/** Validate the form and turn it into a `Resolution`, or explain what's wrong per field. */
export function buildResolution({ issue, fields, form, suggestions = {}, now = new Date() }: BuildInput):
  | { ok: true; resolution: Resolution }
  | { ok: false; errors: FormErrors } {
  // Inputs for fields the dialog doesn't show are ignored, valid or not.
  const shown: ResolveForm = { ...EMPTY_FORM }
  const formKey = (f: ResolvableField) => (f === "sprintIds" ? "sprintId" : f)
  for (const f of fields) Object.assign(shown, { [formKey(f)]: form[formKey(f)] })

  const parsed = formSchema.safeParse(shown)
  if (!parsed.success) {
    const errors: FormErrors = {}
    for (const err of parsed.error.issues) {
      const key = err.path[0] === "sprintId" ? "sprintIds" : (err.path[0] as ResolvableField)
      errors[key] ??= err.message
    }
    return { ok: false, errors }
  }
  const data = parsed.data

  const candidate: ResolutionValues = {
    storyPoints: data.storyPoints,
    assigneeId: data.assigneeId,
    epicKey: data.epicKey,
    sprintIds: data.sprintId,
    priority: data.priority,
    // Unchanged labels aren't a fix.
    labels: data.labels && !sameList(data.labels, issue.labels) ? data.labels : undefined,
    resolved: data.resolved,
  }
  const values: ResolutionValues = {}
  for (const field of fields) {
    const v = candidate[field]
    if (v !== undefined) Object.assign(values, { [field]: v })
  }

  if (values.resolved && values.resolved.slice(0, 10) < issue.created.slice(0, 10)) {
    return { ok: false, errors: { resolved: "The resolved date can't be before the ticket was created." } }
  }
  if (Object.keys(values).length === 0) return { ok: false, errors: { form: "Fill in at least one field to save." } }

  const usedSuggestion = (Object.keys(values) as ResolvableField[]).filter((field) => {
    const s = suggestions[field]
    if (!s) return false
    if (s.field === "assigneeId") return [s.value, ...s.alternatives].includes(values.assigneeId!)
    return JSON.stringify(s.value) === JSON.stringify(values[field])
  })

  return {
    ok: true,
    resolution: { issueKey: issue.key, values, resolvedAt: now.toISOString(), source: "local-mock", usedSuggestion },
  }
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
