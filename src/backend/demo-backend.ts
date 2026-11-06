/**
 * The whole backend, in this browser, for the GitHub Pages demo: the same API
 * shapes as the Jira Health server, so the app runs the same code paths.
 *   - Data: the bundled sample or a file the person loads (never uploaded).
 *   - Jira: a mock with Jira's own refusals (mock-jira.ts); a one-click demo account.
 *   - Live: a stand-in feed that fixes a ticket "in Jira" every minute or so.
 * Changes are kept in this browser per dataset, and can be reset.
 */
import { z } from "zod"
import { fixSchema, HEALTH_FIELD_FOR, issuePatch, updateFields, type Fix, type JiraConnection, type JiraUpdate, type ServerConfig } from "@/lib/api/contract"
import { DEFAULT_RESOLUTIONS, mockJiraErrors } from "@/lib/api/mock-jira"
import { checkResolve, recordWrite } from "@/lib/api/resolve-check"
import { checkDataset } from "@/lib/health/checks"
import { suggest } from "@/lib/health/hints"
import { DEFAULT_FILTERS, inScope, teamOf } from "@/lib/health/list"
import type { Issue } from "@/lib/jira/types"
import { patchDataset } from "@/lib/resolutions/overlay"
import { isResolvable, type ResolvableField } from "@/lib/resolutions/types"
import type { Backend, DataUpdate, LiveStatus, LoadedData } from "@/providers/data-source"
import type { FileData, FileSource } from "@/providers/static-data-source"

export const DEMO_CHANGES_PREFIX = "jira-health:demo-changes:"
export const DEMO_CONNECTION_KEY = "jira-health:demo-connection"
export const DEMO_SIMULATE_KEY = "jira-health:demo-simulate"

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

type Options = {
  files: FileSource
  storage?: StorageLike | null
  /** How long the mock Jira takes to answer. */
  latencyMs?: number
  /** The stand-in feed's gap between changes: a random time in [min, max]. */
  simulateEveryMs?: [number, number]
  random?: () => number
  now?: () => Date
  newId?: () => string
}

const DEMO_USER = { id: "demo-you", displayName: "You (demo)" }

/** Apply fixes in order, each to the issue as the previous ones left it. */
function replay(base: FileData, fixes: readonly Fix[]): LoadedData {
  const patches = new Map<string, Partial<Issue>>()
  for (const f of fixes) {
    const original = base.dataset.byKey.get(f.issueKey)
    if (!original) continue
    const issue = { ...original, ...patches.get(f.issueKey) }
    patches.set(f.issueKey, { ...patches.get(f.issueKey), ...issuePatch(issue, f.update, f.at) })
  }
  return {
    dataset: patchDataset(base.dataset, patches),
    origin: base.origin,
    revision: `${base.dataset.meta.generatedAt}#${fixes.length}`,
    fixes: [...fixes],
  }
}

/** A plausible value someone would enter in Jira for one gap, or null. */
function valueFor(field: ResolvableField, issue: Issue, data: LoadedData, random: () => number): JiraUpdate | null {
  const { dataset } = data
  const s = suggest(issue, field, dataset)
  switch (field) {
    case "storyPoints":
      return { storyPoints: s?.field === "storyPoints" ? s.value : 3 }
    case "assigneeId": {
      if (s?.field === "assigneeId") return { assigneeId: s.value }
      const team = dataset.teamById.get(teamOf(issue, dataset) ?? "")
      const pick = team?.memberIds[Math.floor(random() * team.memberIds.length)]
      return pick ? { assigneeId: pick } : null
    }
    case "epicKey":
      return s?.field === "epicKey" ? { epicKey: s.value } : null
    case "priority":
      return { priority: s?.field === "priority" ? s.value : "Medium" }
    case "labels":
      return s?.field === "labels" ? { labels: s.value } : null
    case "sprintIds": {
      const team = teamOf(issue, dataset)
      const sprint = dataset.sprints.find((sp) => sp.state === "active" && sp.teamId === team)
      return sprint ? { sprintId: sprint.id } : null
    }
    case "resolved":
      return { resolution: "Done" }
  }
}

export function createDemoBackend({
  files,
  storage = defaultStorage(),
  latencyMs = 650,
  simulateEveryMs = [45_000, 90_000],
  random = Math.random,
  now = () => new Date(),
  newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(random() * 1e9)}`,
}: Options): Backend {
  let base: FileData | null = null
  let fixes: Fix[] = []
  let current: LoadedData | null = null
  let connection: JiraConnection | null = read(DEMO_CONNECTION_KEY, (v) => v as JiraConnection)
  let simulate = storage?.getItem(DEMO_SIMULATE_KEY) !== "off"

  const listeners = new Set<(u: DataUpdate) => void>()
  const emit = (u: DataUpdate) => listeners.forEach((l) => l(u))
  const status = (): LiveStatus => ({ state: "live", checkedAt: now().toISOString(), simulated: true })

  function read<T>(key: string, parse: (v: unknown) => T): T | null {
    try {
      const raw = storage?.getItem(key)
      return raw ? parse(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }
  function write(key: string, value: unknown) {
    try {
      if (value === null) storage?.removeItem(key)
      else storage?.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full or blocked: changes last for this visit only.
    }
  }
  const changesKey = () => `${DEMO_CHANGES_PREFIX}${base!.dataset.meta.generatedAt}`

  /** Switch to a dataset, with the changes kept for it. */
  function switchTo(next: FileData): LoadedData {
    base = next
    fixes = read(changesKey(), (v) => z.array(fixSchema).parse(v)) ?? []
    current = replay(base, fixes)
    return current
  }

  function commit(fix: Fix) {
    fixes = [...fixes, fix]
    write(changesKey(), fixes)
    current = replay(base!, fixes)
    emit({ kind: "data", data: current })
    emit({ kind: "status", status: status() })
  }

  const wait = () => new Promise((r) => setTimeout(r, latencyMs))

  /** The stand-in feed: someone fills one gap on an active-sprint ticket, in Jira. */
  function simulateOnce() {
    if (!current) return
    const candidates = checkDataset(current.dataset).filter((h) => h.gaps.length > 0 && inScope(h.issue, DEFAULT_FILTERS, current!.dataset))
    if (candidates.length === 0) return
    const h = candidates[Math.floor(random() * candidates.length)]
    for (const gap of h.gaps) {
      if (!isResolvable(gap.field)) continue
      const update = valueFor(gap.field, h.issue, current, random)
      if (!update || Object.keys(mockJiraErrors(h.issue, update, current.dataset)).length) continue
      const team = current.dataset.teamById.get(teamOf(h.issue, current.dataset) ?? "")
      const personId = team?.memberIds[Math.floor(random() * team.memberIds.length)]
      const by = (personId && current.dataset.personById.get(personId)) || current.dataset.people[0] || { id: "someone", displayName: "Someone" }
      commit({ id: newId(), issueKey: h.issue.key, update, by: { id: by.id, displayName: by.displayName }, at: now().toISOString(), via: "jira", usedSuggestion: [] })
      return
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    if (!simulate || listeners.size === 0) return
    const [min, max] = simulateEveryMs
    timer = setTimeout(() => {
      simulateOnce()
      schedule()
    }, min + random() * (max - min))
  }

  const config = (): ServerConfig => ({
    mode: "demo",
    version: "demo",
    dataAccess: "open",
    jira: {
      writer: "mock",
      flavour: "datacenter",
      baseUrl: current?.dataset.meta.jiraBaseUrl ?? null,
      authKinds: ["demo"],
      tokenHelpUrl: null,
      resolutions: DEFAULT_RESOLUTIONS,
    },
  })

  return {
    mode: "demo",
    data: {
      load: async () => switchTo(await files.load()),
      refresh: async () => current ?? switchTo(await files.load()),
      subscribe(listener) {
        listeners.add(listener)
        listener({ kind: "status", status: status() })
        schedule()
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) clearTimeout(timer)
        }
      },
      files: {
        async loadFile(file) {
          const { data, remembered } = await files.loadFile(file)
          return { data: switchTo(data), remembered }
        },
        reset: async () => switchTo(await files.reset()),
      },
    },
    jira: {
      config: async () => config(),
      connection: async () => connection,
      async connect(request) {
        if (request.kind !== "demo") throw new Error("The demo connects with a demo account; nothing real is used.")
        connection = { user: DEMO_USER, authKind: "demo", connectedAt: now().toISOString() }
        write(DEMO_CONNECTION_KEY, connection)
        return connection
      },
      async disconnect() {
        connection = null
        write(DEMO_CONNECTION_KEY, null)
      },
      async resolve(issueKey, request) {
        await wait()
        if (!connection) return { ok: false, code: "not-connected", message: "Connect to Jira to resolve tickets.", fieldErrors: {} }
        const checked = checkResolve(issueKey, request, current?.dataset ?? null)
        if (!checked.ok) return checked
        const fieldErrors = mockJiraErrors(checked.issue, checked.update, current!.dataset, DEFAULT_RESOLUTIONS)
        if (Object.keys(fieldErrors).length) {
          return { ok: false, code: "rejected", message: "Jira didn't accept these values; nothing was changed.", fieldErrors }
        }
        const written = updateFields(checked.update)
        const { fix } = recordWrite(checked, written, connection.user, now().toISOString(), newId())
        commit(fix)
        return { ok: true, fix, written: written.map((f) => HEALTH_FIELD_FOR[f]), fieldErrors: {} }
      },
    },
    demo: {
      simulation: {
        enabled: () => simulate,
        setEnabled(on) {
          simulate = on
          write(DEMO_SIMULATE_KEY, null)
          if (!on) storage?.setItem(DEMO_SIMULATE_KEY, "off")
          schedule()
        },
      },
      async reset() {
        if (!base) return
        fixes = []
        write(changesKey(), null)
        current = replay(base, fixes)
        emit({ kind: "data", data: current })
      },
    },
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
