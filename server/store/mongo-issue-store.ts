/**
 * The issue store on MongoDB. Live updates come from a change stream when the
 * database supports one (a replica set or Atlas), else from polling.
 */
import type { Collection, Db, Document } from "mongodb"
import type { ExportDoc, Fix } from "../../src/lib/api/contract"
import { collections, DATA_COLLECTIONS, type FixDoc } from "../db"
import { FIX_LIMIT, type IssueStore } from "./issue-store"
import { fromCollections, toCollections, type ReadResult } from "./mapping"

type Log = { info(msg: string): void; warn(obj: object, msg: string): void }

type Options = {
  /** Without change streams, how often `watch` calls back. */
  pollMs: number
  log: Log
}

/** Make a collection hold exactly these documents (no transaction, so a standalone MongoDB works). */
async function replaceAll(coll: Collection<Document>, docs: Document[]) {
  if (docs.length) {
    await coll.bulkWrite(
      docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })),
      { ordered: false },
    )
  }
  await coll.deleteMany({ _id: { $nin: docs.map((d) => d._id) } })
}

export function createMongoIssueStore(db: Db, { pollMs, log }: Options): IssueStore & { read(): Promise<ReadResult | null> } {
  const c = collections(db)

  const read = async (): Promise<ReadResult | null> => {
    const [meta, teams, people, sprints, issues] = await Promise.all([
      c.meta.findOne({ _id: "current" }),
      c.teams.find().toArray(),
      c.people.find().toArray(),
      c.sprints.find().sort({ _id: 1 }).toArray(),
      c.issues.find().toArray(),
    ])
    if (!meta && issues.length === 0) return null
    const result = fromCollections({ meta, teams, people, sprints, issues })
    if (result.skipped.length) {
      log.warn({ skipped: result.skipped.slice(0, 20), count: result.skipped.length }, "Left out documents that don't match the data contract")
    }
    return result
  }

  const supportsChangeStreams = async () => {
    try {
      const hello = await db.admin().command({ hello: 1 })
      return Boolean(hello.setName) || hello.msg === "isdbgrid"
    } catch {
      return false
    }
  }

  return {
    read,

    async snapshot() {
      return (await read())?.doc ?? null
    },

    async replace(doc: ExportDoc) {
      const next = toCollections(doc, new Date())
      await replaceAll(db.collection("teams"), next.teams)
      await replaceAll(db.collection("people"), next.people)
      await replaceAll(db.collection("sprints"), next.sprints)
      await replaceAll(db.collection("issues"), next.issues)
      await c.meta.replaceOne({ _id: "current" }, { _id: "current", ...next.meta }, { upsert: true })
    },

    async patchIssue(key, patch) {
      const { key: _ignored, ...fields } = patch
      void _ignored
      const res = await c.issues.updateOne({ _id: key }, { $set: { ...fields, updatedAt: new Date() } })
      return res.matchedCount > 0
    },

    async recordFix({ id, at, ...rest }: Fix) {
      await c.fixes.insertOne({ _id: id, at: new Date(at), ...rest })
    },

    async fixes(since, limit = FIX_LIMIT) {
      const docs = await c.fixes.find({ at: { $gte: since } }).sort({ at: -1 }).limit(limit).toArray()
      return docs.reverse().map(({ _id, at, ...rest }: FixDoc) => ({ id: _id, at: at.toISOString(), ...rest }))
    },

    async watch(onChange) {
      let stopped = false
      let timer: ReturnType<typeof setInterval> | undefined
      const poll = () => {
        if (stopped || timer) return
        log.info(`Watching for data changes by polling every ${Math.round(pollMs / 1000)}s (no change streams on this MongoDB)`)
        timer = setInterval(onChange, pollMs)
      }

      if (!(await supportsChangeStreams())) {
        poll()
        return async () => {
          stopped = true
          clearInterval(timer)
        }
      }

      const stream = db.watch([{ $match: { "ns.coll": { $in: [...DATA_COLLECTIONS] } } }])
      stream.on("change", () => onChange())
      stream.on("error", (err) => {
        if (stopped) return
        log.warn({ err: err.message }, "Change stream failed; falling back to polling")
        void stream.close()
        poll()
      })
      log.info("Watching for data changes with a MongoDB change stream")
      return async () => {
        stopped = true
        clearInterval(timer)
        await stream.close()
      }
    },

    async ping() {
      await db.command({ ping: 1 })
    },

    async close() {},
  }
}
