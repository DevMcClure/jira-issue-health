/**
 * The only place that knows how issue data is laid out in MongoDB. When the live
 * database arrives with its own document shape, change this file (and the collection
 * names in db.ts); nothing else should need to.
 *
 * Layout used today, one document per thing, `_id` being its natural id:
 *   meta     { _id: "current", source, version, generatedAt, jiraBaseUrl }
 *   teams    { _id: team id,   name, projectKey, memberIds }
 *   people   { _id: person id, displayName }
 *   sprints  { _id: sprint id (number), name, teamId, state, startDate, endDate, completeDate }
 *   issues   { _id: issue key, summary, type, status, statusCategory, priority, assigneeId, teamId,
 *              sprintIds, storyPoints, labels, epicKey, parentKey, created, resolved, changelog }
 * Field names and values are the Trawler contract's (README → "Data contract"). Extra fields are kept and ignored.
 */
import { toExportDoc, type ExportDoc } from "../../src/lib/api/contract"
import { JiraExportError, parseExport } from "../../src/lib/jira/adapter"

type WithId<I> = { _id: I } & Record<string, unknown>

export type RawCollections = {
  meta: Record<string, unknown> | null
  teams: WithId<string>[]
  people: WithId<string>[]
  sprints: WithId<number>[]
  issues: WithId<string>[]
}

/** Housekeeping fields this server adds, never part of the data. */
const strip = ({ _id, updatedAt, ...rest }: Record<string, unknown>) => {
  void updatedAt
  return { _id, rest }
}

export type ReadResult = {
  doc: ExportDoc
  /** Documents left out because they don't fit the contract, with why. */
  skipped: { collection: string; id: string; problem: string }[]
}

/**
 * Database documents → the normalised dataset. One bad issue doesn't take the whole
 * dataset down: it's left out and reported (and logged by the caller).
 */
export function fromCollections(raw: RawCollections): ReadResult {
  const contract = {
    meta: raw.meta ? strip(raw.meta).rest : null,
    teams: raw.teams.map((d) => ({ id: d._id, ...strip(d).rest })),
    people: raw.people.map((d) => ({ id: d._id, ...strip(d).rest })),
    sprints: raw.sprints.map((d) => ({ id: d._id, ...strip(d).rest })),
    issues: raw.issues.map((d) => ({ key: d._id, ...strip(d).rest })),
  }
  const skipped: ReadResult["skipped"] = []
  // Drop the documents a validation problem points at (e.g. "issues.12.created: …") and try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { doc: toExportDoc(parseExport(contract)), skipped }
    } catch (err) {
      if (!(err instanceof JiraExportError)) throw err
      const bad = new Map<string, Set<number>>()
      for (const problem of err.problems) {
        const m = /^(teams|people|sprints|issues)\.(\d+)/.exec(problem)
        if (!m) throw err
        const [, collection, index] = m
        if (!bad.has(collection)) bad.set(collection, new Set())
        if (!bad.get(collection)!.has(Number(index))) {
          bad.get(collection)!.add(Number(index))
          const item = contract[collection as keyof typeof contract] as Record<string, unknown>[]
          const id = String(item[Number(index)].key ?? item[Number(index)].id)
          skipped.push({ collection, id, problem: problem.replace(/^\w+\.\d+\.?/, "") || problem })
        }
      }
      for (const [collection, indexes] of bad) {
        const key = collection as "teams" | "people" | "sprints" | "issues"
        ;(contract[key] as unknown[]) = (contract[key] as unknown[]).filter((_, i) => !indexes.has(i))
      }
    }
  }
  return { doc: toExportDoc(parseExport(contract)), skipped }
}

/** The normalised dataset → database documents. */
export function toCollections(doc: ExportDoc, now: Date) {
  return {
    meta: { ...doc.meta, updatedAt: now },
    teams: doc.teams.map(({ id, ...rest }) => ({ _id: id, ...rest, updatedAt: now })),
    people: doc.people.map(({ id, ...rest }) => ({ _id: id, ...rest, updatedAt: now })),
    sprints: doc.sprints.map(({ id, ...rest }) => ({ _id: id, ...rest, updatedAt: now })),
    issues: doc.issues.map(({ key, ...rest }) => ({ _id: key, ...rest, updatedAt: now })),
  }
}
