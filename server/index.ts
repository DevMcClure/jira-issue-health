/**
 * Start the server: validate settings, connect to the data store, seed if asked,
 * then listen. Every setting comes from the environment (see .env.example).
 */
import { readFile } from "node:fs/promises"
import { toExportDoc } from "../src/lib/api/contract"
import { parseExportText } from "../src/lib/jira/adapter"
import { buildApp } from "./app"
import { connect, ensureIndexes } from "./db"
import { EnvError, loadEnv, type Env } from "./env"
import type { JiraClient } from "./jira/client"
import { createMockJiraClient } from "./jira/mock-client"
import { createJiraRestClient } from "./jira/rest-client"
import { createMemorySessionStore, createMongoSessionStore, createSessions, createTokenCipher, type SessionStore } from "./jira/sessions"
import { createMemoryIssueStore, type IssueStore } from "./store/issue-store"
import { createMongoIssueStore } from "./store/mongo-issue-store"

const VERSION = process.env.npm_package_version ?? "0.0.0"
/** The bundled mock export, relative to the working directory (the repo root). */
const MOCK_DATA = "src/data/mock/trawler-export.json"

const mockData = async () => toExportDoc(parseExportText(await readFile(MOCK_DATA, "utf8")))

function jiraClient(env: Env): JiraClient {
  if (env.JIRA_MODE === "mock") return createMockJiraClient({ resolutions: env.JIRA_RESOLUTIONS, delayMs: 400 })
  return createJiraRestClient({
    baseUrl: env.JIRA_BASE_URL!,
    flavour: env.JIRA_FLAVOUR,
    fields: { storyPoints: env.JIRA_FIELD_STORY_POINTS!, epicLink: env.JIRA_FIELD_EPIC_LINK },
    timeoutMs: env.JIRA_TIMEOUT_SECONDS * 1000,
  })
}

async function main() {
  let env: Env
  try {
    env = loadEnv()
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }

  let store: IssueStore
  let sessionStore: SessionStore
  let closeDb = async () => {}
  if (env.DATA_STORE === "memory") {
    console.warn("DATA_STORE=memory: serving the bundled mock data; nothing is kept after a restart.")
    store = createMemoryIssueStore(await mockData())
    sessionStore = createMemorySessionStore()
  } else {
    const { client, db } = await connect(env)
    await ensureIndexes(db)
    closeDb = () => client.close()
    const log = { info: (m: string) => console.info(m), warn: (o: object, m: string) => console.warn(m, o) }
    store = createMongoIssueStore(db, { pollMs: env.LIVE_POLL_SECONDS * 1000, log })
    sessionStore = createMongoSessionStore(db)
    if (env.SEED_MOCK && !(await store.snapshot())) {
      await store.replace(await mockData())
      console.info("Seeded the empty database with the mock data (SEED_MOCK=true).")
    }
  }

  const app = await buildApp({
    env,
    store,
    jira: jiraClient(env),
    sessions: createSessions({ store: sessionStore, cipher: createTokenCipher(env.TOKEN_ENCRYPTION_KEY), ttlHours: env.SESSION_TTL_HOURS }),
    version: VERSION,
  })

  const shutdown = async (signal: string) => {
    app.log.info(`${signal}: shutting down`)
    await app.close()
    await store.close()
    await closeDb()
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))

  await app.listen({ host: env.HOST, port: env.PORT })
  app.log.info(`Jira mode: ${env.JIRA_MODE}${env.JIRA_MODE === "rest" ? ` (${env.JIRA_FLAVOUR}, ${env.JIRA_BASE_URL})` : ""}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
