/** Missing fields Resolve can fill in through Jira. Team isn't one: it's set in Jira itself. */
export const RESOLVABLE_FIELDS = ["storyPoints", "assigneeId", "epicKey", "sprintIds", "priority", "labels", "resolved"] as const
export type ResolvableField = (typeof RESOLVABLE_FIELDS)[number]

export const isResolvable = (field: string): field is ResolvableField => (RESOLVABLE_FIELDS as readonly string[]).includes(field)
