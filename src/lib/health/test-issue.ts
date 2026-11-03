import type { Issue } from "../jira/types"

/** A complete, healthy In Progress Story in sprint 1; override what a test needs. */
export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    key: "WEB-1",
    summary: "Search: add filters to the list view",
    type: "Story",
    status: "In Progress",
    statusCategory: "inProgress",
    priority: "Medium",
    assigneeId: "u-1",
    teamId: "TEAM-WEB",
    sprintIds: [1],
    storyPoints: 3,
    labels: ["search"],
    epicKey: "WEB-0",
    parentKey: null,
    created: "2026-10-20T10:00:00Z",
    resolved: null,
    changelog: [],
    ...overrides,
  }
}

/** A Done version of `makeIssue`, resolved. */
export const done = (overrides: Partial<Issue> = {}) =>
  makeIssue({ status: "Done", statusCategory: "done", resolved: "2026-10-30T16:00:00Z", ...overrides })

/** A To Do version of `makeIssue`. */
export const todo = (overrides: Partial<Issue> = {}) => makeIssue({ status: "To Do", statusCategory: "todo", ...overrides })
