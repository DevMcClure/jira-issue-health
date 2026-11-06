import { describe, expect, it } from "vitest"
import { makeIssue } from "../../src/lib/health/test-issue"
import { parseExport } from "../../src/lib/jira/adapter"
import { JiraAuthError, JiraUnreachableError } from "./client"
import { createJiraRestClient, type RestClientOptions } from "./rest-client"

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown }

/** A fake Jira: answers each call with the next response and records the request. */
function fakeJira(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ method: init.method!, url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined })
    const r = responses.shift() ?? { status: 204 }
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof globalThis.fetch
  return { fetch, calls }
}

const ctx = parseExport({ issues: [] })
const pat = { kind: "pat" as const, token: "secret-pat" }
const dc = (fetch: typeof globalThis.fetch, extra: Partial<RestClientOptions> = {}) =>
  createJiraRestClient({
    baseUrl: "https://jira.example.com/",
    flavour: "datacenter",
    fields: { storyPoints: "customfield_10002", epicLink: "customfield_10008" },
    timeoutMs: 1000,
    fetch,
    ...extra,
  })

describe("Jira REST client", () => {
  it("edits fields in one request and adds the sprint through the Agile API (Data Center)", async () => {
    const { fetch, calls } = fakeJira([{ status: 204 }, { status: 204 }])
    const issue = makeIssue({ key: "WEB-9", labels: ["search", "old"] })
    const out = await dc(fetch).update(
      pat,
      issue,
      { storyPoints: 3, assigneeId: "jdoe", epicKey: "WEB-1", priority: "High", labels: ["search", "risk"], resolution: "Done", sprintId: 209 },
      ctx,
    )
    expect(out).toEqual({ written: ["storyPoints", "assigneeId", "epicKey", "priority", "labels", "resolution", "sprintId"], fieldErrors: {} })
    expect(calls[0]).toMatchObject({
      method: "PUT",
      url: "https://jira.example.com/rest/api/2/issue/WEB-9",
      body: {
        fields: {
          customfield_10002: 3,
          assignee: { name: "jdoe" },
          customfield_10008: "WEB-1",
          priority: { name: "High" },
          resolution: { name: "Done" },
        },
        // Only the difference, so labels added meanwhile survive.
        update: { labels: [{ add: "risk" }, { remove: "old" }] },
      },
    })
    expect(calls[0].headers.Authorization).toBe("Bearer secret-pat")
    expect(calls[1]).toMatchObject({ method: "POST", url: "https://jira.example.com/rest/agile/1.0/sprint/209/issue", body: { issues: ["WEB-9"] } })
  })

  it("uses account ids, the parent field and Basic auth on Cloud", async () => {
    const { fetch, calls } = fakeJira([{ status: 204 }])
    const cloud = createJiraRestClient({ baseUrl: "https://x.atlassian.net", flavour: "cloud", fields: { storyPoints: "customfield_10016" }, timeoutMs: 1000, fetch })
    await cloud.update({ kind: "basic", email: "a@example.com", token: "tok" }, makeIssue(), { assigneeId: "5b10a", epicKey: "WEB-1" }, ctx)
    expect(calls[0].body).toEqual({ fields: { assignee: { accountId: "5b10a" }, parent: { key: "WEB-1" } } })
    expect(calls[0].headers.Authorization).toBe(`Basic ${Buffer.from("a@example.com:tok").toString("base64")}`)
  })

  it("maps Jira's field errors back to the missing fields and skips the sprint", async () => {
    const { fetch, calls } = fakeJira([{ status: 400, body: { errorMessages: [], errors: { customfield_10008: "Epic 'WEB-1' is closed", assignee: "User 'jdoe' cannot be assigned issues." } } }])
    const out = await dc(fetch).update(pat, makeIssue(), { epicKey: "WEB-1", assigneeId: "jdoe", sprintId: 209 }, ctx)
    expect(out).toEqual({ written: [], fieldErrors: { epicKey: "Epic 'WEB-1' is closed", assigneeId: "User 'jdoe' cannot be assigned issues." } })
    expect(calls).toHaveLength(1)
  })

  it("reports a sprint refusal while keeping the fields that went through", async () => {
    const { fetch } = fakeJira([{ status: 204 }, { status: 400, body: { errorMessages: ["Sprint 107 is closed."] } }])
    const out = await dc(fetch).update(pat, makeIssue(), { storyPoints: 2, sprintId: 107 }, ctx)
    expect(out).toEqual({ written: ["storyPoints"], fieldErrors: { sprintIds: "Sprint 107 is closed." } })
  })

  it("turns 401/403/404 into whole-request failures", async () => {
    for (const [status, code] of [
      [401, "not-connected"],
      [403, "forbidden"],
      [404, "not-found"],
      [503, "jira-unreachable"],
    ] as const) {
      const { fetch } = fakeJira([{ status }])
      const out = await dc(fetch).update(pat, makeIssue(), { storyPoints: 1 }, ctx)
      expect(out.failure?.code).toBe(code)
    }
  })

  it("identifies the person, by user name on Data Center and account id on Cloud", async () => {
    const { fetch } = fakeJira([{ status: 200, body: { name: "jdoe", key: "JIRAUSER1", displayName: "Jo Doe" } }])
    expect(await dc(fetch).whoAmI(pat)).toEqual({ id: "jdoe", displayName: "Jo Doe" })
    const cloud = fakeJira([{ status: 200, body: { accountId: "5b10a", displayName: "Jo" } }])
    expect(await dc(cloud.fetch).whoAmI(pat)).toEqual({ id: "5b10a", displayName: "Jo" })
  })

  it("distinguishes a bad token from Jira being down", async () => {
    await expect(dc(fakeJira([{ status: 401 }]).fetch).whoAmI(pat)).rejects.toBeInstanceOf(JiraAuthError)
    const down = (async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof globalThis.fetch
    await expect(dc(down).whoAmI(pat)).rejects.toBeInstanceOf(JiraUnreachableError)
  })
})
