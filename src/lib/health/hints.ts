/**
 * Suggested values for missing fields, from similar tickets. Pure and deterministic.
 *
 * Similar tickets come from the first tier with at least 3 matches:
 *   1. same epic, same type
 *   2. same team, same type, a shared label
 *   3. same team, same type, similar summary (word Jaccard >= 0.3, stop words removed)
 *   4. same team, same type
 * A match must have the field being suggested; fewer than 3 → no suggestion.
 * Assignees come from the people active on the ticket's epic instead.
 *
 * Suggestions are never applied silently: each carries its evidence for the UI.
 */
import type { Issue, JiraDataset } from "../jira/types"
import { teamOf } from "./list"
import { FLOW_LABELS, type FieldId } from "./requiredFields"

/** Below this many matches there's no suggestion. */
export const MIN_MATCHES = 3
export const SUMMARY_SIMILARITY = 0.3

export type Tier = 1 | 2 | 3 | 4

export type SimilarTickets = {
  tier: Tier
  matches: Issue[]
  /** e.g. "Stories in WEB-700", "Stories in Web labelled perf". */
  source: string
}

type SuggestionBase = {
  /** One sentence: where the value comes from. */
  evidence: string
  /** The tickets it's based on. */
  basedOn: string[]
}

export type Suggestion =
  | (SuggestionBase & { field: "storyPoints"; value: number; tier: Tier })
  | (SuggestionBase & { field: "epicKey"; value: string; tier: Tier })
  | (SuggestionBase & { field: "priority"; value: string; tier: Tier })
  /** The ticket's labels plus the suggested one. */
  | (SuggestionBase & { field: "labels"; value: string[]; added: string; tier: Tier })
  /** Up to 3 people, most active first. */
  | (SuggestionBase & { field: "assigneeId"; value: string; alternatives: string[] })

/** Fields with a suggestion rule. */
export const SUGGESTED_FIELDS: readonly FieldId[] = ["storyPoints", "epicKey", "priority", "labels", "assigneeId"]

type Ctx = Pick<JiraDataset, "issues" | "byKey" | "teams" | "teamById" | "sprintById" | "personById">

// ---------------------------------------------------------------------------
// Similar tickets
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have in into is it its of on or that the this to was were when with without".split(" "),
)

/** Lower-case words without stop words or punctuation. */
export function summaryWords(summary: string): Set<string> {
  return new Set(
    summary
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w && !STOP_WORDS.has(w)),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

const plural = (type: string, n: number) => (n === 1 ? type : type.endsWith("y") ? `${type.slice(0, -1)}ies` : `${type}s`)

/**
 * Similar tickets that pass `has` (usually: the field is filled in), from the first tier with
 * at least `MIN_MATCHES`. Null when no tier has enough.
 */
export function similarTickets(issue: Issue, ctx: Ctx, has: (i: Issue) => boolean): SimilarTickets | null {
  const team = teamOf(issue, ctx)
  const teamName = team ? (ctx.teamById.get(team)?.name ?? team) : null
  const pool = ctx.issues.filter((i) => i.key !== issue.key && i.type === issue.type && has(i))
  const sameTeam = team ? pool.filter((i) => teamOf(i, ctx) === team) : []
  const types = (n: number) => plural(issue.type, n)

  const tiers: (() => SimilarTickets)[] = [
    () => {
      const matches = issue.epicKey ? pool.filter((i) => i.epicKey === issue.epicKey) : []
      return { tier: 1, matches, source: `${types(matches.length)} in ${issue.epicKey}` }
    },
    () => {
      const labels = new Set(issue.labels)
      const matches = sameTeam.filter((i) => i.labels.some((l) => labels.has(l)))
      const shared = issue.labels.filter((l) => matches.some((m) => m.labels.includes(l)))
      return { tier: 2, matches, source: `${types(matches.length)} in ${teamName} labelled ${shared.join(" or ")}` }
    },
    () => {
      const words = summaryWords(issue.summary)
      const matches = sameTeam.filter((i) => jaccard(words, summaryWords(i.summary)) >= SUMMARY_SIMILARITY)
      return { tier: 3, matches, source: `${types(matches.length)} in ${teamName} with similar summaries` }
    },
    () => ({ tier: 4, matches: sameTeam, source: `${types(sameTeam.length)} in ${teamName}` }),
  ]
  for (const tier of tiers) {
    const found = tier()
    if (found.matches.length >= MIN_MATCHES) return found
  }
  return null
}

// ---------------------------------------------------------------------------
// Per-field suggestions
// ---------------------------------------------------------------------------

/** The most common value; ties go to the first in sort order, so results are stable. */
function mostCommon(values: string[]): { value: string; count: number } {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return { value, count }
}

/** The middle value (the lower one of an even count), so it's always a value someone used. */
function median(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

const keysOf = (issues: Issue[]) => issues.map((i) => i.key)
const isFlowLabel = (l: string) => (FLOW_LABELS as readonly string[]).includes(l.toLowerCase())

export function suggest(issue: Issue, field: FieldId, ctx: Ctx): Suggestion | null {
  switch (field) {
    case "storyPoints": {
      const similar = similarTickets(issue, ctx, (i) => i.storyPoints !== null)
      if (!similar) return null
      const points = similar.matches.map((i) => i.storyPoints!).sort((a, b) => a - b)
      const [min, max] = [points[0], points.at(-1)!]
      const value = median(points)
      const range = min === max ? `all ${min} pts` : `${min}–${max} pts, median ${value}`
      return {
        field,
        value,
        tier: similar.tier,
        evidence: `${similar.matches.length} similar ${similar.source} have ${range}.`,
        basedOn: keysOf(similar.matches),
      }
    }
    case "epicKey": {
      const similar = similarTickets(issue, ctx, (i) => i.epicKey !== null)
      if (!similar) return null
      const { value, count } = mostCommon(similar.matches.map((i) => i.epicKey!))
      const name = ctx.byKey.get(value)?.summary
      return {
        field,
        value,
        tier: similar.tier,
        evidence: `${count} of ${similar.matches.length} similar ${similar.source} are in ${value}${name ? ` (${name})` : ""}.`,
        basedOn: keysOf(similar.matches.filter((i) => i.epicKey === value)),
      }
    }
    case "priority": {
      const similar = similarTickets(issue, ctx, (i) => i.priority !== null)
      if (!similar) return null
      const { value, count } = mostCommon(similar.matches.map((i) => i.priority!))
      return {
        field,
        value,
        tier: similar.tier,
        evidence: `${count} of ${similar.matches.length} similar ${similar.source} are ${value} priority.`,
        basedOn: keysOf(similar.matches.filter((i) => i.priority === value)),
      }
    }
    case "labels": {
      // The gap is a missing flow label, so suggest the flow label similar tickets use.
      const similar = similarTickets(issue, ctx, (i) => i.labels.some(isFlowLabel))
      if (!similar) return null
      const { value: added, count } = mostCommon(similar.matches.flatMap((i) => i.labels.filter(isFlowLabel).map((l) => l.toLowerCase())))
      return {
        field,
        value: [...issue.labels, added],
        added,
        tier: similar.tier,
        evidence: `${count} of ${similar.matches.length} similar ${similar.source} are labelled ${added}.`,
        basedOn: keysOf(similar.matches.filter((i) => i.labels.some((l) => l.toLowerCase() === added))),
      }
    }
    case "assigneeId": {
      if (!issue.epicKey) return null
      const onEpic = ctx.issues.filter((i) => i.key !== issue.key && i.epicKey === issue.epicKey && i.assigneeId !== null)
      if (onEpic.length < MIN_MATCHES) return null
      const counts = new Map<string, number>()
      for (const i of onEpic) counts.set(i.assigneeId!, (counts.get(i.assigneeId!) ?? 0) + 1)
      const name = (id: string) => ctx.personById.get(id)?.displayName ?? id
      const people = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])))
        .slice(0, 3)
      const epicName = ctx.byKey.get(issue.epicKey)?.summary
      return {
        field,
        value: people[0][0],
        alternatives: people.slice(1).map(([id]) => id),
        evidence: `Most active on ${issue.epicKey}${epicName ? ` (${epicName})` : ""}: ${people
          .map(([id, n]) => `${name(id)} (${n} ${n === 1 ? "ticket" : "tickets"})`)
          .join(", ")}.`,
        basedOn: keysOf(onEpic),
      }
    }
    default:
      return null
  }
}

/** Suggestions for each of a ticket's gaps that has one. */
export function suggestionsFor(issue: Issue, fields: FieldId[], ctx: Ctx): Partial<Record<FieldId, Suggestion>> {
  const out: Partial<Record<FieldId, Suggestion>> = {}
  for (const field of fields) {
    const s = SUGGESTED_FIELDS.includes(field) ? suggest(issue, field, ctx) : null
    if (s) out[field] = s
  }
  return out
}

/** How a suggested value reads in the UI. */
export function formatSuggestion(s: Suggestion, ctx: Pick<JiraDataset, "byKey" | "personById">): string {
  switch (s.field) {
    case "storyPoints":
      return `${s.value} ${s.value === 1 ? "point" : "points"}`
    case "epicKey": {
      const name = ctx.byKey.get(s.value)?.summary
      return name ? `${s.value} · ${name}` : s.value
    }
    case "priority":
      return s.value
    case "labels":
      return `Add ${s.added}`
    case "assigneeId": {
      const name = (id: string) => ctx.personById.get(id)?.displayName ?? id
      return s.alternatives.length ? `${name(s.value)} (or ${s.alternatives.map(name).join(", ")})` : name(s.value)
    }
  }
}
