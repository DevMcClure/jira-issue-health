/**
 * Deterministic mock Jira Trawler export with deliberate, realistic data gaps.
 *
 * Pure: no file system or browser access, so tests can call it directly.
 * `pnpm mock` runs `scripts/generate-mock.ts`, which writes the result to
 * `src/data/mock/trawler-export.json` (committed).
 *
 * The world mirrors the Jira Dashboard's mock data: teams Platform, Web and
 * Mobile, sprints named "<KEY> 26.4.n" with the same ids, the same epics.
 * Everything is generated complete first, then gaps are injected from a fixed
 * plan so the teams differ: Platform nearly clean, Mobile mixed, Web poor.
 */
import type { RawExportInput } from "../../lib/jira/schema.ts"

export const MOCK_GENERATED_AT = "2026-11-03T08:15:00Z"
export const MOCK_JIRA_BASE_URL = "https://jira.example.com"

type RawIssue = RawExportInput["issues"][number]
type RawSprint = NonNullable<RawExportInput["sprints"]>[number]
type Change = { at: string; authorId: string | null; field: string; from: string | null; to: string | null }

/** An issue while it's being generated: every field present, so gaps are explicit. */
type MockIssue = {
  key: string
  summary: string
  type: "flow-value" | "flow-defect" | "flow-quality" | "flow-accelerator" | "Spike" | "Epic" | "Sub-task"
  status: string
  statusCategory: "new" | "indeterminate" | "done"
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
  changelog: Change[]
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Time helpers (UTC, weekdays 09:00–17:00)
// ---------------------------------------------------------------------------

const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
const isWeekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay())
const midnight = (ms: number) => ms - (ms % DAY)

/** `n` working days after (or before, if negative) the given moment, at `hour` UTC. */
function workday(fromMs: number, n: number, hour: number): number {
  let d = midnight(fromMs)
  const step = n < 0 ? -DAY : DAY
  let left = Math.abs(n)
  while (isWeekend(d)) d += step
  while (left > 0) {
    d += step
    if (!isWeekend(d)) left--
  }
  return d + hour * HOUR
}

const NOW = Date.parse(MOCK_GENERATED_AT)
/** The last moment anything in the active sprint could have happened: yesterday, end of day. */
const LAST_WORK = workday(NOW, -1, 17)

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const PEOPLE = [
  { id: "u-01", displayName: "Priya Shah" },
  { id: "u-02", displayName: "Marcus Chen" },
  { id: "u-03", displayName: "Elena Rossi" },
  { id: "u-04", displayName: "Tomás García" },
  { id: "u-05", displayName: "Aisha Bello" },
  { id: "u-06", displayName: "Sofia Lindqvist" },
  { id: "u-07", displayName: "Jamal Wright" },
  { id: "u-08", displayName: "Hannah Okafor" },
  { id: "u-09", displayName: "Liam O'Brien" },
  { id: "u-10", displayName: "Alex Petrov" },
  { id: "u-11", displayName: "Kenji Watanabe" },
  { id: "u-12", displayName: "Fatima Haddad" },
  { id: "u-13", displayName: "Noah Fischer" },
  { id: "u-14", displayName: "Grace Mensah" },
  { id: "u-15", displayName: "Ravi Iyer" },
]

type EpicDef = { key: string; name: string; topic: string; label: string }
type TeamDef = {
  id: string
  name: string
  projectKey: string
  firstKey: number
  sprintBase: number
  memberIds: string[]
  /** PI 26.3 epics, finished. */
  doneEpics: EpicDef[]
  /** PI 26.4 epics, in progress. */
  epics: EpicDef[]
  /** Relative weights of flow-value, flow-defect, flow-quality, flow-accelerator, Spike. */
  typeWeights: [number, number, number, number, number]
  /** Exact counts of the same types in the active sprint (18 in all), so the gap plan always has candidates. */
  activeMix: [number, number, number, number, number]
}

const TEAMS: TeamDef[] = [
  {
    id: "TEAM-PLAT",
    name: "Platform",
    projectKey: "PLAT",
    firstKey: 1201,
    sprintBase: 101,
    memberIds: ["u-01", "u-02", "u-03", "u-04", "u-05"],
    doneEpics: [
      { key: "PLAT-1041", name: "Webhooks v2", topic: "Webhooks", label: "webhooks" },
      { key: "PLAT-1077", name: "Secrets rotation", topic: "Secrets", label: "infra" },
    ],
    epics: [
      { key: "PLAT-1100", name: "Enterprise SSO & SCIM", topic: "SSO", label: "auth" },
      { key: "PLAT-1105", name: "Rate limits v2", topic: "Rate limits", label: "api" },
      { key: "PLAT-1142", name: "Audit logging", topic: "Audit log", label: "observability" },
      { key: "PLAT-1160", name: "Tenant data export", topic: "Data export", label: "api" },
    ],
    // Platform's defects are rare: the only ones are hand-written below, so they get no suggestions.
    typeWeights: [60, 0, 16, 12, 12],
    activeMix: [11, 0, 3, 2, 2],
  },
  {
    id: "TEAM-WEB",
    name: "Web",
    projectKey: "WEB",
    firstKey: 841,
    sprintBase: 201,
    memberIds: ["u-06", "u-07", "u-08", "u-09", "u-10"],
    doneEpics: [
      { key: "WEB-610", name: "Onboarding redesign", topic: "Onboarding", label: "onboarding" },
      { key: "WEB-633", name: "Saved views", topic: "Saved views", label: "dashboard" },
    ],
    epics: [
      { key: "WEB-700", name: "Core Web Vitals", topic: "Web vitals", label: "perf" },
      { key: "WEB-722", name: "Accessibility AA", topic: "Accessibility", label: "a11y" },
      { key: "WEB-790", name: "Global search", topic: "Search", label: "search" },
      { key: "WEB-805", name: "Dashboard sharing", topic: "Sharing", label: "dashboard" },
    ],
    typeWeights: [55, 22, 9, 7, 7],
    activeMix: [9, 4, 2, 1, 2],
  },
  {
    id: "TEAM-MOB",
    name: "Mobile",
    projectKey: "MOB",
    firstKey: 521,
    sprintBase: 301,
    memberIds: ["u-11", "u-12", "u-13", "u-14", "u-15"],
    doneEpics: [
      { key: "MOB-322", name: "Rich push notifications", topic: "Push", label: "push" },
      { key: "MOB-345", name: "Deep links", topic: "Deep links", label: "android" },
    ],
    epics: [
      { key: "MOB-400", name: "Offline mode", topic: "Offline", label: "offline" },
      { key: "MOB-431", name: "Home screen widgets", topic: "Widgets", label: "ios" },
      { key: "MOB-466", name: "Release 4.2", topic: "Release 4.2", label: "release" },
      { key: "MOB-480", name: "Accessibility pass", topic: "Accessibility", label: "a11y" },
    ],
    typeWeights: [55, 20, 10, 8, 7],
    activeMix: [9, 4, 2, 1, 2],
  },
]

/** Two closed, one active, one future sprint per team; ids and names as in the Jira Dashboard's mock. */
const SPRINTS = [
  { index: 6, name: "26.4.2", state: "closed", start: "2026-09-28" },
  { index: 7, name: "26.4.3", state: "closed", start: "2026-10-12" },
  { index: 8, name: "26.4.4", state: "active", start: "2026-10-26" },
  { index: 9, name: "26.4.5", state: "future", start: "2026-11-09" },
] as const

/** Issues per sprint (closed, closed, active, future) and in the backlog. */
const SPRINT_SIZES = [15, 15, 18, 8] as const
const BACKLOG_SIZE = 14

/** Status mix in an active sprint, in order. */
const ACTIVE_STATUSES = [
  ...Array(6).fill("Done"),
  ...Array(2).fill("In Review"),
  ...Array(6).fill("In Progress"),
  "Blocked",
  ...Array(3).fill("To Do"),
] as string[]

const SUMMARY_ACTIONS: Record<Exclude<MockIssue["type"], "Epic">, string[]> = {
  "flow-value": [
    "show status in settings",
    "let admins configure defaults",
    "expose it in the public API",
    "notify users by email",
    "add filters to the list view",
    "support bulk actions",
    "add an empty state",
    "track usage analytics",
    "add role-based access",
    "handle error states",
    "add onboarding hints",
    "remember the last choice",
  ],
  "flow-defect": [
    "500 error when the list is empty",
    "wrong time zone in timestamps",
    "duplicate entries after retry",
    "settings not saved on Safari",
    "pagination skips the last page",
    "slow query on large tenants",
    "crash when the session expires",
    "counter shows stale totals",
  ],
  "flow-quality": [
    "add integration tests",
    "write the data migration",
    "update the runbook",
    "remove the old feature flag",
    "upgrade the client library",
    "add dashboards and alerts",
    "clean up unused endpoints",
  ],
  "flow-accelerator": [
    "automate the release checklist",
    "speed up CI builds",
    "add deploy previews",
    "script environment setup",
    "cache test fixtures",
  ],
  Spike: [
    "investigate vendor options",
    "prototype the data model",
    "measure the performance impact",
    "review security implications",
  ],
  "Sub-task": ["write unit tests", "code review fixes", "update API docs", "QA sign-off"],
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generateMockExport(seed = 42): RawExportInput {
  const rand = mulberry32(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const chance = (p: number) => rand() < p
  function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
    let r = rand() * pairs.reduce((s, [, w]) => s + w, 0)
    for (const [v, w] of pairs) if ((r -= w) < 0) return v
    return pairs[pairs.length - 1][0]
  }
  const shuffled = <T>(xs: readonly T[]): T[] => {
    const out = [...xs]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  const sprints: RawSprint[] = []
  const issues: MockIssue[] = []
  const usedSummaries = new Set<string>()

  const categoryOf = (status: string): MockIssue["statusCategory"] =>
    status === "To Do" ? "new" : status === "Done" ? "done" : "indeterminate"

  const priorityFor = (type: MockIssue["type"]) =>
    weighted(
      type === "flow-defect"
        ? [["Highest", 15], ["High", 40], ["Medium", 35], ["Low", 10]]
        : [["Highest", 5], ["High", 20], ["Medium", 55], ["Low", 20]],
    )

  const pointsFor = (type: MockIssue["type"]): number | null => {
    if (type === "flow-value") return weighted([[1, 10], [2, 20], [3, 30], [5, 25], [8, 15]])
    if (type === "flow-defect") return weighted([[1, 30], [2, 35], [3, 25], [5, 10]])
    if (type === "flow-quality" || type === "flow-accelerator") return weighted([[1, 20], [2, 35], [3, 30], [5, 15]])
    if (type === "Spike") return chance(0.5) ? pick([1, 2, 3]) : null
    return null
  }

  const labelsFor = (type: MockIssue["type"], epic: EpicDef | null): string[] => {
    const area = epic ? [epic.label] : []
    // Flow types are classified by type; only Spikes need a tech-debt or risk label.
    if (type === "Spike") return [...area, chance(0.7) ? "risk" : "tech-debt"]
    if (type !== "Sub-task" && type !== "Epic") return area
    return []
  }

  const summaryFor = (type: Exclude<MockIssue["type"], "Epic">, topic: string): string => {
    const actions = SUMMARY_ACTIONS[type]
    for (let attempt = 0; attempt < 20; attempt++) {
      const s = `${topic}: ${pick(actions)}`
      if (!usedSummaries.has(s)) {
        usedSummaries.add(s)
        return s
      }
    }
    // Every action already used for this topic: number the repeat.
    const base = `${topic}: ${pick(actions)}`
    let n = 2
    while (usedSummaries.has(`${base} (${n})`)) n++
    usedSummaries.add(`${base} (${n})`)
    return `${base} (${n})`
  }

  /** Status transitions from `start`, one every few working hours/days, never after `cap`. */
  const walkStatuses = (issue: MockIssue, path: string[], startMs: number, capMs: number, authorId: string | null) => {
    let t = startMs
    let from = "To Do"
    for (const to of path) {
      t = Math.min(t, capMs)
      issue.changelog.push({ at: iso(t), authorId, field: "status", from, to })
      from = to
      t = workday(t, int(1, 3), int(9, 16)) + int(0, 59) * 60_000
    }
  }

  const pathTo = (status: string): string[] => {
    switch (status) {
      case "In Progress":
        return ["In Progress"]
      case "In Review":
        return ["In Progress", "In Review"]
      case "Blocked":
        return ["In Progress", "Blocked"]
      case "Done":
        return chance(0.8) ? ["In Progress", "In Review", "Done"] : ["In Progress", "Done"]
      default:
        return []
    }
  }

  for (const team of TEAMS) {
    let nextKey = team.firstKey
    const newKey = () => `${team.projectKey}-${nextKey++}`
    const teamSprints = SPRINTS.map((s) => {
      const startMs = Date.parse(`${s.start}T09:00:00Z`)
      const endMs = workday(startMs, 9, 17)
      const sprint = {
        id: team.sprintBase + s.index,
        name: `${team.projectKey} ${s.name}`,
        teamId: team.id,
        state: s.state,
        startDate: iso(startMs),
        endDate: iso(endMs),
        completeDate: s.state === "closed" ? iso(endMs) : null,
      }
      sprints.push(sprint)
      return { ...sprint, startMs, endMs }
    })

    // Epics: PI 26.3's are done, PI 26.4's in progress.
    for (const [i, epic] of [...team.doneEpics, ...team.epics].entries()) {
      const done = i < team.doneEpics.length
      const createdMs = Date.parse(done ? "2026-06-22T10:00:00Z" : "2026-08-24T10:00:00Z") + i * DAY
      const owner = team.memberIds[i % team.memberIds.length]
      const issue: MockIssue = {
        key: epic.key,
        summary: epic.name,
        type: "Epic",
        status: done ? "Done" : "In Progress",
        statusCategory: done ? "done" : "indeterminate",
        priority: "High",
        assigneeId: owner,
        teamId: team.id,
        sprintIds: [],
        storyPoints: null,
        labels: [epic.label],
        epicKey: null,
        parentKey: null,
        created: iso(createdMs),
        resolved: null,
        changelog: [],
      }
      const startMs = workday(createdMs, int(5, 10), 10)
      walkStatuses(issue, done ? ["In Progress", "Done"] : ["In Progress"], startMs, startMs, owner)
      if (done) {
        const doneAt = Date.parse("2026-09-25T16:00:00Z") - i * DAY
        issue.changelog[1].at = iso(doneAt)
        issue.resolved = iso(doneAt)
      }
      issues.push(issue)
    }

    const types = ["flow-value", "flow-defect", "flow-quality", "flow-accelerator", "Spike"] as const
    const pickType = () => weighted(types.map((t, i) => [t, team.typeWeights[i]] as const))
    const epicFor = (type: MockIssue["type"], sprintIdx: number | null): EpicDef | null => {
      if (type === "Spike" && chance(0.5)) return null
      // The first closed sprint finishes off PI 26.3's epics.
      if (sprintIdx === 0 && chance(0.6)) return pick(team.doneEpics)
      return pick(team.epics)
    }

    const makeIssue = (sprintIdx: number | null, status: string, forcedType?: (typeof types)[number]): MockIssue => {
      const type = forcedType ?? pickType()
      const epic = epicFor(type, sprintIdx)
      const sprint = sprintIdx === null ? null : teamSprints[sprintIdx]
      const inFlight = status !== "To Do"
      const assigned = inFlight || chance(sprint?.state === "active" ? 0.8 : 0.4)
      const assigneeId = assigned ? pick(team.memberIds) : null
      const points = sprint || chance(0.6) ? pointsFor(type) : null
      // Nothing can happen after the trawl: future-sprint work was created and planned already.
      const anchorMs = Math.min(sprint ? sprint.startMs : Date.parse("2026-10-20T09:00:00Z"), LAST_WORK)
      const createdMs = workday(anchorMs, -int(3, 25), int(9, 16)) + int(0, 59) * 60_000
      const issue: MockIssue = {
        key: newKey(),
        summary: summaryFor(type, epic?.topic ?? pick(team.epics).topic),
        type,
        status,
        statusCategory: categoryOf(status),
        priority: priorityFor(type),
        assigneeId,
        teamId: team.id,
        sprintIds: sprint ? [sprint.id] : [],
        storyPoints: points,
        labels: labelsFor(type, epic),
        epicKey: epic?.key ?? null,
        parentKey: null,
        created: iso(createdMs),
        resolved: null,
        changelog: [],
      }
      const reporter = pick(team.memberIds)
      if (points !== null) {
        issue.changelog.push({ at: iso(createdMs + 2 * HOUR), authorId: reporter, field: "storyPoints", from: null, to: String(points) })
      }
      if (sprint) {
        const plannedMs = Math.min(workday(sprint.startMs, -1, 15), LAST_WORK)
        issue.changelog.push({ at: iso(Math.max(plannedMs, createdMs + 3 * HOUR)), authorId: reporter, field: "sprint", from: null, to: sprint.name })
      }
      if (assigneeId) {
        const assignedMs =
          sprint && sprint.state !== "future" ? Math.max(sprint.startMs, createdMs + 4 * HOUR) : createdMs + 4 * HOUR
        issue.changelog.push({ at: iso(assignedMs), authorId: reporter, field: "assignee", from: null, to: assigneeId })
      }
      if (inFlight) {
        const windowStart = sprint ? sprint.startMs : workday(Date.parse("2026-10-26T09:00:00Z"), 0, 9)
        const capMs = sprint?.state === "closed" ? sprint.endMs - HOUR : LAST_WORK
        const startMs = workday(windowStart, int(0, sprint?.state === "closed" ? 5 : 3), int(9, 15)) + 30 * 60_000
        walkStatuses(issue, pathTo(status), Math.min(startMs, capMs), capMs, assigneeId)
        if (status === "Done") issue.resolved = issue.changelog.at(-1)!.at
      }
      issue.changelog.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      return issue
    }

    const activeTypes = shuffled(types.flatMap((t, i) => Array<(typeof types)[number]>(team.activeMix[i]).fill(t)))
    teamSprints.forEach((sprint, idx) => {
      for (let n = 0; n < SPRINT_SIZES[idx]; n++) {
        const status = sprint.state === "closed" ? "Done" : sprint.state === "active" ? ACTIVE_STATUSES[n] : "To Do"
        issues.push(makeIssue(idx, status, sprint.state === "active" ? activeTypes[n] : undefined))
      }
    })
    for (let n = 0; n < BACKLOG_SIZE; n++) issues.push(makeIssue(null, "To Do"))

    // Sub-tasks under a few of the active sprint's stories.
    const activeStories = issues.filter(
      (i) => i.teamId === team.id && i.type === "flow-value" && i.sprintIds[0] === teamSprints[2].id && i.status !== "To Do",
    )
    for (const [n, parent] of activeStories.slice(0, 3).entries()) {
      const status = ["In Progress", "Done", "To Do"][n]
      const sub: MockIssue = {
        ...parent,
        key: newKey(),
        summary: summaryFor("Sub-task", parent.summary.split(":")[0]),
        type: "Sub-task",
        status,
        statusCategory: categoryOf(status),
        sprintIds: [...parent.sprintIds],
        storyPoints: null,
        labels: [],
        epicKey: null,
        parentKey: parent.key,
        created: iso(Date.parse(parent.created) + DAY),
        resolved: null,
        changelog: [],
      }
      if (sub.assigneeId) {
        sub.changelog.push({ at: iso(Date.parse(sub.created) + HOUR), authorId: sub.assigneeId, field: "assignee", from: null, to: sub.assigneeId })
      }
      walkStatuses(sub, pathTo(status), workday(teamSprints[2].startMs, 1, 11), LAST_WORK, sub.assigneeId)
      if (status === "Done") sub.resolved = sub.changelog.at(-1)!.at
      issues.push(sub)
    }
  }

  addHandWrittenIssues(issues, sprints)
  injectGaps(issues, sprints, { pick, shuffled, chance })

  return {
    meta: {
      source: "jira-trawler",
      version: "1.0",
      generatedAt: MOCK_GENERATED_AT,
      jiraBaseUrl: MOCK_JIRA_BASE_URL,
    },
    teams: TEAMS.map((t) => ({ id: t.id, name: t.name, projectKey: t.projectKey, memberIds: t.memberIds })),
    people: PEOPLE,
    sprints,
    issues: issues.map(toRaw),
  }
}

/**
 * Platform's only flow-defects. Too few similar tickets exist for suggestions, so
 * the active one's gaps (story points, priority) and the backlog one's (epic)
 * deliberately get none.
 */
function addHandWrittenIssues(issues: MockIssue[], sprints: RawSprint[]) {
  const sprint = (name: string) => sprints.find((s) => s.name === name)!
  const closed = sprint("PLAT 26.4.3")
  const active = sprint("PLAT 26.4.4")
  issues.push(
    {
      key: "PLAT-1290",
      summary: "SSO: SAML login loops on Safari",
      type: "flow-defect",
      status: "In Progress",
      statusCategory: "indeterminate",
      priority: null,
      assigneeId: "u-02",
      teamId: "TEAM-PLAT",
      sprintIds: [active.id],
      storyPoints: null,
      labels: ["auth"],
      epicKey: "PLAT-1100",
      parentKey: null,
      created: "2026-10-29T10:12:00Z",
      resolved: null,
      changelog: [
        { at: "2026-10-29T10:40:00Z", authorId: "u-01", field: "sprint", from: null, to: active.name },
        { at: "2026-10-29T10:41:00Z", authorId: "u-01", field: "assignee", from: null, to: "u-02" },
        { at: "2026-10-30T09:20:00Z", authorId: "u-02", field: "status", from: "To Do", to: "In Progress" },
      ],
    },
    {
      key: "PLAT-1291",
      summary: "Rate limits: 429 responses missing Retry-After",
      type: "flow-defect",
      status: "Done",
      statusCategory: "done",
      priority: "High",
      assigneeId: "u-04",
      teamId: "TEAM-PLAT",
      sprintIds: [closed.id],
      storyPoints: 2,
      labels: ["api"],
      epicKey: "PLAT-1105",
      parentKey: null,
      created: "2026-10-13T11:05:00Z",
      resolved: "2026-10-16T15:30:00Z",
      changelog: [
        { at: "2026-10-13T11:20:00Z", authorId: "u-01", field: "sprint", from: null, to: closed.name },
        { at: "2026-10-13T11:21:00Z", authorId: "u-01", field: "storyPoints", from: null, to: "2" },
        { at: "2026-10-13T11:22:00Z", authorId: "u-01", field: "assignee", from: null, to: "u-04" },
        { at: "2026-10-14T09:10:00Z", authorId: "u-04", field: "status", from: "To Do", to: "In Progress" },
        { at: "2026-10-16T15:30:00Z", authorId: "u-04", field: "status", from: "In Progress", to: "Done" },
      ],
    },
    {
      key: "PLAT-1292",
      summary: "Webhook retries ignore 429 responses",
      type: "flow-defect",
      status: "To Do",
      statusCategory: "new",
      priority: "Medium",
      assigneeId: null,
      teamId: "TEAM-PLAT",
      sprintIds: [],
      storyPoints: null,
      labels: ["webhooks"],
      epicKey: null,
      parentKey: null,
      created: "2026-10-30T14:02:00Z",
      resolved: null,
      changelog: [],
    },
  )
}

// ---------------------------------------------------------------------------
// Gap injection
// ---------------------------------------------------------------------------

type Rng = {
  pick: <T>(xs: readonly T[]) => T
  shuffled: <T>(xs: readonly T[]) => T[]
  chance: (p: number) => boolean
}

type Gap = "storyPoints" | "assignee" | "epic" | "priority" | "resolved" | "labels" | "team" | "sprint"

type Where = {
  team: string
  sprint: "closed" | "active" | "future" | "backlog"
  type?: MockIssue["type"][]
  status?: string[]
}

/** One line of the plan: `count` tickets matching `where` each get every gap in `gaps`. */
type PlanLine = { where: Where; gaps: Gap[]; count: number }

const VALUE_DEFECT: MockIssue["type"][] = ["flow-value", "flow-defect"]
const IN_FLIGHT = ["In Progress", "In Review", "Blocked"]

/**
 * Roughly 25 tickets need updates in the active sprints (Platform 2, Mobile 8,
 * Web 16), a few with 2–3 gaps at once, plus some in closed and future sprints
 * and the backlog. Every required field is missing somewhere.
 */
const GAP_PLAN: PlanLine[] = [
  // Platform: nearly clean (PLAT-1290 and PLAT-1292 are hand-written with their gaps).
  { where: { team: "TEAM-PLAT", sprint: "active", type: ["flow-value"] }, gaps: ["priority"], count: 1 },

  // Mobile: mixed.
  { where: { team: "TEAM-MOB", sprint: "active", type: ["flow-value"] }, gaps: ["storyPoints"], count: 2 },
  { where: { team: "TEAM-MOB", sprint: "active", type: ["flow-value"] }, gaps: ["storyPoints", "epic"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "active", type: ["flow-value", "flow-defect", "flow-quality"], status: IN_FLIGHT }, gaps: ["assignee"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "active", status: ["Done"], type: ["flow-value", "flow-quality", "flow-defect"] }, gaps: ["resolved"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "active", type: ["Spike"] }, gaps: ["labels"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "active", type: ["flow-defect"] }, gaps: ["priority"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "active", type: ["Sub-task"], status: ["In Progress"] }, gaps: ["assignee"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "future", type: ["flow-value"] }, gaps: ["storyPoints"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "closed", status: ["Done"] }, gaps: ["resolved"], count: 1 },
  { where: { team: "TEAM-MOB", sprint: "backlog", type: ["flow-value", "flow-quality"] }, gaps: ["sprint"], count: 1 },

  // Web: poor.
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-value"], status: IN_FLIGHT }, gaps: ["storyPoints", "assignee", "epic"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "active", type: VALUE_DEFECT, status: IN_FLIGHT }, gaps: ["storyPoints", "assignee"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-value"] }, gaps: ["storyPoints"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-defect"] }, gaps: ["storyPoints"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-value", "flow-quality", "flow-defect"], status: ["Done", "In Review"] }, gaps: ["assignee"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-value", "flow-quality"] }, gaps: ["epic"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "active", status: ["Done"] }, gaps: ["resolved"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "active", type: VALUE_DEFECT }, gaps: ["priority"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["Spike"] }, gaps: ["labels"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["flow-value"] }, gaps: ["team"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "active", type: ["Sub-task"], status: ["In Progress"] }, gaps: ["assignee"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "future", type: ["flow-value"] }, gaps: ["storyPoints"], count: 3 },
  { where: { team: "TEAM-WEB", sprint: "closed", status: ["Done"] }, gaps: ["resolved"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "closed", type: ["flow-value"] }, gaps: ["storyPoints"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "backlog", type: ["flow-value", "flow-quality"] }, gaps: ["epic"], count: 2 },
  { where: { team: "TEAM-WEB", sprint: "backlog", type: VALUE_DEFECT }, gaps: ["priority"], count: 1 },
  { where: { team: "TEAM-WEB", sprint: "backlog", type: ["flow-value", "flow-quality"] }, gaps: ["sprint"], count: 1 },
]

function sprintKind(issue: MockIssue, stateOf: Map<number, string>): Where["sprint"] {
  const id = issue.sprintIds[0]
  if (id === undefined) return "backlog"
  return stateOf.get(id) as Where["sprint"]
}

function injectGaps(issues: MockIssue[], sprints: RawSprint[], rng: Rng) {
  const stateOf = new Map(sprints.map((s) => [s.id, s.state]))
  const touched = new Set<string>()
  // Lines that constrain status pick first, so the broader lines can't use up their few candidates.
  const ordered = [...GAP_PLAN].sort((a, b) => Number(!a.where.status) - Number(!b.where.status))
  for (const line of ordered) {
    const { where } = line
    const candidates = issues.filter(
      (i) =>
        !touched.has(i.key) &&
        i.teamId === where.team &&
        sprintKind(i, stateOf) === where.sprint &&
        (!where.type || where.type.includes(i.type)) &&
        (!where.status || where.status.includes(i.status)) &&
        // Only gaps the checks will see: the field must be present to remove.
        line.gaps.every((g) => canRemove(i, g)),
    )
    const chosen = rng.shuffled(candidates).slice(0, line.count)
    if (chosen.length < line.count) {
      throw new Error(`Gap plan: only ${chosen.length} of ${line.count} ${JSON.stringify(where)} for ${line.gaps.join("+")}`)
    }
    for (const issue of chosen) {
      touched.add(issue.key)
      for (const gap of line.gaps) applyGap(issue, gap, rng)
    }
  }
}

function canRemove(issue: MockIssue, gap: Gap): boolean {
  switch (gap) {
    case "storyPoints":
      return issue.storyPoints !== null
    case "assignee":
      return issue.assigneeId !== null
    case "epic":
      return issue.epicKey !== null
    case "priority":
      return issue.priority !== null
    case "resolved":
      return issue.resolved !== null
    case "labels":
      return issue.labels.some((l) => l === "tech-debt" || l === "risk")
    case "team":
      return issue.teamId !== null
    case "sprint":
      return issue.sprintIds.length === 0 && issue.status === "To Do"
  }
}

/** A blank value, varied so the adapter's "null, '', [] and absent are all missing" rule is exercised. */
const BLANK = "__blank__"

function applyGap(issue: MockIssue, gap: Gap, rng: Rng) {
  const blank = () => rng.pick([null, "", BLANK])
  const at = issue.changelog.at(-1)?.at ?? issue.created
  switch (gap) {
    case "storyPoints":
      issue.storyPoints = rng.chance(0.5) ? null : (BLANK as unknown as null)
      issue.changelog = issue.changelog.filter((c) => c.field !== "storyPoints")
      break
    case "assignee": {
      const was = issue.assigneeId
      issue.assigneeId = blank()
      // Half were never assigned; the rest were unassigned later (someone left, or a bulk edit).
      if (rng.chance(0.5)) {
        issue.changelog = issue.changelog.filter((c) => c.field !== "assignee")
      } else {
        issue.changelog.push({ at: iso(Date.parse(at) + HOUR), authorId: was, field: "assignee", from: was, to: null })
      }
      break
    }
    case "epic":
      issue.epicKey = blank()
      break
    case "priority":
      issue.priority = blank()
      break
    case "resolved":
      issue.resolved = blank()
      break
    case "labels":
      // Keep the area label: labelled, but not with a flow class (tech-debt / risk).
      issue.labels = issue.labels.filter((l) => l !== "tech-debt" && l !== "risk")
      if (issue.labels.length === 0) issue.labels = rng.pick([[], null, BLANK]) as string[]
      break
    case "team":
      issue.teamId = blank()
      break
    case "sprint": {
      // Started without being pulled into a sprint.
      const who = issue.assigneeId ?? "u-07"
      issue.assigneeId = who
      issue.status = "In Progress"
      issue.statusCategory = "indeterminate"
      const startMs = workday(LAST_WORK, -2, 10)
      issue.changelog.push(
        { at: iso(startMs - HOUR), authorId: who, field: "assignee", from: null, to: who },
        { at: iso(startMs), authorId: who, field: "status", from: "To Do", to: "In Progress" },
      )
      break
    }
  }
}

/** Plain JSON for the export; `BLANK` fields are left out entirely. */
function toRaw(issue: MockIssue): RawIssue {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(issue)) if (v !== BLANK) out[k] = v
  return out as RawIssue
}
