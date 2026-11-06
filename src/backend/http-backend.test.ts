import sample from "@/data/mock/trawler-export.json?raw"
import { describe, expect, it } from "vitest"
import type { DataUpdate } from "@/providers/data-source"
import { NeedsConnectionError } from "@/providers/data-source"
import { createHttpBackend } from "./http-backend"


type Route = (init: RequestInit & { url: string }) => Response | Promise<Response>

/** A fake server: routes by path, records requests. */
function fakeServer(routes: Record<string, Route>) {
  const requests: (RequestInit & { url: string })[] = []
  const fetch = (async (url: string, init: RequestInit = {}) => {
    const req = { ...init, url }
    requests.push(req)
    const path = url.replace("http://h/api", "").split("?")[0]
    const route = routes[`${init.method ?? "GET"} ${path}`]
    if (!route) return new Response(JSON.stringify({ error: "nope" }), { status: 404 })
    return route(req)
  }) as unknown as typeof globalThis.fetch
  return { fetch, requests }
}

/** A controllable EventSource. */
class FakeEventSource {
  static last: FakeEventSource
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, ((e: { data: string }) => void)[]>()
  url: string
  init?: EventSourceInit
  constructor(url: string, init?: EventSourceInit) {
    this.url = url
    this.init = init
    FakeEventSource.last = this
  }
  addEventListener(type: string, fn: (e: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) })
  }
  close() {
    this.readyState = 2
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

describe("HTTP backend", () => {
  it("loads the dataset and recent fixes, sending cookies and the CSRF header", async () => {
    const { fetch, requests } = fakeServer({
      "GET /dataset": () => new Response(sample, { headers: { ETag: '"rev-1"' } }),
      "GET /fixes": () => json({ fixes: [] }),
    })
    const backend = createHttpBackend({ baseUrl: "http://h/api/", fetch, EventSource: null })
    const data = await backend.data.load()
    expect(data).toMatchObject({ origin: { kind: "live" }, revision: '"rev-1"', fixes: [] })
    expect(data.dataset.issues).toHaveLength(240)
    expect(requests[0]).toMatchObject({ credentials: "include", headers: { "X-Requested-With": "jira-health" } })
  })

  it("explains an unreachable server and a server that needs a Jira connection", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof globalThis.fetch
    await expect(createHttpBackend({ baseUrl: "http://h/api", fetch: down }).data.load()).rejects.toThrow(/Couldn't reach the Jira Health server at http:\/\/h\/api/)
    const locked = fakeServer({ "GET /dataset": () => json({ error: "Connect" }, 401) })
    await expect(createHttpBackend({ baseUrl: "http://h/api", fetch: locked.fetch }).data.load()).rejects.toBeInstanceOf(NeedsConnectionError)
  })

  it("refetches when the live feed announces a new revision, and adds fixes as they arrive", async () => {
    let revision = "rev-1"
    const { fetch, requests } = fakeServer({
      "GET /dataset": (req) =>
        (req.headers as Record<string, string>)["If-None-Match"] === `"${revision}"`
          ? new Response(null, { status: 304 })
          : new Response(sample, { headers: { ETag: `"${revision}"` } }),
      "GET /fixes": () => json({ fixes: [] }),
    })
    const backend = createHttpBackend({ baseUrl: "http://h/api", fetch, EventSource: FakeEventSource as never })
    await backend.data.load()
    const updates: DataUpdate[] = []
    backend.data.subscribe((u) => updates.push(u))
    const es = FakeEventSource.last
    expect(es.init).toEqual({ withCredentials: true })
    es.onopen?.()
    expect(updates.at(-1)).toMatchObject({ kind: "status", status: { state: "live" } })

    // Same revision: no refetch.
    const before = requests.length
    es.emit("dataset", { type: "dataset", revision: "rev-1" })
    await new Promise((r) => setTimeout(r, 0))
    expect(requests.length).toBe(before)

    revision = "rev-2"
    es.emit("dataset", { type: "dataset", revision: "rev-2" })
    await new Promise((r) => setTimeout(r, 0))
    const data = updates.filter((u) => u.kind === "data").at(-1)
    expect(data && data.kind === "data" && data.data.revision).toBe('"rev-2"')

    const fix = { id: "f1", issueKey: "WEB-877", update: { storyPoints: 3 }, by: { id: "u", displayName: "U" }, at: "2026-11-04T10:00:00Z", via: "app", usedSuggestion: [] }
    es.emit("fix", { type: "fix", fix })
    const withFix = updates.filter((u) => u.kind === "data").at(-1)
    expect(withFix && withFix.kind === "data" && withFix.data.fixes.map((f) => f.id)).toEqual(["f1"])

    es.onerror?.()
    expect(updates.at(-1)).toMatchObject({ kind: "status", status: { state: "reconnecting" } })
  })

  it("sends Resolve to the server and passes its answer back, failures included", async () => {
    const refused = { ok: false, code: "rejected", message: "No", fieldErrors: { epicKey: "Not an epic" } }
    const { fetch, requests } = fakeServer({ "POST /issues/WEB-877/resolve": () => json(refused, 422) })
    const backend = createHttpBackend({ baseUrl: "http://h/api", fetch })
    expect(await backend.jira.resolve("WEB-877", { update: { epicKey: "X" } })).toEqual(refused)
    expect(JSON.parse(requests[0].body as string)).toEqual({ update: { epicKey: "X" } })
  })

  it("reports the server's reason when connecting fails", async () => {
    const { fetch } = fakeServer({ "POST /jira/connection": () => json({ error: "Jira didn't accept that token." }, 401) })
    await expect(createHttpBackend({ baseUrl: "http://h/api", fetch }).jira.connect({ kind: "pat", token: "nope-nope" })).rejects.toThrow(
      "Jira didn't accept that token.",
    )
  })
})
