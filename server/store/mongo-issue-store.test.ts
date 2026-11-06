/**
 * Runs only with MONGO_TEST_URI, e.g.
 *   MONGO_TEST_URI=mongodb://localhost:27017 pnpm test server
 * Uses a throwaway database and drops it afterwards.
 */
import { randomUUID } from "node:crypto"
import { MongoClient, type Db } from "mongodb"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ensureIndexes } from "../db"
import { mockDoc } from "../testkit"
import { createMongoIssueStore } from "./mongo-issue-store"

const uri = process.env.MONGO_TEST_URI
const log = { info: () => {}, warn: () => {} }

describe.skipIf(!uri)("MongoDB issue store", () => {
  let client: MongoClient
  let db: Db

  beforeAll(async () => {
    client = await new MongoClient(uri!).connect()
    db = client.db(`jira_health_test_${randomUUID().slice(0, 8)}`)
    await ensureIndexes(db)
  })
  afterAll(async () => {
    await db?.dropDatabase()
    await client?.close()
  })

  it("stores a dataset and reads the same normalised data back", async () => {
    const store = createMongoIssueStore(db, { pollMs: 50, log })
    expect(await store.snapshot()).toBeNull()
    const doc = mockDoc()
    await store.replace(doc)
    expect(await store.snapshot()).toEqual(doc)

    // A smaller ingest removes what's gone.
    await store.replace({ ...doc, issues: doc.issues.slice(0, 5) })
    expect((await store.snapshot())!.issues).toHaveLength(5)
    await store.replace(doc)
  })

  it("patches one issue and keeps fixes", async () => {
    const store = createMongoIssueStore(db, { pollMs: 50, log })
    expect(await store.patchIssue("WEB-877", { storyPoints: 3 })).toBe(true)
    expect(await store.patchIssue("NOPE-1", { storyPoints: 3 })).toBe(false)
    expect((await store.snapshot())!.issues.find((i) => i.key === "WEB-877")!.storyPoints).toBe(3)

    const fix = { id: randomUUID(), issueKey: "WEB-877", update: { storyPoints: 3 }, by: { id: "u", displayName: "U" }, at: "2026-11-04T10:00:00.000Z", via: "app" as const, usedSuggestion: [] }
    await store.recordFix(fix)
    expect(await store.fixes(new Date("2026-11-04T00:00:00Z"))).toEqual([fix])
    expect(await store.fixes(new Date("2026-11-05T00:00:00Z"))).toEqual([])
  })

  it("leaves out a document that breaks the contract instead of failing the whole dataset", async () => {
    const store = createMongoIssueStore(db, { pollMs: 50, log })
    await db.collection("issues").insertOne({ _id: "BAD-1" as never, summary: "No status or dates" })
    const result = await store.read()
    expect(result!.skipped.map((s) => s.id)).toEqual(["BAD-1"])
    expect(result!.doc.issues.some((i) => i.key === "BAD-1")).toBe(false)
    await db.collection("issues").deleteOne({ _id: "BAD-1" as never })
  })

  it("notices changes made by another process", async () => {
    const store = createMongoIssueStore(db, { pollMs: 50, log })
    let calls = 0
    const stop = await store.watch(() => calls++)
    // Give a change stream a moment to open.
    await new Promise((r) => setTimeout(r, 300))
    await db.collection("issues").updateOne({ _id: "WEB-877" as never }, { $set: { priority: "High" } })
    const deadline = Date.now() + 3000
    while (calls === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
    await stop()
    expect(calls).toBeGreaterThan(0)
  })
})
