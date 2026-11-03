import type { Issue, JiraDataset } from "../jira/types"
import type { Resolution, ResolutionValues } from "./types"

/** Each ticket's resolutions, oldest first. */
export function resolutionsByIssue(resolutions: readonly Resolution[]): Map<string, Resolution[]> {
  const out = new Map<string, Resolution[]>()
  for (const r of resolutions) out.set(r.issueKey, [...(out.get(r.issueKey) ?? []), r])
  return out
}

/** Every value entered for a ticket, later saves winning. */
export const mergedValues = (rs: readonly Resolution[]): ResolutionValues => Object.assign({}, ...rs.map((r) => r.values))

/**
 * The dataset with resolutions laid over it, for checks to run on. The original
 * dataset and its issues are never changed; resolutions for unknown keys are ignored.
 */
export function applyResolutions(dataset: JiraDataset, resolutions: readonly Resolution[]): JiraDataset {
  if (resolutions.length === 0) return dataset
  const byIssue = resolutionsByIssue(resolutions)
  const issues = dataset.issues.map((i): Issue => {
    const rs = byIssue.get(i.key)
    return rs ? { ...i, ...mergedValues(rs) } : i
  })
  return {
    ...dataset,
    issues,
    epics: issues.filter((i) => i.type === "Epic"),
    byKey: new Map(issues.map((i) => [i.key, i])),
  }
}
