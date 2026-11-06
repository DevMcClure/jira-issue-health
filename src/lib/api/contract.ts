/**
 * The API between the web app and the Jira Health server: request and response
 * shapes, shared by both sides (and by the in-browser demo server). Pure: no
 * React, no Node, so it can move into the Jira Dashboard's `packages/core` later.
 */
import { z } from "zod"
import type { Issue, JiraDataset, Meta, Person, Sprint, Team } from "../jira/types"
import type { ResolvableField } from "../resolutions/types"

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid ISO date" })

// ---------------------------------------------------------------------------
// Jira users and connections
// ---------------------------------------------------------------------------

/** A Jira user as Jira reports itself: account id (Cloud) or user name (Data Center). */
export const jiraUserSchema = z.object({ id: z.string().min(1), displayName: z.string() })
export type JiraUser = z.infer<typeof jiraUserSchema>

/**
 * How a person connects their own Jira account. The token goes to the server once,
 * is checked against Jira, and is kept encrypted there; the browser never stores it.
 * - pat: a Data Center / Server Personal Access Token (Bearer).
 * - basic: a Jira Cloud email + API token.
 * - demo: the in-browser demo only; nothing real.
 */
export const connectRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pat"), token: z.string().trim().min(8, "Paste your personal access token.").max(4096) }),
  z.object({
    kind: z.literal("basic"),
    email: z.email("Enter the email you sign in to Jira with."),
    token: z.string().trim().min(8, "Paste your API token.").max(4096),
  }),
  z.object({ kind: z.literal("demo") }),
])
export type ConnectRequest = z.infer<typeof connectRequestSchema>
export type AuthKind = ConnectRequest["kind"]

export type JiraConnection = {
  user: JiraUser
  authKind: AuthKind
  /** ISO timestamp. */
  connectedAt: string
}

// ---------------------------------------------------------------------------
// Updates sent to Jira
// ---------------------------------------------------------------------------

/** Jira's default priorities; a site can have others, which come from the data. */
export const JIRA_PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"] as const

const label = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^\S+$/, "Labels can't contain spaces.")

/**
 * What Resolve asks Jira to change: one key per missing field.
 * `labels` is the full list wanted; the server sends Jira only the additions and removals,
 * so labels someone else added in the meantime are kept.
 * `resolution` is a resolution name: Jira records the resolved date itself when it's set.
 */
export const jiraUpdateSchema = z
  .object({
    storyPoints: z.number().min(0, "Story points can't be negative.").max(100, "Story points must be 100 or fewer."),
    assigneeId: z.string().trim().min(1),
    epicKey: z.string().trim().min(1),
    sprintId: z.number().int().positive(),
    priority: z.string().trim().min(1),
    labels: z.array(label).min(1).max(50),
    resolution: z.string().trim().min(1),
  })
  .partial()
  .strict()
export type JiraUpdate = z.infer<typeof jiraUpdateSchema>
export type UpdateField = keyof JiraUpdate

/** The Jira field each missing field is fixed through. */
export const UPDATE_FIELD_FOR = {
  storyPoints: "storyPoints",
  assigneeId: "assigneeId",
  epicKey: "epicKey",
  sprintIds: "sprintId",
  priority: "priority",
  labels: "labels",
  resolved: "resolution",
} as const satisfies Record<ResolvableField, UpdateField>

/** The missing field an update field fixes. */
export const HEALTH_FIELD_FOR = Object.fromEntries(
  Object.entries(UPDATE_FIELD_FOR).map(([health, update]) => [update, health]),
) as Record<UpdateField, ResolvableField>

export const updateFields = (u: JiraUpdate) => (Object.keys(u) as UpdateField[]).filter((f) => u[f] !== undefined)

export const resolveRequestSchema = z.object({
  update: jiraUpdateSchema.refine((u) => updateFields(u).length > 0, { message: "Fill in at least one field." }),
  /** Fields where the suggested value was used (for the record only). */
  usedSuggestion: z.array(z.string().max(32)).max(10).default([]),
})
export type ResolveRequest = z.input<typeof resolveRequestSchema>

/**
 * How a successful update changes the issue in this app's model, so the list
 * reflects it before the next Trawler run. `at` is when Jira recorded it.
 */
export function issuePatch(issue: Issue, update: JiraUpdate, at: string): Partial<Issue> {
  const patch: Partial<Issue> = {}
  if (update.storyPoints !== undefined) patch.storyPoints = update.storyPoints
  if (update.assigneeId !== undefined) patch.assigneeId = update.assigneeId
  if (update.epicKey !== undefined) patch.epicKey = update.epicKey
  if (update.sprintId !== undefined && !issue.sprintIds.includes(update.sprintId)) patch.sprintIds = [...issue.sprintIds, update.sprintId]
  if (update.priority !== undefined) patch.priority = update.priority
  if (update.labels !== undefined) patch.labels = update.labels
  if (update.resolution !== undefined && !issue.resolved) patch.resolved = at
  return patch
}

/** Labels to add and remove to get from `current` to `wanted`. */
export function labelChanges(current: readonly string[], wanted: readonly string[]): { add: string[]; remove: string[] } {
  return {
    add: wanted.filter((l) => !current.includes(l)),
    remove: current.filter((l) => !wanted.includes(l)),
  }
}

// ---------------------------------------------------------------------------
// Fixes and results
// ---------------------------------------------------------------------------

/** A change that fixed missing fields: made with Resolve here ("app"), or seen arriving from Jira ("jira"). */
export const fixSchema = z.object({
  id: z.string().min(1),
  issueKey: z.string().min(1),
  update: jiraUpdateSchema,
  by: jiraUserSchema,
  at: isoDate,
  via: z.enum(["app", "jira"]),
  usedSuggestion: z.array(z.string()),
})
export type Fix = z.infer<typeof fixSchema>

/** Messages per missing field (as the dialog shows them), plus "form" for the rest. */
export type FieldErrors = Partial<Record<ResolvableField | "form", string>>

export type ResolveFailureCode =
  /** No Jira connection, or Jira no longer accepts the token. */
  | "not-connected"
  /** Jira refused the values (see fieldErrors). */
  | "rejected"
  /** Someone filled a field in after the dialog opened. */
  | "conflict"
  | "not-found"
  | "forbidden"
  | "jira-unreachable"
  | "invalid"

export type ResolveResult =
  | {
      ok: true
      fix: Fix
      /** Fields Jira accepted. */
      written: ResolvableField[]
      /** Fields Jira refused while others went through. */
      fieldErrors: FieldErrors
    }
  | { ok: false; code: ResolveFailureCode; message: string; fieldErrors: FieldErrors }

// ---------------------------------------------------------------------------
// Server config and live events
// ---------------------------------------------------------------------------

export type ServerConfig = {
  /** "demo" is the in-browser stand-in used on GitHub Pages. */
  mode: "api" | "demo"
  version: string
  /** "connected": the data is only readable once connected to Jira. */
  dataAccess: "open" | "connected"
  jira: {
    /** "rest": a real Jira. "mock": the server's built-in mock Jira. */
    writer: "rest" | "mock"
    flavour: "datacenter" | "cloud"
    baseUrl: string | null
    /** Ways people can connect. */
    authKinds: AuthKind[]
    /** Where people create a token, when known. */
    tokenHelpUrl: string | null
    /** Resolution names offered for a missing resolved date. */
    resolutions: string[]
  }
}

/** Server-sent events on GET /api/events. */
export type LiveEvent =
  /** On connect, and whenever the data changes: refetch when the revision differs. */
  | { type: "dataset"; revision: string }
  | { type: "fix"; fix: Fix }

// ---------------------------------------------------------------------------
// The dataset over the wire
// ---------------------------------------------------------------------------

/** The normalised contract JSON the server serves and stores: `parseExport` reads it back unchanged. */
export type ExportDoc = {
  meta: Meta
  teams: Team[]
  people: Person[]
  sprints: Sprint[]
  issues: Issue[]
}

/** A parsed dataset back to contract JSON (the shapes already match). */
export const toExportDoc = (d: Pick<JiraDataset, "meta" | "teams" | "people" | "sprints" | "issues">): ExportDoc => ({
  meta: d.meta,
  teams: d.teams,
  people: d.people,
  sprints: d.sprints,
  issues: d.issues,
})
