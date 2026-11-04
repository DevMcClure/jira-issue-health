/**
 * What counts as "required": the default rules from the project brief, §8.
 * Each rule is data plus small predicates; checks.ts applies them.
 */
import type { Issue, IssueType, JiraDataset } from "../jira/types"
import { DASHBOARD_VIEW_IDS, type DashboardViewId } from "./impact"

export type FieldId = "storyPoints" | "assigneeId" | "teamId" | "resolved" | "sprintIds" | "epicKey" | "priority" | "labels"
export type Severity = "critical" | "warning" | "info"

/** Worst first. */
export const SEVERITIES: readonly Severity[] = ["critical", "warning", "info"]
export const severityRank = (s: Severity) => SEVERITIES.indexOf(s)

/** What a rule's condition can look at besides the issue itself. */
export type CheckContext = { dataset: Pick<JiraDataset, "sprintById"> }

export interface RequiredField {
  field: FieldId
  /** Chip text, e.g. "Story points". */
  label: string
  requiredFor: IssueType[]
  /** Condition under which it's required; absent = always. */
  when?: (issue: Issue, ctx: CheckContext) => boolean
  /** The condition in words, shown read-only in the settings panel. */
  whenLabel: string
  severity: Severity
  affects: DashboardViewId[]
  /** One sentence for the UI: why the gap matters. */
  why: string
  /** Overrides the default "has a value" test. */
  isPresent?: (issue: Issue) => boolean
}

/** Labels that classify a Spike in the Jira Dashboard's flow distribution (flow-* types are classified by type). */
export const FLOW_LABELS = ["tech-debt", "risk"] as const

/** Open question default: Sub-tasks are only checked for a missing assignee. */
/** The flow item types: the estimated, sprint-planned work. (flow-defect replaces Bug.) */
const DELIVERY: IssueType[] = ["flow-value", "flow-quality", "flow-defect", "flow-accelerator"]
const WORK_ITEMS: IssueType[] = [...DELIVERY, "Spike"]
const ALL_BUT_SUBTASK: IssueType[] = [...WORK_ITEMS, "Epic"]

const inASprint = (i: Issue) => i.sprintIds.length > 0
const startedOrDone = (i: Issue) => i.statusCategory === "inProgress" || i.statusCategory === "done"
const isDone = (i: Issue) => i.statusCategory === "done"
const inProgress = (i: Issue) => i.statusCategory === "inProgress"

export const DEFAULT_REQUIRED_FIELDS: readonly RequiredField[] = [
  {
    field: "storyPoints",
    label: "Story points",
    requiredFor: DELIVERY,
    when: inASprint,
    whenLabel: "only when in a sprint",
    severity: "critical",
    affects: ["velocity", "sprint-burndown", "commitment", "predictability"],
    why: "Unestimated work counts as zero, so velocity and burndown under-report the sprint.",
  },
  {
    field: "assigneeId",
    label: "Assignee",
    requiredFor: [...WORK_ITEMS, "Sub-task"],
    when: startedOrDone,
    whenLabel: "only when In Progress or Done",
    severity: "critical",
    affects: ["load", "people", "work-item-age"],
    why: "Started or finished work with no assignee disappears from everyone's load.",
  },
  {
    field: "teamId",
    label: "Team",
    requiredFor: ALL_BUT_SUBTASK,
    whenLabel: "always",
    severity: "critical",
    affects: [...DASHBOARD_VIEW_IDS],
    why: "Without a team the ticket drops out of every team-filtered view.",
  },
  {
    field: "resolved",
    label: "Resolved date",
    requiredFor: ALL_BUT_SUBTASK,
    when: isDone,
    whenLabel: "only when Done",
    severity: "critical",
    affects: ["cycle-time", "throughput"],
    why: "Done work with no resolved date has no cycle time and never counts as delivered.",
  },
  {
    field: "sprintIds",
    label: "Sprint",
    requiredFor: DELIVERY,
    when: inProgress,
    whenLabel: "only when In Progress",
    severity: "warning",
    affects: ["commitment", "sprint-burndown", "scope-change"],
    why: "Work in progress outside any sprint is invisible to sprint views and burndown.",
  },
  {
    field: "epicKey",
    label: "Epic",
    requiredFor: DELIVERY,
    whenLabel: "always",
    severity: "warning",
    affects: ["epic-progress", "pi-objectives"],
    why: "Tickets without an epic don't count toward epic progress or PI objectives.",
  },
  {
    field: "priority",
    label: "Priority",
    requiredFor: WORK_ITEMS,
    whenLabel: "always",
    severity: "info",
    affects: ["priority"],
    why: "Tickets without a priority are left out of the priority breakdown.",
  },
  {
    field: "labels",
    label: "Labels",
    requiredFor: ["Spike"],
    whenLabel: "always (needs tech-debt or risk)",
    severity: "info",
    affects: ["flow-distribution"],
    why: "Spikes need a tech-debt or risk label, or flow distribution files them as Other.",
    isPresent: (i) => i.labels.some((l) => (FLOW_LABELS as readonly string[]).includes(l.toLowerCase())),
  },
]

/** Whether the issue has a value for the field (missing = null or an empty list, after the adapter). */
export function isFieldPresent(rule: Pick<RequiredField, "field" | "isPresent">, issue: Issue): boolean {
  if (rule.isPresent) return rule.isPresent(issue)
  const value = issue[rule.field]
  return Array.isArray(value) ? value.length > 0 : value !== null
}

/** Whether the rule applies to this issue at all: its type is listed and its condition holds. */
export function ruleApplies(rule: RequiredField, issue: Issue, ctx: CheckContext): "yes" | "wrong-type" | "condition-not-met" {
  if (!(rule.requiredFor as string[]).includes(issue.type)) return "wrong-type"
  if (rule.when && !rule.when(issue, ctx)) return "condition-not-met"
  return "yes"
}
