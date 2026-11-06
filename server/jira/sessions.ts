/**
 * People's Jira connections. Connecting checks the token with Jira, then keeps it
 * server-side, encrypted (AES-256-GCM), under a random session id that only the
 * browser's httpOnly cookie holds. The database stores a hash of that id, so a
 * database dump hands out neither sessions nor Jira tokens.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto"
import type { Db } from "mongodb"
import type { JiraConnection } from "../../src/lib/api/contract"
import { collections, type SessionDoc } from "../db"
import type { JiraCredentials } from "./client"

export type TokenCipher = { encrypt(plain: string): string; decrypt(sealed: string): string }

export function createTokenCipher(secret: string): TokenCipher {
  const key = scryptSync(secret, "jira-health/jira-token/v1", 32)
  return {
    encrypt(plain) {
      const iv = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, iv)
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
      return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`
    },
    decrypt(sealed) {
      if (!sealed.startsWith("v1.")) throw new Error("Unknown token format")
      const raw = Buffer.from(sealed.slice(3), "base64url")
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
    },
  }
}

const hashId = (id: string) => createHash("sha256").update(id).digest("base64url")

export interface SessionStore {
  insert(doc: SessionDoc): Promise<void>
  get(id: string): Promise<SessionDoc | null>
  delete(id: string): Promise<void>
}

export function createMongoSessionStore(db: Db): SessionStore {
  const { sessions } = collections(db)
  return {
    insert: async (doc) => void (await sessions.insertOne(doc)),
    get: (id) => sessions.findOne({ _id: id }),
    delete: async (id) => void (await sessions.deleteOne({ _id: id })),
  }
}

export function createMemorySessionStore(): SessionStore & { docs: Map<string, SessionDoc> } {
  const docs = new Map<string, SessionDoc>()
  return {
    docs,
    insert: async (doc) => void docs.set(doc._id, structuredClone(doc)),
    get: async (id) => structuredClone(docs.get(id) ?? null),
    delete: async (id) => void docs.delete(id),
  }
}

export type ActiveSession = { connection: JiraConnection; credentials: JiraCredentials }

type Options = { store: SessionStore; cipher: TokenCipher; ttlHours: number; now?: () => Date }

export function createSessions({ store, cipher, ttlHours, now = () => new Date() }: Options) {
  return {
    ttlSeconds: Math.round(ttlHours * 3600),

    /** Keep a checked connection; returns the id for the cookie. */
    async start(credentials: JiraCredentials, user: JiraConnection["user"]): Promise<{ sessionId: string; connection: JiraConnection }> {
      const sessionId = randomBytes(32).toString("base64url")
      const createdAt = now()
      await store.insert({
        _id: hashId(sessionId),
        user,
        authKind: credentials.kind,
        credentials: cipher.encrypt(JSON.stringify(credentials)),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + ttlHours * 3600_000),
      })
      return { sessionId, connection: { user, authKind: credentials.kind, connectedAt: createdAt.toISOString() } }
    },

    /** The connection behind a cookie, or null when it's unknown, expired or unreadable. */
    async get(sessionId: string | undefined): Promise<ActiveSession | null> {
      if (!sessionId) return null
      const doc = await store.get(hashId(sessionId))
      if (!doc || doc.expiresAt <= now()) return null
      try {
        const credentials = JSON.parse(cipher.decrypt(doc.credentials)) as JiraCredentials
        return { credentials, connection: { user: doc.user, authKind: doc.authKind, connectedAt: doc.createdAt.toISOString() } }
      } catch {
        // E.g. TOKEN_ENCRYPTION_KEY changed: the person connects again.
        await store.delete(doc._id)
        return null
      }
    },

    async end(sessionId: string | undefined) {
      if (sessionId) await store.delete(hashId(sessionId))
    },
  }
}

export type Sessions = ReturnType<typeof createSessions>
