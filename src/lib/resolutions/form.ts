import { z } from "zod"
import { jiraUpdateSchema, UPDATE_FIELD_FOR, type FieldErrors, type JiraUpdate } from "../api/contract"
import type { Suggestion } from "../health/hints"
import type { Issue } from "../jira/types"
import type { ResolvableField } from "./types"

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
  /** A resolution name; Jira records the resolved date when it's set. */
  resolution: string
}

export const EMPTY_FORM: ResolveForm = {
  storyPoints: "",
  assigneeId: "",
  epicKey: "",
  sprintId: "",
  priority: "",
  labels: null,
  resolution: "",
}

export const STORY_POINT_PICKS = [1, 2, 3, 5, 8, 13] as const

export type FormErrors = FieldErrors

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
    .transform((s) => (s === "" ? undefined : Number(s))),
  priority: z.string().transform(optional),
  labels: z
    .array(z.string())
    .nullable()
    .transform((ls) => (ls === null ? undefined : [...new Set(ls.map((l) => l.trim()).filter(Boolean))]))
    .refine((ls) => !ls?.some((l) => /\s/.test(l)), "Labels can't contain spaces.")
    .transform((ls) => (ls?.length ? ls : undefined)),
  resolution: z.string().transform(optional),
})

type FormKey = keyof ResolveForm
const FORM_KEY: Record<ResolvableField, FormKey> = {
  storyPoints: "storyPoints",
  assigneeId: "assigneeId",
  epicKey: "epicKey",
  sprintIds: "sprintId",
  priority: "priority",
  labels: "labels",
  resolved: "resolution",
}
const FIELD_FOR_KEY = Object.fromEntries(Object.entries(FORM_KEY).map(([f, k]) => [k, f])) as Record<FormKey, ResolvableField>

type BuildInput = {
  issue: Issue
  /** The missing fields the dialog shows; anything else in the form is ignored. */
  fields: readonly ResolvableField[]
  form: ResolveForm
  suggestions?: Partial<Record<string, Suggestion>>
}

export type BuiltUpdate = { update: JiraUpdate; usedSuggestion: ResolvableField[] }

/** Validate the form and turn it into the update to send to Jira, or explain what's wrong per field. */
export function buildUpdate({ issue, fields, form, suggestions = {} }: BuildInput): ({ ok: true } & BuiltUpdate) | { ok: false; errors: FormErrors } {
  // Inputs for fields the dialog doesn't show are ignored, valid or not.
  const shown: ResolveForm = { ...EMPTY_FORM }
  for (const f of fields) Object.assign(shown, { [FORM_KEY[f]]: form[FORM_KEY[f]] })

  const parsed = formSchema.safeParse(shown)
  if (!parsed.success) {
    const errors: FormErrors = {}
    for (const err of parsed.error.issues) errors[FIELD_FOR_KEY[err.path[0] as FormKey]] ??= err.message
    return { ok: false, errors }
  }
  const data = parsed.data

  const candidate: JiraUpdate = {
    storyPoints: data.storyPoints,
    assigneeId: data.assigneeId,
    epicKey: data.epicKey,
    sprintId: data.sprintId,
    priority: data.priority,
    // Unchanged labels aren't a fix.
    labels: data.labels && !sameList(data.labels, issue.labels) ? data.labels : undefined,
    resolution: data.resolution,
  }
  const update: JiraUpdate = {}
  for (const field of fields) {
    const key = UPDATE_FIELD_FOR[field]
    if (candidate[key] !== undefined) Object.assign(update, { [key]: candidate[key] })
  }
  if (Object.keys(update).length === 0) return { ok: false, errors: { form: "Fill in at least one field." } }

  // The same rules the server applies, so problems show before anything is sent.
  const checked = jiraUpdateSchema.safeParse(update)
  if (!checked.success) {
    const errors: FormErrors = {}
    for (const err of checked.error.issues) {
      const field = fields.find((f) => UPDATE_FIELD_FOR[f] === err.path[0])
      errors[field ?? "form"] ??= err.message
    }
    return { ok: false, errors }
  }

  const usedSuggestion = fields.filter((field) => {
    const s = suggestions[field]
    const value = update[UPDATE_FIELD_FOR[field]]
    if (!s || value === undefined) return false
    if (s.field === "assigneeId") return [s.value, ...s.alternatives].includes(value as string)
    return JSON.stringify(s.value) === JSON.stringify(value)
  })

  return { ok: true, update: checked.data, usedSuggestion }
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
