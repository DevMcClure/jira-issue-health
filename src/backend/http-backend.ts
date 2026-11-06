/**
 * The web app's side of the Jira Health server API (server/app.ts). Cookies carry
 * the Jira connection, so every request sends credentials; the browser never sees
 * a Jira token after connecting.
 */
import type { ConnectRequest, Fix, JiraConnection, LiveEvent, ResolveResult, ServerConfig } from "@/lib/api/contract"
import { parseExportText } from "@/lib/jira/adapter"
import type { Backend, DataUpdate, LiveState, LiveStatus, LoadedData } from "@/providers/data-source"
import { NeedsConnectionError } from "@/providers/data-source"

type EventSourceCtor = new (url: string, init?: EventSourceInit) => EventSource

type Options = {
  /** e.g. "/api" (same origin, or Vite's dev proxy) or "https://health.example.com/api". */
  baseUrl: string
  fetch?: typeof globalThis.fetch
  /** Missing (very old browsers, tests): the source polls instead. */
  EventSource?: EventSourceCtor | null
  /** Polling interval without server-sent events. */
  pollMs?: number
  now?: () => Date
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export function createHttpBackend({
  baseUrl,
  fetch = globalThis.fetch.bind(globalThis),
  EventSource = globalThis.EventSource ?? null,
  pollMs = 30_000,
  now = () => new Date(),
}: Options): Backend {
  const root = baseUrl.replace(/\/+$/, "")

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(`${root}${path}`, {
        ...init,
        credentials: "include",
        headers: { "X-Requested-With": "jira-health", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      })
    } catch {
      throw new ApiError(0, `Couldn't reach the Jira Health server at ${root}. Check it's running, then retry.`)
    }
  }

  const errorText = async (res: Response) => {
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      return body.error ?? body.message ?? `The server answered ${res.status}.`
    } catch {
      return `The server answered ${res.status}.`
    }
  }

  // --- Data -----------------------------------------------------------------

  let current: LoadedData | null = null
  let etag: string | null = null

  async function fetchFixes(): Promise<Fix[]> {
    const res = await call("/fixes")
    return res.ok ? ((await res.json()) as { fixes: Fix[] }).fixes : []
  }

  /** The data now; reuses what we have when the server says it hasn't changed. */
  async function fetchData(): Promise<LoadedData> {
    const res = await call("/dataset", { headers: current && etag ? { "If-None-Match": etag } : {} })
    if (res.status === 304 && current) return current
    if (res.status === 401) throw new NeedsConnectionError()
    if (!res.ok) throw new ApiError(res.status, await errorText(res))
    const [text, fixes] = await Promise.all([res.text(), fetchFixes()])
    etag = res.headers.get("ETag")
    current = { dataset: parseExportText(text), origin: { kind: "live" }, revision: etag ?? String(Date.now()), fixes }
    return current
  }

  const listeners = new Set<(u: DataUpdate) => void>()
  const emit = (u: DataUpdate) => listeners.forEach((l) => l(u))
  let status: LiveStatus = { state: "connecting", checkedAt: null, simulated: false }
  const setState = (state: LiveState, checked = false) => {
    status = { ...status, state, checkedAt: checked ? now().toISOString() : status.checkedAt }
    emit({ kind: "status", status })
  }

  /** Refetch and tell listeners when the data changed. */
  async function pull() {
    const before = current
    const next = await fetchData()
    setState("live", true)
    if (next !== before) emit({ kind: "data", data: next })
    return next
  }

  /** Server-sent events, falling back to polling. Started by the first subscriber. */
  function startLive(): () => void {
    let stopped = false
    let source: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let retryMs = 2_000

    const poll = () => {
      timer = setTimeout(async () => {
        if (stopped) return
        try {
          await pull()
        } catch {
          setState("offline")
        }
        poll()
      }, pollMs)
    }

    const open = () => {
      if (stopped) return
      if (!EventSource) {
        setState("live")
        poll()
        return
      }
      source = new EventSource(`${root}/events`, { withCredentials: true })
      source.onopen = () => {
        retryMs = 2_000
        setState("live", true)
      }
      source.addEventListener("dataset", (e) => {
        const { revision } = JSON.parse((e as MessageEvent).data) as Extract<LiveEvent, { type: "dataset" }>
        if (current && etag === `"${revision}"`) return setState("live", true)
        pull().catch(() => setState("reconnecting"))
      })
      source.addEventListener("fix", (e) => {
        const { fix } = JSON.parse((e as MessageEvent).data) as Extract<LiveEvent, { type: "fix" }>
        if (!current || current.fixes.some((f) => f.id === fix.id)) return
        current = { ...current, fixes: [...current.fixes, fix] }
        emit({ kind: "data", data: current })
      })
      source.onerror = () => {
        // The browser retries on its own while CONNECTING; once CLOSED, we reopen with backoff.
        if (source?.readyState === 2) {
          source.close()
          setState("offline")
          timer = setTimeout(open, retryMs)
          retryMs = Math.min(retryMs * 2, 60_000)
        } else {
          setState("reconnecting")
        }
      }
    }

    // Catch up as soon as the tab is back or the network returns.
    const wake = () => {
      if (document.visibilityState === "visible") pull().catch(() => setState("offline"))
    }
    const hasDom = typeof window !== "undefined" && typeof document !== "undefined"
    if (hasDom) {
      document.addEventListener("visibilitychange", wake)
      window.addEventListener("online", wake)
    }
    open()

    return () => {
      stopped = true
      clearTimeout(timer)
      source?.close()
      if (hasDom) {
        document.removeEventListener("visibilitychange", wake)
        window.removeEventListener("online", wake)
      }
    }
  }

  let stopLive: (() => void) | null = null

  // --- Jira -----------------------------------------------------------------

  const jsonOrThrow = async <T>(res: Response): Promise<T> => {
    if (!res.ok) throw new ApiError(res.status, await errorText(res))
    return (await res.json()) as T
  }

  return {
    mode: "api",
    data: {
      async load() {
        const data = await fetchData()
        status = { ...status, checkedAt: now().toISOString() }
        return data
      },
      refresh: pull,
      subscribe(listener) {
        listeners.add(listener)
        listener({ kind: "status", status })
        stopLive ??= startLive()
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) {
            stopLive?.()
            stopLive = null
          }
        }
      },
    },
    jira: {
      config: async () => jsonOrThrow<ServerConfig>(await call("/config")),
      connection: async () => (await jsonOrThrow<{ connection: JiraConnection | null }>(await call("/jira/connection"))).connection,
      async connect(request: ConnectRequest) {
        const res = await call("/jira/connection", { method: "POST", body: JSON.stringify(request) })
        return (await jsonOrThrow<{ connection: JiraConnection }>(res)).connection
      },
      async disconnect() {
        await jsonOrThrow(await call("/jira/connection", { method: "DELETE" }))
      },
      async resolve(issueKey, request) {
        const res = await call(`/issues/${encodeURIComponent(issueKey)}/resolve`, { method: "POST", body: JSON.stringify(request) })
        try {
          return (await res.json()) as ResolveResult
        } catch {
          return { ok: false, code: "jira-unreachable", message: `The server answered ${res.status}.`, fieldErrors: {} }
        }
      },
    },
  }
}
