/** Builders for server tests: the app in memory, on the mock data, with the mock Jira. */
import { readFileSync } from "node:fs"
import { toExportDoc, type ExportDoc } from "../src/lib/api/contract"
import { parseExportText } from "../src/lib/jira/adapter"
import { buildApp, CSRF_HEADER, CSRF_VALUE, SESSION_COOKIE } from "./app"
import { loadEnv } from "./env"
import type { JiraClient } from "./jira/client"
import { createMockJiraClient } from "./jira/mock-client"
import { createMemorySessionStore, createSessions, createTokenCipher } from "./jira/sessions"
import { createMemoryIssueStore } from "./store/issue-store"

export const TEST_KEY = "test-encryption-key-that-is-at-least-32-chars"

export const mockDoc = (): ExportDoc => toExportDoc(parseExportText(readFileSync("src/data/mock/trawler-export.json", "utf8")))

export const testEnv = (overrides: Record<string, string> = {}) =>
  loadEnv({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: TEST_KEY, LOG_LEVEL: "silent", INGEST_TOKEN: "ingest-secret", ...overrides })

export async function testApp({
  env = {},
  doc = mockDoc(),
  jira = createMockJiraClient({ resolutions: ["Done", "Won't Do"] }),
  now = () => new Date("2026-11-04T10:00:00Z"),
}: { env?: Record<string, string>; doc?: ExportDoc | null; jira?: JiraClient; now?: () => Date } = {}) {
  const store = createMemoryIssueStore(doc)
  const sessionStore = createMemorySessionStore()
  const app = await buildApp({
    env: testEnv(env),
    store,
    jira,
    sessions: createSessions({ store: sessionStore, cipher: createTokenCipher(TEST_KEY), ttlHours: 12, now }),
    version: "test",
    logger: false,
    now,
  })
  await app.ready()
  return { app, store, sessionStore }
}

export const csrf = { [CSRF_HEADER]: CSRF_VALUE }

/** Connect with a token and return the session cookie header. */
export async function connectAs(app: Awaited<ReturnType<typeof testApp>>["app"], token = "pat-token-123") {
  const res = await app.inject({ method: "POST", url: "/api/jira/connection", headers: csrf, payload: { kind: "pat", token } })
  const set = res.cookies.find((c) => c.name === SESSION_COOKIE)
  if (!set) throw new Error(`Connect failed: ${res.statusCode} ${res.body}`)
  return { cookie: `${SESSION_COOKIE}=${set.value}`, res }
}
