import type { Issue, JiraDataset } from "../jira/types"

/**
 * The dataset with some issues changed (e.g. after a write to Jira, before the next
 * Trawler run). The original dataset and its issues are never mutated; patches for
 * unknown keys are ignored.
 */
export function patchDataset(dataset: JiraDataset, patches: ReadonlyMap<string, Partial<Issue>>): JiraDataset {
  if (patches.size === 0) return dataset
  const issues = dataset.issues.map((i): Issue => {
    const p = patches.get(i.key)
    return p ? { ...i, ...p, key: i.key } : i
  })
  return {
    ...dataset,
    issues,
    epics: issues.filter((i) => i.type === "Epic"),
    byKey: new Map(issues.map((i) => [i.key, i])),
  }
}
