/**
 * Dataset + required-field rules → each ticket's health. Pure: no React, no browser.
 */
import type { Issue, JiraDataset } from "../jira/types"
import type { DashboardViewId } from "./impact"
import {
  DEFAULT_REQUIRED_FIELDS,
  isFieldPresent,
  ruleApplies,
  severityRank,
  type CheckContext,
  type FieldId,
  type RequiredField,
  type Severity,
} from "./requiredFields"

/** One missing required field. */
export type FieldGap = {
  field: FieldId
  label: string
  severity: Severity
  affects: DashboardViewId[]
  why: string
}

/** How a required field stands for one ticket: present, missing, or not required right now (condition not met). */
export type FieldState = {
  field: FieldId
  label: string
  state: "present" | "missing" | "not-required"
  whenLabel: string
}

export type TicketHealth = {
  issue: Issue
  /** Every rule for this ticket's type, in rule order. */
  fields: FieldState[]
  /** Missing fields, worst severity first (rule order within a severity). */
  gaps: FieldGap[]
  /** The worst gap's severity, or null when nothing is missing. */
  severity: Severity | null
  /** Every dashboard view the gaps degrade. */
  affects: DashboardViewId[]
}

export function checkIssue(
  issue: Issue,
  rules: readonly RequiredField[] = DEFAULT_REQUIRED_FIELDS,
  ctx: CheckContext = { dataset: { sprintById: new Map() } },
): TicketHealth {
  const fields: FieldState[] = []
  const gaps: FieldGap[] = []
  for (const rule of rules) {
    const applies = ruleApplies(rule, issue, ctx)
    if (applies === "wrong-type") continue
    const missing = applies === "yes" && !isFieldPresent(rule, issue)
    fields.push({
      field: rule.field,
      label: rule.label,
      state: applies === "condition-not-met" ? "not-required" : missing ? "missing" : "present",
      whenLabel: rule.whenLabel,
    })
    if (missing) {
      gaps.push({ field: rule.field, label: rule.label, severity: rule.severity, affects: rule.affects, why: rule.why })
    }
  }
  // Stable sort keeps rule order within a severity.
  gaps.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  return {
    issue,
    fields,
    gaps,
    severity: gaps[0]?.severity ?? null,
    affects: [...new Set(gaps.flatMap((g) => g.affects))],
  }
}

/** Every issue's health, in dataset order. */
export function checkDataset(dataset: JiraDataset, rules: readonly RequiredField[] = DEFAULT_REQUIRED_FIELDS): TicketHealth[] {
  const ctx: CheckContext = { dataset }
  return dataset.issues.map((issue) => checkIssue(issue, rules, ctx))
}

/** Tickets with at least one missing required field. */
export const needsFix = (health: TicketHealth[]) => health.filter((h) => h.gaps.length > 0)
