import { afterEach, describe, expect, it } from "vitest"
import type { ResolveResult, ServerConfig } from "../src/lib/api/contract"
import { checkIssue } from "../src/lib/health/checks"
import { parseExport } from "../src/lib/jira/adapter"
import { SESSION_COOKIE } from "./app"
import { connectAs, csrf, mockDoc, testApp } from "./testkit"

let close: (() => Promise<unknown>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})
const start = async (opts?: Parameters<typeof testApp>[0]) => {
  const t = await testApp(opts)
  close = () => t.app.close()
  return t
}

const gapsOf = async (app: Awaited<ReturnType<typeof start>>["app"], key: string) => {
  const res = await app.inject({ url: "/api/dataset" })
  const issue = parseExport(res.json()).byKey.get(key)!
  return checkIssue(issue).gaps.map((g) => g.field)
}

describe("data", () => {
  it("serves the dataset with an ETag and answers 304 when it hasn't changed", async () => {
    const { app } = await start()
    const res = await app.inject({ url: "/api/dataset" })
    expect(res.statusCode).toBe(200)
    expect(parseExport(res.json()).issues).toHaveLength(240)
    const again = await app.inject({ url: "/api/dataset", headers: { "if-none-match": res.headers.etag as string } })
    expect(again.statusCode).toBe(304)
  })

  it("says there's no data yet rather than serving an empty list", async () => {
    const { app } = await start({ doc: null })
    expect((await app.inject({ url: "/api/dataset" })).statusCode).toBe(404)
  })

  it("reports Jira settings the web app needs, never secrets", async () => {
    const { app } = await start()
    const config = (await app.inject({ url: "/api/config" })).json<ServerConfig>()
    expect(config).toMatchObject({ mode: "api", dataAccess: "open", jira: { writer: "mock", authKinds: ["pat"] } })
    expect(JSON.stringify(config)).not.toMatch(/test-encryption-key|ingest-secret/)
  })

  it("can require a Jira connection to read the data", async () => {
    const { app } = await start({ env: { DATA_ACCESS: "connected" } })
    expect((await app.inject({ url: "/api/dataset" })).statusCode).toBe(401)
    const { cookie } = await connectAs(app)
    expect((await app.inject({ url: "/api/dataset", headers: { cookie } })).statusCode).toBe(200)
  })
})

describe("connecting to Jira", () => {
  it("checks the token with Jira and keeps it server-side behind an httpOnly cookie", async () => {
    const { app, sessionStore } = await start()
    const { res, cookie } = await connectAs(app, "pat-token-123")
    expect(res.json().connection.user.displayName).toBe("Mock Jira user")
    const set = res.cookies.find((c) => c.name === SESSION_COOKIE)!
    expect(set).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true, path: "/api" })
    // Stored encrypted, under a hash of the cookie's id.
    const [doc] = sessionStore.docs.values()
    expect(doc._id).not.toBe(set.value)
    expect(JSON.stringify(doc)).not.toContain("pat-token-123")

    const who = await app.inject({ url: "/api/jira/connection", headers: { cookie } })
    expect(who.json().connection.user.displayName).toBe("Mock Jira user")
  })

  it("refuses a token Jira doesn't accept", async () => {
    const { app } = await start()
    const res = await app.inject({ method: "POST", url: "/api/jira/connection", headers: csrf, payload: { kind: "pat", token: "bad-token-123" } })
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
  })

  it("rejects state-changing requests without the CSRF header", async () => {
    const { app } = await start()
    const res = await app.inject({ method: "POST", url: "/api/jira/connection", payload: { kind: "pat", token: "pat-token-123" } })
    expect(res.statusCode).toBe(403)
  })

  it("forgets the token on disconnect", async () => {
    const { app, sessionStore } = await start()
    const { cookie } = await connectAs(app)
    await app.inject({ method: "DELETE", url: "/api/jira/connection", headers: { ...csrf, cookie } })
    expect(sessionStore.docs.size).toBe(0)
    expect((await app.inject({ url: "/api/jira/connection", headers: { cookie } })).json().connection).toBeNull()
  })
})

describe("resolving in Jira", () => {
  const resolve = (app: Awaited<ReturnType<typeof start>>["app"], key: string, update: object, cookie?: string) =>
    app.inject({
      method: "POST",
      url: `/api/issues/${key}/resolve`,
      headers: { ...csrf, ...(cookie ? { cookie } : {}) },
      payload: { update, usedSuggestion: ["assigneeId"] },
    })

  it("needs a Jira connection", async () => {
    const { app } = await start()
    const res = await resolve(app, "WEB-877", { storyPoints: 3 })
    expect(res.statusCode).toBe(401)
    expect(res.json<ResolveResult>()).toMatchObject({ ok: false, code: "not-connected" })
  })

  // WEB-877 is missing story points, assignee and epic.
  it("writes the values, updates the data straight away and records who fixed it", async () => {
    const { app } = await start()
    const { cookie } = await connectAs(app)
    const res = await resolve(app, "WEB-877", { storyPoints: 3, assigneeId: "u-07", epicKey: "WEB-805" }, cookie)
    expect(res.statusCode).toBe(200)
    const body = res.json<Extract<ResolveResult, { ok: true }>>()
    expect(body.written).toEqual(["storyPoints", "assigneeId", "epicKey"])
    expect(body.fix).toMatchObject({ issueKey: "WEB-877", via: "app", by: { displayName: "Mock Jira user" }, usedSuggestion: ["assigneeId"] })
    expect(await gapsOf(app, "WEB-877")).toEqual([])

    const fixes = (await app.inject({ url: "/api/fixes" })).json().fixes
    expect(fixes.map((f: { issueKey: string }) => f.issueKey)).toEqual(["WEB-877"])
  })

  it("passes Jira's refusal back per field and changes nothing", async () => {
    const { app } = await start()
    const { cookie } = await connectAs(app)
    const res = await resolve(app, "WEB-877", { storyPoints: 3, epicKey: "WEB-877" }, cookie)
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ ok: false, code: "rejected", fieldErrors: { epicKey: "'WEB-877' is not an epic." } })
    expect(await gapsOf(app, "WEB-877")).toEqual(["storyPoints", "assigneeId", "epicKey"])
  })

  it("won't overwrite a field someone filled in after the dialog opened", async () => {
    const { app, store } = await start()
    const { cookie } = await connectAs(app)
    await store.patchIssue("WEB-877", { storyPoints: 5 })
    const res = await resolve(app, "WEB-877", { storyPoints: 3 }, cookie)
    expect(res.statusCode).toBe(409)
    expect(res.json().fieldErrors.storyPoints).toMatch(/Already set in Jira \(5 points\)/)
  })

  it("rejects malformed updates before calling Jira", async () => {
    const { app } = await start()
    const { cookie } = await connectAs(app)
    expect((await resolve(app, "WEB-877", { storyPoints: -1 }, cookie)).statusCode).toBe(400)
    expect((await resolve(app, "WEB-877", { team: "x" }, cookie)).statusCode).toBe(400)
    expect((await resolve(app, "WEB-877", {}, cookie)).statusCode).toBe(400)
    expect((await resolve(app, "NOPE-1", { storyPoints: 1 }, cookie)).statusCode).toBe(404)
  })

  it("disconnects when Jira stops accepting the token", async () => {
    const jira = {
      kind: "mock" as const,
      whoAmI: async () => ({ id: "u", displayName: "U" }),
      update: async () => ({ written: [], fieldErrors: {}, failure: { code: "not-connected" as const, message: "Expired" } }),
    }
    const { app, sessionStore } = await start({ jira })
    const { cookie } = await connectAs(app)
    const res = await resolve(app, "WEB-877", { storyPoints: 3 }, cookie)
    expect(res.statusCode).toBe(401)
    expect(sessionStore.docs.size).toBe(0)
  })
})

describe("ingest", () => {
  it("replaces the data with a Trawler export, given the ingest token", async () => {
    const { app } = await start()
    const doc = mockDoc()
    doc.issues = doc.issues.slice(0, 10)
    const unauthorised = await app.inject({ method: "POST", url: "/api/ingest", payload: doc })
    expect(unauthorised.statusCode).toBe(401)
    const res = await app.inject({ method: "POST", url: "/api/ingest", headers: { authorization: "Bearer ingest-secret" }, payload: doc })
    expect(res.json()).toMatchObject({ ok: true, issues: 10 })
    expect(parseExport((await app.inject({ url: "/api/dataset" })).json()).issues).toHaveLength(10)
  })

  it("lists what's wrong with an invalid export and keeps the current data", async () => {
    const { app } = await start()
    const res = await app.inject({
      method: "POST",
      url: "/api/ingest",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      payload: JSON.stringify({ issues: [{ key: "X-1" }] }),
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().problems.length).toBeGreaterThan(0)
    expect(parseExport((await app.inject({ url: "/api/dataset" })).json()).issues).toHaveLength(240)
  })
})

describe("live events", () => {
  it("streams the revision on connect and again when the data changes", async () => {
    const { app } = await start()
    await app.listen({ port: 0, host: "127.0.0.1" })
    const { port } = app.server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${port}/api/events`)
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ""
    const readUntil = async (pattern: RegExp) => {
      while (!pattern.test(text)) text += decoder.decode((await reader.read()).value)
    }
    await readUntil(/event: dataset/)
    const first = /"revision":"([^"]+)"/.exec(text)![1]

    const { cookie } = await connectAs(app)
    text = ""
    await app.inject({
      method: "POST",
      url: "/api/issues/WEB-877/resolve",
      headers: { ...csrf, cookie },
      payload: { update: { storyPoints: 3 } },
    })
    await readUntil(/event: fix/)
    const second = /"revision":"([^"]+)"/.exec(text)![1]
    expect(second).not.toBe(first)
    await reader.cancel()
  })
})
