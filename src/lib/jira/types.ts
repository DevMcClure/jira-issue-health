/**
 * Domain model: what the rest of the app sees. Produced only by `adapter.ts`.
 *
 * Missing values are normalised: a missing scalar is `null` and a missing list
 * is `[]`, whatever the export had (`null`, `""`, `[]` or no key). Dates stay
 * ISO strings so issues can be overlaid and stored as plain JSON.
 */

export type StatusCategory = "todo" | "inProgress" | "done"
export type SprintState = "future" | "active" | "closed"

/** The issue types the required-field rules know about. Other types pass through as plain strings. */
/** Flow types first; the order is the settings panel's column order. */
export const ISSUE_TYPES = [
  "flow-value",
  "flow-quality",
  "flow-defect",
  "flow-accelerator",
  "Spike",
  "Epic",
  "Sub-task",
] as const
export type IssueType = (typeof ISSUE_TYPES)[number]

export type Meta = {
  source: string | null
  version: string | null
  /** When the Trawler ran. Falls back to the newest date in the data. */
  generatedAt: string
  /** Without a trailing slash; null when the export doesn't say. */
  jiraBaseUrl: string | null
}

export type Team = {
  id: string
  name: string
  projectKey: string | null
  memberIds: string[]
}

export type Person = {
  id: string
  displayName: string
}

export type Sprint = {
  id: number
  name: string
  teamId: string | null
  state: SprintState
  startDate: string | null
  endDate: string | null
  completeDate: string | null
}

/** Known fields: "status" | "assignee" | "sprint" | "storyPoints" | "priority" | "epic" | "labels". */
export type ChangelogEntry = {
  at: string
  authorId: string | null
  field: string
  from: string | null
  to: string | null
}

export type Issue = {
  key: string
  summary: string
  type: string
  status: string
  statusCategory: StatusCategory
  priority: string | null
  assigneeId: string | null
  teamId: string | null
  sprintIds: number[]
  storyPoints: number | null
  labels: string[]
  epicKey: string | null
  parentKey: string | null
  created: string
  resolved: string | null
  /** Sorted ascending by `at`. */
  changelog: ChangelogEntry[]
}

export type JiraDataset = {
  meta: Meta
  teams: Team[]
  people: Person[]
  /** Sorted by start date (undated last). */
  sprints: Sprint[]
  issues: Issue[]
  /** Issues of type "Epic". */
  epics: Issue[]
  byKey: Map<string, Issue>
  personById: Map<string, Person>
  sprintById: Map<number, Sprint>
  teamById: Map<string, Team>
}
