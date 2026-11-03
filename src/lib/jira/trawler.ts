import { z } from "zod"

/** The contract's category names; the schema normalises them. */
type StatusCategory = "todo" | "in_progress" | "done"

/** A category for a status name when Jira didn't send one. */
function categoryForStatus(status: string): StatusCategory {
  if (/done|closed|resolved|released|complete/i.test(status)) return "done"
  if (/to ?do|open|backlog|new|triage|selected/i.test(status)) return "todo"
  return "in_progress"
}

/**
 * The real Jira Trawler output (raw Jira REST fields), and its conversion to the
 * Trawler contract (project brief §6). Ported from the Jira Dashboard's
 * packages/core/src/trawler.ts so both apps read the same files.
 *
 * Accepted inputs:
 * - the audit log text, one `PROJECT {...}` / `TICKET {...}` JSON line each
 * - the JSON output: `{ projects: [...], tickets: [...] }`, projects with nested
 *   `tickets`/`issues`, or a bare array of tickets
 *
 * The Trawler is run with `sprint_open: true`, so every ticket is in its
 * project's current sprint. It doesn't export sprint details, so each project
 * gets one synthetic active sprint with unknown dates.
 *
 * PIs: when the expanded Trawler adds a top-level `programIncrements` array (in
 * the contract's shape), it is passed through and the synthetic sprints are put
 * in the PI that contains `generatedAt`. Map its real shape here once known.
 *
 * Story points and history are optional. History is Jira's native changelog
 * (`changelog.histories[].items[]`); field names like "Story Points" and person
 * references (username / user key / accountId) are mapped to the contract's.
 */

const idLike = z.union([z.string(), z.number()])
const optionalString = z.string().nullable().optional()
const stringList = z
  .array(z.union([z.string(), z.looseObject({ name: z.string() })]))
  .nullable()
  .optional()

/** Jira Server returns { name, key, displayName }; Cloud uses accountId. */
const trawlerPersonSchema = z.union([
  z.string(),
  z.looseObject({
    accountId: optionalString,
    key: optionalString,
    name: optionalString,
    displayName: optionalString,
    emailAddress: optionalString,
  }),
])

const changeValue = z.union([z.string(), z.number()]).nullable().optional()

/**
 * Jira names a change's display value `toString`, so an entry without one would
 * otherwise be read as `Object.prototype.toString`. Make it an own property.
 */
const ownToString = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (v) => (typeof v === "object" && v !== null && !Object.hasOwn(v, "toString") ? { ...v, toString: undefined } : v),
    schema,
  )

/** One changed field, as in Jira's `changelog.histories[].items[]`. */
const trawlerChangeItemSchema = ownToString(
  z.looseObject({
    field: z.string(),
    from: changeValue,
    fromString: changeValue,
    to: changeValue,
    toString: changeValue,
  }),
)

/** A Jira history entry; a flat entry (no `items`) is treated as one change. */
const trawlerHistorySchema = ownToString(
  z.looseObject({
    author: trawlerPersonSchema.nullable().optional(),
    created: z.string(),
    items: z.array(trawlerChangeItemSchema).nullable().optional(),
    field: optionalString,
    from: changeValue,
    fromString: changeValue,
    to: changeValue,
    toString: changeValue,
  }),
)

const historyList = z.array(trawlerHistorySchema).nullable().optional()

/** Accepts `"5"` as well as `5`. */
const points = z.union([z.number(), z.string()]).nullable().optional()

export const trawlerTicketSchema = z.looseObject({
  id: idLike.nullable().optional(),
  key: z.string().min(1),
  self: optionalString,
  project: optionalString,
  summary: z.string(),
  issuetype: optionalString,
  status: z.string().min(1),
  statusCategory: optionalString,
  priority: optionalString,
  resolution: optionalString,
  assignee: trawlerPersonSchema.nullable().optional(),
  reporter: trawlerPersonSchema.nullable().optional(),
  creator: trawlerPersonSchema.nullable().optional(),
  created: z.string(),
  updated: optionalString,
  resolutiondate: optionalString,
  duedate: optionalString,
  labels: stringList,
  components: stringList,
  fixVersions: stringList,
  affectsVersions: stringList,
  parent: optionalString,
  storyPoints: points,
  story_points: points,
  "Story Points": points,
  changelog: z
    .union([z.looseObject({ histories: historyList }), historyList])
    .nullable()
    .optional(),
  history: historyList,
  histories: historyList,
})

export const trawlerProjectSchema = z.looseObject({
  id: idLike.nullable().optional(),
  key: z.string().min(1),
  name: z.string(),
  lead: trawlerPersonSchema.nullable().optional(),
  self: optionalString,
  tickets: z.array(trawlerTicketSchema).nullable().optional(),
  issues: z.array(trawlerTicketSchema).nullable().optional(),
})

export const trawlerExportSchema = z.looseObject({
  jiraUrl: optionalString,
  generatedAt: optionalString,
  projects: z.array(trawlerProjectSchema).nullable().optional(),
  tickets: z.array(trawlerTicketSchema).nullable().optional(),
  /** Passed through as-is; validated by the contract schema. */
  programIncrements: z.array(z.looseObject({ startDate: z.unknown(), endDate: z.unknown() })).nullable().optional(),
})

export type TrawlerExport = z.infer<typeof trawlerExportSchema>
type TrawlerTicket = z.infer<typeof trawlerTicketSchema>
type TrawlerPerson = z.infer<typeof trawlerPersonSchema>

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** True for anything that looks like Trawler output rather than the contract shape. */
export function isTrawlerShape(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length === 0 || (isObject(raw[0]) && "issuetype" in raw[0])
  return isObject(raw) && !("issues" in raw) && ("projects" in raw || "tickets" in raw)
}

/** Wraps a bare ticket array so it validates against `trawlerExportSchema`. */
export function normaliseTrawlerInput(raw: unknown): unknown {
  return Array.isArray(raw) ? { tickets: raw } : raw
}

const LOG_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),(\d{3}) \w+ (.*)$/

/** True if the text looks like a Trawler audit log. */
export function isTrawlerLog(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2} [\d:,]+ \w+ (TICKET|PROJECT|Connecting to) /m.test(text)
}

/** Parse audit log text into a Trawler export. Bad JSON lines throw `SyntaxError`. */
export function parseTrawlerLog(text: string): TrawlerExport {
  const projects: unknown[] = []
  const tickets: unknown[] = []
  let jiraUrl: string | null = null
  let lastAt: string | null = null

  text.split(/\r?\n/).forEach((line, i) => {
    const m = LOG_LINE.exec(line.trim())
    if (!m) return
    const [, stamp, ms, message] = m
    lastAt = `${stamp.replace(" ", "T")}.${ms}`
    const kind = /^(PROJECT|TICKET) (.*)$/.exec(message)
    if (kind) {
      let value: unknown
      try {
        value = JSON.parse(kind[2])
      } catch (err) {
        throw new SyntaxError(`line ${i + 1} (${kind[1]}): ${(err as Error).message}`, { cause: err })
      }
      ;(kind[1] === "PROJECT" ? projects : tickets).push(value)
    } else if (message.startsWith("Connecting to ")) {
      jiraUrl = message.slice("Connecting to ".length).trim()
    }
  })

  return { jiraUrl, generatedAt: lastAt, projects, tickets } as TrawlerExport
}

/** Jira's "+0000" offsets aren't ISO 8601; make them "+00:00". */
function isoDate(s: string | null | undefined): string | null {
  if (!s) return null
  return s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
}

function personId(p: TrawlerPerson | null | undefined): string | null {
  if (!p) return null
  if (typeof p === "string") return p
  return p.accountId ?? p.key ?? p.name ?? p.displayName ?? null
}

function personName(p: TrawlerPerson): string | null {
  return typeof p === "string" ? p : (p.displayName ?? p.name ?? null)
}

function names(list: z.infer<typeof stringList>): string[] {
  return (list ?? []).map((v) => (typeof v === "string" ? v : v.name))
}

function toPoints(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function storyPointsOf(t: TrawlerTicket): number | null {
  return toPoints(t.storyPoints ?? t.story_points ?? t["Story Points"])
}

function historiesOf(t: TrawlerTicket) {
  const c = t.changelog
  return (Array.isArray(c) ? c : c?.histories) ?? t.history ?? t.histories ?? []
}

/** Jira field names → the contract's changelog field names. */
function contractField(field: string): string {
  const f = field.trim().toLowerCase()
  if (/^story ?points?( estimate)?$|^story_points$/.test(f)) return "storyPoints"
  if (f === "status" || f === "assignee" || f === "sprint" || f === "priority") return f
  return field
}

const str = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined || v === "" ? null : String(v)

/** Jira category names ("To Do") and keys ("new", "indeterminate") → ours. */
function toCategory(t: TrawlerTicket): StatusCategory {
  const c = t.statusCategory?.trim().toLowerCase()
  if (c === "done") return "done"
  if (c === "to do" || c === "new" || c === "todo") return "todo"
  if (c === "in progress" || c === "indeterminate") return "in_progress"
  return categoryForStatus(t.status)
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Map a validated Trawler export to the contract shape `exportSchema` expects. */
export function trawlerToContract(data: TrawlerExport): unknown {
  const projects = data.projects ?? []
  const tickets = [...(data.tickets ?? []), ...projects.flatMap((p) => [...(p.tickets ?? []), ...(p.issues ?? [])])]

  // A ticket's `project` may be the key or the name; fall back to the key prefix.
  const projectKey = new Map<string, string>()
  for (const p of projects) {
    projectKey.set(p.key, p.key)
    projectKey.set(p.name, p.key)
  }
  const teamOf = (t: TrawlerTicket) => (t.project && projectKey.get(t.project)) ?? t.project ?? t.key.split("-")[0]

  // History refers to people by whichever identifier Jira uses (username, user
  // key or accountId), so remember every alias of each person.
  const people = new Map<string, { id: string; displayName: string; email: string | null }>()
  const alias = new Map<string, string>()
  const notePerson = (p: TrawlerPerson | null | undefined) => {
    const id = personId(p)
    if (!p || !id) return
    for (const a of typeof p === "string" ? [p] : [p.accountId, p.key, p.name, p.displayName]) {
      if (a && !alias.has(a)) alias.set(a, id)
    }
    if (people.has(id)) return
    people.set(id, {
      id,
      displayName: personName(p) ?? id,
      email: typeof p === "string" ? null : (p.emailAddress ?? null),
    })
  }
  for (const t of tickets) {
    notePerson(t.assignee)
    notePerson(t.reporter)
    notePerson(t.creator)
    for (const h of historiesOf(t)) notePerson(h.author)
  }

  /** Assignee change value → person id, adding anyone not seen elsewhere. */
  const assigneeRef = (raw: string | number | null | undefined, name: string | number | null | undefined) => {
    const id = str(raw)
    const label = str(name)
    const known = (id && alias.get(id)) ?? (label && alias.get(label))
    if (known) return known
    if (id || label) notePerson({ key: id, displayName: label })
    return id ?? label
  }

  const changelogOf = (t: TrawlerTicket) =>
    historiesOf(t).flatMap((h) =>
      (h.items ?? (h.field ? [{ ...h, field: h.field }] : [])).map((item) => {
        const field = contractField(item.field)
        const value = (raw: typeof item.to, text: typeof item.toString) =>
          field === "assignee" ? assigneeRef(raw, text) : str(text ?? raw)
        return {
          at: isoDate(h.created),
          authorId: personId(h.author),
          field,
          from: value(item.from, item.fromString),
          to: value(item.to, item.toString),
        }
      }),
    )

  const members = new Map<string, Set<string>>()
  const issues = tickets.map((t) => {
    const teamId = teamOf(t)
    const assigneeId = personId(t.assignee)
    if (assigneeId) {
      if (!members.has(teamId)) members.set(teamId, new Set())
      members.get(teamId)!.add(assigneeId)
    }
    return {
      key: t.key,
      id: t.id ?? null,
      summary: t.summary,
      type: t.issuetype ?? null,
      status: t.status,
      statusCategory: toCategory(t),
      priority: t.priority ?? null,
      assigneeId,
      reporterId: personId(t.reporter) ?? personId(t.creator),
      teamId,
      storyPoints: storyPointsOf(t),
      labels: [...names(t.labels), ...names(t.components)],
      parentKey: t.parent ?? null,
      created: isoDate(t.created),
      updated: isoDate(t.updated),
      resolved: isoDate(t.resolutiondate),
      dueDate: isoDate(t.duedate),
      changelog: changelogOf(t),
    }
  })

  const teamIds = [...new Set([...projects.map((p) => p.key), ...issues.map((i) => i.teamId)])]
  const projectName = new Map(projects.map((p) => [p.key, p.name]))
  const teams = teamIds.map((id) => ({
    id,
    name: projectName.get(id) ?? id,
    projectKey: id,
    memberIds: [...(members.get(id) ?? [])],
  }))
  const sprints = teams.map((t, i) => ({
    id: i + 1,
    name: `${t.name} current sprint`,
    teamId: t.id,
    state: "active",
    startDate: null,
    endDate: null,
    completeDate: null,
  }))
  const sprintOf = new Map(sprints.map((s) => [s.teamId, s.id]))
  const pis = data.programIncrements ?? []
  const at = Date.parse(data.generatedAt ?? "")
  const currentPi = pis.find(
    (p) => typeof p.startDate === "string" && typeof p.endDate === "string" && at >= Date.parse(p.startDate) && at <= Date.parse(p.endDate),
  )

  return {
    meta: {
      source: "jira-trawler",
      generatedAt: data.generatedAt ?? null,
      jiraBaseUrl: data.jiraUrl ?? originOf(tickets[0]?.self) ?? originOf(projects[0]?.self),
    },
    teams,
    people: [...people.values()],
    sprints: sprints.map((s) => ({ ...s, piId: currentPi?.id ?? null })),
    ...(pis.length ? { programIncrements: pis } : {}),
    issues: issues.map((i) => ({ ...i, sprintIds: [sprintOf.get(i.teamId)!] })),
  }
}
