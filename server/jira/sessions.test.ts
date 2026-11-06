import { describe, expect, it } from "vitest"
import { createMemorySessionStore, createSessions, createTokenCipher } from "./sessions"

const KEY = "a-test-key-that-is-long-enough-for-scrypt"

describe("Jira sessions", () => {
  it("round-trips credentials through encryption, and a different key can't read them", () => {
    const sealed = createTokenCipher(KEY).encrypt("secret")
    expect(sealed).not.toContain("secret")
    expect(createTokenCipher(KEY).decrypt(sealed)).toBe("secret")
    expect(() => createTokenCipher(`${KEY}-other`).decrypt(sealed)).toThrow()
  })

  it("expires connections after the TTL", async () => {
    let now = new Date("2026-11-04T10:00:00Z")
    const sessions = createSessions({ store: createMemorySessionStore(), cipher: createTokenCipher(KEY), ttlHours: 1, now: () => now })
    const { sessionId } = await sessions.start({ kind: "pat", token: "t" }, { id: "u", displayName: "U" })
    expect((await sessions.get(sessionId))?.credentials).toEqual({ kind: "pat", token: "t" })
    now = new Date("2026-11-04T11:00:01Z")
    expect(await sessions.get(sessionId)).toBeNull()
  })

  it("drops a connection it can no longer decrypt (the key changed)", async () => {
    const store = createMemorySessionStore()
    const before = createSessions({ store, cipher: createTokenCipher(KEY), ttlHours: 1 })
    const { sessionId } = await before.start({ kind: "pat", token: "t" }, { id: "u", displayName: "U" })
    const after = createSessions({ store, cipher: createTokenCipher(`${KEY}-rotated`), ttlHours: 1 })
    expect(await after.get(sessionId)).toBeNull()
    expect(store.docs.size).toBe(0)
  })
})
