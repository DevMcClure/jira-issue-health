import { describe, expect, it } from "vitest"
import { EnvError, loadEnv } from "./env"

const KEY = "k".repeat(32)
const problems = (raw: Record<string, string>) => {
  try {
    loadEnv(raw)
    return []
  } catch (err) {
    return (err as EnvError).problems
  }
}

describe("server settings", () => {
  it("runs on memory data with the mock Jira given only an encryption key", () => {
    const env = loadEnv({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: KEY })
    expect(env).toMatchObject({ JIRA_MODE: "mock", PORT: 8787, BASE_PATH: "", COOKIE_SECURE: true })
  })

  it("needs a MongoDB URL and database name for live data", () => {
    expect(problems({ TOKEN_ENCRYPTION_KEY: KEY })).toEqual([
      "MONGO_URI is required with DATA_STORE=mongo",
      "MONGO_DB_NAME is required with DATA_STORE=mongo",
    ])
    expect(problems({ TOKEN_ENCRYPTION_KEY: KEY, MONGO_URI: "postgres://x", MONGO_DB_NAME: "health" })[0]).toMatch(/MONGO_URI/)
    expect(problems({ TOKEN_ENCRYPTION_KEY: KEY, MONGO_URI: "mongodb+srv://cluster.example.net", MONGO_DB_NAME: "health" })).toEqual([])
  })

  it("needs the Jira URL and field ids to write to a real Jira", () => {
    expect(problems({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: KEY, JIRA_MODE: "rest" })).toEqual([
      "JIRA_BASE_URL is required with JIRA_MODE=rest",
      "JIRA_FIELD_STORY_POINTS is required with JIRA_MODE=rest (e.g. customfield_10016)",
      "JIRA_FIELD_EPIC_LINK is required with JIRA_MODE=rest on Data Center (e.g. customfield_10014)",
    ])
  })

  it("refuses a short encryption key, a wildcard origin and insecure cross-site cookies", () => {
    expect(problems({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: "short" })[0]).toMatch(/TOKEN_ENCRYPTION_KEY/)
    expect(problems({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: KEY, CORS_ORIGIN: "*" })[0]).toMatch(/CORS_ORIGIN/)
    expect(problems({ DATA_STORE: "memory", TOKEN_ENCRYPTION_KEY: KEY, COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" })[0]).toMatch(/COOKIE_SAMESITE/)
  })
})
