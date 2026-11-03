/**
 * The only place that knows the raw export shape: Trawler JSON in, `JiraDataset` out.
 * If the Trawler's output changes, change this file and `schema.ts`; nothing else should need to.
 */
import { exportSchema, type RawExport, type RawIssue } from "./schema"
import {
  isTrawlerLog,
  isTrawlerShape,
  normaliseTrawlerInput,
  parseTrawlerLog,
  trawlerExportSchema,
  trawlerToContract,
} from "./trawler"
import type { ChangelogEntry, Issue, JiraDataset, Meta, Person, Sprint, Team } from "./types"

export class JiraExportError extends Error {
  /** Every validation problem as "path: message". */
  readonly problems: string[]

  constructor(problems: string[]) {
    const shown = problems.slice(0, 5)
    const more = problems.length > shown.length ? `\n…and ${problems.length - shown.length} more` : ""
    super(`Invalid Jira export:\n${shown.join("\n")}${more}`)
    this.name = "JiraExportError"
    this.problems = problems
  }
}

/** `null`, `undefined`, `""` and whitespace all count as missing. */
export const presentString = (v: string | null | undefined): string | null => {
  const s = v?.trim()
  return s ? s : null
}

const presentList = <T>(v: T[] | null | undefined): T[] => v ?? []

const changeValue = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : presentString(String(v))

const problemList = (issues: { path: PropertyKey[]; message: string }[]) =>
  issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)

/**
 * Validate and normalise a parsed export: the contract shape, or raw Trawler
 * output (converted first, as in the Jira Dashboard). Throws `JiraExportError` listing every problem.
 */
export function parseExport(raw: unknown): JiraDataset {
  if (isTrawlerShape(raw)) {
    const trawler = trawlerExportSchema.safeParse(normaliseTrawlerInput(raw))
    if (!trawler.success) throw new JiraExportError(problemList(trawler.error.issues))
    raw = trawlerToContract(trawler.data)
  }
  const result = exportSchema.safeParse(raw)
  if (!result.success) throw new JiraExportError(problemList(result.error.issues))
  return buildDataset(result.data)
}

/**
 * File contents in, dataset out: JSON (either shape) or a Trawler audit log.
 * Throws `SyntaxError` for invalid JSON, `JiraExportError` for the wrong shape.
 */
export function parseExportText(text: string): JiraDataset {
  if (isTrawlerLog(text)) return parseExport(parseTrawlerLog(text))
  return parseExport(JSON.parse(text))
}

/** The ticket's page in Jira, or null when the export has no base URL. */
export function jiraIssueUrl(meta: Pick<Meta, "jiraBaseUrl">, key: string): string | null {
  return meta.jiraBaseUrl ? `${meta.jiraBaseUrl}/browse/${encodeURIComponent(key)}` : null
}

function buildDataset(data: RawExport): JiraDataset {
  const issues = data.issues.map(toIssue)
  inferEpicsFromParents(issues)
  const people = (data.people ?? []).map((p): Person => ({ id: p.id, displayName: p.displayName }))
  const teams = (data.teams ?? []).map(
    (t): Team => ({
      id: t.id,
      name: t.name,
      projectKey: presentString(t.projectKey),
      memberIds: presentList(t.memberIds),
    }),
  )
  const sprints = (data.sprints ?? [])
    .map(
      (s): Sprint => ({
        id: s.id,
        name: s.name,
        teamId: presentString(s.teamId),
        state: s.state,
        startDate: presentString(s.startDate),
        endDate: presentString(s.endDate),
        completeDate: presentString(s.completeDate),
      }),
    )
    .sort((a, b) => time(a.startDate) - time(b.startDate))

  synthesiseMissingPeople(people, teams, issues)

  return {
    meta: toMeta(data, issues),
    teams,
    people,
    sprints,
    issues,
    epics: issues.filter((i) => i.type === "Epic"),
    byKey: new Map(issues.map((i) => [i.key, i])),
    personById: new Map(people.map((p) => [p.id, p])),
    sprintById: new Map(sprints.map((s) => [s.id, s])),
    teamById: new Map(teams.map((t) => [t.id, t])),
  }
}

/**
 * Jira Cloud links a Story, Task or Bug to its epic as its parent, and raw Trawler
 * output has no `epicKey`. So a non-Sub-task whose parent isn't known to be
 * something other than an Epic takes that parent as its epic.
 */
function inferEpicsFromParents(issues: Issue[]) {
  const typeOf = new Map(issues.map((i) => [i.key, i.type]))
  for (const issue of issues) {
    if (issue.epicKey || !issue.parentKey || issue.type === "Sub-task" || issue.type === "Epic") continue
    const parentType = typeOf.get(issue.parentKey)
    if (parentType === undefined || parentType === "Epic") issue.epicKey = issue.parentKey
  }
}

const time = (iso: string | null) => (iso ? Date.parse(iso) : Infinity)

function toIssue(r: RawIssue): Issue {
  const changelog: ChangelogEntry[] = (r.changelog ?? [])
    .map((c) => ({
      at: c.at,
      authorId: presentString(c.authorId),
      field: c.field,
      from: changeValue(c.from),
      to: changeValue(c.to),
    }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  return {
    key: r.key,
    summary: r.summary,
    type: presentString(r.type) ?? "Task",
    status: r.status,
    statusCategory: r.statusCategory,
    priority: presentString(r.priority),
    assigneeId: presentString(r.assigneeId),
    teamId: presentString(r.teamId),
    sprintIds: presentList(r.sprintIds),
    storyPoints: r.storyPoints ?? null,
    labels: presentList(r.labels)
      .map((l) => l.trim())
      .filter(Boolean),
    epicKey: presentString(r.epicKey),
    parentKey: presentString(r.parentKey),
    created: r.created,
    resolved: presentString(r.resolved),
    changelog,
  }
}

/** Any person id referenced but not defined becomes "Unknown (<id>)", so names always resolve. */
function synthesiseMissingPeople(people: Person[], teams: Team[], issues: Issue[]) {
  const known = new Set(people.map((p) => p.id))
  const add = (id: string | null) => {
    if (!id || known.has(id)) return
    known.add(id)
    people.push({ id, displayName: `Unknown (${id})` })
  }
  for (const t of teams) t.memberIds.forEach(add)
  for (const i of issues) {
    add(i.assigneeId)
    for (const c of i.changelog) {
      add(c.authorId)
      if (c.field === "assignee") {
        add(c.from)
        add(c.to)
      }
    }
  }
}

function toMeta(data: RawExport, issues: Issue[]): Meta {
  const m = data.meta
  const newest = issues
    .flatMap((i) => [i.created, i.resolved, i.changelog.at(-1)?.at])
    .reduce<string | null>((max, d) => (d && (!max || Date.parse(d) > Date.parse(max)) ? d : max), null)
  return {
    source: presentString(m?.source),
    version: presentString(m?.version),
    generatedAt: presentString(m?.generatedAt) ?? newest ?? new Date(0).toISOString(),
    jiraBaseUrl: presentString(m?.jiraBaseUrl)?.replace(/\/+$/, "") ?? null,
  }
}
