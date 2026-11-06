/**
 * MongoDB connection, collections and indexes. Works with any MongoDB: the
 * connection string, database name and optional TLS CA file come from env.
 */
import { MongoClient, type Db } from "mongodb"
import type { Fix } from "../src/lib/api/contract"
import type { Env } from "./env"

export async function connect(env: Pick<Env, "MONGO_URI" | "MONGO_DB_NAME" | "MONGO_TLS_CA_FILE">) {
  const client = new MongoClient(env.MONGO_URI!, {
    appName: "jira-health",
    serverSelectionTimeoutMS: 10_000,
    ...(env.MONGO_TLS_CA_FILE ? { tls: true, tlsCAFile: env.MONGO_TLS_CA_FILE } : {}),
  })
  await client.connect()
  return { client, db: client.db(env.MONGO_DB_NAME) }
}

/** Issue data (see store/mapping.ts for their documents). */
export const DATA_COLLECTIONS = ["meta", "teams", "people", "sprints", "issues"] as const

export type FixDoc = Omit<Fix, "id" | "at"> & { _id: string; at: Date }

/** One person's Jira connection. The session id is stored hashed and the token encrypted. */
export type SessionDoc = {
  _id: string
  user: { id: string; displayName: string }
  authKind: "pat" | "basic"
  /** AES-256-GCM sealed credentials (sessions.ts). */
  credentials: string
  createdAt: Date
  expiresAt: Date
}

export function collections(db: Db) {
  return {
    meta: db.collection<{ _id: string } & Record<string, unknown>>("meta"),
    teams: db.collection<{ _id: string } & Record<string, unknown>>("teams"),
    people: db.collection<{ _id: string } & Record<string, unknown>>("people"),
    sprints: db.collection<{ _id: number } & Record<string, unknown>>("sprints"),
    issues: db.collection<{ _id: string } & Record<string, unknown>>("issues"),
    fixes: db.collection<FixDoc>("fixes"),
    sessions: db.collection<SessionDoc>("jira_sessions"),
  }
}

/** Idempotent: safe on every startup. */
export async function ensureIndexes(db: Db) {
  const { fixes, sessions } = collections(db)
  await fixes.createIndex({ at: -1 }, { name: "at_desc" })
  await fixes.createIndex({ issueKey: 1, at: -1 }, { name: "issue_at" })
  // Mongo deletes a session once expiresAt has passed.
  await sessions.createIndex({ expiresAt: 1 }, { name: "expiresAt_ttl", expireAfterSeconds: 0 })
}
